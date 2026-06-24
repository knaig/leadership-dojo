/**
 * Meeting Champion Agent
 *
 * Silently accumulates meeting pattern data and surfaces coaching
 * insights only when confidence is sufficient.
 *
 * Features:
 * 1. Weekly pattern snapshots — aggregates meeting outcomes, categories, commitments
 * 2. Commitment reminders — nudges when follow-ups are due
 * 3. Weekly reflection — narrative coaching based on patterns (only when data is sufficient)
 * 4. Meeting advisory — suggests meetings the user should set up (only with enough history)
 */

import { prisma } from '../lib/prisma';
import { publishMessage } from '../lib/pusher';
import { sendPushToUser } from '../lib/web-push';
import { getUserLLMConfig, generateText } from '../lib/user-llm';
import { shouldDeliverViaVoice, triggerVoiceCall } from '../lib/vapi-voice';

const MIRA_NOTIFICATIONS = {
    commitment: {
        title: 'Mira',
        bodyTemplate: (msg: string) => msg.replace(/\*\*/g, '').substring(0, 120),
    }
};

// ─────────────────────────────────────────
// 1. WEEKLY PATTERN SNAPSHOT
// ─────────────────────────────────────────

export async function generateWeeklyPatternSnapshot(userId: string): Promise<void> {
    const now = new Date();
    // Week = last 7 days ending now
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);

    // Check if we already generated a snapshot for this week
    const existing = await prisma.meetingPatternSnapshot.findFirst({
        where: { userId, weekStart: { gte: weekStart } }
    });
    if (existing) {
        console.log(`[MeetingChampion] Snapshot already exists for week starting ${weekStart.toISOString()}`);
        return;
    }

    // Fetch all meetings from the past week
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: weekStart, lte: now },
            status: { not: 'cancelled' }
        }
    });

    // Filter to real meetings (2+ attendees)
    const realMeetings = meetings.filter(m => {
        const attendees = (m.attendees as any[]) || [];
        return attendees.length >= 2;
    });

    if (realMeetings.length === 0) {
        console.log(`[MeetingChampion] No meetings for ${userId} this week, skipping snapshot`);
        return;
    }

    // Count outcomes
    const outcomesSet = realMeetings.filter(m => m.desiredOutcome != null).length;
    const outcomesLanded = realMeetings.filter(m => m.outcomeResult === 'LANDED').length;
    const outcomesMissed = realMeetings.filter(m => m.outcomeResult === 'MISSED' || m.outcomeResult === 'PARTIAL').length;

    // Count commitments
    const commitments = await prisma.meetingCommitment.findMany({
        where: {
            userId,
            createdAt: { gte: weekStart, lte: now }
        }
    });
    const commitmentsMade = commitments.length;
    const commitmentsFulfilled = commitments.filter(c => c.status === 'FULFILLED').length;

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const m of realMeetings) {
        const cat = m.meetingCategory || 'UNCLASSIFIED';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    }

    // Total meeting hours
    const totalMeetingHours = realMeetings.reduce((sum, m) => {
        return sum + (m.endTime.getTime() - m.startTime.getTime()) / (1000 * 60 * 60);
    }, 0);

    // Meetings per day
    const daysWithMeetings = new Set(realMeetings.map(m => m.startTime.toDateString())).size;
    const avgMeetingsPerDay = daysWithMeetings > 0 ? realMeetings.length / daysWithMeetings : 0;

    // Recurring meetings with no value (no outcome ever set, recurring)
    const recurringNoValue = realMeetings
        .filter(m => m.isRecurring && !m.desiredOutcome && !m.outcome)
        .reduce((acc, m) => {
            const key = m.recurringId || m.title;
            if (!acc[key]) acc[key] = { title: m.title, count: 0, lastOutcome: null as string | null };
            acc[key].count++;
            if (m.outcome) acc[key].lastOutcome = m.outcome;
            return acc;
        }, {} as Record<string, { title: string; count: number; lastOutcome: string | null }>);

    // Stakeholder gaps: key stakeholders not met this week
    const stakeholderGaps = await findStakeholderGaps(userId, weekStart);

    // Save snapshot
    await prisma.meetingPatternSnapshot.create({
        data: {
            userId,
            weekStart,
            totalMeetings: realMeetings.length,
            outcomesSet,
            outcomesLanded,
            outcomesMissed,
            commitmentsMade,
            commitmentsFulfilled,
            categoryBreakdown,
            totalMeetingHours: Math.round(totalMeetingHours * 10) / 10,
            avgMeetingsPerDay: Math.round(avgMeetingsPerDay * 10) / 10,
            recurringWithNoValue: Object.values(recurringNoValue),
            stakeholderGaps,
            insights: [] // Will be populated by weekly reflection if confidence is sufficient
        }
    });

    console.log(`[MeetingChampion] Snapshot created: ${realMeetings.length} meetings, ${outcomesSet} outcomes set, ${outcomesLanded} landed`);

    // Check if we have enough data for weekly reflection
    await maybeGenerateWeeklyReflection(userId, realMeetings.length, outcomesSet);

    // Check if we have enough history for meeting advisory
    await generateMeetingAdvisory(userId);
}

