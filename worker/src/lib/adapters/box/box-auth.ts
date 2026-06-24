/**
 * Box API authentication.
 */
import { prisma } from '../../prisma';

export async function getBoxAuth(userId: string): Promise<string> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'box' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });
    if (!account) throw new Error(`No Box account connected for user ${userId}`);

    const now = Math.floor(Date.now() / 1000);
    if (account.access_token && account.expires_at && account.expires_at > now + 300) {
        return account.access_token;
    }

    if (!account.refresh_token) throw new Error('Box refresh token missing');

    const res = await fetch('https://api.box.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: account.refresh_token,
            client_id: process.env.BOX_CLIENT_ID || '',
            client_secret: process.env.BOX_CLIENT_SECRET || '',
        }),
    });

    if (!res.ok) throw new Error(`Box token refresh failed: ${res.status}`);
    const data = await res.json() as any;

    await prisma.account.update({
        where: { id: account.id },
        data: {
            access_token: data.access_token,
            refresh_token: data.refresh_token || account.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        },
    });

    return data.access_token;
}

export async function boxRequest(userId: string, path: string, options?: { method?: string; body?: any }): Promise<any> {
    const token = await getBoxAuth(userId);
    const res = await fetch(`https://api.box.com/2.0${path}`, {
        method: options?.method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) throw new Error(`Box API ${path} failed: ${res.status}`);
    return res.json();
}
