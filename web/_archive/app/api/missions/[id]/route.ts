import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
    getMissionById,
    startMission,
    logEvidence,
    completeMission,
    validateMission,
} from '@/lib/feedback-loop/mission-tracker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/missions/[id]
 * Get a specific mission by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const missionId = (await params).id;
        const mission = await getMissionById(missionId);

        if (!mission) {
            return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
        }

        // Ensure user owns this mission
        if (mission.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.json({
            success: true,
            mission,
        });
    } catch (error) {
        console.error('[API] Error fetching mission:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch mission',
            },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/missions/[id]
 * Update a mission (start, log evidence, complete, validate)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const missionId = (await params).id;
        const mission = await getMissionById(missionId);

        if (!mission) {
            return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
        }

        // Ensure user owns this mission
        if (mission.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { action, artifactId, currentScore, validationNotes } = body;

        let updatedMission;

        switch (action) {
            case 'start':
                updatedMission = await startMission(missionId);
                break;

            case 'log_evidence':
                if (!artifactId) {
                    return NextResponse.json({ error: 'artifactId required' }, { status: 400 });
                }
                updatedMission = await logEvidence({
                    missionId: missionId,
                    artifactId,
                });
                break;

            case 'complete':
                updatedMission = await completeMission(missionId);
                break;

            case 'validate':
                if (currentScore === undefined) {
                    return NextResponse.json({ error: 'currentScore required' }, { status: 400 });
                }
                updatedMission = await validateMission({
                    missionId: missionId,
                    currentScore: parseFloat(currentScore),
                    validationNotes,
                });
                break;

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            mission: updatedMission,
        });
    } catch (error) {
        console.error('[API] Error updating mission:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update mission',
            },
            { status: 500 }
        );
    }
}
