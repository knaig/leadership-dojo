
import { prisma } from '@/lib/prisma';
import { syncGmailConnector } from './connectors/gmail';
import { syncCalendarConnector } from './connectors/calendar';
import { syncDriveConnector } from './connectors/drive';
import { ConnectorType } from '@prisma/client';

export interface SyncResult {
    connectorId: string;
    type: string;
    success: boolean;
    count: number;
    error?: string;
}

export async function syncAllConnectors(userId: string): Promise<SyncResult[]> {
    console.log(`[SyncService] Starting full sync for user ${userId}`);

    // 1. Fetch connected connectors
    const connectors = await prisma.dataConnector.findMany({
        where: {
            userId,
            status: 'CONNECTED' // Schema uses 'status' enum likely
        },
        include: {
            account: true
        }
    });

    if (connectors.length === 0) {
        console.log('[SyncService] No active connectors found.');
        return [];
    }

    // 2. Map connectors to their sync functions
    const syncPromises = connectors.map(async (connector) => {
        try {
            let result;

            // Cast to 'any' to bypass strict inclusion checks if types are mismatched
            // The logic inside connectors uses getGoogleClient(userId) anyway
            const connectorWithAccount = connector as any;

            switch (connector.type) {
                // Use explicit casts to satisfy TS if enum imports behave oddly
                case 'GMAIL' as ConnectorType:
                    result = await syncGmailConnector(connectorWithAccount, userId);
                    break;
                case 'GOOGLE_CALENDAR' as ConnectorType:
                case 'CALENDAR' as unknown as ConnectorType:
                    result = await syncCalendarConnector(connectorWithAccount, userId);
                    break;
                case 'GOOGLE_DRIVE' as ConnectorType:
                case 'DRIVE' as unknown as ConnectorType:
                    result = await syncDriveConnector(connectorWithAccount, userId);
                    break;
                default:
                    // Fallback string check
                    if (connector.type === 'CALENDAR' as any) {
                        result = await syncCalendarConnector(connectorWithAccount, userId);
                    } else if (connector.type === 'DRIVE' as any) {
                        result = await syncDriveConnector(connectorWithAccount, userId);
                    } else {
                        console.warn(`[SyncService] Unknown connector type: ${connector.type}`);
                        return { connectorId: connector.id, type: connector.type, success: false, count: 0, error: 'Unknown Type' };
                    }
            }

            if (!result) {
                return { connectorId: connector.id, type: connector.type, success: false, count: 0, error: 'No sync function' };
            }

            // Update lastSyncAt (Schema field inferred from lint error)
            await prisma.dataConnector.update({
                where: { id: connector.id },
                data: { lastSyncAt: new Date() }
            });

            return {
                connectorId: connector.id,
                type: connector.type,
                success: result.success,
                count: result.artifactsCreated,
                error: result.error
            };
        } catch (e: any) {
            console.error(`[SyncService] Failed to sync ${connector.type}:`, e);
            return {
                connectorId: connector.id,
                type: connector.type,
                success: false,
                count: 0,
                error: e.message
            };
        }
    });

    // 3. Run in parallel
    const results = await Promise.all(syncPromises);

    console.log('[SyncService] Sync complete:', results);
    return results;
}
