/**
 * Coaching Trajectory Agent — Computes weekly coaching KPIs per user.
 *
 * Runs once per week (typically Sunday night or Monday morning) to snapshot
 * engagement quality, knowledge growth, and commitment follow-through into
 * the CoachingTrajectory table. Powers the coaching dashboard and helps
 * Mira adapt her approach based on trajectory trends.
 *
 * Flow: Cron → computeWeeklyTrajectoryAllUsers → per-user computeWeeklyTrajectory
 *       → upsert CoachingTrajectory record
 */

import { prisma } from '../lib/prisma';
import { withAgentRun } from '../lib/agent-run';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Returns Sunday 00:00:00 and Saturday 23:59:59.999 for the current week.
 * Week boundary: Sunday through Saturday.
 */
function getCurrentWeekBoundaries(): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday

    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - dayOfWeek);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
}

/**
 * Returns the week boundaries for the previous week (for comparison).
 */
function getPreviousWeekStart(currentWeekStart: Date): Date {
    const prev = new Date(currentWeekStart);
    prev.setUTCDate(prev.getUTCDate() - 7);
    return prev;
}

// ============================================================================
// ONBOARDING TOPIC FIELDS
// ============================================================================

const ONBOARDING_TOPIC_FIELDS = [
    'coveredStory',
    'coveredDrivesAndValues',
    'coveredLife',
    'coveredRole',
    'coveredStakeholders',
    'coveredLeadershipStyle',
    'coveredGoals',
    'coveredChallenges',
    'coveredGrowth',
] as const;

// ============================================================================
// MAIN: computeWeeklyTrajectory
// ============================================================================

/**
 * Computes and upserts the CoachingTrajectory record for a single user
 * for the current week.
 */
export async function computeWeeklyTrajectory(userId: string): Promise<void> {
    const { weekStart, weekEnd } = getCurrentWeekBoundaries();

    console.log(`[CoachingTrajectory] Computing trajectory for user ${userId}, week ${weekStart.toISOString()}`);

    // 1. Load CallEvaluations for this week
    const evaluations = await prisma.callEvaluation.findMany({
        where: {
            userId,
            voiceCall: {
                endedAt: { gte: weekStart, lte: weekEnd },
            },
        },
        select: { overallScore: true },
    });

    const avgCallQuality = evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length
        : null;

    // 2. Load completed VoiceCalls for this week
    const completedCalls = await prisma.voiceCall.findMany({
        where: {
            userId,
            status: 'ended',
            endedAt: { gte: weekStart, lte: weekEnd },
        },
        select: { durationSeconds: true },
    });

    const callsCompleted = completedCalls.length;
    const totalMinutes = Math.round(
        completedCalls.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0) / 60
    );

    // 3. Count KnowledgeFact growth (facts created this week)
    const knowledgeGraphGrowth = await prisma.knowledgeFact.count({
        where: {
            userId,
            recordedAt: { gte: weekStart, lte: weekEnd },
        },
    });

    // 4. ScheduledCall completion rate
    const scheduledCalls = await prisma.scheduledCall.count({
        where: {
            userId,
            scheduledFor: { gte: weekStart, lte: weekEnd },
            status: { not: 'cancelled' },
        },
    });

    const completedScheduledCalls = await prisma.scheduledCall.count({
        where: {
            userId,
            scheduledFor: { gte: weekStart, lte: weekEnd },
            status: 'completed',
        },
    });

    const callRetentionRate = scheduledCalls > 0
        ? completedScheduledCalls / scheduledCalls
        : null;

    // 5. Commitment completion rate from CoachingRelationshipPlan
    let commitmentsTracked = 0;
    let commitmentsCompleted = 0;

    const plan = await prisma.coachingRelationshipPlan.findUnique({
        where: { userId },
        select: { commitments: true },
    });

    if (plan?.commitments && Array.isArray(plan.commitments)) {
        const commitments = plan.commitments as Array<{ status?: string }>;
        commitmentsTracked = commitments.length;
        commitmentsCompleted = commitments.filter(
            (c) => c.status === 'completed' || c.status === 'followed_up'
        ).length;
    }

    // 6. Relationship depth rate: compare this week's avg to previous week's
    let relationshipDepthRate: number | null = null;

    if (avgCallQuality !== null) {
        const previousWeekStart = getPreviousWeekStart(weekStart);
        const previousTrajectory = await prisma.coachingTrajectory.findUnique({
            where: {
                userId_weekStart: { userId, weekStart: previousWeekStart },
            },
            select: { avgCallQuality: true },
        });

        if (previousTrajectory?.avgCallQuality != null && previousTrajectory.avgCallQuality > 0) {
            relationshipDepthRate =
                (avgCallQuality - previousTrajectory.avgCallQuality) / previousTrajectory.avgCallQuality;
        }
    }

    // 7. Onboarding velocity: if onboarding not complete, count topics covered this week
    let onboardingVelocity: number | null = null;

    const onboarding = await prisma.onboardingProgress.findUnique({
        where: { userId },
    });

    if (onboarding && !onboarding.onboardingComplete) {
        const coveredCount = ONBOARDING_TOPIC_FIELDS.filter(
            (field) => onboarding[field] === true
        ).length;
        // Velocity = topics covered / total topics (progress ratio for this snapshot)
        onboardingVelocity = coveredCount / ONBOARDING_TOPIC_FIELDS.length;
    }

    // 8. Upsert CoachingTrajectory
    await prisma.coachingTrajectory.upsert({
        where: {
            userId_weekStart: { userId, weekStart },
        },
        create: {
            userId,
            weekStart,
            avgCallQuality,
            callsCompleted,
            totalMinutes,
            knowledgeGraphGrowth,
            callRetentionRate,
            commitmentsTracked,
            commitmentsCompleted,
            relationshipDepthRate,
            onboardingVelocity,
        },
        update: {
            avgCallQuality,
            callsCompleted,
            totalMinutes,
            knowledgeGraphGrowth,
            callRetentionRate,
            commitmentsTracked,
            commitmentsCompleted,
            relationshipDepthRate,
            onboardingVelocity,
        },
    });

    console.log(
        `[CoachingTrajectory] Upserted trajectory for user ${userId}: ` +
        `calls=${callsCompleted}, mins=${totalMinutes}, avgQuality=${avgCallQuality?.toFixed(2) ?? 'N/A'}, ` +
        `facts=${knowledgeGraphGrowth}, retention=${callRetentionRate?.toFixed(2) ?? 'N/A'}, ` +
        `commitments=${commitmentsCompleted}/${commitmentsTracked}`
    );
}

