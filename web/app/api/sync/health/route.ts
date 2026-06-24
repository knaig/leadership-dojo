import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface ConnectorHealth {
    provider: string;
    status: string;
    lastSyncAt: string | null;
    lastSyncAgo: string;
    syncStatus: string;
    lastError: string | null;
    hasWatchChannel: boolean;
    watchChannelExpires: string | null;
}

function timeAgo(date: Date | null): string {
    if (!date) return 'never';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const providerMap: Record<string, string> = {
        gcal: 'calendar',
        gmail: 'email',
        gdrive: 'drive',
    };

    const [connectors, syncStatuses, watchChannels] = await Promise.all([
        prisma.dataConnector.findMany({
            where: { userId, provider: { in: ['gcal', 'gmail', 'gdrive'] } },
            select: { provider: true, status: true },
        }),
        prisma.syncStatus.findMany({
            where: { userId, connector: { in: ['calendar', 'email', 'drive'] } },
        }),
        prisma.watchChannel.findMany({
            where: { userId, connector: { in: ['calendar', 'email', 'drive', 'gmail'] } },
        }),
    ]);

    const now = new Date();
    const result: ConnectorHealth[] = [];

    for (const [provider, syncConnector] of Object.entries(providerMap)) {
        const connector = connectors.find(c => c.provider === provider);
        const sync = syncStatuses.find(s => s.connector === syncConnector);
        const watch = watchChannels.find(w =>
            w.connector === syncConnector && w.expiration > now
        );

        if (!connector) continue;

        result.push({
            provider,
            status: connector.status,
            lastSyncAt: sync?.lastSyncAt?.toISOString() || null,
            lastSyncAgo: timeAgo(sync?.lastSyncAt || null),
            syncStatus: sync?.status || 'unknown',
            lastError: sync?.lastError || null,
            hasWatchChannel: !!watch,
            watchChannelExpires: watch?.expiration?.toISOString() || null,
        });
    }

    // Overall health
    const hasDisconnected = result.some(c => c.status === 'DISCONNECTED');
    const hasStaleness = result.some(c => {
        if (!c.lastSyncAt) return true;
        return Date.now() - new Date(c.lastSyncAt).getTime() > 60 * 60 * 1000;
    });
    const missingWatch = result.some(c => !c.hasWatchChannel && c.status === 'CONNECTED');

    let overall: 'healthy' | 'degraded' | 'disconnected' = 'healthy';
    if (hasDisconnected) overall = 'disconnected';
    else if (hasStaleness || missingWatch) overall = 'degraded';

    return NextResponse.json({ connectors: result, overall });
}
