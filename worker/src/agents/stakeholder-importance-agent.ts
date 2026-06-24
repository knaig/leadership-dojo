/**
 * Stakeholder Importance Scoring Agent
 *
 * Aggregates email + meeting signals per stakeholder, feeds them into an LLM,
 * and computes importance scores. Runs after first sync and weekly thereafter.
 *
 * Signals used:
 * - Meeting frequency, recency, type (1:1 vs group, needle-mover vs operational)
 * - Email sent vs received ratio (who initiates = who needs something)
 * - Email volume + thread depth
 * - Calendar title signals (Board, Review, Approval, Steering)
 * - Outcome history (landed/missed rate for meetings with this person)
 * - Interaction recency (staleness)
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText } from '../lib/user-llm';
import { publishMessage } from '../lib/pusher';

interface StakeholderSignals {
    name: string;
    email: string | null;
    role: string | null;
    organization: string | null;
    currentPowerLevel: string;
    currentInfluenceRole: string;
    isUserPinned: boolean;

    // Meeting signals
    meetingCount: number;
    meetingCount1to1: number;
    meetingCountNeedleMover: number;
    meetingCountRecent30d: number;
    avgMeetingSize: number;
    calendarTitleSamples: string[];

    // Email signals
    emailTotal: number;
    emailSentToThem: number;
    emailReceivedFromThem: number;
    emailThreadsWithAction: number;
    recentEmailTopics: string[];

    // Outcome signals
    outcomesLanded: number;
    outcomesPartial: number;
    outcomesMissed: number;

    // Recency
    daysSinceLastInteraction: number;
    firstInteractionDaysAgo: number;
}

interface ImportanceResult {
    stakeholderId: string;
    score: number;           // 1-100
    reason: string;          // 1-2 sentences
    category: string;        // inner-circle, high-stakes, operational, peripheral, dormant
    dynamic: string;         // relationship dynamic description
}

/**
 * Main entry point. Scores all stakeholders for a user.
 */
