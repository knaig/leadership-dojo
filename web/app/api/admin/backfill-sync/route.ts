import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backfill-sync
 * Reset sync status for a user so next worker run pulls from onboarding date.
 * This triggers a full historical sync on next cron cycle.
 */
export async function POST() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Reset sync status records — worker will see no lastSyncAt and use user.createdAt
    const deleted = await prisma.syncStatus.deleteMany({
        where: { userId },
    });

    // Get user's onboarding date for confirmation
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true, email: true },
    });

    return NextResponse.json({
        success: true,
        message: `Sync status reset. Next worker run will pull all data from ${user?.createdAt?.toISOString() || 'unknown'}.`,
        syncStatusesCleared: deleted.count,
        user: user?.email,
        onboardedAt: user?.createdAt?.toISOString(),
    });
}
