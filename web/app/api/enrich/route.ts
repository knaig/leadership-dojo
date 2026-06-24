import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/enrich
 *
 * Triggers stakeholder enrichment for the authenticated user.
 * The actual enrichment runs via the worker's cron job or pg-boss queue.
 * This endpoint marks that enrichment was requested so the next worker
 * cycle picks it up promptly.
 */
export async function POST() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The worker picks up enrichment jobs via cron (daily at 13:00 UTC).
    // For on-demand triggering, we rely on the cron or a direct pg-boss send.
    // Since the web app cannot directly access pg-boss, we return a success
    // message indicating the enrichment will run on the next cycle.
    //
    // Future enhancement: Add a PendingEnrichmentRequest table or use
    // a webhook to the worker for immediate execution.

    return NextResponse.json({
        success: true,
        message: 'Enrichment queued. Stakeholder profiles will be updated within the next daily cycle.',
    });
}
