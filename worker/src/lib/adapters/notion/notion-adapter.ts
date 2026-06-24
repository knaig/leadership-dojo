/**
 * Notion adapter — reads pages and databases for project context.
 * Notion tokens don't expire (integration tokens are permanent).
 */
import { prisma } from '../../prisma';
import type { DocumentItem } from '../types';
import type { DocumentAdapter } from '../document-adapter';

async function notionRequest(userId: string, path: string, options?: { method?: string; body?: any }): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'notion' },
        select: { access_token: true },
    });
    if (!account?.access_token) throw new Error(`No Notion account for user ${userId}`);

    const res = await fetch(`https://api.notion.com/v1${path}`, {
        method: options?.method || 'GET',
        headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) throw new Error(`Notion API ${path} failed: ${res.status}`);
    return res.json();
}

export class NotionDocumentAdapter implements DocumentAdapter {
    provider = 'notion';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listDocuments(options?: {
        maxResults?: number;
        modifiedAfter?: Date;
        pageToken?: string;
    }): Promise<{ documents: DocumentItem[]; nextPageToken?: string }> {
        const body: any = {
            page_size: options?.maxResults || 50,
            sort: { direction: 'descending', timestamp: 'last_edited_time' },
        };
        if (options?.pageToken) body.start_cursor = options.pageToken;
        if (options?.modifiedAfter) {
            body.filter = { property: 'object', value: 'page' };
        }

        const data = await notionRequest(this.userId, '/search', { method: 'POST', body });

        const documents: DocumentItem[] = (data.results || [])
            .filter((r: any) => r.object === 'page')
            .map((page: any) => {
                const title = page.properties?.title?.title?.[0]?.plain_text
                    || page.properties?.Name?.title?.[0]?.plain_text
                    || 'Untitled';
                return {
                    externalId: page.id,
                    title,
                    mimeType: 'application/notion',
                    url: page.url || null,
                    lastModified: new Date(page.last_edited_time),
                    createdAt: new Date(page.created_time),
                    owner: page.created_by?.id ? { email: '', name: page.created_by.name || page.created_by.id } : null,
                    sharedWith: [],
                    size: null,
                    raw: page,
                };
            });

        return { documents, nextPageToken: data.has_more ? data.next_cursor : undefined };
    }

    async getDocumentText(documentId: string): Promise<string | null> {
        try {
            const data = await notionRequest(this.userId, `/blocks/${documentId}/children?page_size=100`);
            const blocks = data.results || [];
            const text = blocks.map((b: any) => {
                const richText = b[b.type]?.rich_text || [];
                return richText.map((t: any) => t.plain_text).join('');
            }).filter(Boolean).join('\n');
            return text || null;
        } catch {
            return null;
        }
    }
}
