/**
 * Drive Sync Agent
 *
 * Syncs Google Drive documents in real-time.
 * Publishes live progress updates via Pusher.
 */

import { prisma } from '../lib/prisma';
import { publishSystemEvent } from '../lib/pusher';
import { getGoogleAuth } from '../lib/google-auth';
import { google } from 'googleapis';

interface SyncResult {
    synced: number;
    created: number;
    updated: number;
    errors: string[];
}

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    createdTime?: string;
    webViewLink?: string;
    lastModifyingUser?: { displayName?: string };
    owners?: Array<{ displayName?: string; emailAddress?: string }>;
}

// Supported MIME types for sync
const SUPPORTED_MIME_TYPES = [
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];

/**
 * Real-time drive sync with live Pusher updates
 */
export async function driveSyncAgent(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, errors: [] };

    console.log(`[DriveSync] Starting for user ${userId}`);

    try {
        // Skip if synced recently (within 2 minutes — reduced from 20 for webhook-triggered syncs)
        const syncStatus = await prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'drive' } }
        });
        if (syncStatus?.lastSyncAt && (Date.now() - syncStatus.lastSyncAt.getTime()) < 2 * 60 * 1000) {
            console.log(`[DriveSync] Skipping — last synced ${Math.round((Date.now() - syncStatus.lastSyncAt.getTime()) / 60000)}m ago`);
            return result;
        }

        // Detect provider — support both Google and Microsoft
        const account = await prisma.account.findFirst({
            where: { userId, provider: { in: ['google', 'microsoft'] } },
            select: { provider: true },
        });

        if (account?.provider === 'microsoft') {
            return await microsoftDriveSync(userId);
        }

        // Existing Google path continues below...

        // Notify user that sync is starting
        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: '📁 Syncing drive...',
            data: { status: 'connecting', progress: 0, syncType: 'drive' }
        });

        // Get authenticated Google client (handles token refresh + persistence)
        const auth = await getGoogleAuth(userId);

        if (!auth) {
            await publishSystemEvent(userId, {
                type: 'drive_sync',
                message: '⚠️ Google Drive not connected. Please connect it first.',
                data: { status: 'error', error: 'Not connected', syncType: 'drive' }
            });
            result.errors.push('Google Drive not connected');
            return result;
        }

        const { oauth2Client } = auth;

        // Update sync status
        await updateSyncStatus(userId, 'drive', 'syncing');

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Fetch files modified in last 90 days (rolling window)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        // Build query for supported MIME types
        const mimeQuery = SUPPORTED_MIME_TYPES.map(t => `mimeType='${t}'`).join(' or ');
        const query = `(${mimeQuery}) and modifiedTime > '${ninetyDaysAgo}' and trashed=false`;

        console.log(`[DriveSync] Query: ${query}`);

        // Collect all files (paginated)
        const allFiles: DriveFile[] = [];
        let pageToken: string | undefined = undefined;
        const MAX_FILES = 500;

        do {
            const response = await drive.files.list({
                q: query,
                pageSize: 100,
                pageToken: pageToken,
                fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, createdTime, lastModifyingUser, owners)',
                orderBy: 'modifiedTime desc',
            });

            const files = (response.data.files || []) as DriveFile[];
            allFiles.push(...files);
            pageToken = response.data.nextPageToken || undefined;

            console.log(`[DriveSync] Fetched page: ${files.length} files, total: ${allFiles.length}`);

        } while (pageToken && allFiles.length < MAX_FILES);

        // Also fetch files from pinned sources (bypass 90-day window)
        const pinnedSources = await prisma.pinnedSource.findMany({
            where: { userId, sourceType: { in: ['drive_folder', 'drive_doc'] } },
        });

        for (const pinned of pinnedSources) {
            try {
                if (pinned.sourceType === 'drive_doc') {
                    // Single pinned doc — fetch directly
                    const fileRes = await drive.files.get({
                        fileId: pinned.externalId,
                        fields: 'id, name, mimeType, modifiedTime, webViewLink, createdTime, lastModifyingUser, owners',
                    });
                    const file = fileRes.data as DriveFile;
                    if (file && !allFiles.some(f => f.id === file.id)) {
                        allFiles.push(file);
                    }
                } else if (pinned.sourceType === 'drive_folder') {
                    // Pinned folder — list all files in it
                    const folderQuery = `'${pinned.externalId}' in parents and (${mimeQuery}) and trashed=false`;
                    const folderRes = await drive.files.list({
                        q: folderQuery,
                        pageSize: 50,
                        fields: 'files(id, name, mimeType, modifiedTime, webViewLink, createdTime, lastModifyingUser, owners)',
                        orderBy: 'modifiedTime desc',
                    });
                    for (const file of (folderRes.data.files || []) as DriveFile[]) {
                        if (!allFiles.some(f => f.id === file.id)) {
                            allFiles.push(file);
                        }
                    }
                }
                // Update sync status for pinned source
                await prisma.pinnedSource.update({
                    where: { id: pinned.id },
                    data: { lastSyncedAt: new Date(), syncStatus: 'synced' },
                });
            } catch (err: any) {
                console.warn(`[DriveSync] Failed to sync pinned source "${pinned.name}": ${err.message}`);
                await prisma.pinnedSource.update({
                    where: { id: pinned.id },
                    data: { syncStatus: 'error' },
                }).catch(() => {});
            }
        }

        console.log(`[DriveSync] Found ${allFiles.length} files (${pinnedSources.length} pinned sources)`);

        // Get or create the Drive connector
        const connector = await getOrCreateConnector(userId);

        // Process files (no per-file Pusher updates to avoid spam)
        for (let i = 0; i < allFiles.length; i++) {
            const file = allFiles[i];

            try {
                const { created, updated } = await syncSingleFile(userId, connector.id, file, drive);
                result.synced++;
                if (created) result.created++;
                if (updated) result.updated++;
            } catch (err) {
                console.error(`[DriveSync] Error processing file ${file.id}:`, err);
                result.errors.push(`File ${file.name}: ${err}`);
            }
        }

        // Update sync status to idle (SyncStatus is the single source of truth for sync recency)
        await updateSyncStatus(userId, 'drive', 'idle');

        // Final success message
        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: `✅ Drive sync complete! ${result.synced} documents synced (${result.created} new, ${result.updated} updated).`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                updated: result.updated,
                syncType: 'drive'
            }
        });

        console.log(`[DriveSync] Complete: ${result.synced} files (${result.created} created, ${result.updated} updated)`);
        return result;

    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[DriveSync] Error:`, error);

        // Detect permanent auth failures and disconnect
        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('invalid_grant') ||
            error?.message?.includes('Token refresh failed') ||
            error?.message?.includes('invalid_client')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'gdrive', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            await prisma.watchChannel.deleteMany({ where: { userId, connector: 'drive' } }).catch(() => {});
            await publishSystemEvent(userId, {
                type: 'google_disconnected',
                message: 'Your Google Drive connection has expired. Please reconnect in Settings.',
                data: { provider: 'gdrive', requiresAction: true },
            });
            console.error('[DriveSync] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'drive', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'drive', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: `❌ Drive sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'drive' }
        });

        return result;
    }
}

