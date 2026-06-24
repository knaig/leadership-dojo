/**
 * Microsoft OneDrive adapter via Graph API.
 * Implements DocumentAdapter interface from ../document-adapter.ts
 */

import { graphRequest } from './microsoft-auth';
import type { DocumentItem } from '../types';
import type { DocumentAdapter } from '../document-adapter';

export class MicrosoftDocumentAdapter implements DocumentAdapter {
    provider = 'microsoft';
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async listDocuments(options?: {
        maxResults?: number;
        modifiedAfter?: Date;
        pageToken?: string;
    }): Promise<{ documents: DocumentItem[]; nextPageToken?: string }> {
        const params: Record<string, string> = {
            '$top': String(options?.maxResults || 50),
            '$orderby': 'lastModifiedDateTime desc',
            '$select': 'id,name,file,webUrl,lastModifiedDateTime,createdDateTime,createdBy,size,shared',
        };

        // Use /me/drive/recent for recently accessed files
        const data = await graphRequest(this.userId, '/me/drive/recent', { params });

        const documents: DocumentItem[] = (data.value || [])
            .filter((item: any) => item.file) // only files, not folders
            .map((item: any) => ({
                externalId: item.id,
                title: item.name || '(Untitled)',
                mimeType: item.file?.mimeType || 'application/octet-stream',
                url: item.webUrl || null,
                lastModified: new Date(item.lastModifiedDateTime),
                createdAt: new Date(item.createdDateTime),
                owner: item.createdBy?.user ? {
                    email: item.createdBy.user.email || '',
                    name: item.createdBy.user.displayName,
                } : null,
                sharedWith: [], // Would need separate /permissions call
                size: item.size || null,
                raw: item,
            }));

        return {
            documents,
            nextPageToken: data['@odata.nextLink'] || undefined,
        };
    }

    async getDocumentText(documentId: string): Promise<string | null> {
        try {
            // For Office documents, Graph API can return content
            const res = await graphRequest(this.userId, `/me/drive/items/${documentId}/content`);
            if (typeof res === 'string') return res;
            return null;
        } catch {
            return null;
        }
    }
}