/**
 * Find key stakeholders the user hasn't met with recently.
 */
async function findStakeholderGaps(userId: string, since: Date): Promise<any[]> {
    // Get stakeholders marked as important (from onboarding or interaction frequency)
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, interactionCount: { gte: 3 } },
        orderBy: { interactionCount: 'desc' },
        take: 20,
        select: { name: true, email: true, influenceLevel: true, lastInteraction: true }
    });

    // Get emails of people met this week
    const weekMeetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: since }, status: { not: 'cancelled' } },
        select: { participants: true }
    });
    const metThisWeek = new Set(weekMeetings.flatMap(m => m.participants.map(p => p.toLowerCase())));

    // Find gaps
    const gaps = stakeholders
        .filter(s => s.email && !metThisWeek.has(s.email.toLowerCase()))
        .map(s => ({
            name: s.name,
            lastMet: s.lastInteraction?.toISOString() || null,
            relationship: s.influenceLevel
        }))
        .slice(0, 5);

    return gaps;
}

// ─────────────────────────────────────────
// 2. WEEKLY REFLECTION (confidence-gated)
// ─────────────────────────────────────────

/**
 * Only generate a weekly reflection if we have enough data.
 * Minimum: 5 meetings in the week AND at least 2 outcomes set.
 * This prevents generic/empty reflections early on.
 */
async function maybeGenerateWeeklyReflection(
    userId: string,
    totalMeetings: number,
    outcomesSet: number
): Promise<void> {
    // Confidence gate
    if (totalMeetings < 5 || outcomesSet < 2) {
        console.log(`[MeetingChampion] Not enough data for reflection (${totalMeetings} meetings, ${outcomesSet} outcomes). Skipping.`);
        return;
    }

    // Check if we already sent a reflection this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existingReflection = await prisma.proactivePrompt.findFirst({
        where: {
            userId,
            type: 'REFLECTION',
            stakeholderId: 'weekly-reflection',
            deliveredAt: { gte: oneWeekAgo }
        }
    });
    if (existingReflection) return;

    // Get the snapshot we just created
    const snapshot = await prisma.meetingPatternSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
    if (!snapshot) return;

    // Get specific meeting data for narrative detail
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const reviewedMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: weekStart },
            lifecycleStage: 'REVIEWED'
        },
        include: { conversationOutcome: true },
        orderBy: { startTime: 'desc' },
        take: 10
    });

    // Previous week snapshot for comparison
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const prevSnapshot = await prisma.meetingPatternSnapshot.findFirst({
        where: { userId, weekStart: { gte: twoWeeksAgo, lt: weekStart } }
    });

    // Get upcoming week for forward look
    const nextWeekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const upcomingMeetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: new Date(), lte: nextWeekEnd }, status: { not: 'cancelled' } },
        orderBy: { startTime: 'asc' },
        take: 15
    });
    const upcomingNeedleMovers = upcomingMeetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER' || m.isPresentation);

    // Build LLM prompt for reflection
    const llmConfig = await getUserLLMConfig(userId);
    const prompt = `You are Mira, an executive coach. Generate a weekly meeting reflection for the user.

THIS WEEK'S DATA:
- Total meetings: ${snapshot.totalMeetings}
- Outcomes set: ${snapshot.outcomesSet} of ${snapshot.totalMeetings}
- Outcomes landed: ${snapshot.outcomesLanded}
- Outcomes missed: ${snapshot.outcomesMissed}
- Total meeting hours: ${snapshot.totalMeetingHours}
- Avg meetings/day: ${snapshot.avgMeetingsPerDay}
- Category breakdown: ${JSON.stringify(snapshot.categoryBreakdown)}
- Commitments made: ${snapshot.commitmentsMade}, fulfilled: ${snapshot.commitmentsFulfilled}

${prevSnapshot ? `LAST WEEK FOR COMPARISON:
- Meetings: ${prevSnapshot.totalMeetings}, outcomes set: ${prevSnapshot.outcomesSet}, landed: ${prevSnapshot.outcomesLanded}
` : ''}

SPECIFIC MEETINGS REVIEWED:
${reviewedMeetings.map(m => {
    const outcome = m.conversationOutcome as any;
    return `- "${m.title}": outcome=${m.outcomeResult || 'unknown'}, desired="${m.desiredOutcome || 'not set'}"${outcome?.aiInsights ? `, insight: ${outcome.aiInsights.substring(0, 100)}` : ''}`;
}).join('\n')}

${(snapshot.recurringWithNoValue as any[]).length > 0 ? `RECURRING MEETINGS WITH NO VALUE:
${(snapshot.recurringWithNoValue as any[]).map((r: any) => `- "${r.title}" (${r.count} times, no outcome set)`).join('\n')}` : ''}

${(snapshot.stakeholderGaps as any[]).length > 0 ? `STAKEHOLDER GAPS (people not met this week):
${(snapshot.stakeholderGaps as any[]).map((g: any) => `- ${g.name} (${g.relationship || 'unknown'}), last met: ${g.lastMet || 'never'}`).join('\n')}` : ''}

NEXT WEEK:
- ${upcomingMeetings.length} meetings ahead
- ${upcomingNeedleMovers.length} look like needle-movers

INSTRUCTIONS:
Write a brief, warm, specific weekly reflection. Structure:
1. One sentence summary of the week (reference specific numbers)
2. One specific callout of something that went WELL — reference a real meeting by name
3. One pattern observation — something you noticed, framed as "I noticed..." not a criticism
4. Forward look — "This week you have X meetings. N look important. Want to prep for those?"

RULES:
- Under 150 words total
- Reference specific meeting names, not just aggregates
- If comparing to last week, mention the trend naturally ("You're setting more outcomes than last week")
- Do NOT give generic advice. Be specific.
- Do NOT use scores or ratings
- Tone: like a coach after watching game film — specific, encouraging, actionable
- End with an actionable question`;

    try {
        const reflection = await generateText(llmConfig, prompt);
        if (!reflection || reflection.length < 20) return;

        // Save as message
        const savedMessage = await prisma.message.create({
            data: { userId, role: 'assistant', content: reflection, type: 'PROACTIVE_NUDGE' }
        });

        // Dedup record
        await prisma.proactivePrompt.create({
            data: {
                userId,
                type: 'REFLECTION',
                content: reflection,
                stakeholderId: 'weekly-reflection',
                deliveredVia: 'pusher'
            }
        });

        // Push to user
        await publishMessage(userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: reflection,
            createdAt: savedMessage.createdAt
        });

        await sendPushToUser(userId, {
            title: 'Mira — Weekly Reflection',
            body: reflection.replace(/\*\*/g, '').substring(0, 120),
            url: '/v2'
        });

        // Update snapshot with generated insights
        await prisma.meetingPatternSnapshot.update({
            where: { id: snapshot.id },
            data: { insights: [reflection] }
        });

        console.log(`[MeetingChampion] Weekly reflection sent for ${userId}`);
    } catch (error: any) {
        console.error(`[MeetingChampion] Reflection generation failed: ${error.message}`);
    }
}

