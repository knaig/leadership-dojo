/**
 * Dropbox API authentication.
 */
import { prisma } from '../../prisma';

const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

export async function getDropboxAuth(userId: string): Promise<string> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'dropbox' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });
    if (!account) throw new Error(`No Dropbox account connected for user ${userId}`);

    const now = Math.floor(Date.now() / 1000);
    if (account.access_token && account.expires_at && account.expires_at > now + 300) {
        return account.access_token;
    }

    if (!account.refresh_token) throw new Error('Dropbox refresh token missing');

    const clientId = process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('DROPBOX_CLIENT_ID/SECRET not configured');

    const res = await fetch(DROPBOX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    if (!res.ok) throw new Error(`Dropbox token refresh failed: ${res.status}`);
    const data = await res.json() as any;

    await prisma.account.update({
        where: { id: account.id },
        data: {
            access_token: data.access_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 14400),
        },
    });

    return data.access_token;
}

export async function dropboxRequest(userId: string, endpoint: string, body?: any): Promise<any> {
    const token = await getDropboxAuth(userId);
    const res = await fetch(`https://api.dropboxapi.com/2${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : JSON.stringify(null),
    });
    if (!res.ok) throw new Error(`Dropbox API ${endpoint} failed: ${res.status}`);
    return res.json();
}
