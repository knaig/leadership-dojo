import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                subscription: {
                    select: {
                        tier: true,
                        status: true,
                        llmSource: true,
                        monthlyTokenLimit: true,
                        tokensUsedThisMonth: true,
                        tokenResetDate: true,
                    },
                },
                voiceCalls: {
                    select: {
                        id: true,
                        status: true,
                        callType: true,
                        durationSeconds: true,
                        startedAt: true,
                    },
                    orderBy: { startedAt: 'desc' },
                    take: 50,
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Fetch sync statuses for all user IDs (no relation on model)
        const userIds = users.map(u => u.id);
        const syncStatuses = await prisma.syncStatus.findMany({
            where: { userId: { in: userIds } },
            select: {
                userId: true,
                connector: true,
                status: true,
                lastSyncAt: true,
                lastError: true,
                syncCount: true,
            },
        });

        // Group sync statuses by userId
        const syncByUser = new Map<string, typeof syncStatuses>();
        for (const s of syncStatuses) {
            const existing = syncByUser.get(s.userId) || [];
            existing.push(s);
            syncByUser.set(s.userId, existing);
        }

        // Serialize and combine
        const serializedUsers = users.map(u => {
            const completedCalls = u.voiceCalls.filter(c => c.status === 'ended');
            const totalDuration = completedCalls.reduce(
                (sum, c) => sum + (c.durationSeconds || 0),
                0
            );

            return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                createdAt: u.createdAt,
                subscription: u.subscription
                    ? {
                          ...u.subscription,
                          tokensUsedThisMonth: u.subscription.tokensUsedThisMonth
                              ? Number(u.subscription.tokensUsedThisMonth)
                              : 0,
                      }
                    : null,
                syncStatus: syncByUser.get(u.id) || [],
                callStats: {
                    total: u.voiceCalls.length,
                    completed: completedCalls.length,
                    totalDurationSeconds: totalDuration,
                    lastCallAt: u.voiceCalls[0]?.startedAt || null,
                },
            };
        });

        return NextResponse.json({ users: serializedUsers });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Admin Users List] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
