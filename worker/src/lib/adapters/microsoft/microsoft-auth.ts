/**
 * Microsoft Graph API authentication.
 * Gets OAuth2 access tokens for a user from the Account table,
 * handles token refresh via MSAL-style refresh flow.
 */

import { prisma } from '../../prisma';

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
}

/**
 * Get a valid access token for Microsoft Graph API.
 * Refreshes automatically if expired.
 */
export async function getMicrosoftAuth(userId: string): Promise<string> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'microsoft' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });

    if (!account) {
        throw new Error(`No Microsoft account connected for user ${userId}`);
    }

    // Check if token is still valid (with 5 min buffer)
    const now = Math.floor(Date.now() / 1000);
    if (account.access_token && account.expires_at && account.expires_at > now + 300) {
        return account.access_token;
    }

    // Token expired — refresh it
    if (!account.refresh_token) {
        throw new Error(`Microsoft refresh token missing for user ${userId} — re-authentication required`);
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET not configured');
    }

    const res = await fetch(MICROSOFT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: account.refresh_token,
            grant_type: 'refresh_token',
            scope: 'openid profile offline_access Calendars.Read Mail.Read Files.Read User.Read',
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        console.error(`[MicrosoftAuth] Token refresh failed: ${res.status} ${error}`);
        throw new Error(`Microsoft token refresh failed: ${res.status}`);
    }

    const data = await res.json() as TokenResponse;

    // Update stored tokens
    await prisma.account.update({
        where: { id: account.id },
        data: {
            access_token: data.access_token,
            refresh_token: data.refresh_token || account.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        },
    });

    return data.access_token;
}

/**
 * Make an authenticated request to Microsoft Graph API.
 */
export async function graphRequest(userId: string, path: string, options?: {
    method?: string;
    body?: any;
    params?: Record<string, string>;
}): Promise<any> {
    const token = await getMicrosoftAuth(userId);

    let url = `https://graph.microsoft.com/v1.0${path}`;
    if (options?.params) {
        const qs = new URLSearchParams(options.params).toString();
        url += `?${qs}`;
    }

    const res = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const error = await res.text();
        throw new Error(`Graph API ${path} failed: ${res.status} ${error.substring(0, 200)}`);
    }

    return res.json();
}
