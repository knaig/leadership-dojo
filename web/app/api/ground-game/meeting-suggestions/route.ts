import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface MeetingSuggestion {
    type: 'relationship_gap' | 'pre_meeting' | 'follow_up' | 'new_connection';
    stakeholderId: string;
    stakeholderName: string;
    stakeholderRole: string | null;
    reason: string;
    urgency: 'urgent' | 'soon' | 'when_convenient';
    suggestedAgenda: string;
    relatedMeetingId?: string;
    relatedMeetingTitle?: string;
}

/**
 * GET /api/ground-game/meeting-suggestions
 * Suggest meetings to have based on relationship gaps, upcoming high-stakes meetings,
 * and stakeholder dynamics. This is the proactive meeting suggestion engine.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [stakeholders, upcomingHighStakes, recentCommitments] = await Promise.all([
        // Important stakeholders with relationship data
        prisma.stakeholderProfile.findMany({
            where: {
                userId,
                mergedIntoId: null,
                OR: [
                    { powerLevel: 'HIGH' },
                    { influenceRole: { in: ['DECISION_MAKER', 'KEY_INFLUENCER'] } },
                    { isImportant: true },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                organization: true,
                politicalStance: true,
                influenceRole: true,
                powerLevel: true,
                personaArchetype: true,
                relationshipStrength: true,
                lastInteraction: true,
                interactionCount: true,
                intelligence: {
                    select: { currentMood: true, objectionPatterns: true },
                },
            },
            orderBy: { lastInteraction: 'asc' },
        }),

        // Upcoming high-stakes meetings in next 2 weeks
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: now, lte: twoWeeksOut },
                status: { not: 'cancelled' },
                OR: [
                    { meetingCategory: 'NEEDLE_MOVER' },
                    { userImportanceOverride: { in: ['critical', 'high'] } },
                ],
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                participants: true,
            },
            orderBy: { startTime: 'asc' },
        }),

        // Recent commitments that need follow-up
        prisma.meetingCommitment.findMany({
            where: {
                userId,
                status: { in: ['PENDING', 'OVERDUE'] },
            },
            select: {
                id: true,
                owner: true,
                description: true,
                dueDate: true,
                status: true,
                meeting: {
                    select: { title: true },
                },
            },
            orderBy: { dueDate: 'asc' },
            take: 10,
        }),
    ]);

    const suggestions: MeetingSuggestion[] = [];

    // 1. Relationship gaps — important people going stale
    for (const s of stakeholders) {
        if (!s.lastInteraction) {
            // Never met — should meet if they're important
            if (s.powerLevel === 'HIGH' || s.influenceRole === 'DECISION_MAKER') {
                suggestions.push({
                    type: 'new_connection',
                    stakeholderId: s.id,
                    stakeholderName: s.name,
                    stakeholderRole: s.role,
                    reason: `Key ${s.influenceRole?.toLowerCase()?.replace('_', ' ') || 'stakeholder'} you haven't met yet.`,
                    urgency: 'soon',
                    suggestedAgenda: `Introductory 1:1. Learn their priorities and how you can help.`,
                });
            }
            continue;
        }

        const daysSince = Math.floor((now.getTime() - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000));
        const isHighPower = s.powerLevel === 'HIGH' || s.influenceRole === 'DECISION_MAKER';

        if (daysSince >= 21 && isHighPower) {
            suggestions.push({
                type: 'relationship_gap',
                stakeholderId: s.id,
                stakeholderName: s.name,
                stakeholderRole: s.role,
                reason: `No contact in ${daysSince} days. ${s.politicalStance === 'SKEPTIC' ? 'They were skeptical last time — check in.' : 'Keep this relationship warm.'}`,
                urgency: daysSince >= 30 ? 'urgent' : 'soon',
                suggestedAgenda: s.politicalStance === 'SKEPTIC' || s.politicalStance === 'HOSTILE'
                    ? `Address their concerns directly. Ask what would change their mind.`
                    : `Quick catch-up. Share wins, ask about their priorities, align on next steps.`,
            });
        }
    }

    // 2. Pre-meeting 1:1s — meet skeptics/unknowns before high-stakes meetings
    for (const meeting of upcomingHighStakes) {
        const participants = (meeting.participants || []) as string[];
        const daysUntil = Math.floor((meeting.startTime.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        const meetingStakeholders = stakeholders.filter(s =>
            s.email && participants.some(p => p.toLowerCase() === s.email!.toLowerCase())
        );

        for (const s of meetingStakeholders) {
            if (s.politicalStance === 'SKEPTIC' || s.politicalStance === 'HOSTILE') {
                suggestions.push({
                    type: 'pre_meeting',
                    stakeholderId: s.id,
                    stakeholderName: s.name,
                    stakeholderRole: s.role,
                    reason: `${s.politicalStance === 'HOSTILE' ? 'Hostile' : 'Skeptical'} ahead of "${meeting.title}" in ${daysUntil} days.`,
                    urgency: daysUntil <= 3 ? 'urgent' : 'soon',
                    suggestedAgenda: s.intelligence?.objectionPatterns?.[0]
                        ? `Address their concern: "${s.intelligence.objectionPatterns[0]}". Find common ground before the group meeting.`
                        : `Understand their position. Find alignment before the group meeting.`,
                    relatedMeetingId: meeting.id,
                    relatedMeetingTitle: meeting.title,
                });
            } else if (s.politicalStance === 'UNKNOWN' && (s.powerLevel === 'HIGH' || s.influenceRole === 'DECISION_MAKER')) {
                suggestions.push({
                    type: 'pre_meeting',
                    stakeholderId: s.id,
                    stakeholderName: s.name,
                    stakeholderRole: s.role,
                    reason: `Unknown stance on "${meeting.title}" in ${daysUntil} days. Key decision-maker — get a read.`,
                    urgency: daysUntil <= 5 ? 'urgent' : 'soon',
                    suggestedAgenda: `Learn where they stand. Share your perspective informally and gauge their reaction.`,
                    relatedMeetingId: meeting.id,
                    relatedMeetingTitle: meeting.title,
                });
            }
        }
    }

    // 3. Follow-up meetings for overdue commitments
    for (const c of recentCommitments) {
        if (c.status === 'OVERDUE') {
            const stakeholder = stakeholders.find(s =>
                s.name.toLowerCase() === c.owner.toLowerCase()
            );
            if (stakeholder) {
                suggestions.push({
                    type: 'follow_up',
                    stakeholderId: stakeholder.id,
                    stakeholderName: stakeholder.name,
                    stakeholderRole: stakeholder.role,
                    reason: `Overdue commitment from "${c.meeting?.title || 'a meeting'}": "${c.description}"`,
                    urgency: 'urgent',
                    suggestedAgenda: `Follow up on "${c.description}". Understand blockers and agree on revised timeline.`,
                });
            }
        }
    }

    // Dedup by stakeholder
    const seen = new Set<string>();
    const deduped = suggestions.filter(s => {
        const key = `${s.stakeholderId}-${s.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Sort by urgency
    const urgencyOrder = { urgent: 0, soon: 1, when_convenient: 2 };
    deduped.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    return NextResponse.json({
        suggestions: deduped.slice(0, 10),
        total: deduped.length,
    });
}
