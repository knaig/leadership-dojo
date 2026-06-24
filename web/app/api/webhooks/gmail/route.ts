/**
 * Gmail Push Notifications Webhook
 *
 * Receives notifications from Google Cloud Pub/Sub when Gmail changes.
 * The Pub/Sub subscription should be configured to push to this endpoint.
 *
 * Pub/Sub sends a POST with a JSON body containing:
 * {
 *   "message": {
 *     "data": base64-encoded JSON with { emailAddress, historyId },
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * @see https://developers.google.com/gmail/api/guides/push
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface PubSubMessage {
    message: {
        data: string; // base64-encoded
        messageId: string;
        publishTime: string;
    };
    subscription: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as PubSubMessage;

        if (!body.message?.data) {
            console.log('[Gmail Webhook] No message data, ignoring');
            return NextResponse.json({ status: 'ignored' }, { status: 200 });
        }

        // Decode the Pub/Sub message
        const decoded = Buffer.from(body.message.data, 'base64').toString('utf-8');
        const notification = JSON.parse(decoded) as { emailAddress: string; historyId: number };

        console.log(`[Gmail Webhook] email=${notification.emailAddress} historyId=${notification.historyId}`);

        // Find user by email address
        const user = await prisma.user.findUnique({
            where: { email: notification.emailAddress }
        });

        if (!user) {
            console.log(`[Gmail Webhook] No user found for ${notification.emailAddress}`);
            return NextResponse.json({ status: 'unknown user' }, { status: 200 });
        }

        // Queue email sync job
        const payload = JSON.stringify({ userId: user.id });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES (
                'email-sync',
                ${payload}::jsonb,
                'created',
                2, 0, 30, 300,
                now(),
                now() + interval '1 day'
            )
        `;

        console.log(`[Gmail Webhook] Queued email-sync for user ${user.id.substring(0, 8)}...`);
        return NextResponse.json({ status: 'queued' });

    } catch (err) {
        console.error('[Gmail Webhook] Error:', err);
        // Always return 200 to Pub/Sub to avoid retries
        return NextResponse.json({ status: 'error' }, { status: 200 });
    }
}

// Pub/Sub may also send GET for verification
export async function GET() {
    return NextResponse.json({ status: 'ok' });
}
