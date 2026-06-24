import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/calls/schedule
 * Schedule a call for the authenticated user.
 *
 * Body:
 *   trigger: 'first_login' | 'callback' | 'now'
 *   callbackTime?: string  (ISO datetime for 'callback' trigger)
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { trigger, callbackTime } = body as {
            trigger: 'first_login' | 'callback' | 'now';
            callbackTime?: string;
        };

        if (!trigger || !['first_login', 'callback', 'now'].includes(trigger)) {
            return NextResponse.json(
                { error: 'Invalid trigger. Must be first_login, callback, or now.' },
                { status: 400 }
            );
        }

        let scheduledCall;

        switch (trigger) {
            case 'first_login': {
                // Create onboarding call scheduled for now
                scheduledCall = await prisma.scheduledCall.create({
                    data: {
                        userId,
                        callType: 'onboarding',
                        scheduledFor: new Date(),
                        status: 'pending',
                    },
                });

                // Create OnboardingProgress if it doesn't exist
                await prisma.onboardingProgress.upsert({
                    where: { userId },
                    create: { userId },
                    update: {},
                });

                // Enable daily calls in user preferences
                await prisma.userPreferences.upsert({
                    where: { userId },
                    create: {
                        userId,
                        dailyCallEnabled: true,
                    },
                    update: {
                        dailyCallEnabled: true,
                    },
                });

                break;
            }

            case 'callback': {
                const scheduledFor = callbackTime
                    ? new Date(callbackTime)
                    : new Date(Date.now() + 60 * 60 * 1000); // Default: 1 hour from now

                scheduledCall = await prisma.scheduledCall.create({
                    data: {
                        userId,
                        callType: 'callback',
                        scheduledFor,
                        status: 'pending',
                        agenda: { userRequest: 'User requested a callback' },
                    },
                });
                break;
            }

            case 'now': {
                scheduledCall = await prisma.scheduledCall.create({
                    data: {
                        userId,
                        callType: 'daily_checkin',
                        scheduledFor: new Date(),
                        status: 'pending',
                    },
                });
                break;
            }
        }

        return NextResponse.json({ scheduledCallId: scheduledCall.id });
    } catch (error) {
        console.error('[Calls Schedule] Error:', error);
        return NextResponse.json({ error: 'Failed to schedule call' }, { status: 500 });
    }
}
