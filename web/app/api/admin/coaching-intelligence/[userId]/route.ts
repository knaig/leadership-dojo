import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/coaching-intelligence/[userId]
 * Per-user coaching intelligence detail for admin.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ userId: string }> },
) {
    const { userId: adminId } = await auth();
    if (!adminId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId: targetUserId } = await params;

    try {
        // Full call history with evaluations
        const calls = await prisma.voiceCall.findMany({
            where: { userId: targetUserId, status: 'ended' },
            orderBy: { endedAt: 'desc' },
            take: 50,
            select: {
                id: true,
                callType: true,
                durationSeconds: true,
                summary: true,
                endedAt: true,
                confidenceMode: true,
                evaluation: {
                    select: {
                        overallScore: true,
                        newGroundScore: true,
                        depthOfSharingScore: true,
                        valueAddScore: true,
                        contextUtilScore: true,
                        repetitionScore: true,
                        engagementScore: true,
                        whatWorked: true,
                        whatToImprove: true,
                        commitmentsExtracted: true,
                        newInfoLearned: true,
                        recommendedTopics: true,
                        postureMatch: true,
                        timingMatch: true,
                        selectedPosture: true,
                    },
                },
            },
        });

        // Coaching relationship plan
        const plan = await prisma.coachingRelationshipPlan.findUnique({
            where: { userId: targetUserId },
        });

        // Trajectory time series
        const trajectories = await prisma.coachingTrajectory.findMany({
            where: { userId: targetUserId },
            orderBy: { weekStart: 'desc' },
            take: 12,
        });

        // Personal context
        const personalContext = await prisma.personalContext.findUnique({
            where: { userId: targetUserId },
            select: {
                callCount: true,
                totalCallMinutes: true,
                firstCallDate: true,
                lastCallDate: true,
                knownTopics: true,
                gapTopics: true,
            },
        });

        // Personal threads
        const threads = await prisma.personalThread.findMany({
            where: { userId: targetUserId },
            orderBy: { lastTouched: 'desc' },
        });

        // User preferences (archetype, adaptation signals)
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId: targetUserId },
            select: {
                primaryArchetype: true,
                secondaryArchetype: true,
                conversationMode: true,
                adaptationSignals: true,
                preferredCallDuration: true,
                postureReceptivity: true,
                fatigueProfile: true,
            },
        });

        // Goals and strategic objectives
        const goals = await prisma.strategicObjective.findMany({
            where: { userId: targetUserId },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                deadline: true,
                ownerType: true,
                updatedAt: true,
            },
        });

        // Onboarding progress
        const onboarding = await prisma.onboardingProgress.findUnique({
            where: { userId: targetUserId },
            select: {
                coveredStory: true,
                coveredDrivesAndValues: true,
                coveredLife: true,
                coveredRole: true,
                coveredStakeholders: true,
                coveredLeadershipStyle: true,
                coveredGoals: true,
                coveredChallenges: true,
                coveredGrowth: true,
                totalOnboardingCalls: true,
            },
        });

        // Format personality profile
        const personalityProfile = plan?.personalityProfile as Record<string, unknown> || {};
        const communicationProfile = plan?.communicationProfile as Record<string, unknown> || {};
        const coachingThemes = plan?.coachingThemes as unknown[] || [];
        const commitments = plan?.commitments as unknown[] || [];

        // Tool use analytics
        const toolUseStats = await prisma.toolUseRecord.groupBy({
            by: ['toolName', 'source'],
            where: { userId: targetUserId },
            _count: true,
            _avg: { durationMs: true },
        });

        return NextResponse.json({
            calls,
            plan: plan ? {
                phase: plan.phase,
                coachingThemes,
                communicationProfile,
                personalityProfile,
                commitments,
                avoidTopics: plan.avoidTopics,
                updatedAt: plan.updatedAt,
            } : null,
            trajectories,
            personalContext,
            threads,
            preferences: prefs,
            goals,
            onboarding,
            toolUseStats,
        });
    } catch (error) {
        console.error('[Admin Coaching Intelligence Detail]', error);
        return NextResponse.json({ error: 'Failed to load user coaching data' }, { status: 500 });
    }
}