export async function scoreStakeholderImportance(userId: string, opts?: { isFirstSync?: boolean }): Promise<ImportanceResult[]> {
    console.log(`[ImportanceAgent] Scoring stakeholders for user ${userId.substring(0, 8)}`);

    // Get user's email for sent/received detection
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true }
    });
    if (!user?.email) {
        console.log('[ImportanceAgent] No user email found, skipping');
        return [];
    }

    const userEmail = user.email.toLowerCase();
    // Also match on domain-less prefix for flexibility
    const userEmailPrefix = userEmail.split('@')[0];

    // Get all active stakeholders (not merged, not archived)
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            mergedIntoId: null,
            validationStatus: { not: 'ARCHIVED' },
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            organization: true,
            powerLevel: true,
            influenceRole: true,
            isImportant: true,
            interactionCount: true,
            lastInteraction: true,
            createdAt: true,
        },
        orderBy: { interactionCount: 'desc' },
        take: 50, // Score top 50 by interaction count
    });

    if (stakeholders.length === 0) {
        console.log('[ImportanceAgent] No stakeholders to score');
        return [];
    }

    // Aggregate signals for each stakeholder
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const signals: Array<StakeholderSignals & { id: string }> = [];

    for (const s of stakeholders) {
        if (!s.email) continue;
        const stakeholderEmail = s.email.toLowerCase();

        // Meeting signals
        const meetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                participants: { has: stakeholderEmail },
            },
            select: {
                startTime: true,
                title: true,
                meetingType: true,
                meetingCategory: true,
                outcomeResult: true,
                participants: true,
            },
        });

        const meetingCountRecent = meetings.filter(m => m.startTime >= thirtyDaysAgo).length;
        const meetings1to1 = meetings.filter(m =>
            m.meetingType === '1:1' || (m.participants && m.participants.length <= 3)
        ).length;
        const meetingsNeedleMover = meetings.filter(m =>
            m.meetingCategory === 'NEEDLE_MOVER'
        ).length;
        const avgSize = meetings.length > 0
            ? meetings.reduce((sum, m) => sum + (m.participants?.length || 2), 0) / meetings.length
            : 0;
        const titleSamples = meetings
            .slice(-5)
            .map(m => m.title)
            .filter(Boolean);

        const outcomesLanded = meetings.filter(m => m.outcomeResult === 'LANDED').length;
        const outcomesPartial = meetings.filter(m => m.outcomeResult === 'PARTIAL').length;
        const outcomesMissed = meetings.filter(m => m.outcomeResult === 'MISSED').length;

        // Email signals
        const emails = await prisma.emailSummary.findMany({
            where: {
                userId,
                participants: { has: stakeholderEmail },
            },
            select: {
                from: true,
                to: true,
                requiresAction: true,
                keyTopics: true,
                lastMessageAt: true,
            },
        });

        let sentToThem = 0;
        let receivedFromThem = 0;
        for (const e of emails) {
            const fromLower = (e.from || '').toLowerCase();
            if (fromLower.includes(userEmail) || fromLower.includes(userEmailPrefix)) {
                sentToThem++;
            }
            if (fromLower.includes(stakeholderEmail)) {
                receivedFromThem++;
            }
        }

        const actionEmails = emails.filter(e => e.requiresAction).length;
        const recentTopics = emails
            .slice(-5)
            .flatMap(e => e.keyTopics || [])
            .filter(Boolean)
            .slice(0, 5);

        // Recency
        const lastInteraction = s.lastInteraction || s.createdAt;
        const daysSinceLast = Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));
        const firstInteractionDaysAgo = Math.floor((now.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        signals.push({
            id: s.id,
            name: s.name,
            email: s.email,
            role: s.role,
            organization: s.organization,
            currentPowerLevel: s.powerLevel,
            currentInfluenceRole: s.influenceRole,
            isUserPinned: s.isImportant,
            meetingCount: meetings.length,
            meetingCount1to1: meetings1to1,
            meetingCountNeedleMover: meetingsNeedleMover,
            meetingCountRecent30d: meetingCountRecent,
            avgMeetingSize: Math.round(avgSize * 10) / 10,
            calendarTitleSamples: titleSamples,
            emailTotal: emails.length,
            emailSentToThem: sentToThem,
            emailReceivedFromThem: receivedFromThem,
            emailThreadsWithAction: actionEmails,
            recentEmailTopics: recentTopics,
            outcomesLanded,
            outcomesPartial,
            outcomesMissed,
            daysSinceLastInteraction: daysSinceLast,
            firstInteractionDaysAgo,
        });
    }

    if (signals.length === 0) {
        console.log('[ImportanceAgent] No stakeholders with emails to score');
        return [];
    }

    // Feed signals into LLM in batches of 15
    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') {
        console.log('[ImportanceAgent] No LLM configured, skipping');
        return [];
    }

    const results: ImportanceResult[] = [];
    const batchSize = 15;

    for (let i = 0; i < signals.length; i += batchSize) {
        const batch = signals.slice(i, i + batchSize);
        const batchResults = await scoreBatch(config, userId, user.name || 'the user', batch);
        results.push(...batchResults);
    }

    // Persist scores
    for (const r of results) {
        await prisma.stakeholderProfile.update({
            where: { id: r.stakeholderId },
            data: {
                importanceScore: r.score,
                importanceReason: r.reason,
                importanceCategory: r.category,
                importanceComputedAt: now,
            },
        });
    }

    console.log(`[ImportanceAgent] Scored ${results.length} stakeholders`);

    // First sync: send proactive wow message
    if (opts?.isFirstSync && results.length >= 3) {
        await sendFirstSyncMessage(userId, user.name || '', results);
    }

    return results;
}

/**
 * Score a batch of stakeholders via LLM
 */
