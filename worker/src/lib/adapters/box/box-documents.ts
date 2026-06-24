/**
 * Box document adapter.
 */
import { boxRequest } from './box-auth';
import type { DocumentItem } from '../types';
import type { DocumentAdapter } from '../document-adapter';

export class BoxDocumentAdapter implements DocumentAdapter {
    provider = 'box';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listDocuments(options?: {
        maxResults?: number;
        modifiedAfter?: Date;
        pageToken?: string;
    }): Promise<{ documents: DocumentItem[]; nextPageToken?: string }> {
        const limit = options?.maxResults || 50;
        const offset = options?.pageToken ? parseInt(options.pageToken) : 0;

        // Search recent files
        const params = new URLSearchParams({
            type: 'file',
            limit: String(limit),
            offset: String(offset),
            sort: 'modified_at',
            direction: 'DESC',
            fields: 'id,name,type,size,modified_at,created_at,owned_by,shared_link,extension',
        });

        if (options?.modifiedAfter) {
            params.set('modified_at_range', `${options.modifiedAfter.toISOString()},`);
        }

        const data = await boxRequest(this.userId, `/search?${params}`);

        const documents: DocumentItem[] = (data.entries || []).map((item: any) => ({
            externalId: item.id,
            title: item.name,
            mimeType: this.inferMimeType(item.extension || item.name),
            url: item.shared_link?.url || null,
            lastModified: new Date(item.modified_at),
            createdAt: new Date(item.created_at),
            owner: item.owned_by ? { email: item.owned_by.login || '', name: item.owned_by.name } : null,
            sharedWith: [],
            size: item.size || null,
            raw: item,
        }));

        const nextOffset = offset + limit;
        return {
            documents,
            nextPageToken: data.total_count > nextOffset ? String(nextOffset) : undefined,
        };
    }

    async getDocumentText(documentId: string): Promise<string | null> {
        try {
            // Box has a text representation API for supported file types
            const data = await boxRequest(this.userId, `/files/${documentId}/content`);
            return typeof data === 'string' ? data : null;
        } catch {
            return null;
        }
    }

    private inferMimeType(ext: string): string {
        const name = ext.toLowerCase().replace(/^\./, '');
        const map: Record<string, string> = {
            pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
        };
        return map[name] || 'application/octet-stream';
    }
}
