/**
 * Google Calendar Push Notifications Webhook
 *
 * Receives real-time notifications when calendar events change.
 * Queues a calendar-sync job for the affected user.
 *
 * Headers from Google:
 * - X-Goog-Channel-ID: The channel ID we created
 * - X-Goog-Resource-ID: The resource being watched
 * - X-Goog-Resource-State: "sync" (initial) | "exists" (event changed)
 *
 * @see https://developers.google.com/calendar/api/guides/push
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
    const channelId = request.headers.get('X-Goog-Channel-ID');
    const resourceId = request.headers.get('X-Goog-Resource-ID');
    const resourceState = request.headers.get('X-Goog-Resource-State');

    console.log(`[GCal Webhook] state=${resourceState} channel=${channelId}`);

    if (!channelId) {
        return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // Validate channel exists in our DB
    const channel = await prisma.watchChannel.findUnique({
        where: { channelId }
    });

    if (!channel) {
        console.log(`[GCal Webhook] Unknown channel ${channelId}, ignoring`);
        return NextResponse.json({ status: 'unknown channel' }, { status: 200 });
    }

    // Update resourceId if not set
    if (resourceId && !channel.resourceId) {
        await prisma.watchChannel.update({
            where: { id: channel.id },
            data: { resourceId }
        });
    }

    // "sync" = initial validation from Google, just ACK
    if (resourceState === 'sync') {
        console.log(`[GCal Webhook] Initial sync ACK for user ${channel.userId.substring(0, 8)}...`);
        return NextResponse.json({ status: 'ok' });
    }

    // "exists" = event created/updated/deleted — queue a sync
    try {
        const payload = JSON.stringify({ userId: channel.userId });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES (
                'calendar-sync',
                ${payload}::jsonb,
                'created',
                2, 0, 30, 300,
                now(),
                now() + interval '1 day'
            )
        `;
        console.log(`[GCal Webhook] Queued calendar-sync for user ${channel.userId.substring(0, 8)}...`);
    } catch (err) {
        console.error('[GCal Webhook] Failed to queue job:', err);
    }

    return NextResponse.json({ status: 'queued' });
}

// Google sends HEAD to verify endpoint
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}
