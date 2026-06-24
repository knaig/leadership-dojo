/**
 * Watch Channel Management (Worker-side)
 *
 * Handles setup, renewal, and cleanup of Google API push notification channels
 * for Calendar, Drive, and Gmail.
 */

import { google } from 'googleapis';
import { prisma } from './prisma';
import { getGoogleAuth } from './google-auth';
import { v4 as uuidv4 } from 'uuid';

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';

/**
 * Setup a calendar watch channel for a user
 */
export async function setupCalendarWatch(userId: string): Promise<boolean> {
    try {
        if (!WEBHOOK_BASE_URL) {
            console.log('[WatchChannels] No WEBHOOK_BASE_URL configured, skipping');
            return false;
        }

        const auth = await getGoogleAuth(userId);
        if (!auth) return false;

        const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
        const channelId = `cal-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;
        const expirationTime = Date.now() + 7 * 24 * 60 * 60 * 1000;

        const watchResponse = await calendar.events.watch({
            calendarId: 'primary',
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: `${WEBHOOK_BASE_URL}/api/webhooks/gcal`,
                expiration: String(expirationTime),
            }
        });

        const { resourceId, expiration } = watchResponse.data;

        await prisma.watchChannel.create({
            data: {
                userId,
                connector: 'calendar',
                channelId,
                resourceId: resourceId || null,
                expiration: new Date(Number(expiration)),
            }
        });

        console.log(`[WatchChannels] Calendar watch set up for user ${userId.substring(0, 8)}...`);
        return true;
    } catch (error: any) {
        console.error(`[WatchChannels] Calendar watch setup failed:`, error.message);
        return false;
    }
}

/**
 * Setup a drive watch channel for a user
 */
export async function setupDriveWatch(userId: string): Promise<boolean> {
    try {
        if (!WEBHOOK_BASE_URL) return false;

        const auth = await getGoogleAuth(userId);
        if (!auth) return false;

        const drive = google.drive({ version: 'v3', auth: auth.oauth2Client });
        const channelId = `drive-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;

        const startPageTokenRes = await drive.changes.getStartPageToken();
        const startPageToken = startPageTokenRes.data.startPageToken;
        if (!startPageToken) return false;

        const expirationTime = Date.now() + 7 * 24 * 60 * 60 * 1000;

        const watchResponse = await drive.changes.watch({
            pageToken: startPageToken,
            requestBody: {
                id: channelId,
                type: 'web_hook',
                address: `${WEBHOOK_BASE_URL}/api/webhooks/drive`,
                expiration: String(expirationTime),
            }
        });

        const { resourceId, expiration } = watchResponse.data;

        await prisma.watchChannel.create({
            data: {
                userId,
                connector: 'drive',
                channelId,
                resourceId: resourceId || null,
                expiration: new Date(Number(expiration)),
                pageToken: startPageToken,
            }
        });

        console.log(`[WatchChannels] Drive watch set up for user ${userId.substring(0, 8)}...`);
        return true;
    } catch (error: any) {
        console.error(`[WatchChannels] Drive watch setup failed:`, error.message);
        return false;
    }
}

/**
 * Setup Gmail watch for a user (requires GMAIL_PUBSUB_TOPIC)
 */
export async function setupGmailWatch(userId: string): Promise<boolean> {
    try {
        const topic = process.env.GMAIL_PUBSUB_TOPIC;
        if (!topic) {
            console.log('[WatchChannels] No GMAIL_PUBSUB_TOPIC configured, skipping Gmail watch');
            return false;
        }

        const auth = await getGoogleAuth(userId);
        if (!auth) return false;

        const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
        const channelId = `gmail-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;

        const watchResponse = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: topic,
                labelIds: ['INBOX'],
            }
        });

        const { historyId, expiration } = watchResponse.data;

        await prisma.watchChannel.create({
            data: {
                userId,
                connector: 'gmail',
                channelId,
                expiration: new Date(Number(expiration)),
                syncToken: historyId?.toString() || null,
            }
        });

        console.log(`[WatchChannels] Gmail watch set up for user ${userId.substring(0, 8)}...`);
        return true;
    } catch (error: any) {
        console.error(`[WatchChannels] Gmail watch setup failed:`, error.message);
        return false;
    }
}

/**
 * Auto-setup watch channels for a user after successful sync.
 * Only creates channels that don't already exist.
 */
export async function autoSetupWatchChannels(userId: string, connector: 'calendar' | 'drive' | 'gmail'): Promise<void> {
    const existing = await prisma.watchChannel.findFirst({
        where: { userId, connector, expiration: { gt: new Date() } }
    });

    if (existing) return; // Already has an active channel

    switch (connector) {
        case 'calendar':
            await setupCalendarWatch(userId);
            break;
        case 'drive':
            await setupDriveWatch(userId);
            break;
        case 'gmail':
            await setupGmailWatch(userId);
            break;
    }
}

/**
 * Renew all expiring watch channels (calendar, drive, gmail).
 * Called daily via cron.
 */
export async function renewExpiringWatchChannels(): Promise<{
    renewed: number;
    failed: number;
}> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiringChannels = await prisma.watchChannel.findMany({
        where: { expiration: { lt: tomorrow } }
    });

    console.log(`[WatchChannels] Found ${expiringChannels.length} expiring channels to renew`);

    let renewed = 0;
    let failed = 0;

    for (const channel of expiringChannels) {
        try {
            // Stop old channel via Google API
            await stopChannel(channel);

            // Delete from DB
            await prisma.watchChannel.delete({ where: { id: channel.id } }).catch(() => {});

            // Create new channel
            let success = false;
            switch (channel.connector) {
                case 'calendar':
                    success = await setupCalendarWatch(channel.userId);
                    break;
                case 'drive':
                    success = await setupDriveWatch(channel.userId);
                    break;
                case 'gmail':
                    success = await setupGmailWatch(channel.userId);
                    break;
            }

            if (success) {
                renewed++;
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
            console.error(`[WatchChannels] Error renewing ${channel.connector} channel ${channel.channelId}:`, error);
        }
    }

    return { renewed, failed };
}

/**
 * Stop a watch channel via Google API
 */
async function stopChannel(channel: { userId: string; connector: string; channelId: string; resourceId: string | null }): Promise<void> {
    try {
        const auth = await getGoogleAuth(channel.userId);
        if (!auth) return;

        if (channel.connector === 'gmail') {
            const gmail = google.gmail({ version: 'v1', auth: auth.oauth2Client });
            await gmail.users.stop({ userId: 'me' });
        } else if (channel.resourceId) {
            // Calendar and Drive use channels.stop()
            const calendar = google.calendar({ version: 'v3', auth: auth.oauth2Client });
            await calendar.channels.stop({
                requestBody: { id: channel.channelId, resourceId: channel.resourceId }
            });
        }
    } catch (error: any) {
        console.warn(`[WatchChannels] Failed to stop channel ${channel.channelId}:`, error.message);
    }
}
