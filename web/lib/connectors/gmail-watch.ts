/**
 * Gmail Watch Setup
 *
 * Sets up push notifications for Gmail using users.watch().
 * Gmail uses Google Cloud Pub/Sub to deliver notifications,
 * which then forwards to our webhook endpoint.
 *
 * Unlike Calendar/Drive which use direct webhooks, Gmail requires:
 * 1. A Google Cloud Pub/Sub topic
 * 2. Grant Gmail publish permission to the topic
 * 3. A push subscription that forwards to our webhook
 *
 * For simplicity, we use the same pattern: call users.watch(),
 * store the historyId, and process notifications via webhook.
 *
 * @see https://developers.google.com/gmail/api/guides/push
 */

import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { encryptOAuthToken, decryptOAuthToken } from '@/lib/encryption';

const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || '';

/**
 * Set up Gmail watch for a user.
 * Gmail watch uses Pub/Sub, which auto-expires after 7 days.
 */
export async function setupGmailWatch(userId: string): Promise<{
    success: boolean;
    channelId?: string;
    expiration?: Date;
    error?: string;
}> {
    try {
        if (!GMAIL_PUBSUB_TOPIC) {
            return { success: false, error: 'GMAIL_PUBSUB_TOPIC not configured' };
        }

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

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        const channelId = `gmail-watch-${userId.substring(0, 8)}-${uuidv4().substring(0, 8)}`;

        // Call users.watch() — Gmail will send notifications to the Pub/Sub topic
        const watchResponse = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: GMAIL_PUBSUB_TOPIC,
                labelIds: ['INBOX'], // Only watch inbox changes
            }
        });

        const { historyId, expiration } = watchResponse.data;

        // Store channel in DB
        await prisma.watchChannel.create({
            data: {
                userId,
                connector: 'gmail',
                channelId,
                expiration: new Date(Number(expiration)),
                syncToken: historyId?.toString() || null, // Store historyId as syncToken
            }
        });

        console.log(`[GmailWatch] Set up watch for user ${userId.substring(0, 8)}..., historyId=${historyId}`);
        console.log(`[GmailWatch] Expires: ${new Date(Number(expiration)).toISOString()}`);

        return {
            success: true,
            channelId,
            expiration: new Date(Number(expiration))
        };

    } catch (error: any) {
        console.error('[GmailWatch] Setup error:', error.message);

        if (error.code === 401 || error.message?.includes('invalid_grant')) {
            return { success: false, error: 'Token expired - user needs to reconnect Google' };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Stop Gmail watch for a user.
 * Gmail watch auto-expires, but we can call users.stop() to immediately stop.
 */
export async function stopGmailWatch(channelId: string): Promise<boolean> {
    try {
        const channel = await prisma.watchChannel.findUnique({
            where: { channelId }
        });

        if (!channel) {
            console.log(`[GmailWatch] Channel ${channelId} not found in DB`);
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

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            await gmail.users.stop({ userId: 'me' });
        }

        await prisma.watchChannel.delete({ where: { channelId } });
        console.log(`[GmailWatch] Stopped watch ${channelId}`);
        return true;

    } catch (error: any) {
        console.error(`[GmailWatch] Stop error for ${channelId}:`, error.message);
        try {
            await prisma.watchChannel.delete({ where: { channelId } });
        } catch {}
        return false;
    }
}

/**
 * Renew expiring Gmail watch channels.
 */
export async function renewExpiringGmailChannels(): Promise<{
    renewed: number;
    failed: number;
}> {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const expiringChannels = await prisma.watchChannel.findMany({
        where: {
            connector: 'gmail',
            expiration: { lt: tomorrow }
        }
    });

    console.log(`[GmailWatch] Found ${expiringChannels.length} expiring channels to renew`);

    let renewed = 0;
    let failed = 0;

    for (const channel of expiringChannels) {
        try {
            await stopGmailWatch(channel.channelId);

            const result = await setupGmailWatch(channel.userId);
            if (result.success) {
                renewed++;
            } else {
                failed++;
                console.error(`[GmailWatch] Failed to renew for user ${channel.userId}:`, result.error);
            }
        } catch (error) {
            failed++;
            console.error(`[GmailWatch] Error renewing channel ${channel.channelId}:`, error);
        }
    }

    return { renewed, failed };
}
