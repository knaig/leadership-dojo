import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { google } from 'googleapis';
import { getGoogleClient } from '@/lib/google-apis';

export const dynamic = 'force-dynamic';

// GET /api/calendar/events - Fetch upcoming calendar events for auto-population
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get Google OAuth client
        const googleAuth = await getGoogleClient(userId);
        const calendar = google.calendar({ version: 'v3', auth: googleAuth });

        // Fetch upcoming events (next 30 days)
        const now = new Date();
        const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            timeMax: thirtyDaysAhead.toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        });

        if (!response.data.items) {
            return NextResponse.json({ events: [] });
        }

        // Filter and format events for the UI
        const events = response.data.items
            .filter(event => {
                // Only show events with attendees (not solo blocks)
                return event.attendees && event.attendees.length > 0;
            })
            .filter(event => {
                // Only show timed events (not all-day)
                return event.start?.dateTime;
            })
            .map(event => {
                const attendees = event.attendees
                    ?.filter(a => a.email && !a.self)
                    .map(a => ({
                        email: a.email,
                        name: a.displayName || a.email?.split('@')[0] || 'Unknown'
                    })) || [];

                return {
                    id: event.id,
                    title: event.summary || 'Untitled Meeting',
                    description: event.description || '',
                    startTime: event.start?.dateTime,
                    endTime: event.end?.dateTime,
                    attendees,
                    location: event.location || '',
                    organizer: event.organizer?.email,
                };
            });

        return NextResponse.json({ events });
    } catch (error) {
        console.error('[Calendar Events API] Error:', error);

        // If Google API isn't set up, return empty array instead of erroring
        if (error instanceof Error && error.message.includes('No connected Google account')) {
            return NextResponse.json({ events: [], requiresConnection: true });
        }

        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Failed to fetch calendar events',
            events: []
        }, { status: 500 });
    }
}
