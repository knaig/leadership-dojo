/**
 * Worker Web Push Notifications
 *
 * Sends browser push notifications to users for proactive nudges.
 * Uses the PushSubscription model to get user's registered devices.
 */

import webpush from 'web-push';
import { prisma } from './prisma';

// Initialize VAPID details for web push
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    try {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:support@clarity.app',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        console.log('[WebPush] ✅ VAPID details configured');
    } catch (err) {
        console.error('[WebPush] ❌ Error setting VAPID details:', err);
    }
} else {
    console.warn('[WebPush] ⚠️ VAPID keys not set. Push notifications disabled.');
}

interface PushPayload {
    title: string;
    body: string;
    url?: string;
    icon?: string;
    badge?: string;
}

/**
 * Send push notification to all of a user's registered devices
 */
export async function sendPushToUser(
    userId: string,
    payload: PushPayload
): Promise<{ sent: number; failed: number }> {
    // Get all push subscriptions for this user
    const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId }
    });

    if (subscriptions.length === 0) {
        console.log(`[WebPush] No subscriptions for user ${userId.substring(0, 8)}...`);
        return { sent: 0, failed: 0 };
    }

    console.log(`[WebPush] Sending to ${subscriptions.length} device(s) for user ${userId.substring(0, 8)}...`);

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                },
                JSON.stringify(payload)
            );
            sent++;
            console.log(`[WebPush] ✅ Sent to subscription ${sub.id.substring(0, 8)}...`);
        } catch (error: any) {
            failed++;
            console.error(`[WebPush] ❌ Failed to send to ${sub.id}:`, error.message);

            // If subscription is expired/invalid (410 Gone), delete it
            if (error.statusCode === 410) {
                console.log(`[WebPush] 🗑️ Deleting expired subscription ${sub.id}`);
                await prisma.pushSubscription.delete({
                    where: { id: sub.id }
                }).catch(() => {
                    // Ignore delete errors
                });
            }
        }
    }

    console.log(`[WebPush] Results: ${sent} sent, ${failed} failed`);
    return { sent, failed };
}
