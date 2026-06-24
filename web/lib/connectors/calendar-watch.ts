/**
 * Google Calendar Watch Setup
 *
 * Sets up push notification channels with Google Calendar API
 * to receive real-time notifications when events change.
 *
 * @see https://developers.google.com/calendar/api/guides/push
 */

import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { encryptOAuthToken, decryptOAuthToken } from '@/lib/encryption';

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Set up a watch channel for a user's Calendar events.
 * Google will POST to our webhook when events are created/modified/deleted.
 */
export async function setupCalendarWatch(userId: string): Promise<{
    success: boolean;
    channelId?: string;
    expiration?: Date;
    error?: string;
}> {
    try {
        const account = await prisma.account.findFirst({
            where: { userId, provider: 'google' }
        });

        if (!account?.access_token || !account?.refresh_token) {
            return { success: false, error: 'No Google account connected' };
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${WEBHOOK_BASE_URL}/api/auth/callback/google`
        );

        oauth2Client.setCredentials({
            access_token: decryptOAuthToken(account.access_token),
            refresh_token: decryptOAuthToken(account.refresh_token),
            expiry_date: account.expires_at ? account.expires_at * 1000 : undefined
        });

        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.access_token) {
                await prisma.account.update({
                    where: { id: account.id },
                    data: {
                        access_token: encryptOAuthToken(tokens.access_token),
                        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined
                    }
                });
            }
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const channelId = `cal-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;
        const expirationTime = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

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

        // Store channel in DB
        await prisma.watchChannel.create({
            data: {
                userId,
                connector: 'calendar',
                channelId,
                resourceId: resourceId || null,
                expiration: new Date(Number(expiration)),
            }
        });

        console.log(`[CalendarWatch] Set up channel ${channelId} for user ${userId.substring(0, 8)}...`);
        console.log(`[CalendarWatch] Expires: ${new Date(Number(expiration)).toISOString()}`);

        return {
            success: true,
            channelId,
            expiration: new Date(Number(expiration))
        };

    } catch (error: any) {
        console.error('[CalendarWatch] Setup error:', error.message);

        if (error.code === 401 || error.message?.includes('invalid_grant')) {
            return { success: false, error: 'Token expired - user needs to reconnect Google' };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Stop watching a specific channel.
 */
export async function stopCalendarWatch(channelId: string, resourceId: string): Promise<boolean> {
    try {
        const channel = await prisma.watchChannel.findUnique({
            where: { channelId }
        });

        if (!channel) {
            console.log(`[CalendarWatch] Channel ${channelId} not found in DB`);
            return false;
        }

        const account = await prisma.account.findFirst({
            where: { userId: channel.userId, provider: 'google' }
        });

        if (account?.access_token) {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            oauth2Client.setCredentials({
                access_token: decryptOAuthToken(account.access_token),
                refresh_token: decryptOAuthToken(account.refresh_token) || undefined,
            });

            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            await calendar.channels.stop({
                requestBody: { id: channelId, resourceId }
            });
        }

        await prisma.watchChannel.delete({ where: { channelId } });
        console.log(`[CalendarWatch] Stopped channel ${channelId}`);
        return true;

    } catch (error: any) {
        console.error(`[CalendarWatch] Stop error for ${channelId}:`, error.message);
        // Clean up DB record even if Google API call fails
        try {
            await prisma.watchChannel.delete({ where: { channelId } });
        } catch {}
        return false;
    }
}

/**
 * Renew expiring calendar watch channels.
 * Should be called daily via cron.
 */
export async function renewExpiringCalendarChannels(): Promise<{
    renewed: number;
    failed: number;
}> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiringChannels = await prisma.watchChannel.findMany({
        where: {
            connector: 'calendar',
            expiration: { lt: tomorrow }
        }
    });

    console.log(`[CalendarWatch] Found ${expiringChannels.length} expiring channels to renew`);

    let renewed = 0;
    let failed = 0;

    for (const channel of expiringChannels) {
        try {
            // Stop old channel
            if (channel.resourceId) {
                await stopCalendarWatch(channel.channelId, channel.resourceId);
            } else {
                await prisma.watchChannel.delete({ where: { id: channel.id } });
            }

            // Create new one
            const result = await setupCalendarWatch(channel.userId);
            if (result.success) {
                renewed++;
            } else {
                failed++;
                console.error(`[CalendarWatch] Failed to renew for user ${channel.userId}:`, result.error);
            }
        } catch (error) {
            failed++;
            console.error(`[CalendarWatch] Error renewing channel ${channel.channelId}:`, error);
        }
    }

    return { renewed, failed };
}
