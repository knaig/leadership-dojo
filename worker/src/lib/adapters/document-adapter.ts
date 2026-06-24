import { DocumentItem } from './types';

export interface DocumentAdapter {
    provider: string;

    /**
     * List recently modified documents.
     */
    listDocuments(options?: {
        maxResults?: number;
        modifiedAfter?: Date;
        pageToken?: string;
    }): Promise<{ documents: DocumentItem[]; nextPageToken?: string }>;

    /**
     * Get document content as text (for fact extraction).
     */
    getDocumentText?(documentId: string): Promise<string | null>;
}
