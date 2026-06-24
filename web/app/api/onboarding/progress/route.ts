import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

export interface OnboardingProgress {
    profile: boolean;       // job title, company
    role: boolean;          // responsibilities confirmed
    outcomes: boolean;      // business outcomes mapped
    stakeholders: boolean;  // key people added
    calendar: boolean;      // calendar connected
    context: boolean;       // additional docs/context uploaded
}

const DEFAULT_PROGRESS: OnboardingProgress = {
    profile: false,
    role: false,
    outcomes: false,
    stakeholders: false,
    calendar: false,
    context: false,
};

function getCompletionPercent(progress: OnboardingProgress): number {
    const steps = Object.values(progress);
    return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

/**
 * GET /api/onboarding/progress
 * Returns current onboarding progress + what's still needed
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user record exists (Clerk creates auth but not DB record)
    await ensureUserExists(userId);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            jobTitle: true,
            company: true,
            onboardingComplete: true,
            onboardingProgress: true,
            preferredChannel: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const progress = {
        ...DEFAULT_PROGRESS,
        ...(user.onboardingProgress as Record<string, boolean> || {}),
    };

    // Auto-detect completed steps from existing data
    const [stakeholderCount, hasCalendar, hasResponsibility, docCount] = await Promise.all([
        prisma.stakeholderProfile.count({ where: { userId } }),
        prisma.account.count({ where: { userId, provider: 'google' } }),
        prisma.userResponsibility.count({ where: { userId } }),
        prisma.uploadedDocument.count({ where: { userId } }),
    ]);

    if (user.jobTitle && user.company) progress.profile = true;
    if (hasResponsibility > 0) progress.role = true;
    if (stakeholderCount >= 1) progress.stakeholders = true;
    if (hasCalendar > 0) progress.calendar = true;
    if (docCount > 0) progress.context = true;

    const completionPercent = getCompletionPercent(progress);

    // Figure out next recommended step
    const stepOrder: (keyof OnboardingProgress)[] = ['profile', 'role', 'stakeholders', 'calendar', 'outcomes', 'context'];
    const nextStep = stepOrder.find(s => !progress[s]) || null;

    return NextResponse.json({
        progress,
        completionPercent,
        nextStep,
        isComplete: completionPercent === 100 || user.onboardingComplete,
        preferredChannel: user.preferredChannel,
    });
}

/**
 * PATCH /api/onboarding/progress
 * Update specific onboarding steps
 */
export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const body = await req.json();
    const { step, completed, preferredChannel } = body;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingProgress: true },
    });

    const currentProgress = {
        ...DEFAULT_PROGRESS,
        ...(user?.onboardingProgress as Record<string, boolean> || {}),
    };

    if (step && typeof completed === 'boolean') {
        (currentProgress as Record<string, boolean>)[step] = completed;
    }

    const updateData: Record<string, unknown> = {
        onboardingProgress: currentProgress,
    };

    if (preferredChannel !== undefined) {
        updateData.preferredChannel = preferredChannel;
    }

    // Mark onboarding complete if all steps done
    const allDone = Object.values(currentProgress).every(Boolean);
    if (allDone) {
        updateData.onboardingComplete = true;
    }

    await prisma.user.update({
        where: { id: userId },
        data: updateData,
    });

    return NextResponse.json({
        progress: currentProgress,
        completionPercent: getCompletionPercent(currentProgress),
        isComplete: allDone,
    });
}
