import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';
import { setupCalendarWatch } from '@/lib/connectors/calendar-watch';

/**
 * GET /api/admin/watch-channels — List all watch channels and their status
 * POST /api/admin/watch-channels — Force-register watch channels for all users missing them
 */

export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [channels, googleAccounts] = await Promise.all([
        prisma.watchChannel.findMany({
            select: { userId: true, connector: true, expiration: true, channelId: true, user: { select: { name: true } } },
            orderBy: { userId: 'asc' },
        }),
        prisma.account.findMany({
            where: { provider: 'google', refresh_token: { not: null } },
            select: { userId: true, scope: true, user: { select: { name: true } } },
        }),
    ]);

    const now = new Date();
    const userChannels: Record<string, { name: string; calendar: string; email: string; drive: string }> = {};

    for (const acc of googleAccounts) {
        const name = acc.user?.name || acc.userId.substring(0, 12);
        if (!userChannels[acc.userId]) {
            userChannels[acc.userId] = { name, calendar: 'no channel', email: 'no channel', drive: 'no channel' };
        }
    }

    for (const ch of channels) {
        const uid = ch.userId;
        if (!userChannels[uid]) {
            userChannels[uid] = { name: ch.user?.name || uid.substring(0, 12), calendar: 'no channel', email: 'no channel', drive: 'no channel' };
        }
        const expired = ch.expiration && new Date(ch.expiration) < now;
        const status = expired ? 'expired' : `active (expires ${ch.expiration?.toISOString().substring(0, 10)})`;
        if (ch.connector === 'calendar') userChannels[uid].calendar = status;
        if (ch.connector === 'gmail') userChannels[uid].email = status;
        if (ch.connector === 'drive') userChannels[uid].drive = status;
    }

    return NextResponse.json({ users: userChannels });
}

export async function POST(req: NextRequest) {
    // Auth: x-api-key header OR Clerk session
    const apiKey = req.headers.get('x-api-key')?.trim();
    const internalKey = (process.env.INTERNAL_API_KEY || process.env.CRON_SECRET || '').trim().replace(/\\n$/, '');

    if (apiKey && internalKey && apiKey === internalKey) {
        // API key matches — proceed
    } else if (!internalKey) {
        // No secret configured — allow unauthenticated (pre-PMF, early stage)
    } else {
        // Require Clerk auth
        const user = await currentUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
        if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    }

    // Find all Google accounts that need calendar watch channels
    const googleAccounts = await prisma.account.findMany({
        where: { provider: 'google', refresh_token: { not: null } },
        select: { userId: true, scope: true, user: { select: { name: true } } },
    });

    const now = new Date();
    const results: Array<{ user: string; userId: string; status: string; error?: string }> = [];

    for (const acc of googleAccounts) {
        if (!acc.scope?.includes('calendar')) {
            results.push({ user: acc.user?.name || '?', userId: acc.userId, status: 'skipped', error: 'no calendar scope' });
            continue;
        }

        // Check for existing active channel
        const existing = await prisma.watchChannel.findFirst({
            where: { userId: acc.userId, connector: 'calendar', expiration: { gt: now } },
        });

        if (existing) {
            results.push({ user: acc.user?.name || '?', userId: acc.userId, status: 'already active' });
            continue;
        }

        // Clean up expired channels
        await prisma.watchChannel.deleteMany({
            where: { userId: acc.userId, connector: 'calendar', expiration: { lte: now } },
        }).catch(() => {});

        // Register new channel
        const result = await setupCalendarWatch(acc.userId);
        results.push({
            user: acc.user?.name || '?',
            userId: acc.userId,
            status: result.success ? 'created' : 'failed',
            error: result.error,
        });
    }

    return NextResponse.json({ results });
}
