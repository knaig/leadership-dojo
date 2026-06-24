import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/voice/calls?limit=3
 * Returns recent completed voice calls for the current user.
 */
export async function GET(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '5'), 20);

    const calls = await prisma.voiceCall.findMany({
        where: {
            userId,
            status: 'ended',
            durationSeconds: { gt: 0 },
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        select: {
            id: true,
            callType: true,
            durationSeconds: true,
            summary: true,
            startedAt: true,
        },
    });

    // Map startedAt to createdAt for consistent client API
    const mapped = calls.map(c => ({
        id: c.id,
        callType: c.callType,
        durationSeconds: c.durationSeconds,
        summary: c.summary,
        createdAt: c.startedAt.toISOString(),
    }));

    return NextResponse.json({ calls: mapped });
}
