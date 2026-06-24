
import webpush from 'web-push';
import { BRAND } from '@/lib/brand';

if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    console.warn('VAPID keys not set. Push notifications will not work.');
} else {
    try {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || `mailto:${BRAND.supportEmail}`,
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } catch (err) {
        console.error('Error setting VAPID details:', err);
    }
}

export const sendPushNotification = async (subscription: { endpoint: string, p256dh: string, auth: string }, payload: any) => {
    return webpush.sendNotification(
        {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
            }
        },
        JSON.stringify(payload)
    );
};
