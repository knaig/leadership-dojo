import { EmailThread, WatchSubscription } from './types';

export interface EmailAdapter {
    provider: string;

    /**
     * List email threads/messages, optionally filtered by date or query.
     */
    listThreads(options?: {
        maxResults?: number;
        query?: string;
        after?: Date;
        pageToken?: string;
    }): Promise<{ threads: EmailThread[]; nextPageToken?: string }>;

    /**
     * Get full thread details including all messages.
     */
    getThread?(threadId: string): Promise<EmailThread | null>;

    /**
     * Set up push notifications for new email.
     */
    watchInbox?(webhookUrl: string): Promise<WatchSubscription>;

    /**
     * Stop watching.
     */
    stopWatch?(subscriptionId: string): Promise<void>;
}
