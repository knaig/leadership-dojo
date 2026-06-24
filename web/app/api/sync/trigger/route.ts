import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/trigger
 * Body: { provider: 'gcal' | 'gmail' | 'gdrive' }
 *
 * Manually triggers a sync for a specific provider. Bypasses the cron schedule.
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = body.provider as string;

    const jobMap: Record<string, string> = {
        gcal: 'calendar-sync',
        gmail: 'email-sync',
        gdrive: 'drive-sync',
    };

    const jobName = jobMap[provider];
    if (!jobName) {
        return NextResponse.json({ error: 'Invalid provider. Use: gcal, gmail, gdrive' }, { status: 400 });
    }

    // Check connector is connected
    const connector = await prisma.dataConnector.findFirst({
        where: { userId, provider, status: 'CONNECTED' },
    });
    if (!connector) {
        return NextResponse.json({ error: 'Connector not connected' }, { status: 400 });
    }

    // Queue sync job via pg-boss
    try {
        await prisma.$executeRawUnsafe(
            `INSERT INTO pgboss.job (name, data, state) VALUES ($1, $2, 'created')`,
            jobName,
            JSON.stringify({ userId })
        );
        return NextResponse.json({ status: 'queued', job: jobName });
    } catch (e: any) {
        return NextResponse.json({ error: `Failed to queue: ${e.message}` }, { status: 500 });
    }
}
