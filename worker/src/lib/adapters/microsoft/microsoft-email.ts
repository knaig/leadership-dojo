/**
 * Microsoft Email adapter via Graph API (Outlook).
 * Implements EmailAdapter interface from ../email-adapter.ts
 */

import { graphRequest } from './microsoft-auth';
import type { EmailThread } from '../types';
import type { EmailAdapter } from '../email-adapter';

export class MicrosoftEmailAdapter implements EmailAdapter {
    provider = 'microsoft';
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async listThreads(options?: {
        maxResults?: number;
        query?: string;
        after?: Date;
        pageToken?: string;
    }): Promise<{ threads: EmailThread[]; nextPageToken?: string }> {
        const params: Record<string, string> = {
            '$top': String(options?.maxResults || 50),
            '$orderby': 'receivedDateTime desc',
            '$select': 'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,hasAttachments,categories',
        };

        // Filter by date
        if (options?.after) {
            params['$filter'] = `receivedDateTime ge ${options.after.toISOString()}`;
        }

        // Search query
        if (options?.query) {
            params['$search'] = `"${options.query}"`;
            delete params['$filter']; // can't combine $search and $filter
        }

        const data = await graphRequest(this.userId, '/me/messages', { params });

        // Group by conversationId to simulate threads
        const threadMap = new Map<string, any[]>();
        for (const msg of (data.value || [])) {
            const convId = msg.conversationId || msg.id;
            const existing = threadMap.get(convId);
            if (existing) {
                existing.push(msg);
            } else {
                threadMap.set(convId, [msg]);
            }
        }

        const threads: EmailThread[] = [];
        for (const [convId, messages] of Array.from(threadMap.entries())) {
            const latest = messages[0]; // already sorted by receivedDateTime desc
            const allParticipants = new Set<string>();

            for (const msg of messages) {
                if (msg.from?.emailAddress?.address) allParticipants.add(msg.from.emailAddress.address.toLowerCase());
                for (const r of (msg.toRecipients || [])) {
                    if (r.emailAddress?.address) allParticipants.add(r.emailAddress.address.toLowerCase());
                }
                for (const r of (msg.ccRecipients || [])) {
                    if (r.emailAddress?.address) allParticipants.add(r.emailAddress.address.toLowerCase());
                }
            }

            threads.push({
                externalId: convId,
                subject: latest.subject || '(No subject)',
                snippet: latest.bodyPreview || '',
                from: {
                    email: latest.from?.emailAddress?.address || '',
                    name: latest.from?.emailAddress?.name,
                },
                to: (latest.toRecipients || []).map((r: any) => ({
                    email: r.emailAddress?.address || '',
                    name: r.emailAddress?.name,
                })),
                cc: (latest.ccRecipients || []).map((r: any) => ({
                    email: r.emailAddress?.address || '',
                    name: r.emailAddress?.name,
                })),
                date: new Date(latest.receivedDateTime),
                isRead: latest.isRead || false,
                isStarred: latest.flag?.flagStatus === 'flagged',
                labels: latest.categories || [],
                hasAttachments: latest.hasAttachments || false,
                messageCount: messages.length,
                participants: Array.from(allParticipants),
                raw: latest,
            });
        }

        return {
            threads,
            nextPageToken: data['@odata.nextLink'] || undefined,
        };
    }
}
