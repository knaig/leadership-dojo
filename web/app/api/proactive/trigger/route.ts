/**
 * Trigger Proactive Message API
 *
 * POST /api/proactive/trigger
 * Body: { trigger?: string }
 *
 * Queues a proactive-agent job for the authenticated user.
 * Used by the "Ask Mira" button to test/trigger proactive messages on demand.
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const VALID_TRIGGERS = [
    'PRE_MEETING_PREP',
    'MORNING_BRIEF',
    'ONBOARDING',
    'CONTEXT_DEEPENING',
    // [DISABLED] 'POST_DOCUMENT_ACTIVITY', 'EXECUTION_NUDGE', 'GOAL_CHECK_IN'
];

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const trigger = body.trigger || 'CONTEXT_DEEPENING';

        if (!VALID_TRIGGERS.includes(trigger)) {
            return NextResponse.json(
                { error: `Invalid trigger. Valid: ${VALID_TRIGGERS.join(', ')}` },
                { status: 400 }
            );
        }

        const queue = await getQueue();
        await queue.send('proactive-agent', { userId, trigger, force: true });

        return NextResponse.json({ success: true, trigger, queued: true });

    } catch (error: any) {
        console.error('[Proactive Trigger API] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
