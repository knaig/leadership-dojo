import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { decryptOAuthToken } from '@/lib/encryption';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL
);

/**
 * Fetches recent meetings from the user's generic Google Calendar.
 * Requires the User to have a valid stored Refresh Token (via NextAuth).
 */
export async function syncRecentMeetings(userId: string) {
    // 1. Get Tokens
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'google' }
    });

    if (!account || !account.refresh_token) {
        console.warn(`[GoogleSync] No refresh token for user ${userId}`);
        return;
    }

    oauth2Client.setCredentials({
        refresh_token: decryptOAuthToken(account.refresh_token),
        access_token: decryptOAuthToken(account.access_token),
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 2. Fetch Events (Last 7 days)
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: oneWeekAgo.toISOString(),
        timeMax: now.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });

    const events = res.data.items || [];
    console.log(`[GoogleSync] Found ${events.length} events for ${userId}`);

    // 3. Process & Pass to Advisor
    // We only care about events with descriptions (notes) or specific tags?
    // For MVP, we just return them. The integration loop would call `analyzeMeetingNotes` 
    // on the event.description if available.

    return events;
}