// ─────────────────────────────────────────
// 3. COMMITMENT REMINDERS
// ─────────────────────────────────────────

/**
 * Check for commitments that are due today or overdue.
 * Send a nudge for each, max 2 per day.
 */
export async function checkCommitmentReminders(userId: string): Promise<void> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Find commitments due today or overdue
    const dueCommitments = await prisma.meetingCommitment.findMany({
        where: {
            userId,
            status: 'PENDING',
            dueDate: { lte: endOfDay },
            // Don't remind if we already reminded today
            OR: [
                { reminderSentAt: null },
                { reminderSentAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }
            ]
        },
        include: { meeting: { select: { title: true } } },
        orderBy: { dueDate: 'asc' },
        take: 2 // Max 2 reminders per day
    });

    if (dueCommitments.length === 0) return;

    // Mark overdue ones
    for (const c of dueCommitments) {
        if (c.dueDate && c.dueDate < now) {
            await prisma.meetingCommitment.update({
                where: { id: c.id },
                data: { status: 'OVERDUE' }
            });
        }
    }

    // Build a single consolidated reminder message
    const commitmentLines = dueCommitments.map(c => {
        const isOverdue = c.dueDate && c.dueDate < now;
        const meetingTitle = c.meeting?.title || 'a meeting';
        const dateStr = c.dueDate ? c.dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'no date set';
        return `- **${c.owner}** was going to ${c.description} (from "${meetingTitle}", due ${dateStr})${isOverdue ? ' — overdue' : ''}`;
    });

    const message = dueCommitments.length === 1
        ? `Quick follow-up: ${commitmentLines[0].replace('- ', '')}\n\nHas this happened?`
        : `A couple of follow-ups due:\n\n${commitmentLines.join('\n')}\n\nWant to check in on these?`;

    // Save and deliver
    const savedMessage = await prisma.message.create({
        data: { userId, role: 'assistant', content: message, type: 'PROACTIVE_NUDGE' }
    });

    await publishMessage(userId, {
        id: savedMessage.id,
        role: 'assistant',
        content: message,
        createdAt: savedMessage.createdAt
    });

    await sendPushToUser(userId, {
        title: MIRA_NOTIFICATIONS.commitment.title,
        body: MIRA_NOTIFICATIONS.commitment.bodyTemplate(message),
        url: '/v2'
    });

    // Voice call delivery — if user prefers voice, trigger a commitment reminder call
    try {
        const wantsVoice = await shouldDeliverViaVoice(userId);
        if (wantsVoice) {
            console.log(`[MeetingChampion] User prefers voice — triggering commitment_reminder call`);
            await triggerVoiceCall({ userId, callType: 'commitment_reminder' });
        }
    } catch (voiceErr: unknown) {
        const errMsg = voiceErr instanceof Error ? voiceErr.message : String(voiceErr);
        console.error(`[MeetingChampion] Voice call failed: ${errMsg}`);
    }

    // Mark reminders as sent
    for (const c of dueCommitments) {
        await prisma.meetingCommitment.update({
            where: { id: c.id },
            data: { reminderSentAt: now }
        });
    }

    console.log(`[MeetingChampion] Sent ${dueCommitments.length} commitment reminders for ${userId}`);
}

