
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    console.log('⚡️ [Chat API] Received request');
    const session = await auth();

    if (!session?.user?.id) {
        console.warn('⚠️ [Chat API] Unauthorized attempt');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { message } = await req.json();
        const userId = session.user.id;

        console.log(`📩 [Chat API] User ${userId} says: "${message}"`);

        // 0. Ensure user exists in DB (Clerk manages auth separately)
        await ensureUserExists(userId);

        // 1. Save User Message to DB
        const userMsg = await prisma.message.create({
            data: {
                userId,
                role: 'user',
                content: message,
            },
        });
        console.log(`✅ [Chat API] Saved DB Message: ${userMsg.id}`);

        // 2. Enqueue job via direct SQL INSERT into pgboss.job table.
        // We skip pg-boss.start() — it runs schema migrations and requires session-level
        // Postgres advisory locks that reliably time out in Vercel serverless functions.
        // We also skip publishMessage() here — the Render worker handles all Pusher publishing
        // after it processes the job (typing indicators + final AI response).
        console.log('📤 [Chat API] Inserting job into pgboss.job...');

        const payload = JSON.stringify({
            userId,
            message,
            messageId: userMsg.id,
            timestamp: new Date().toISOString()
        });

        const result = await prisma.$queryRaw<{ id: string }[]>`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES (
                'agent-interviewer',
                ${payload}::jsonb,
                'created',
                3,
                0,
                30,
                900,
                now(),
                now() + INTERVAL '7 days'
            )
            RETURNING id
        `;

        const jobId = result[0]?.id;

        if (jobId) {
            console.log(`🚀 [Chat API] Job Inserted! Job ID: ${jobId}`);
            return NextResponse.json({ success: true, jobId });
        } else {
            console.error('❌ [Chat API] INSERT returned no ID');
            return NextResponse.json({ error: 'Failed to queue job' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('🔥 [Chat API] Critical Error:', error?.message);
        return NextResponse.json({ error: `Failed: ${error?.message || String(error)}` }, { status: 500 });
    }
}
