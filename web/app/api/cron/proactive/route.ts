/**
 * Proactive Cron Endpoint (Legacy → Worker Delegation)
 *
 * Previously generated static morning briefs directly.
 * Now delegates to the worker's LLM-powered proactive agent via pg-boss queue.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const queue = await getQueue();

        // Find users who should get proactive messages
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { preferences: null },
                    { preferences: { enableProactivePrompts: true } }
                ]
            },
            select: { id: true },
            take: 50
        });

        for (const user of users) {
            await queue.send('proactive-agent', {
                userId: user.id,
                trigger: 'MORNING_BRIEF'
            });
        }

        return NextResponse.json({ success: true, queued: users.length });
    } catch (error: any) {
        console.error('[Cron Proactive] Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
