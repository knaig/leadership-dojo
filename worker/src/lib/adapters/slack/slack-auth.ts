/**
 * Slack API authentication.
 * Bot tokens don't expire. User tokens may need refresh.
 */
import { prisma } from '../../prisma';

export async function getSlackAuth(userId: string): Promise<{ botToken: string; userToken?: string }> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'slack' },
        select: { access_token: true, refresh_token: true },
    });
    if (!account?.access_token) throw new Error(`No Slack account connected for user ${userId}`);

    return {
        botToken: account.access_token,
        userToken: account.refresh_token || undefined, // Slack stores user token in refresh_token field
    };
}

export async function slackRequest(userId: string, method: string, body?: Record<string, any>): Promise<any> {
    const { botToken } = await getSlackAuth(userId);

    const res = await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) throw new Error(`Slack API ${method} failed: ${res.status}`);
    const data = await res.json() as any;
    if (!data.ok) throw new Error(`Slack API ${method} error: ${data.error}`);
    return data;
}
