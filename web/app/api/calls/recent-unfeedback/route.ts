import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calls/recent-unfeedback
 * Returns the most recent VoiceCall that doesn't have manual (in_app) CallFeedback.
 * Only returns calls from the last 24 hours.
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Find calls from the last 24 hours that have ended
        const recentCalls = await prisma.voiceCall.findMany({
            where: {
                userId,
                status: 'ended',
                startedAt: { gte: twentyFourHoursAgo },
                durationSeconds: { gt: 30 }, // Only meaningful calls
            },
            orderBy: { startedAt: 'desc' },
            take: 5,
            select: {
                id: true,
                callType: true,
                durationSeconds: true,
                startedAt: true,
                summary: true,
            },
        });

        if (recentCalls.length === 0) {
            return NextResponse.json({ call: null });
        }

        // Find which of these already have manual feedback
        const callIds = recentCalls.map(c => c.id);
        const existingFeedback = await prisma.callFeedback.findMany({
            where: {
                voiceCallId: { in: callIds },
                userId,
                feedbackSource: 'in_app',
            },
            select: { voiceCallId: true },
        });

        const feedbackCallIds = new Set(existingFeedback.map(f => f.voiceCallId));

        // Return the first call without manual feedback
        const unfeedbackedCall = recentCalls.find(c => !feedbackCallIds.has(c.id));

        return NextResponse.json({ call: unfeedbackedCall || null });
    } catch (error) {
        console.error('[RecentUnfeedback] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
