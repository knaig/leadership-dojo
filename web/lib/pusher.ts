/**
 * Pusher Server Instance (Singleton)
 *
 * Used by API routes to publish events to user channels.
 */

import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
    if (!pusherInstance) {
        if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY ||
            !process.env.PUSHER_SECRET || !process.env.PUSHER_CLUSTER) {
            throw new Error('Pusher environment variables not configured');
        }

        pusherInstance = new Pusher({
            appId: process.env.PUSHER_APP_ID,
            key: process.env.PUSHER_KEY,
            secret: process.env.PUSHER_SECRET,
            cluster: process.env.PUSHER_CLUSTER,
            useTLS: true,
        });
    }
    return pusherInstance;
}

/**
 * Publish an event to a user's private channel
 */
export async function publishToUser(userId: string, event: string, data: any) {
    const pusher = getPusher();
    await pusher.trigger(`private-user-${userId}`, event, data);
}

/**
 * Publish a new message to a user
 */
export async function publishMessage(userId: string, message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}) {
    await publishToUser(userId, 'new-message', message);
}

/**
 * Publish typing indicator
 */
export async function publishTypingIndicator(userId: string, isTyping: boolean) {
    await publishToUser(userId, 'typing', { isTyping });
}

/**
 * Publish system event (calendar sync complete, goal created, etc.)
 */
export async function publishSystemEvent(userId: string, event: {
    type: 'calendar_sync_complete' | 'goal_created' | 'stakeholder_added' | 'mode_change';
    message: string;
    data?: any;
}) {
    await publishToUser(userId, 'system-event', event);
}
