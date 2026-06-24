import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runScenarioDetection } from '@/lib/detection/scenario-detector';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scenarios/detect
 * 
 * Runs AI-powered scenario detection for the authenticated user.
 * Returns detected leadership challenges based on synced email/meeting data.
 */
export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Run detection (don't persist automatically - let user interact)
        const scenarios = await runScenarioDetection(userId, false);

        return NextResponse.json({
            success: true,
            data: {
                scenarios,
                detectedAt: new Date().toISOString(),
                count: scenarios.length
            }
        });

    } catch (error) {
        console.error('[API] Scenario detection failed:', error);
        return NextResponse.json(
            { success: false, error: 'Detection failed' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/scenarios/detect
 * 
 * Runs detection and persists results.
 */
export async function POST() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const scenarios = await runScenarioDetection(userId, true);

        return NextResponse.json({
            success: true,
            data: {
                scenarios,
                persisted: true,
                detectedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('[API] Scenario detection failed:', error);
        return NextResponse.json(
            { success: false, error: 'Detection failed' },
            { status: 500 }
        );
    }
}
