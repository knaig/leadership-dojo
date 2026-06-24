import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/vapi/calls — List user's voice call history
 */
export async function GET(_req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const calls = await prisma.voiceCall.findMany({
        where: { userId },
        select: {
            id: true,
            callType: true,
            direction: true,
            status: true,
            durationSeconds: true,
            summary: true,
            transcript: true,
            recordingUrl: true,
            keyTakeaways: true,
            commitments: true,
            outcomeSet: true,
            startedAt: true,
            endedAt: true,
            meeting: {
                select: { id: true, title: true, startTime: true },
            },
        },
        orderBy: { startedAt: 'desc' },
        take: 30,
    });

    return NextResponse.json({ calls });
}