/**
 * Get or create the Drive data connector for this user
 */
async function getOrCreateConnector(userId: string) {
    const existing = await prisma.dataConnector.findFirst({
        where: {
            userId,
            provider: 'gdrive'
        }
    });

    if (existing) return existing;

    // Create new connector
    return await prisma.dataConnector.create({
        data: {
            userId,
            provider: 'gdrive',
            type: 'DOCUMENTS',
            status: 'CONNECTED',
        }
    });
}

/**
 * Sync a single file to WorkArtifact
 */
async function syncSingleFile(
    userId: string,
    connectorId: string,
    file: DriveFile,
    drive: ReturnType<typeof google.drive>
): Promise<{ created: boolean; updated: boolean }> {

    // Check if already exists
    const existing = await prisma.workArtifact.findFirst({
        where: {
            connectorId,
            externalId: file.id,
        },
    });

    // If exists and hasn't been modified, skip
    if (existing) {
        const existingModified = (existing.metadata as Record<string, unknown>)?.modifiedTime;
        if (existingModified === file.modifiedTime) {
            return { created: false, updated: false };
        }
    }

    // Extract content
    let content = '';
    try {
        if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
            // Google native formats -> Export to plain text
            const exportResponse = await drive.files.export({
                fileId: file.id,
                mimeType: 'text/plain',
            });
            content = (exportResponse.data as string) || '';
        } else {
            // Binary formats (Word, PDF) - placeholder for now
            content = `[File: ${file.name}] (${file.mimeType})\n(Content extraction pending implementation)`;
        }
    } catch (exportErr) {
        console.warn(`[DriveSync] Failed to export content for ${file.id} (${file.name}):`, exportErr);
        content = `[File: ${file.name}] (${file.mimeType})\n(Content extraction failed)`;
    }

    const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : new Date();
    const metadata = {
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        createdTime: file.createdTime,
        lastModifyingUser: file.lastModifyingUser?.displayName,
        owners: file.owners?.map(o => o.displayName || o.emailAddress),
    };

    if (existing) {
        // Update existing artifact
        await prisma.workArtifact.update({
            where: { id: existing.id },
            data: {
                content: content.substring(0, 50000),
                rawContent: content,
                metadata,
                occurredAt: modifiedTime,
                analyzed: false, // Mark for re-analysis
            },
        });

        // Queue graph job for updated artifact
        await queueGraphJob(userId, existing.id);

        return { created: false, updated: true };
    } else {
        // Create new artifact
        const newArtifact = await prisma.workArtifact.create({
            data: {
                userId,
                connectorId,
                type: 'DOCUMENT_AUTHORED',
                externalId: file.id,
                title: file.name || 'Untitled Document',
                content: content.substring(0, 50000),
                rawContent: content,
                metadata,
                participants: [],
                occurredAt: modifiedTime,
            },
        });

        // Queue graph job for new artifact
        await queueGraphJob(userId, newArtifact.id);

        return { created: true, updated: false };
    }
}

