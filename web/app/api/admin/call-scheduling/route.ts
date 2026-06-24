import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/call-scheduling
 *
 * Returns all users with their call scheduling preferences and recent call stats.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            preferences: {
                select: {
                    dailyCallEnabled: true,
                    dailyCallTime: true,
                    callScheduleMode: true,
                    meetingPrepLeadMinutes: true,
                    meetingPrepMinGap: true,
                    callFrequencyMinutes: true,
                    callWindowStart: true,
                    callWindowEnd: true,
                    dailyCallMaxRetries: true,
                    dailyCallRetryAfterMin: true,
                    maxCallsPerDay: true,
                },
            },
        },
    });

    // Get recent call stats per user
    const recentCalls = await prisma.voiceCall.findMany({
        where: { startedAt: { gte: d7 } },
        select: {
            userId: true,
            status: true,
            startedAt: true,
            endedAt: true,
            durationSeconds: true,
            callType: true,
        },
        orderBy: { startedAt: 'desc' },
    });

    // Get scheduled calls
    const scheduledCalls = await prisma.scheduledCall.findMany({
        where: { scheduledFor: { gte: h24 }, status: { in: ['pending', 'in_progress'] } },
        select: {
            userId: true,
            scheduledFor: true,
            callType: true,
            status: true,
        },
    });

    const callsByUser = new Map<string, typeof recentCalls>();
    for (const call of recentCalls) {
        if (!callsByUser.has(call.userId)) callsByUser.set(call.userId, []);
        callsByUser.get(call.userId)!.push(call);
    }

    const scheduledByUser = new Map<string, typeof scheduledCalls>();
    for (const sc of scheduledCalls) {
        if (!scheduledByUser.has(sc.userId)) scheduledByUser.set(sc.userId, []);
        scheduledByUser.get(sc.userId)!.push(sc);
    }

    const result = users.map(user => {
        const calls = callsByUser.get(user.id) || [];
        const scheduled = scheduledByUser.get(user.id) || [];
        const completedCalls = calls.filter(c => c.status === 'ended');
        const todayCalls = calls.filter(c => c.startedAt >= h24);
        const lastCall = calls[0];

        return {
            userId: user.id,
            userName: user.name || user.email,
            email: user.email,
            role: user.role,
            schedule: user.preferences ? {
                enabled: user.preferences.dailyCallEnabled,
                mode: user.preferences.callScheduleMode || 'calendar_aware',
                time: user.preferences.dailyCallTime,
                leadMinutes: user.preferences.meetingPrepLeadMinutes ?? 15,
                minGap: user.preferences.meetingPrepMinGap ?? 12,
                frequencyMinutes: user.preferences.callFrequencyMinutes,
                windowStart: user.preferences.callWindowStart,
                windowEnd: user.preferences.callWindowEnd,
                maxRetries: user.preferences.dailyCallMaxRetries,
                retryAfterMin: user.preferences.dailyCallRetryAfterMin,
                maxCallsPerDay: user.preferences.maxCallsPerDay,
            } : null,
            stats: {
                callsLast7d: completedCalls.length,
                callsToday: todayCalls.length,
                lastCallAt: lastCall?.startedAt?.toISOString() || null,
                lastCallStatus: lastCall?.status || null,
                avgDuration: completedCalls.length > 0
                    ? Math.round(completedCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / completedCalls.length)
                    : null,
            },
            upcoming: scheduled.map(s => ({
                scheduledFor: s.scheduledFor.toISOString(),
                callType: s.callType,
                status: s.status,
            })),
        };
    });

    // Sort: enabled first, then by last call
    result.sort((a, b) => {
        if (a.schedule?.enabled && !b.schedule?.enabled) return -1;
        if (!a.schedule?.enabled && b.schedule?.enabled) return 1;
        return 0;
    });

    return NextResponse.json({ users: result });
}
