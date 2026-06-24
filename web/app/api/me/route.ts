import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

/**
 * GET /api/me
 * Returns the user's full profile — who they are, their responsibilities,
 * what Mira knows about them, and what's still missing.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const [user, responsibility, businessCtx, intelligence, onboardingProgress] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                email: true,
                jobTitle: true,
                company: true,
                industry: true,
                companyStage: true,
                phoneNumber: true,
                preferredChannel: true,
                onboardingComplete: true,
                onboardingProgress: true,
            },
        }),
        prisma.userResponsibility.findFirst({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        }),
        prisma.businessContext.findUnique({
            where: { userId },
            select: {
                teamSize: true,
                directReports: true,
                reportingTo: true,
                communicationStyle: true,
                strengths: true,
                blindSpots: true,
                strategicPriorities: true,
                currentChallenges: true,
                businessModel: true,
                primaryMetric: true,
            },
        }),
        prisma.userIntelligence.findUnique({
            where: { userId },
            select: {
                strengths: true,
                growthAreas: true,
                communicationPatterns: true,
                meetingBehavior: true,
            },
        }),
        // Check what onboarding steps are done
        prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingProgress: true },
        }),
    ]);

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Compute what's missing for Mira to coach effectively
    const gaps: string[] = [];
    if (!user.jobTitle) gaps.push('Job title');
    if (!user.company) gaps.push('Company name');
    if (!responsibility) gaps.push('Responsibilities & KPIs');
    if (!responsibility?.businessOutcomes || (responsibility.businessOutcomes as unknown[]).length === 0) gaps.push('Business outcomes');
    if (!businessCtx?.reportingTo) gaps.push('Who you report to');
    if (!businessCtx?.teamSize) gaps.push('Team size');
    if (!businessCtx?.currentChallenges?.length) gaps.push('Current challenges');

    return NextResponse.json({
        profile: {
            name: user.name,
            email: user.email,
            jobTitle: user.jobTitle,
            company: user.company,
            team: user.industry,
            companyStage: user.companyStage,
            phoneNumber: user.phoneNumber,
            preferredChannel: user.preferredChannel,
        },
        responsibility: responsibility ? {
            title: responsibility.title,
            scope: responsibility.scope,
            responsibilities: responsibility.responsibilities,
            kpis: responsibility.kpis,
            successCriteria: responsibility.successCriteria,
            reportsTo: responsibility.reportsTo,
            teamSize: responsibility.teamSize,
            businessOutcomes: responsibility.businessOutcomes,
            inferred: responsibility.inferred,
            confirmedAt: responsibility.confirmedAt,
            source: responsibility.source,
        } : null,
        businessContext: businessCtx,
        intelligence: intelligence ? {
            strengths: intelligence.strengths,
            growthAreas: intelligence.growthAreas,
            communicationPatterns: intelligence.communicationPatterns,
            meetingBehavior: intelligence.meetingBehavior,
        } : null,
        gaps,
        onboardingProgress: onboardingProgress?.onboardingProgress || {},
    });
}

/**
 * PATCH /api/me
 * Update user profile fields directly
 */
export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const body = await req.json();
    const allowedFields = ['name', 'jobTitle', 'company', 'industry', 'phoneNumber', 'countryCode', 'preferredChannel', 'companyStage'];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
        if (field in body) {
            updateData[field] = body[field] || null;
        }
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await prisma.user.update({
        where: { id: userId },
        data: updateData,
    });

    return NextResponse.json({ success: true });
}
