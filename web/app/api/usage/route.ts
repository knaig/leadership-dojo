import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sub = await prisma.subscription.findUnique({
        where: { userId },
        select: {
            tier: true,
            llmSource: true,
            monthlyTokenLimit: true,
            tokensUsedThisMonth: true,
            tokenResetDate: true,
        },
    });

    if (!sub) {
        return NextResponse.json({
            llmSource: 'byollm',
            tokenLimit: 0,
            tokensUsed: 0,
            tokensRemaining: 0,
            percentage: 0,
            resetDate: null,
            tier: 'FREE',
        });
    }

    const tokensUsed = Number(sub.tokensUsedThisMonth);
    const tokenLimit = sub.monthlyTokenLimit;
    const tokensRemaining = Math.max(0, tokenLimit - tokensUsed);
    const percentage = tokenLimit > 0 ? Math.min(100, Math.round((tokensUsed / tokenLimit) * 100)) : 0;

    return NextResponse.json({
        llmSource: sub.llmSource,
        tokenLimit,
        tokensUsed,
        tokensRemaining,
        percentage,
        resetDate: sub.tokenResetDate,
        tier: sub.tier,
    });
}
