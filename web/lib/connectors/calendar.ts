import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getGoogleClient } from '@/lib/google-apis';
import { DataConnector } from '@prisma/client';

interface SyncResult {
  success: boolean;
  artifactsCreated: number;
  error?: string;
}

/**
 * Sync Calendar connector - fetches meetings attended
 * Focus on meetings with other attendees (not solo blocks)
 */
export async function syncCalendarConnector(
  connector: DataConnector & { account: { id: string; access_token: string | null; refresh_token: string | null } | null },
  userId: string
): Promise<SyncResult> {
  try {
    console.log('[Calendar Sync] Starting sync for user:', userId);

    // Note: We use getGoogleClient which looks up account by userId directly
    // The connector.account relationship is not needed
    const auth = await getGoogleClient(userId);
    console.log('[Calendar Sync] Got Google client successfully');

    const calendar = google.calendar({ version: 'v3', auth });

    // Get events from the past 30 days (for reflection) and next 7 days (for prep)
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    console.log('[Calendar Sync] Fetching events from', monthAgo.toISOString(), 'to', weekAhead.toISOString());

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: monthAgo.toISOString(),
      timeMax: weekAhead.toISOString(),
      maxResults: 250, // Increased from 100
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log('[Calendar Sync] Calendar API response:', {
      eventCount: response.data.items?.length || 0
    });

    if (!response.data.items || response.data.items.length === 0) {
      console.log('[Calendar Sync] No events found');
      return { success: true, artifactsCreated: 0 };
    }

    let artifactsCreated = 0;
    let skippedNoAttendees = 0;
    let skippedAllDay = 0;
    let skippedExisting = 0;

    for (const event of response.data.items) {
      if (!event.id) continue;

      // Skip events without attendees (solo time blocks)
      if (!event.attendees || event.attendees.length === 0) {
        skippedNoAttendees++;
        continue;
      }

      // Skip all-day events (usually reminders/holidays)
      if (!event.start?.dateTime) {
        skippedAllDay++;
        continue;
      }

      // Check if already ingested
      const existing = await prisma.workArtifact.findFirst({
        where: {
          connectorId: connector.id,
          externalId: event.id,
        },
      });

      if (existing) {
        skippedExisting++;
        continue;
      }

      const startTime = new Date(event.start.dateTime);
      const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : startTime;
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      // Extract attendee emails
      const attendees = event.attendees
        .filter(a => a.email && !a.self)
        .map(a => a.email as string);

      // Create artifact
      await prisma.workArtifact.create({
        data: {
          userId,
          connectorId: connector.id,
          type: 'MEETING_ATTENDED',
          externalId: event.id,
          title: event.summary || 'Untitled Meeting',
          content: event.description || null,
          rawContent: event.description || null,
          metadata: JSON.parse(JSON.stringify({
            calendarId: 'primary',
            htmlLink: event.htmlLink,
            hangoutLink: event.hangoutLink,
            conferenceData: event.conferenceData,
            startTime: event.start.dateTime,
            endTime: event.end?.dateTime,
            durationMinutes,
            status: event.status,
            organizer: event.organizer?.email,
            recurringEventId: event.recurringEventId,
            location: event.location,
          })),
          participants: attendees,
          occurredAt: startTime,
        },
      });

      artifactsCreated++;
    }

    console.log('[Calendar Sync] Summary:', {
      totalEvents: response.data.items.length,
      skippedNoAttendees,
      skippedAllDay,
      skippedExisting,
      artifactsCreated
    });

    return { success: true, artifactsCreated };
  } catch (error) {
    console.error('Calendar sync error:', error);
    return {
      success: false,
      artifactsCreated: 0,
      error: error instanceof Error ? error.message : 'Calendar sync failed',
    };
  }
}
