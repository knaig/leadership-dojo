/**
 * Worker Pusher Publisher
 *
 * Used by the worker daemon to publish real-time events to users.
 */

import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
    if (!pusherInstance) {
        const appId = process.env.PUSHER_APP_ID;
        const key = process.env.PUSHER_KEY;
        const secret = process.env.PUSHER_SECRET;
        const cluster = process.env.PUSHER_CLUSTER;

        console.log('[Pusher] Initializing with:', {
            appId: appId ? `${appId.substring(0, 4)}...` : 'MISSING',
            key: key ? `${key.substring(0, 8)}...` : 'MISSING',
            secret: secret ? `${secret.substring(0, 4)}...` : 'MISSING',
            cluster: cluster || 'MISSING'
        });

        if (!appId || !key || !secret || !cluster) {
            console.error('[Pusher] ❌ Missing environment variables!');
            throw new Error('Pusher environment variables not configured');
        }

        pusherInstance = new Pusher({
            appId,
            key,
            secret,
            cluster,
            useTLS: true,
        });

        console.log('[Pusher] ✅ Worker instance initialized');
    }
    return pusherInstance;
}

/**
 * Safely publish an event (won't throw if Pusher fails)
 */
async function safePublish(userId: string, event: string, data: any): Promise<boolean> {
    try {
        console.log(`[Pusher] 📤 Publishing ${event} to user ${userId.substring(0, 8)}...`);
        const pusher = getPusher();
        const channel = `private-user-${userId}`;
        console.log(`[Pusher] Channel: ${channel}`);
        const result = await pusher.trigger(channel, event, data);
        console.log(`[Pusher] ✅ Published ${event} successfully`);
        return true;
    } catch (error: any) {
        console.error(`[Pusher] ❌ Failed to publish ${event}:`, error.message || error);
        // Don't throw - message is still in DB, user will see it on refresh
        return false;
    }
}

/**
 * Publish a new assistant message to the user
 */
export async function publishMessage(userId: string, message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}): Promise<boolean> {
    console.log(`[Pusher] Publishing message ${message.id} to user ${userId}`);
    return safePublish(userId, 'new-message', message);
}

/**
 * Publish typing indicator (show "thinking..." in UI)
 */
export async function publishTypingIndicator(userId: string, isTyping: boolean): Promise<boolean> {
    return safePublish(userId, 'typing', { isTyping });
}

/**
 * Publish system event (calendar sync complete, goal created, proactive nudge, etc.)
 */
export async function publishSystemEvent(userId: string, event: {
    type: 'calendar_sync_complete' | 'calendar_sync' | 'email_sync' | 'drive_sync' | 'google_disconnected' | 'microsoft_disconnected' | 'goal_created' | 'stakeholder_added' | 'mode_change' | 'proactive_nudge';
    message: string;
    data?: any;
}): Promise<boolean> {
    console.log(`[Pusher] Publishing system event: ${event.type}`);
    return safePublish(userId, 'system-event', event);
}

/**
 * Publish a proactive nudge notification (AI-initiated message)
 */
export async function publishProactiveNudge(userId: string, nudge: {
    trigger: string;
    messageId: string;
    preview: string;
}): Promise<boolean> {
    console.log(`[Pusher] 🔔 Publishing proactive nudge: ${nudge.trigger}`);
    return safePublish(userId, 'proactive-nudge', nudge);
}

/**
 * Publish conversation mode change
 */
export async function publishModeChange(userId: string, mode: string): Promise<boolean> {
    return safePublish(userId, 'mode-change', { mode });
}
