import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkObservations } from '@/lib/utils/check-observations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/observations/status
 * Check observation recording status
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const status = await checkObservations();

        return NextResponse.json({
            success: true,
            ...status,
        });
    } catch (error) {
        console.error('[API] Error checking observations:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to check observations',
            },
            { status: 500 }
        );
    }
}
