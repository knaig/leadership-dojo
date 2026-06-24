'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import Pusher from 'pusher-js';
import { incrementUnread } from '@/lib/stores/unread-store';
import { toast } from 'sonner';
import { BRAND } from '@/lib/brand';

export function WebPushManager() {
    const { userId } = useAuth();
    const pathname = usePathname();
    const [isSubscribed, setIsSubscribed] = useState(false);

    // Listen for proactive nudges via Pusher and increment unread when not on chat
    useEffect(() => {
        if (!userId) return;
        const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
        const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
        if (!pusherKey || !pusherCluster) return;

        const pusher = new Pusher(pusherKey, {
            cluster: pusherCluster,
            authorizer: (channel) => ({
                authorize: async (socketId: string, callback: (error: Error | null, authData: any) => void) => {
                    try {
                        const response = await fetch('/api/pusher/auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            credentials: 'include',
                            body: new URLSearchParams({ socket_id: socketId, channel_name: channel.name }),
                        });
                        if (!response.ok) {
                            callback(new Error('Auth failed'), null);
                            return;
                        }
                        callback(null, await response.json());
                    } catch (error) {
                        callback(error as Error, null);
                    }
                },
            }),
        });

        const channel = pusher.subscribe(`private-user-${userId}`);
        channel.bind('new-message', (data: any) => {
            // Only notify if the message is from assistant
            if (data.role === 'assistant') {
                incrementUnread();

                // Show toast on any page
                const preview = (data.content || '').replace(/\*\*/g, '').substring(0, 120);
                toast(BRAND.name, {
                    description: preview + (data.content?.length > 120 ? '...' : ''),
                    action: {
                        label: 'View',
                        onClick: () => window.location.href = '/dashboard',
                    },
                    duration: 15000,
                });
            }
        });

        return () => {
            channel.unbind_all();
            pusher.unsubscribe(`private-user-${userId}`);
            pusher.disconnect();
        };
    }, [userId]);

    // Register push notifications
    useEffect(() => {
        if (!userId) return;

        const registerServiceWorkerAndSubscribe = async () => {
            try {
                if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                    console.log('[WebPush] Push notifications not supported by browser.');
                    return;
                }

                // 1. Register Service Worker first (must happen before permission request)
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('[WebPush] Service Worker registered:', registration.scope);

                // 2. Wait for it to be active
                await navigator.serviceWorker.ready;

                // 3. Check if already subscribed
                const existingSub = await registration.pushManager.getSubscription();
                if (existingSub) {
                    console.log('[WebPush] Already subscribed, syncing to backend');
                    await fetch('/api/notifications/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(existingSub),
                    });
                    setIsSubscribed(true);
                    return;
                }

                // 4. Request Permission
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.log('[WebPush] Notification permission denied.');
                    return;
                }

                // 5. Get VAPID key from backend
                const vapidRes = await fetch('/api/notifications/vapid-key');
                if (!vapidRes.ok) {
                    console.error('[WebPush] Failed to get VAPID key:', vapidRes.status);
                    return;
                }
                const { publicKey } = await vapidRes.json();

                // 6. Subscribe to PushManager
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(publicKey)
                });

                // 7. Send subscription to our backend
                const subRes = await fetch('/api/notifications/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(subscription),
                });

                if (subRes.ok) {
                    console.log('[WebPush] Successfully subscribed to push notifications');
                    setIsSubscribed(true);
                } else {
                    console.error('[WebPush] Failed to save subscription:', subRes.status);
                }

            } catch (error) {
                console.error('[WebPush] Error in setup:', error);
            }
        };

        // Auto-subscribe if permission is already granted, or prompt if default
        if (typeof Notification !== 'undefined' &&
            (Notification.permission === 'default' || Notification.permission === 'granted')) {
            registerServiceWorkerAndSubscribe();
        }

    }, [userId]);

    return null;
}

// Utility to convert VAPID key
function urlB64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
