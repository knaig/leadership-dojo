import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/subscription
 * 
 * Get current user's subscription details
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const subscription = await prisma.subscription.findUnique({
            where: { userId: session.user.id },
            select: {
                tier: true,
                status: true,
                enabledFeatures: true,
                disabledFeatures: true,
                trialEndsAt: true,
                stripeCurrentPeriodEnd: true,
            },
        });

        if (!subscription) {
            // Return default FREE tier if no subscription exists
            return NextResponse.json({
                tier: 'FREE',
                status: 'ACTIVE',
                enabledFeatures: [],
                disabledFeatures: [],
            });
        }

        return NextResponse.json(subscription);
    } catch (error) {
        console.error('Failed to fetch subscription:', error);
        return NextResponse.json(
            { error: 'Failed to fetch subscription' },
            { status: 500 }
        );
    }
}