// ─────────────────────────────────────────
// 4. MEETING ADVISORY (confidence-gated)
// ─────────────────────────────────────────

/**
 * Suggest meetings the user should set up.
 * Only runs after 2+ weeks of pattern data.
 * Called as part of the weekly pattern snapshot flow.
 * Max 2 recommendations per week.
 */
export async function generateMeetingAdvisory(userId: string): Promise<void> {
    // Confidence gate: need at least 2 weekly snapshots
    const snapshotCount = await prisma.meetingPatternSnapshot.count({ where: { userId } });
    if (snapshotCount < 2) {
        console.log(`[MeetingChampion] Only ${snapshotCount} snapshots — need 2+ for advisory. Skipping.`);
        return;
    }

    // Dedup: check if we already sent advisory this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existingAdvisory = await prisma.proactivePrompt.count({
        where: {
            userId,
            type: 'OPPORTUNITY',
            stakeholderId: { startsWith: 'advisory-' },
            deliveredAt: { gte: oneWeekAgo }
        }
    });
    if (existingAdvisory >= 2) return;

    // Get latest snapshot for gaps
    const snapshot = await prisma.meetingPatternSnapshot.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
    if (!snapshot) return;

    const gaps = snapshot.stakeholderGaps as any[];
    if (!gaps || gaps.length === 0) return;

    // Get user's active goals for context
    const activeGoals = await prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { stakeholders: true },
        take: 5
    });

    // Find the most impactful gap — stakeholder linked to a goal
    const goalStakeholderNames = new Set(
        activeGoals.flatMap(g => g.stakeholders.map(s => s.id))
    );

    // Also check stakeholder profiles matching gap names
    const gapNames = gaps.map(g => g.name);
    const matchingStakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, name: { in: gapNames } },
        select: { name: true, id: true }
    });

    // Pick the top gap to recommend
    const topGap = gaps[0];
    if (!topGap) return;

    const matchingProfile = matchingStakeholders.find(s => s.name === topGap.name);
    const relatedGoal = matchingProfile
        ? activeGoals.find(g => g.stakeholders.some(s => s.id === matchingProfile.id))
        : null;

    const message = relatedGoal
        ? `You haven't synced with **${topGap.name}** in a while${topGap.lastMet ? ` (last: ${new Date(topGap.lastMet).toLocaleDateString()})` : ''}. They're connected to your goal: "${relatedGoal.description}". Might be worth a quick 30-min alignment.`
        : `You haven't met with **${topGap.name}**${topGap.relationship ? ` (${topGap.relationship})` : ''} recently${topGap.lastMet ? ` — last sync was ${new Date(topGap.lastMet).toLocaleDateString()}` : ''}. Worth reconnecting?`;

    // Save and deliver
    const savedMessage = await prisma.message.create({
        data: { userId, role: 'assistant', content: message, type: 'PROACTIVE_NUDGE' }
    });

    await prisma.proactivePrompt.create({
        data: {
            userId,
            type: 'OPPORTUNITY',
            content: message,
            stakeholderId: `advisory-${topGap.name}`,
            deliveredVia: 'pusher'
        }
    });

    await publishMessage(userId, {
        id: savedMessage.id,
        role: 'assistant',
        content: message,
        createdAt: savedMessage.createdAt
    });

    console.log(`[MeetingChampion] Advisory sent: meet with ${topGap.name}`);
}
