/**
 * Zoom OAuth2 authentication.
 * Gets OAuth2 access tokens for a user from the Account table,
 * handles token refresh via Zoom's OAuth refresh flow.
 */

import { prisma } from '../../prisma';

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
}

/**
 * Get a valid access token for Zoom API.
 * Refreshes automatically if expired.
 */
export async function getZoomAuth(userId: string): Promise<string> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'zoom' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });

    if (!account) {
        throw new Error(`No Zoom account connected for user ${userId}`);
    }

    // Check if token is still valid (with 5 min buffer)
    const now = Math.floor(Date.now() / 1000);
    if (account.access_token && account.expires_at && account.expires_at > now + 300) {
        return account.access_token;
    }

    // Token expired — refresh it
    if (!account.refresh_token) {
        throw new Error(`Zoom refresh token missing for user ${userId} — re-authentication required`);
    }

    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET not configured');
    }

    const res = await fetch(ZOOM_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        console.error(`[ZoomAuth] Token refresh failed: ${res.status} ${error}`);
        throw new Error(`Zoom token refresh failed: ${res.status}`);
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
 * Make an authenticated request to the Zoom API.
 */
export async function zoomApiRequest(userId: string, path: string, options?: {
    method?: string;
    body?: any;
    params?: Record<string, string>;
}): Promise<any> {
    const token = await getZoomAuth(userId);

    let url = `https://api.zoom.us/v2${path}`;
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
        throw new Error(`Zoom API ${path} failed: ${res.status} ${error.substring(0, 200)}`);
    }

    return res.json();
}
