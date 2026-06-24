import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getGoogleClient } from '@/lib/google-apis';
import { DataConnector } from '@prisma/client';
import { publishGraphJob } from '@/lib/queue';

interface SyncResult {
  success: boolean;
  artifactsCreated: number;
  error?: string;
}

/**
 * Sync Drive connector - fetches recently modified documents
 * Focus on Google Docs (text content) and Sheets
 */
export async function syncDriveConnector(
  connector: DataConnector & { account: { id: string; access_token: string | null; refresh_token: string | null } | null },
  userId: string
): Promise<SyncResult> {
  try {
    console.log('[Drive Sync] Starting sync for user:', userId);
    console.log('[Drive Sync] Connector account:', {
      hasAccount: !!connector.account,
      hasAccessToken: !!connector.account?.access_token
    });

    // Note: We use getGoogleClient which looks up account by userId, not connector.account
    const auth = await getGoogleClient(userId);
    console.log('[Drive Sync] Got Google client successfully');

    const drive = google.drive({ version: 'v3', auth });

    // Get last sync time or default to 30 days ago for better coverage
    const lastSyncAt = connector.lastSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastSyncRfc = lastSyncAt.toISOString();

    console.log('[Drive Sync] Fetching files modified after:', lastSyncRfc);

    // EXPANDED SCOPE: Google Docs + Word + PDF + Text
    const mimeTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word .docx
      'text/plain'
    ];

    // Construct query: (mime1 or mime2...) AND modifiedTime > X AND not trashed
    const mimeQuery = mimeTypes.map(t => `mimeType='${t}'`).join(' or ');
    // REMOVED: 'me' in owners (to include shared files)
    const query = `(${mimeQuery}) and modifiedTime > '${lastSyncRfc}' and trashed=false`;

    console.log('[Drive Sync] Query:', query);

    let artifactsCreated = 0;
    let pageToken: string | undefined = undefined;
    let processedCount = 0;
    const MAX_FILES = 1000; // Safety limit

    do {
      const driveResponse: any = await drive.files.list({
        q: query,
        pageSize: 100,
        pageToken: pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, createdTime, lastModifyingUser, owners)',
        orderBy: 'modifiedTime desc',
      });

      console.log('[Drive Sync] Page fetch:', {
        fileCount: driveResponse.data.files?.length || 0,
        nextPageToken: !!driveResponse.data.nextPageToken
      });

      if (!driveResponse.data.files || driveResponse.data.files.length === 0) {
        break;
      }

      for (const file of driveResponse.data.files) {
        if (!file.id) continue;
        processedCount++;

        // Check if already ingested (by file ID and modified time)
        const existing = await prisma.workArtifact.findFirst({
          where: {
            connectorId: connector.id,
            externalId: file.id,
          },
        });

        // If exists and hasn't been modified, skip
        if (existing) {
          const existingModified = (existing.metadata as Record<string, unknown>)?.modifiedTime;
          if (existingModified === file.modifiedTime) continue;
        }

        // Content Extraction Strategy
        let content = '';
        try {
          // 1. Google Native Formats -> Export
          if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
            const exportResponse = await drive.files.export({
              fileId: file.id,
              mimeType: 'text/plain',
            });
            content = (exportResponse.data as string) || '';
          }
          // 2. Binary Formats (Word, PDF) -> Placeholder for now (requires parsing lib)
          else {
            content = `[File: ${file.name}] (${file.mimeType})\n(Content extraction pending implementation)`;
          }
        } catch (exportErr) {
          console.warn(`Failed to export content for file ${file.id} (${file.name}):`, exportErr);
        }

        const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : new Date();

        if (existing) {
          // Update existing artifact
          await prisma.workArtifact.update({
            where: { id: existing.id },
            data: {
              content: content.substring(0, 50000), // Limit content size
              rawContent: content,
              metadata: {
                mimeType: file.mimeType,
                modifiedTime: file.modifiedTime,
                webViewLink: file.webViewLink,
                createdTime: file.createdTime,
                lastModifyingUser: file.lastModifyingUser?.displayName,
                owners: file.owners?.map((o: any) => o.displayName || o.emailAddress),
              },
              occurredAt: modifiedTime,
              analyzed: false, // Mark for re-analysis
            },
          });

          // Trigger Graph Builder on update
          await publishGraphJob(userId, existing.id);

        } else {
          // Create new artifact
          const newArtifact = await prisma.workArtifact.create({
            data: {
              userId,
              connectorId: connector.id,
              type: 'DOCUMENT_AUTHORED',
              externalId: file.id,
              title: file.name || 'Untitled Document',
              content: content.substring(0, 50000),
              rawContent: content,
              metadata: {
                mimeType: file.mimeType,
                modifiedTime: file.modifiedTime,
                webViewLink: file.webViewLink,
                createdTime: file.createdTime,
                lastModifyingUser: file.lastModifyingUser?.displayName,
                owners: file.owners?.map((o: any) => o.displayName || o.emailAddress),
              },
              participants: [], // Documents don't have participants in same way
              occurredAt: modifiedTime,
            },
          });

          await publishGraphJob(userId, newArtifact.id);
          artifactsCreated++;
        }
      }

      pageToken = driveResponse.data.nextPageToken || undefined;

    } while (pageToken && processedCount < MAX_FILES);

    console.log(`[Drive Sync] Completed. Processed: ${processedCount}, Created/Updated: ${artifactsCreated}`);
    return { success: true, artifactsCreated };
  } catch (error) {
    console.error('Drive sync error:', error);
    return {
      success: false,
      artifactsCreated: 0,
      error: error instanceof Error ? error.message : 'Drive sync failed',
    };
  }
}
