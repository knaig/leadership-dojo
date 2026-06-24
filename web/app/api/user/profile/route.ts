import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                onboardingComplete: true,
                jobTitle: true,
                company: true,
                subscription: {
                    select: {
                        tier: true,
                        status: true,
                        monthlyCaseLimit: true,
                        monthlyAiFeedbackLimit: true,
                        casesUsedThisMonth: true,
                        aiFeedbackUsedThisMonth: true,
                        // currency removed
                        trialEndsAt: true,
                    }
                }
            }
        });

        if (!user) {
            // Create the user record from Clerk data so onboarding can save to it
            if (session?.user?.email) {
                await ensureUserExistsWithData(
                    userId,
                    session.user.email,
                    session.user.name || null,
                    session.user.image || null
                );
            }
            return NextResponse.json({
                id: userId,
                tier: 'FREE',
                role: 'STUDENT',
                onboardingComplete: false,
            });
        }

        return NextResponse.json({
            ...user,
            tier: (user as any).subscription?.tier || 'FREE',
        });
    } catch (error: any) {
        console.error('[Profile] Error:', error?.message || error, error?.stack);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}
