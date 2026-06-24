/**
 * Microsoft Calendar adapter via Graph API.
 * Implements CalendarAdapter interface from ../calendar-adapter.ts
 */

import { graphRequest } from './microsoft-auth';
import type { CalendarEvent } from '../types';
import type { CalendarAdapter } from '../calendar-adapter';

export class MicrosoftCalendarAdapter implements CalendarAdapter {
    provider = 'microsoft';
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async listEvents(start: Date, end: Date, options?: {
        maxResults?: number;
        pageToken?: string;
        syncToken?: string;
    }): Promise<{ events: CalendarEvent[]; nextPageToken?: string; nextSyncToken?: string }> {
        const params: Record<string, string> = {
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            '$top': String(options?.maxResults || 100),
            '$orderby': 'start/dateTime',
            '$select': 'id,subject,bodyPreview,start,end,location,isAllDay,recurrence,showAs,organizer,attendees,onlineMeeting,hasAttachments',
        };

        if (options?.pageToken) {
            // For Microsoft, pageToken is the full @odata.nextLink URL
            const data = await graphRequest(this.userId, '', { params: {} });
            // Actually use the nextLink directly
        }

        const data = await graphRequest(this.userId, '/me/calendarview', { params });

        const events: CalendarEvent[] = (data.value || []).map((e: any) => this.mapEvent(e));

        return {
            events,
            nextPageToken: data['@odata.nextLink'] || undefined,
        };
    }

    private mapEvent(e: any): CalendarEvent {
        const statusMap: Record<string, 'confirmed' | 'tentative' | 'cancelled'> = {
            'busy': 'confirmed',
            'tentative': 'tentative',
            'free': 'confirmed',
            'oof': 'confirmed',
            'workingElsewhere': 'confirmed',
        };

        const responseMap: Record<string, 'accepted' | 'declined' | 'tentative' | 'needsAction'> = {
            'accepted': 'accepted',
            'declined': 'declined',
            'tentativelyAccepted': 'tentative',
            'none': 'needsAction',
            'notResponded': 'needsAction',
        };

        return {
            externalId: e.id,
            title: e.subject || '(No title)',
            description: e.bodyPreview || null,
            startTime: new Date(e.start?.dateTime + 'Z'),
            endTime: new Date(e.end?.dateTime + 'Z'),
            location: e.location?.displayName || null,
            isAllDay: e.isAllDay || false,
            isRecurring: !!e.recurrence,
            status: statusMap[e.showAs] || 'confirmed',
            organizer: e.organizer?.emailAddress ? {
                email: e.organizer.emailAddress.address,
                name: e.organizer.emailAddress.name,
            } : null,
            attendees: (e.attendees || []).map((a: any) => ({
                email: a.emailAddress?.address || '',
                name: a.emailAddress?.name,
                responseStatus: responseMap[a.status?.response] || 'needsAction',
            })),
            meetingLink: e.onlineMeeting?.joinUrl || null,
            attachments: [],
            raw: e,
        };
    }
}
