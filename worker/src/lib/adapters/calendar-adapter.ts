import { CalendarEvent, WatchSubscription } from './types';

export interface CalendarAdapter {
    provider: string;

    /**
     * List calendar events in a date range.
     */
    listEvents(start: Date, end: Date, options?: {
        maxResults?: number;
        pageToken?: string;
        syncToken?: string;
    }): Promise<{ events: CalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }>;

    /**
     * Set up push notifications for calendar changes.
     */
    watchEvents?(webhookUrl: string, channelId: string): Promise<WatchSubscription>;

    /**
     * Stop watching for changes.
     */
    stopWatch?(subscriptionId: string, resourceId: string): Promise<void>;
}
