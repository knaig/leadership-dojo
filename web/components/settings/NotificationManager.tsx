
'use client';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Loader2 } from 'lucide-react';

export function NotificationManager() {
    const { isSupported, isSubscribed, subscribe, unsubscribe, sendTestNotification, loading } = usePushNotifications();


    const handleSubscribe = async () => {
        const success = await subscribe();
        if (success) {
            alert('Notifications enabled!');
        } else {
            alert('Failed to enable notifications. Please check your browser settings.');
        }
    };

    const handleTest = async () => {
        try {
            await sendTestNotification();
            alert('Notification sent!');
        } catch (e) {
            alert('Failed to send');
        }
    };


    if (!isSupported) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Notifications</CardTitle>
                    <CardDescription>Push notifications are not supported in this browser context (http vs https or browser limitations).</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    Push Notifications
                </CardTitle>
                <CardDescription>
                    Get alerted when it's time to prep for a high-stakes meeting.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <div className="text-sm font-medium">Daily Prep Reminders</div>
                        <div className="text-xs text-muted-foreground">Receive a nudge 1 hour before key meetings.</div>
                    </div>
                    {loading ? (
                        <Button disabled size="sm"><Loader2 className="w-4 h-4 animate-spin" /></Button>
                    ) : isSubscribed ? (
                        <Button variant="outline" size="sm" onClick={unsubscribe} className="text-red-500 hover:text-red-600 border-red-200 bg-red-50">
                            Disable Notifications
                        </Button>
                    ) : (
                        <Button size="sm" onClick={handleSubscribe}>
                            Enable Notifications
                        </Button>
                    )}
                </div>

                {isSubscribed && (
                    <div className="pt-4 border-t flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Test that your device can receive alerts.</span>
                        <Button variant="secondary" size="sm" onClick={handleTest} disabled={loading}>
                            Send Test Notification
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
