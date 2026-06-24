/**
 * Dropbox document adapter.
 */
import { dropboxRequest } from './dropbox-auth';
import type { DocumentItem } from '../types';
import type { DocumentAdapter } from '../document-adapter';

export class DropboxDocumentAdapter implements DocumentAdapter {
    provider = 'dropbox';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listDocuments(options?: {
        maxResults?: number;
        modifiedAfter?: Date;
        pageToken?: string;
    }): Promise<{ documents: DocumentItem[]; nextPageToken?: string }> {
        const body: any = options?.pageToken
            ? { cursor: options.pageToken }
            : { path: '', recursive: true, limit: options?.maxResults || 50 };

        const endpoint = options?.pageToken ? '/files/list_folder/continue' : '/files/list_folder';
        const data = await dropboxRequest(this.userId, endpoint, body);

        const documents: DocumentItem[] = (data.entries || [])
            .filter((e: any) => e['.tag'] === 'file')
            .filter((e: any) => {
                if (!options?.modifiedAfter) return true;
                return new Date(e.server_modified) >= options.modifiedAfter;
            })
            .map((e: any) => ({
                externalId: e.id,
                title: e.name,
                mimeType: this.inferMimeType(e.name),
                url: null, // Dropbox doesn't give web URLs in list_folder
                lastModified: new Date(e.server_modified),
                createdAt: new Date(e.client_modified || e.server_modified),
                owner: null,
                sharedWith: [],
                size: e.size || null,
                raw: e,
            }));

        return {
            documents,
            nextPageToken: data.has_more ? data.cursor : undefined,
        };
    }

    async getDocumentText(documentId: string): Promise<string | null> {
        // Dropbox doesn't have a text extraction API — would need to download + parse
        return null;
    }

    private inferMimeType(name: string): string {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const map: Record<string, string> = {
            pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
        };
        return map[ext] || 'application/octet-stream';
    }
}
