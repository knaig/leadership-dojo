/**
 * Slack messaging adapter.
 * New adapter type — not calendar/email/document but messaging.
 */
import { slackRequest } from './slack-auth';

export interface SlackMessage {
    channelId: string;
    channelName: string;
    messageId: string;
    userId: string;
    userName: string;
    text: string;
    timestamp: Date;
    threadTs?: string;
    replyCount: number;
    reactions: Array<{ name: string; count: number }>;
}

export interface SlackChannel {
    id: string;
    name: string;
    isPrivate: boolean;
    memberCount: number;
    topic: string;
    purpose: string;
}

export class SlackMessagingAdapter {
    provider = 'slack';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    /**
     * List channels the user is a member of.
     */
    async listChannels(): Promise<SlackChannel[]> {
        const data = await slackRequest(this.userId, 'conversations.list', {
            types: 'public_channel,private_channel',
            exclude_archived: true,
            limit: 200,
        });

        return (data.channels || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.is_private || false,
            memberCount: c.num_members || 0,
            topic: c.topic?.value || '',
            purpose: c.purpose?.value || '',
        }));
    }

    /**
     * Get recent messages from a channel.
     */
    async getChannelHistory(channelId: string, options?: {
        limit?: number;
        oldest?: Date;
        latest?: Date;
    }): Promise<SlackMessage[]> {
        const params: any = {
            channel: channelId,
            limit: options?.limit || 100,
        };
        if (options?.oldest) params.oldest = String(options.oldest.getTime() / 1000);
        if (options?.latest) params.latest = String(options.latest.getTime() / 1000);

        const data = await slackRequest(this.userId, 'conversations.history', params);

        // Get user info for display names
        const userIds = [...new Set((data.messages || []).map((m: any) => m.user).filter(Boolean))];
        const userMap = new Map<string, string>();
        for (const uid of userIds.slice(0, 50)) {
            try {
                const userInfo = await slackRequest(this.userId, 'users.info', { user: uid });
                userMap.set(uid, userInfo.user?.real_name || userInfo.user?.name || uid);
            } catch { userMap.set(uid as string, uid as string); }
        }

        return (data.messages || [])
            .filter((m: any) => m.type === 'message' && !m.subtype)
            .map((m: any) => ({
                channelId,
                channelName: '', // filled by caller
                messageId: m.ts,
                userId: m.user || '',
                userName: userMap.get(m.user) || m.user || 'unknown',
                text: m.text || '',
                timestamp: new Date(parseFloat(m.ts) * 1000),
                threadTs: m.thread_ts,
                replyCount: m.reply_count || 0,
                reactions: (m.reactions || []).map((r: any) => ({ name: r.name, count: r.count })),
            }));
    }

    /**
     * Get user's DMs (direct messages) — requires explicit consent.
     */
    async listDMs(): Promise<Array<{ channelId: string; userId: string; userName: string }>> {
        const data = await slackRequest(this.userId, 'conversations.list', {
            types: 'im',
            limit: 100,
        });

        return (data.channels || []).map((c: any) => ({
            channelId: c.id,
            userId: c.user || '',
            userName: '', // need users.info call
        }));
    }
}
