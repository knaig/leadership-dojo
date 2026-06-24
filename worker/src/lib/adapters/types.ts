/**
 * Shared types for data adapters.
 * All providers (Google, Microsoft, etc.) normalize their data to these shapes.
 */

export interface CalendarEvent {
    externalId: string;          // provider's event ID
    title: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    location: string | null;
    isAllDay: boolean;
    isRecurring: boolean;
    status: 'confirmed' | 'tentative' | 'cancelled';
    organizer: { email: string; name?: string } | null;
    attendees: Array<{
        email: string;
        name?: string;
        responseStatus?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
        self?: boolean;
    }>;
    meetingLink: string | null;  // Zoom, Meet, Teams URL
    attachments: Array<{ title: string; url: string }>;
    raw?: any;                   // original provider response for debugging
}

export interface EmailThread {
    externalId: string;          // provider's thread/conversation ID
    subject: string;
    snippet: string;             // preview text
    from: { email: string; name?: string };
    to: Array<{ email: string; name?: string }>;
    cc: Array<{ email: string; name?: string }>;
    date: Date;
    isRead: boolean;
    isStarred: boolean;
    labels: string[];            // Gmail labels or Outlook categories
    hasAttachments: boolean;
    messageCount: number;        // messages in thread
    participants: string[];      // all unique email addresses in thread
    raw?: any;
}

export interface DocumentItem {
    externalId: string;
    title: string;
    mimeType: string;
    url: string | null;
    lastModified: Date;
    createdAt: Date;
    owner: { email: string; name?: string } | null;
    sharedWith: Array<{ email: string; name?: string }>;
    size: number | null;         // bytes
    raw?: any;
}

export interface WatchSubscription {
    id: string;
    resourceId: string;
    expiresAt: Date;
}

export type DataProvider = 'google' | 'microsoft';
