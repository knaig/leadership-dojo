/**
 * Shared Google OAuth2 client factory for sync agents.
 *
 * - Creates an OAuth2Client with proper credentials
 * - Automatically refreshes expired tokens
 * - Persists refreshed tokens to the database
 */

import { OAuth2Client } from 'google-auth-library';
import { prisma } from './prisma';
import { encryptOAuthToken, decryptOAuthToken } from './encryption';

interface GoogleAuthResult {
    oauth2Client: OAuth2Client;
    userId: string;
}

/**
 * Get a configured OAuth2Client for a user.
 * Handles token refresh and persistence automatically.
 */
export async function getGoogleAuth(userId: string): Promise<GoogleAuthResult | null> {
    const account = await prisma.account.findFirst({
        where: {
            userId,
            provider: 'google',
        },
        select: {
            id: true,
            access_token: true,
            refresh_token: true,
            expires_at: true,
        },
    });

    if (!account?.access_token) {
        return null;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('[GoogleAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set!');
        return null;
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret);

    // Decrypt tokens from storage (migration-safe: handles both encrypted and plaintext)
    const accessToken = decryptOAuthToken(account.access_token);
    const refreshToken = decryptOAuthToken(account.refresh_token);

    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
    });

    // Check if token is expired or about to expire (within 5 minutes)
    const expiresAt = account.expires_at ? Number(account.expires_at) * 1000 : 0;
    const isExpired = expiresAt > 0 && Date.now() > expiresAt - 5 * 60 * 1000;

    if (isExpired && refreshToken) {
        console.log(`[GoogleAuth] Token expired for user ${userId.substring(0, 8)}..., refreshing...`);
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);

            // Persist refreshed token encrypted (only if we got a valid token back)
            if (credentials.access_token) {
                await prisma.account.update({
                    where: { id: account.id },
                    data: {
                        access_token: encryptOAuthToken(credentials.access_token),
                        expires_at: credentials.expiry_date
                            ? Math.floor(credentials.expiry_date / 1000)
                            : undefined,
                    },
                });
            }

            console.log(`[GoogleAuth] Token refreshed and saved for user ${userId.substring(0, 8)}...`);
        } catch (err: any) {
            console.error(`[GoogleAuth] Token refresh failed:`, err.message);
            throw new Error(`Token refresh failed: ${err.message}`);
        }
    }

    // Listen for automatic token refresh events and persist them encrypted
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            try {
                await prisma.account.update({
                    where: { id: account.id },
                    data: {
                        access_token: encryptOAuthToken(tokens.access_token),
                        expires_at: tokens.expiry_date
                            ? Math.floor(tokens.expiry_date / 1000)
                            : undefined,
                    },
                });
                console.log(`[GoogleAuth] Auto-refreshed token saved for user ${userId.substring(0, 8)}...`);
            } catch (err: any) {
                console.error(`[GoogleAuth] Failed to save refreshed token:`, err.message);
            }
        }
    });

    return { oauth2Client, userId };
}