/**
 * Queue a graph builder job for the artifact via direct SQL INSERT.
 * Avoids creating a new PgBoss instance per file.
 */
async function queueGraphJob(userId: string, artifactId: string): Promise<void> {
    try {
        const payload = JSON.stringify({ userId, artifactId });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES (
                'agent-graph-builder',
                ${payload}::jsonb,
                'created',
                3, 0, 30, 300,
                now(),
                now() + INTERVAL '7 days'
            )
        `;
    } catch (err) {
        console.warn(`[DriveSync] Failed to queue graph job for artifact ${artifactId}:`, err);
    }
}

/**
 * Update sync status
 */
async function updateSyncStatus(userId: string, connector: string, status: string, error?: string): Promise<void> {
    await prisma.syncStatus.upsert({
        where: { userId_connector: { userId, connector } },
        create: {
            userId,
            connector,
            status,
            lastError: error,
            lastSyncAt: status === 'idle' ? new Date() : undefined,
        },
        update: {
            status,
            lastError: error,
            lastSyncAt: status === 'idle' ? new Date() : undefined,
            syncCount: status === 'idle' ? { increment: 1 } : undefined,
        },
    });
}

/**
 * Microsoft OneDrive sync via Graph API adapter.
 * Mirrors the Google Drive sync logic but uses the adapter interface.
 */
async function microsoftDriveSync(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, errors: [] };

    try {
        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: '📁 Syncing OneDrive...',
            data: { status: 'connecting', progress: 0, syncType: 'drive' }
        });

        await updateSyncStatus(userId, 'drive', 'syncing');

        const { MicrosoftDocumentAdapter } = require('../lib/adapters/microsoft/microsoft-onedrive');
        const adapter = new MicrosoftDocumentAdapter(userId);

        // Fetch recent documents (adapter returns them sorted by lastModified desc)
        const { documents } = await adapter.listDocuments({
            maxResults: 500,
            modifiedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        });

        console.log(`[DriveSync:Microsoft] Found ${documents.length} documents`);

        // Get or create the OneDrive connector
        const connector = await getOrCreateMicrosoftDriveConnector(userId);

        for (const doc of documents) {
            try {
                // Check if already exists
                const existing = await prisma.workArtifact.findFirst({
                    where: {
                        connectorId: connector.id,
                        externalId: doc.externalId,
                    },
                });

                // If exists and hasn't been modified, skip
                if (existing) {
                    const existingModified = (existing.metadata as Record<string, unknown>)?.modifiedTime;
                    if (existingModified === doc.lastModified.toISOString()) {
                        continue;
                    }
                }

                // Try to extract content
                let content = '';
                try {
                    const text = await adapter.getDocumentText(doc.externalId);
                    content = text || `[File: ${doc.title}] (${doc.mimeType})\n(Content extraction pending)`;
                } catch (err: any) {
                    console.warn(`[DriveSync:Microsoft] Failed to extract content for ${doc.externalId} (${doc.title}): ${err.message}`);
                    content = `[File: ${doc.title}] (${doc.mimeType})\n(Content extraction failed)`;
                }

                const metadata = {
                    mimeType: doc.mimeType,
                    modifiedTime: doc.lastModified.toISOString(),
                    webViewLink: doc.url,
                    createdTime: doc.createdAt.toISOString(),
                    owner: doc.owner?.name || doc.owner?.email,
                    size: doc.size,
                };

                if (existing) {
                    await prisma.workArtifact.update({
                        where: { id: existing.id },
                        data: {
                            content: content.substring(0, 50000),
                            rawContent: content,
                            metadata,
                            occurredAt: doc.lastModified,
                            analyzed: false,
                        },
                    });

                    await queueGraphJob(userId, existing.id);
                    result.synced++;
                    result.updated++;
                } else {
                    const newArtifact = await prisma.workArtifact.create({
                        data: {
                            userId,
                            connectorId: connector.id,
                            type: 'DOCUMENT_AUTHORED',
                            externalId: doc.externalId,
                            title: doc.title || 'Untitled Document',
                            content: content.substring(0, 50000),
                            rawContent: content,
                            metadata,
                            participants: [],
                            occurredAt: doc.lastModified,
                        },
                    });

                    await queueGraphJob(userId, newArtifact.id);
                    result.synced++;
                    result.created++;
                }
            } catch (err: any) {
                console.error(`[DriveSync:Microsoft] Error processing file ${doc.externalId}:`, err);
                result.errors.push(`File ${doc.title}: ${err.message}`);
            }
        }

        await updateSyncStatus(userId, 'drive', 'idle');

        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: `✅ OneDrive sync complete! ${result.synced} documents synced (${result.created} new, ${result.updated} updated).`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                updated: result.updated,
                syncType: 'drive'
            }
        });

        console.log(`[DriveSync:Microsoft] Complete: ${result.synced} files (${result.created} created, ${result.updated} updated)`);
    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[DriveSync:Microsoft] Error:`, error);

        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('InvalidAuthenticationToken') ||
            error?.message?.includes('CompactToken')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'microsoft_drive', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            await publishSystemEvent(userId, {
                type: 'microsoft_disconnected',
                message: 'Your OneDrive connection has expired. Please reconnect in Settings.',
                data: { provider: 'microsoft_drive', requiresAction: true },
            });
            console.error('[DriveSync:Microsoft] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'drive', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'drive', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'drive_sync',
            message: `❌ OneDrive sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'drive' }
        });
    }

    return result;
}

/**
 * Get or create the OneDrive data connector for this user
 */
async function getOrCreateMicrosoftDriveConnector(userId: string) {
    const existing = await prisma.dataConnector.findFirst({
        where: {
            userId,
            provider: 'microsoft_drive'
        }
    });

    if (existing) return existing;

    return await prisma.dataConnector.create({
        data: {
            userId,
            provider: 'microsoft_drive',
            type: 'DOCUMENTS',
            status: 'CONNECTED',
        }
    });
}
