/**
 * Google Drive Watch Setup
 *
 * Sets up push notification channels with Google Drive API
 * to receive real-time notifications when files change.
 *
 * @see https://developers.google.com/drive/api/v3/push
 */

import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { encryptOAuthToken, decryptOAuthToken } from '@/lib/encryption';

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Set up a watch channel for a user's Drive changes.
 * This will notify us when ANY file in their Drive changes.
 */
export async function setupDriveWatch(userId: string): Promise<{
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

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const channelId = `drive-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;

        // Get the current start page token
        const startPageTokenRes = await drive.changes.getStartPageToken();
        const startPageToken = startPageTokenRes.data.startPageToken;

        if (!startPageToken) {
            return { success: false, error: 'Could not get start page token' };
        }

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

        // Store channel in DB
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

        console.log(`[DriveWatch] Set up channel ${channelId} for user ${userId.substring(0, 8)}...`);
        console.log(`[DriveWatch] Expires: ${new Date(Number(expiration)).toISOString()}`);

        return {
            success: true,
            channelId,
            expiration: new Date(Number(expiration))
        };

    } catch (error: any) {
        console.error('[DriveWatch] Setup error:', error.message);

        if (error.code === 401 || error.message?.includes('invalid_grant')) {
            return { success: false, error: 'Token expired - user needs to reconnect Google' };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Stop watching a specific channel.
 */
export async function stopDriveWatch(channelId: string, resourceId: string): Promise<boolean> {
    try {
        const channel = await prisma.watchChannel.findUnique({
            where: { channelId }
        });

        if (!channel) {
            console.log(`[DriveWatch] Channel ${channelId} not found in DB`);
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
        console.log(`[DriveWatch] Stopped channel ${channelId}`);
        return true;

    } catch (error: any) {
        console.error(`[DriveWatch] Stop error for ${channelId}:`, error.message);
        try {
            await prisma.watchChannel.delete({ where: { channelId } });
        } catch {}
        return false;
    }
}

/**
 * Renew expiring drive watch channels.
 * Should be called daily via cron.
 */
export async function renewExpiringDriveChannels(): Promise<{
    renewed: number;
    failed: number;
}> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiringChannels = await prisma.watchChannel.findMany({
        where: {
            connector: 'drive',
            expiration: { lt: tomorrow }
        }
    });

    console.log(`[DriveWatch] Found ${expiringChannels.length} expiring channels to renew`);

    let renewed = 0;
    let failed = 0;

    for (const channel of expiringChannels) {
        try {
            if (channel.resourceId) {
                await stopDriveWatch(channel.channelId, channel.resourceId);
            } else {
                await prisma.watchChannel.delete({ where: { id: channel.id } });
            }

            const result = await setupDriveWatch(channel.userId);
            if (result.success) {
                renewed++;
            } else {
                failed++;
                console.error(`[DriveWatch] Failed to renew for user ${channel.userId}:`, result.error);
            }
        } catch (error) {
            failed++;
            console.error(`[DriveWatch] Error renewing channel ${channel.channelId}:`, error);
        }
    }

    return { renewed, failed };
}
