import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getUserLLMConfig } from '@/lib/llm/user-config';
import { createProvider } from '@/lib/llm/factory';

export const dynamic = 'force-dynamic';

/**
 * GET /api/coaching-brief
 *
 * Generates Mira's strategic coaching note — 3-4 observations that
 * surface patterns, gaps, and uncomfortable truths. Not a calendar summary.
 *
 * Cached for 4 hours per user to avoid repeated LLM calls.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check cache — reuse if generated within 4 hours
    const cached = await prisma.proactivePrompt.findFirst({
        where: {
            userId,
            type: 'COACHING_BRIEF',
            deliveredAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
        },
        orderBy: { deliveredAt: 'desc' },
        select: { content: true, deliveredAt: true },
    });

    if (cached) {
        return NextResponse.json({
            brief: cached.content,
            generatedAt: cached.deliveredAt,
            cached: true,
        });
    }

    // Gather raw signals for LLM synthesis
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
        user,
        meetings,
        snapshot,
        recentInsights,
        stakeholders,
        kpis,
        commitments,
        recentCalls,
    ] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, jobTitle: true, company: true } }),
        // Today + tomorrow meetings
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: new Date(now.setHours(0, 0, 0, 0)), lte: new Date(new Date().setHours(48, 0, 0, 0)) },
            },
            orderBy: { startTime: 'asc' },
            select: {
                id: true, title: true, startTime: true, meetingCategory: true,
                isPresentation: true, desiredOutcome: true, outcomeResult: true,
                participants: true, isRecurring: true,
            },
        }),
        // Weekly snapshot with patterns
        prisma.meetingPatternSnapshot.findFirst({
            where: { userId },
            orderBy: { weekStart: 'desc' },
            select: {
                insights: true, categoryBreakdown: true,
                totalMeetings: true, outcomesSet: true, outcomesLanded: true,
                totalMeetingHours: true,
                commitmentsMade: true, commitmentsFulfilled: true,
                recurringWithNoValue: true,
            },
        }),
        // Recent coaching insights
        prisma.conversationInsight.findMany({
            where: { userId, confidence: { gte: 0.6 }, conversationDate: { gte: oneWeekAgo } },
            orderBy: { conversationDate: 'desc' },
            take: 5,
            select: { insight: true, contextType: true },
        }),
        // Key stakeholders needing attention
        prisma.stakeholderProfile.findMany({
            where: {
                userId,
                powerLevel: 'HIGH',
                OR: [
                    { lastInteraction: { lt: twoWeeksAgo } },
                    { lastInteraction: null },
                    { relationshipStrength: { lt: 0.4 } },
                ],
            },
            select: { name: true, role: true, lastInteraction: true, powerLevel: true },
            take: 5,
        }),
        // KPIs at risk
        prisma.userKPI.findMany({
            where: { userId, status: { in: ['AT_RISK', 'OFF_TRACK'] } },
            select: { name: true, status: true },
            take: 5,
        }),
        // Overdue commitments
        prisma.meetingCommitment.findMany({
            where: { userId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: now } },
            select: { description: true, owner: true },
            take: 5,
        }),
        // Recent voice calls (for context)
        prisma.voiceCall.findMany({
            where: { userId, status: 'ended', durationSeconds: { gt: 30 } },
            orderBy: { startedAt: 'desc' },
            take: 3,
            select: { summary: true, startedAt: true, callType: true },
        }),
    ]);

    // Build the context signal document for the LLM
    const signals: string[] = [];

    // Time allocation
    if (snapshot?.categoryBreakdown) {
        try {
            const bd = snapshot.categoryBreakdown as Record<string, number>;
            const total = Object.values(bd).reduce((s, v) => s + v, 0);
            if (total > 0) {
                const categories = Object.entries(bd)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => `${k}: ${Math.round((v / total) * 100)}%`);
                signals.push(`TIME ALLOCATION THIS WEEK: ${categories.join(', ')}. Total: ${snapshot.totalMeetingHours?.toFixed(1) || '?'} hours in meetings.`);
            }
        } catch { /* ignore */ }
    }

    // Performance
    if (snapshot) {
        const hitRate = snapshot.outcomesSet > 0 ? Math.round((snapshot.outcomesLanded / snapshot.outcomesSet) * 100) : null;
        const followThrough = snapshot.commitmentsMade > 0 ? Math.round((snapshot.commitmentsFulfilled / snapshot.commitmentsMade) * 100) : null;
        if (hitRate !== null) signals.push(`MEETING EFFECTIVENESS: ${hitRate}% outcome hit rate (${snapshot.outcomesLanded}/${snapshot.outcomesSet} landed). ${followThrough !== null ? `Commitment follow-through: ${followThrough}%.` : ''}`);
    }

    // Existing pattern insights
    if (snapshot?.insights) {
        try {
            const ins = snapshot.insights as string[];
            if (Array.isArray(ins) && ins.length > 0) {
                signals.push(`WEEKLY PATTERN INSIGHTS: ${ins.slice(0, 3).join(' | ')}`);
            }
        } catch { /* ignore */ }
    }

    // Recent coaching insights
    if (recentInsights.length > 0) {
        signals.push(`RECENT OBSERVATIONS: ${recentInsights.map(i => i.insight).join(' | ')}`);
    }

    // Today's meetings
    const todayMeetings = meetings.filter(m => new Date(m.startTime).toDateString() === new Date().toDateString());
    if (todayMeetings.length > 0) {
        const meetingLines = todayMeetings.map(m => {
            const time = new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const category = m.meetingCategory || 'uncategorized';
            const outcome = m.desiredOutcome ? `Goal: "${m.desiredOutcome}"` : 'No goal set';
            const attendeeCount = (m.participants || []).length;
            return `  ${time} ${m.title} (${category}, ${attendeeCount} people) — ${outcome}`;
        });
        signals.push(`TODAY'S MEETINGS:\n${meetingLines.join('\n')}`);
    }

    // Recurring meetings with no value
    if (snapshot?.recurringWithNoValue) {
        try {
            const recurring = snapshot.recurringWithNoValue as Array<{ title: string }>;
            if (Array.isArray(recurring) && recurring.length > 0) {
                signals.push(`RECURRING MEETINGS WITH NO OUTCOMES EVER SET: ${recurring.map(r => r.title || r).join(', ')}`);
            }
        } catch { /* ignore */ }
    }

    // Stakeholder gaps
    if (stakeholders.length > 0) {
        const staleNames = stakeholders.map(s => {
            const days = s.lastInteraction
                ? Math.floor((now.getTime() - new Date(s.lastInteraction).getTime()) / 86400000)
                : null;
            return `${s.name} (${s.role || s.powerLevel}${days !== null ? `, ${days} days silent` : ', never met'})`;
        });
        signals.push(`KEY RELATIONSHIPS GOING COLD: ${staleNames.join(', ')}`);
    }

    // KPIs at risk
    if (kpis.length > 0) {
        signals.push(`KPIs AT RISK: ${kpis.map(k => `${k.name} (${k.status})`).join(', ')}`);
    }

    // Overdue commitments
    if (commitments.length > 0) {
        signals.push(`OVERDUE COMMITMENTS: ${commitments.map(c => `"${c.description}" (owner: ${c.owner})`).join(', ')}`);
    }

    // Recent call context
    if (recentCalls.length > 0) {
        signals.push(`RECENT CALLS: ${recentCalls.map(c => c.summary || c.callType).join(' | ')}`);
    }

    // If we have no signals at all, return a simple fallback
    if (signals.length === 0) {
        return NextResponse.json({
            brief: null,
            generatedAt: now,
            cached: false,
        });
    }

    // Generate the coaching note via LLM
    const config = await getUserLLMConfig(userId);
    if (!config || config.provider === 'none' || !config.apiKey) {
        return NextResponse.json({
            brief: null,
            generatedAt: now,
            cached: false,
        });
    }

    const provider = createProvider(config);
    const firstName = user?.name?.split(' ')[0] || 'there';

    const prompt = `You are Mira — an executive coach. Sharp, warm, direct. You write like Della Street meets Indra Nooyi.

You're writing a SHORT coaching note to ${firstName} (${user?.jobTitle || 'executive'}${user?.company ? ` at ${user.company}` : ''}).

TODAY: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

HERE ARE THE RAW SIGNALS FROM THEIR WORK DATA:
${signals.join('\n\n')}

WRITE 3-4 SHORT COACHING OBSERVATIONS. These are NOT calendar summaries. They are strategic insights — things ${firstName} isn't seeing from inside their own week.

RULES:
- Each observation is 1-3 sentences. Direct. Sometimes uncomfortable.
- Focus on: patterns they can't see, conversations they're avoiding, gaps between stated priorities and actual time spent, relationships that are quietly eroding, decisions that are overdue
- Reference specific people, meetings, and projects by name
- If they have a big meeting today, the last observation can mention it — but as coaching ("Madhu decides with data. Have your numbers, not your narrative."), NOT as a calendar reminder
- Never say "I noticed" or "Based on the data" — just state the insight
- Never list all their meetings or commitments
- Don't be generic. Be specific to THEIR situation.
- Tone: like a note from a trusted advisor who knows them well
- No bullet points, no headers, no emojis, no markdown formatting
- Write in second person ("You've been..." / "The Brazil pilot...")
- Separate each observation with a blank line

OUTPUT: Just the coaching note text. Nothing else.`;

    try {
        const brief = await provider.generateText(prompt);

        // Cache the result
        await prisma.proactivePrompt.create({
            data: {
                userId,
                type: 'COACHING_BRIEF',
                content: brief,
                deliveredVia: 'web',
                deliveredAt: new Date(),
            },
        });

        return NextResponse.json({
            brief,
            generatedAt: new Date(),
            cached: false,
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[coaching-brief] LLM error:', errMsg);
        return NextResponse.json({
            brief: null,
            error: 'generation_failed',
            generatedAt: now,
            cached: false,
        });
    }
}
