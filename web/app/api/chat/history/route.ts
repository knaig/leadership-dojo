
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let session;
    try {
        session = await auth();
    } catch (authErr: any) {
        console.error('[Chat History] auth() threw:', authErr?.message);
        return NextResponse.json({ error: 'Auth failed', detail: authErr?.message }, { status: 500 });
    }

    if (!session?.user?.id) {
        console.warn('[Chat History] No session user id');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log(`[Chat History] Fetching for user ${session.user.id}`);

        // Ensure user exists in DB (Clerk manages auth separately)
        await ensureUserExists(session.user.id);

        // Fetch most recent 200 messages (desc), then reverse for chronological display
        const messagesDesc = await prisma.message.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        const messages = messagesDesc.reverse();

        console.log(`[Chat History] Found ${messages.length} messages`);

        // Proactive ONBOARDING trigger if user has no chat history.
        // Uses direct SQL INSERT into pgboss.job (same pattern as chat route)
        // to avoid pg-boss.start() which times out in Vercel serverless.
        if (messages.length === 0) {
            try {
                const payload = JSON.stringify({
                    userId: session.user.id,
                    trigger: 'ONBOARDING'
                });
                await prisma.$queryRaw`
                    INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
                    VALUES (
                        'proactive-agent',
                        ${payload}::jsonb,
                        'created',
                        3, 0, 30, 900,
                        now(),
                        now() + INTERVAL '7 days'
                    )
                `;
            } catch (err) {
                console.error("Failed to queue onboarding proactive agent", err);
            }
        }

        const state = await prisma.conversationState.findUnique({
            where: { userId: session.user.id }
        });

        return NextResponse.json({
            messages,
            mode: state?.mode || 'GENERAL',
            state: state,
        });
    } catch (error: any) {
        console.error('[Chat History] Error:', error?.message, error?.stack?.slice(0, 300));
        return NextResponse.json({ error: 'Failed to fetch history', detail: error?.message }, { status: 500 });
    }
}