// ============================================================================
// BATCH: computeWeeklyTrajectoryAllUsers
// ============================================================================

/**
 * Finds all users who had VoiceCalls in the past week and computes
 * their weekly trajectory. Errors are handled per-user so one failure
 * does not block others.
 */
export async function computeWeeklyTrajectoryAllUsers(): Promise<void> {
    return withAgentRun('coaching-trajectory', undefined, 'cron', async (ctx) => {
        const { weekStart, weekEnd } = getCurrentWeekBoundaries();

        console.log(
            `[CoachingTrajectory] Computing weekly trajectories for all users, ` +
            `week ${weekStart.toISOString()} – ${weekEnd.toISOString()}`
        );

        const usersWithCalls = await prisma.voiceCall.findMany({
            where: {
                endedAt: { gte: weekStart, lte: weekEnd },
                status: 'ended',
            },
            select: { userId: true },
            distinct: ['userId'],
        });

        const userIds = usersWithCalls.map((u) => u.userId);

        console.log(`[CoachingTrajectory] Found ${userIds.length} users with calls this week`);

        let succeeded = 0;
        let failed = 0;

        for (const userId of userIds) {
            try {
                await computeWeeklyTrajectory(userId);
                succeeded++;
            } catch (error) {
                failed++;
                console.error(
                    `[CoachingTrajectory] Failed for user ${userId}:`,
                    error instanceof Error ? error.message : error
                );
            }
        }

        ctx.itemsProcessed = succeeded;
        ctx.itemsSkipped = failed;
        ctx.logs.push(`${succeeded} succeeded, ${failed} failed out of ${userIds.length} users`);

        console.log(
            `[CoachingTrajectory] Batch complete: ${succeeded} succeeded, ${failed} failed out of ${userIds.length} users`
        );
    });
}
