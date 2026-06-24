/**
 * Connector Adapter Interface
 *
 * Standardizes how the worker dispatches sync, auth checks, and disconnect
 * across all connector types. Each provider implements this interface,
 * wrapping its existing sync agent.
 *
 * Usage:
 *   const adapter = getAdapter('github');
 *   const result = await adapter.sync({ userId, resourceId });
 */

export interface SyncOptions {
    userId: string;
    resourceId?: string;
    fullResync?: boolean;
    trigger?: string;
}

export interface SyncResult {
    synced: number;
    created: number;
    updated: number;
    errors: string[];
}

export interface ConnectorAdapter {
    /** Provider key (matches ConnectorDefinition.provider) */
    readonly provider: string;

    /** Check if this connector is authenticated for the user */
    isAuthenticated(userId: string): Promise<boolean>;

    /** Run sync — returns standardized result */
    sync(options: SyncOptions): Promise<SyncResult>;

    /** Disconnect — clean up tokens, watch channels, mark connector DISCONNECTED */
    disconnect(userId: string): Promise<void>;

    /** pg-boss job name that triggers this adapter's sync */
    readonly syncJobName: string;

    /** pg-boss job name for downstream knowledge extraction */
    readonly extractJobName: string;
}
