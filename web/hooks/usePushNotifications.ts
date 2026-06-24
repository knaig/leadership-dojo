
import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY) {
            setIsSupported(true);

            // Check current subscription
            navigator.serviceWorker.ready.then(function (registration) {
                registration.pushManager.getSubscription().then(function (sub) {
                    setSubscription(sub);
                    setLoading(false);
                });
            });
        } else {
            setLoading(false);
        }
    }, []);

    const subscribe = async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');

            // Wait for it to be active
            await navigator.serviceWorker.ready;

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            console.log('User Subscribed:', sub);

            // Send to backend
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(sub)
            });

            setSubscription(sub);
            return true;
        } catch (error) {
            console.error('Failed to subscribe:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const unsubscribe = async () => {
        setLoading(true);
        try {
            if (subscription) {
                await subscription.unsubscribe();
                setSubscription(null);
                // Ideally call backend to remove too
            }
        } catch (error) {
            console.error('Error unsubscribing', error);
        } finally {
            setLoading(false);
        }
    };

    const sendTestNotification = async () => {
        try {
            await fetch('/api/push/test', { method: 'POST' });
        } catch (e) {
            console.error(e);
        }
    }

    return {
        isSupported,
        isSubscribed: !!subscription,
        subscription,
        subscribe,
        unsubscribe,
        sendTestNotification,
        loading
    };
}
