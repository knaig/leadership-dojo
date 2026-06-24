import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RelationshipSuggestion {
    type: 'stale_relationship' | 'unknown_stance' | 'pre_meeting' | 'new_stakeholder';
    stakeholderId: string;
    stakeholderName: string;
    reason: string;
    actionLabel: string;
    meetingId?: string;
    meetingTitle?: string;
    priority: 'high' | 'medium' | 'low';
}

/**
 * GET /api/ground-game/suggestions
 * Get active suggestions: stale relationships, pre-meeting 1:1s, new stakeholders.
 * This powers the "Relationships to Watch" section in Today Brief.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [importantStakeholders, upcomingMeetings] = await Promise.all([
        // Get important stakeholders with relationship data
        prisma.stakeholderProfile.findMany({
            where: {
                userId,
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
                politicalStance: true,
                relationshipStrength: true,
                lastInteraction: true,
                interactionCount: true,
                powerLevel: true,
                influenceRole: true,
                intelligence: {
                    select: { currentMood: true, objectionPatterns: true },
                },
            },
            orderBy: { lastInteraction: 'asc' },
            take: 20,
        }),

        // Get upcoming important meetings this week
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: now, lte: nextWeek },
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
            take: 5,
        }),
    ]);

    const suggestions: RelationshipSuggestion[] = [];

    // 1. Stale relationships with important people
    for (const s of importantStakeholders) {
        if (!s.lastInteraction) continue;
        const daysSince = Math.floor((now.getTime() - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000));

        if (daysSince >= 14) {
            suggestions.push({
                type: 'stale_relationship',
                stakeholderId: s.id,
                stakeholderName: s.name,
                reason: `No contact in ${daysSince} days. ${s.role ? `(${s.role})` : ''} Key ${s.influenceRole?.toLowerCase()?.replace('_', ' ') || 'stakeholder'}.`,
                actionLabel: 'Book 1:1',
                priority: daysSince >= 30 ? 'high' : 'medium',
            });
        }
    }

    // 2. Unknown stance with important people before high-stakes meetings
    for (const meeting of upcomingMeetings) {
        const participants = (meeting.participants || []) as string[];
        const meetingStakeholders = importantStakeholders.filter(s =>
            s.email && participants.some(p => p.toLowerCase() === s.email!.toLowerCase())
        );

        for (const s of meetingStakeholders) {
            if (s.politicalStance === 'UNKNOWN' || s.politicalStance === null) {
                suggestions.push({
                    type: 'unknown_stance',
                    stakeholderId: s.id,
                    stakeholderName: s.name,
                    reason: `In your ${meeting.title} but you haven't assessed their position yet.`,
                    actionLabel: 'Get a read',
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    priority: 'high',
                });
            } else if (s.politicalStance === 'SKEPTIC' || s.politicalStance === 'HOSTILE') {
                const concern = s.intelligence?.objectionPatterns?.[0];
                suggestions.push({
                    type: 'pre_meeting',
                    stakeholderId: s.id,
                    stakeholderName: s.name,
                    reason: `Currently ${s.politicalStance.toLowerCase()} ahead of ${meeting.title}.${concern ? ` Concern: "${concern}"` : ''} Meet them first.`,
                    actionLabel: 'Book 1:1',
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    priority: 'high',
                });
            }
        }
    }

    // 3. Dedup and sort by priority
    const seen = new Set<string>();
    const deduped = suggestions.filter(s => {
        const key = `${s.stakeholderId}-${s.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    deduped.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return NextResponse.json({
        suggestions: deduped.slice(0, 5),
        total: deduped.length,
    });
}