async function scoreBatch(
    config: any,
    userId: string,
    userName: string,
    batch: Array<StakeholderSignals & { id: string }>
): Promise<ImportanceResult[]> {
    const stakeholderSummaries = batch.map((s, idx) => {
        const emailDirection = s.emailSentToThem > s.emailReceivedFromThem
            ? `${userName} initiates more (${s.emailSentToThem} sent, ${s.emailReceivedFromThem} received)`
            : s.emailReceivedFromThem > s.emailSentToThem
                ? `They initiate more (${s.emailReceivedFromThem} from them, ${s.emailSentToThem} from ${userName})`
                : `Balanced (${s.emailSentToThem} each way)`;

        return `[${idx}] ${s.name}${s.role ? ` — ${s.role}` : ''}${s.organization ? ` at ${s.organization}` : ''}
  Meetings: ${s.meetingCount} total (${s.meetingCountRecent30d} in last 30d, ${s.meetingCount1to1} 1:1s, ${s.meetingCountNeedleMover} needle-movers)
  Avg meeting size: ${s.avgMeetingSize} people
  Meeting titles: ${s.calendarTitleSamples.join(', ') || 'none'}
  Emails: ${s.emailTotal} threads, direction: ${emailDirection}
  Action-required threads: ${s.emailThreadsWithAction}
  Topics: ${s.recentEmailTopics.join(', ') || 'none'}
  Outcomes: ${s.outcomesLanded} landed, ${s.outcomesPartial} partial, ${s.outcomesMissed} missed
  Last interaction: ${s.daysSinceLastInteraction} days ago (known for ${s.firstInteractionDaysAgo} days)
  Current power: ${s.currentPowerLevel}, role: ${s.currentInfluenceRole}
  User pinned as important: ${s.isUserPinned}`;
    }).join('\n\n');

    const prompt = `You are analyzing ${userName}'s professional relationships based on communication patterns.

For each person below, determine their importance to ${userName}'s work. Consider:
- Meeting frequency alone does NOT equal importance. Someone met rarely but in high-stakes 1:1s may matter more than a daily standup colleague.
- Email direction: if ${userName} initiates most emails, they NEED something from this person. If the other person initiates, ${userName} is important to THEM.
- Meeting types: needle-mover and 1:1 meetings signal strategic importance. Large operational meetings signal less.
- Calendar titles with "Board", "Review", "Steering", "Approval" signal authority.
- Action-required emails signal active dependency.
- Staleness: high importance + no recent contact = needs attention.

People to analyze:
${stakeholderSummaries}

Return ONLY valid JSON array. No markdown. Each entry:
[
  {
    "index": 0,
    "score": 85,
    "reason": "Key decision-maker for AI4I. ${userName} initiates most contact — actively needs their input.",
    "category": "high-stakes",
    "dynamic": "You pursue this relationship — they hold authority you need."
  }
]

Categories: inner-circle (frequent + important), high-stakes (rare but critical), operational (regular but routine), peripheral (infrequent, low impact), dormant (was important, gone quiet)

Be specific in reasons — reference actual signals (email counts, meeting types, topics). Keep each reason to 1-2 sentences.`;

    try {
        const raw = await generateText(config, prompt, {
            temperature: 0.3,
            maxOutputTokens: 2000,
            userId,
            traceName: 'stakeholder-importance',
        });

        const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) {
            console.log('[ImportanceAgent] LLM did not return array');
            return [];
        }

        return parsed
            .filter((r: any) => typeof r.index === 'number' && batch[r.index])
            .map((r: any) => ({
                stakeholderId: batch[r.index].id,
                score: Math.min(100, Math.max(1, Number(r.score) || 50)),
                reason: String(r.reason || ''),
                category: String(r.category || 'operational'),
                dynamic: String(r.dynamic || ''),
            }));
    } catch (err: any) {
        console.error(`[ImportanceAgent] LLM scoring failed: ${err.message}`);
        return [];
    }
}

/**
 * Send the first-sync "wow" message via Pusher
 */
async function sendFirstSyncMessage(
    userId: string,
    userName: string,
    results: ImportanceResult[]
): Promise<void> {
    // Sort by score descending
    const sorted = [...results].sort((a, b) => b.score - a.score);

    // Get stakeholder names
    const stakeholderIds = sorted.map(r => r.stakeholderId);
    const profiles = await prisma.stakeholderProfile.findMany({
        where: { id: { in: stakeholderIds } },
        select: { id: true, name: true, importanceCategory: true, importanceReason: true, importanceScore: true },
    });
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    // Group by category
    const innerCircle = sorted.filter(r => r.category === 'inner-circle').slice(0, 3);
    const highStakes = sorted.filter(r => r.category === 'high-stakes').slice(0, 3);
    const needsAttention = sorted.filter(r => {
        const p = profileMap.get(r.stakeholderId);
        return p && r.score >= 60 && r.category === 'dormant';
    }).slice(0, 2);

    let message = `I've been mapping your working relationships. Here's what stands out:\n\n`;

    if (innerCircle.length > 0) {
        message += `**Your inner circle** — `;
        message += innerCircle.map(r => {
            const p = profileMap.get(r.stakeholderId);
            return `**${p?.name || 'Unknown'}**`;
        }).join(', ');
        message += `. You're in constant contact.\n\n`;
    }

    if (highStakes.length > 0) {
        message += `**High-stakes relationships** — `;
        message += highStakes.map(r => {
            const p = profileMap.get(r.stakeholderId);
            return `**${p?.name || 'Unknown'}** (${r.reason.split('.')[0]})`;
        }).join('; ');
        message += `.\n\n`;
    }

    if (needsAttention.length > 0) {
        message += `**Worth checking in on** — `;
        message += needsAttention.map(r => {
            const p = profileMap.get(r.stakeholderId);
            return `**${p?.name || 'Unknown'}** (${r.dynamic})`;
        }).join('; ');
        message += `.\n\n`;
    }

    message += `Am I reading this right?`;

    // Save as message and publish
    const saved = await prisma.message.create({
        data: {
            userId,
            role: 'assistant',
            content: message,
            type: 'PROACTIVE_NUDGE',
        },
    });

    await publishMessage(userId, {
        id: saved.id,
        role: 'assistant',
        content: message,
        createdAt: saved.createdAt,
    });

    console.log(`[ImportanceAgent] Sent first-sync wow message to ${userId.substring(0, 8)}`);
}
