import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';

/**
 * GET /api/admin/calls/scheduled — Today's call plan + upcoming scheduled calls.
 * Shows what Mira plans to do today so the admin knows what to expect.
 */
export async function GET(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(todayStart.getTime() + 2 * 24 * 60 * 60 * 1000);

    const calls = await prisma.scheduledCall.findMany({
        where: {
            scheduledFor: { gte: todayStart, lt: tomorrowEnd },
        },
        include: {
            user: { select: { name: true, email: true } },
        },
        orderBy: { scheduledFor: 'asc' },
    });

    // Group by user for the plan view
    const byUser: Record<string, typeof calls> = {};
    for (const call of calls) {
        const key = call.userId;
        if (!byUser[key]) byUser[key] = [];
        byUser[key].push(call);
    }

    // Summary stats
    const pending = calls.filter(c => c.status === 'pending');
    const completed = calls.filter(c => c.status === 'completed');
    const noAnswer = calls.filter(c => c.status === 'no_answer');
    const calling = calls.filter(c => c.status === 'calling');

    // Users who have no calls scheduled today
    const voiceUsers = await prisma.userPreferences.findMany({
        where: { dailyCallEnabled: true, preferredChannel: 'voice' },
        select: {
            userId: true,
            user: { select: { name: true, phoneNumber: true } },
        },
    });
    const usersWithCalls = new Set(calls.map(c => c.userId));
    const usersWithNoCalls = voiceUsers.filter(u =>
        !usersWithCalls.has(u.userId) && u.user.phoneNumber
    );

    return NextResponse.json({
        calls,
        summary: {
            total: calls.length,
            pending: pending.length,
            completed: completed.length,
            noAnswer: noAnswer.length,
            calling: calling.length,
            usersWithCalls: usersWithCalls.size,
            usersWithNoCalls: usersWithNoCalls.map(u => ({
                userId: u.userId,
                name: u.user.name,
            })),
        },
        byUser,
    });
}
