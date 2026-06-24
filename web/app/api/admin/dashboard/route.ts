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
        // Fetch users with subscription (including token usage) and activity counts
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
                _count: {
                    select: {
                        progress: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        // Convert BigInt to Number for JSON serialization
        const serializedUsers = users.map(u => ({
            ...u,
            subscription: u.subscription ? {
                ...u.subscription,
                tokensUsedThisMonth: u.subscription.tokensUsedThisMonth
                    ? Number(u.subscription.tokensUsedThisMonth)
                    : 0,
            } : null,
        }));

        // Calculate stats
        const paidUsers = users.filter(u =>
            u.subscription && u.subscription.tier !== 'FREE' && u.subscription.status === 'ACTIVE'
        );

        const mrr = paidUsers.reduce((sum, u) => {
            const tier = u.subscription?.tier;
            const base = tier === 'ENTERPRISE' ? 99 : tier === 'PRO' ? 29 : 0;
            return sum + base;
        }, 0);

        // Platform LLM usage stats
        const platformUsers = users.filter(u => u.subscription?.llmSource === 'platform');
        const totalPlatformTokens = platformUsers.reduce((sum, u) => {
            return sum + Number(u.subscription?.tokensUsedThisMonth || 0);
        }, 0);

        const stats = {
            totalUsers: users.length,
            paidUsers: paidUsers.length,
            mrr,
            activeCoupons: 0,
            platformUsers: platformUsers.length,
            totalPlatformTokens,
        };

        return NextResponse.json({ users: serializedUsers, coupons: [], stats });
    } catch (error: any) {
        console.error('[Admin Dashboard] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
