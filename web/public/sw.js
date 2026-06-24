// Service Worker for Web Push Notifications
// Activate immediately on install (don't wait for old SW to die)
self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body || '',
            icon: data.icon || '/icon-192x192.png',
            badge: '/badge-72x72.png',
            vibrate: [100, 50, 100],
            tag: 'mira-notification',
            renotify: true,
            requireInteraction: false,
            data: {
                url: data.url || '/dashboard'
            },
        };
        event.waitUntil(
            self.registration.showNotification(data.title || 'Mira', options)
        );
    } catch (err) {
        console.error('[SW] Failed to show notification:', err);
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const url = (event.notification.data && event.notification.data.url) || '/dashboard';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Focus existing tab if open
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            // Otherwise open new tab
            if (self.clients.openWindow) {
                return self.clients.openWindow(url);
            }
        })
    );
});
