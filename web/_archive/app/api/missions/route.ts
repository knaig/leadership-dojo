import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
    createMission,
    getUserMissions,
    getMissionById,
    startMission,
    logEvidence,
    completeMission,
    validateMission,
    getMissionStats,
} from '@/lib/feedback-loop/mission-tracker';
import { MissionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/missions
 * Get all missions for the current user
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') as MissionStatus | null;
        const statsOnly = searchParams.get('stats') === 'true';

        if (statsOnly) {
            const stats = await getMissionStats(session.user.id);
            return NextResponse.json({ success: true, stats });
        }

        const missions = await getUserMissions(session.user.id, status || undefined);

        return NextResponse.json({
            success: true,
            missions,
        });
    } catch (error) {
        console.error('[API] Error fetching missions:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch missions',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/missions
 * Create a new mission
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        let { title, description, capacityId, recommendationId, targetScore, baselineScore, deadline, capacityName } = body;

        // If capacityId is missing but we have a name, try to look it up
        if (!capacityId && capacityName) {
            const capacity = await prisma.capacity.findFirst({
                where: { name: capacityName }
            });
            if (capacity) {
                capacityId = capacity.id;
            }
        }

        if (!title || !description || !capacityId || !targetScore || !baselineScore || !deadline) {
            return NextResponse.json(
                { error: 'Missing required fields (title, description, capacityId/capacityName, scores, deadline)' },
                { status: 400 }
            );
        }

        const mission = await createMission({
            userId: session.user.id,
            title,
            description,
            capacityId,
            recommendationId,
            targetScore: parseFloat(targetScore),
            baselineScore: parseFloat(baselineScore),
            deadline: new Date(deadline),
        });

        return NextResponse.json({
            success: true,
            mission,
        });
    } catch (error) {
        console.error('[API] Error creating mission:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create mission',
            },
            { status: 500 }
        );
    }
}
