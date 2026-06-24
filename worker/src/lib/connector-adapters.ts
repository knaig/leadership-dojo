/**
 * Connector Adapter Implementations + Registry
 *
 * Wraps existing sync agents behind the ConnectorAdapter interface.
 * The registry maps provider keys → adapter instances for dispatch.
 */

import { ConnectorAdapter, SyncOptions, SyncResult } from './connector-adapter';
import { prisma } from './prisma';

// ─── Google Calendar ────────────────────────────────────────────────

class GoogleCalendarAdapter implements ConnectorAdapter {
    readonly provider = 'gcal';
    readonly syncJobName = 'calendar-sync';
    readonly extractJobName = 'knowledge-extract-calendar';

    async isAuthenticated(userId: string): Promise<boolean> {
        const connector = await prisma.dataConnector.findFirst({
            where: { userId, provider: this.provider, status: 'CONNECTED' },
        });
        return !!connector;
    }

    async sync(options: SyncOptions): Promise<SyncResult> {
        const { calendarSyncAgent } = await import('../agents/calendar-sync');
        const result = await calendarSyncAgent(options.userId);
        return {
            synced: result.synced,
            created: result.created,
            updated: result.updated,
            errors: result.errors,
        };
    }

    async disconnect(userId: string): Promise<void> {
        await prisma.dataConnector.updateMany({
            where: { userId, provider: this.provider },
            data: { status: 'DISCONNECTED' },
        });
    }
}

// ─── Gmail ──────────────────────────────────────────────────────────

class GmailAdapter implements ConnectorAdapter {
    readonly provider = 'gmail';
    readonly syncJobName = 'email-sync';
    readonly extractJobName = 'knowledge-extract-email';

    async isAuthenticated(userId: string): Promise<boolean> {
        const connector = await prisma.dataConnector.findFirst({
            where: { userId, provider: this.provider, status: 'CONNECTED' },
        });
        return !!connector;
    }

    async sync(options: SyncOptions): Promise<SyncResult> {
        const { emailSyncAgent } = await import('../agents/email-sync');
        const result = await emailSyncAgent(options.userId);
        return {
            synced: result.synced,
            created: result.created,
            updated: result.updated,
            errors: result.errors,
        };
    }

    async disconnect(userId: string): Promise<void> {
        await prisma.dataConnector.updateMany({
            where: { userId, provider: this.provider },
            data: { status: 'DISCONNECTED' },
        });
    }
}

// ─── Google Drive ───────────────────────────────────────────────────

class GoogleDriveAdapter implements ConnectorAdapter {
    readonly provider = 'gdrive';
    readonly syncJobName = 'drive-sync';
    readonly extractJobName = 'knowledge-extract-document';

    async isAuthenticated(userId: string): Promise<boolean> {
        const connector = await prisma.dataConnector.findFirst({
            where: { userId, provider: this.provider, status: 'CONNECTED' },
        });
        return !!connector;
    }

    async sync(options: SyncOptions): Promise<SyncResult> {
        const { driveSyncAgent } = await import('../agents/drive-sync');
        const result = await driveSyncAgent(options.userId);
        return {
            synced: result.synced,
            created: result.created,
            updated: result.updated,
            errors: result.errors,
        };
    }

    async disconnect(userId: string): Promise<void> {
        await prisma.dataConnector.updateMany({
            where: { userId, provider: this.provider },
            data: { status: 'DISCONNECTED' },
        });
    }
}

// ─── GitHub ─────────────────────────────────────────────────────────

class GitHubAdapter implements ConnectorAdapter {
    readonly provider = 'github';
    readonly syncJobName = 'github-sync';
    readonly extractJobName = 'knowledge-extract-github';

    async isAuthenticated(userId: string): Promise<boolean> {
        const installation = await prisma.gitHubInstallation.findFirst({
            where: { userId },
        });
        return !!installation;
    }

    async sync(options: SyncOptions): Promise<SyncResult> {
        const { runGitHubSync } = await import('../agents/github-sync');
        await runGitHubSync({
            userId: options.userId,
            resourceId: options.resourceId,
            trigger: options.trigger || 'adapter',
        });

        // GitHub sync doesn't return counts — approximate from DB
        // This is intentionally approximate; the sync agent logs details
        return { synced: 0, created: 0, updated: 0, errors: [] };
    }

    async disconnect(userId: string): Promise<void> {
        await prisma.dataConnector.updateMany({
            where: { userId, provider: this.provider },
            data: { status: 'DISCONNECTED' },
        });
        // Note: doesn't uninstall the GitHub App — user does that from GitHub settings
    }
}

// ─── Adapter Registry ───────────────────────────────────────────────

const adapters: Map<string, ConnectorAdapter> = new Map();

function register(adapter: ConnectorAdapter): void {
    adapters.set(adapter.provider, adapter);
}

register(new GoogleCalendarAdapter());
register(new GmailAdapter());
register(new GoogleDriveAdapter());
register(new GitHubAdapter());

/**
 * Get adapter for a provider. Returns undefined for manual/MCP connectors
 * that don't have a sync agent.
 */
export function getAdapter(provider: string): ConnectorAdapter | undefined {
    return adapters.get(provider);
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): ConnectorAdapter[] {
    return Array.from(adapters.values());
}

/**
 * Get adapter by pg-boss sync job name (for dispatch in index.ts).
 */
export function getAdapterByJobName(jobName: string): ConnectorAdapter | undefined {
    return getAllAdapters().find(a => a.syncJobName === jobName);
}
