import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pmf-overview
 *
 * PMF dashboard: narratives + metrics for every user.
 * Returns headline metrics, per-user cards with engagement/quality/commitment data,
 * and actionable alerts.
 */
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // ------------------------------------------------------------------
        // 1. Get all users with their context
        // ------------------------------------------------------------------
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                personalContext: {
                    select: {
                        callCount: true,
                        totalCallMinutes: true,
                        firstCallDate: true,
                        lastCallDate: true,
                    },
                },
                coachingRelationshipPlan: {
                    select: {
                        phase: true,
                        coachingThemes: true,
                        commitments: true,
                        personalityProfile: true,
                    },
                },
                connectors: {
                    select: { type: true, status: true, lastSyncAt: true },
                },
            },
        });

        // ------------------------------------------------------------------
        // 2. Get all voice calls (last 30 days for trends)
        // ------------------------------------------------------------------
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const recentCalls = await prisma.voiceCall.findMany({
            where: {
                endedAt: { gte: thirtyDaysAgo },
            },
            select: {
                id: true,
                userId: true,
                status: true,
                callType: true,
                durationSeconds: true,
                endedAt: true,
                startedAt: true,
            },
            orderBy: { endedAt: 'desc' },
        });

        // Also get scheduled calls to compute pickup rate
        const scheduledCalls = await prisma.scheduledCall.findMany({
            where: {
                scheduledFor: { gte: thirtyDaysAgo },
            },
            select: {
                userId: true,
                scheduledFor: true,
                status: true,
                primaryPosture: true,
                callWorthiness: true,
            },
        });

        // ------------------------------------------------------------------
        // 3. Get all evaluations (last 30 days)
        // ------------------------------------------------------------------
        const recentEvals = await prisma.callEvaluation.findMany({
            where: { createdAt: { gte: thirtyDaysAgo } },
            select: {
                userId: true,
                overallScore: true,
                depthOfSharingScore: true,
                valueAddScore: true,
                repetitionScore: true,
                newGroundScore: true,
                contextUtilScore: true,
                engagementScore: true,
                createdAt: true,
                commitmentsExtracted: true,
                postureMatch: true,
                selectedPosture: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // ------------------------------------------------------------------
        // 4. Knowledge stats per user
        // ------------------------------------------------------------------
        const knowledgeStats = await prisma.knowledgeFact.groupBy({
            by: ['userId'],
            _count: { id: true },
        });
        const knowledgeMap = new Map(knowledgeStats.map(k => [k.userId, k._count.id]));

        const entityStats = await prisma.knowledgeEntity.groupBy({
            by: ['userId'],
            _count: { id: true },
        });
        const entityMap = new Map(entityStats.map(e => [e.userId, e._count.id]));

        // Corrections per user (last 14 days)
        const corrections = await prisma.userCorrection.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: fourteenDaysAgo } },
            _count: { id: true },
        });
        const correctionMap = new Map(corrections.map(c => [c.userId, c._count.id]));

        // ------------------------------------------------------------------
        // 5. Build per-user data
        // ------------------------------------------------------------------
        const callsByUser = new Map<string, typeof recentCalls>();
        for (const call of recentCalls) {
            const arr = callsByUser.get(call.userId) || [];
            arr.push(call);
            callsByUser.set(call.userId, arr);
        }

        const scheduledByUser = new Map<string, typeof scheduledCalls>();
        for (const sc of scheduledCalls) {
            const arr = scheduledByUser.get(sc.userId) || [];
            arr.push(sc);
            scheduledByUser.set(sc.userId, arr);
        }

        const evalsByUser = new Map<string, typeof recentEvals>();
        for (const ev of recentEvals) {
            const arr = evalsByUser.get(ev.userId) || [];
            arr.push(ev);
            evalsByUser.set(ev.userId, arr);
        }

        const alerts: Array<{
            userId: string;
            userName: string;
            type: string;
            severity: 'warning' | 'error';
            message: string;
            action: string;
        }> = [];

        const userCards = users
            .filter(u => u.personalContext) // Only users who have had at least some activity
            .map(u => {
                const ctx = u.personalContext!;
                const plan = u.coachingRelationshipPlan;
                const userCalls = callsByUser.get(u.id) || [];
                const userScheduled = scheduledByUser.get(u.id) || [];
                const userEvals = evalsByUser.get(u.id) || [];
                const daysSinceSignup = Math.floor((now.getTime() - u.createdAt.getTime()) / (1000 * 60 * 60 * 24));

                // --- Engagement ---
                const endedCalls = userCalls.filter(c => c.status === 'ended');
                const last7Calls = endedCalls.filter(c => c.endedAt && c.endedAt >= sevenDaysAgo);
                const last7Scheduled = userScheduled.filter(s => s.scheduledFor >= sevenDaysAgo);
                const pickupRate7d = last7Scheduled.length > 0
                    ? Math.round((last7Calls.length / last7Scheduled.length) * 100)
                    : null;

                // Streak: consecutive days with a call, counting back from today
                let streak = 0;
                const callDates = new Set(
                    endedCalls
                        .filter(c => c.endedAt)
                        .map(c => c.endedAt!.toISOString().split('T')[0])
                );
                for (let d = 0; d < 60; d++) {
                    const dateStr = new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
                        .toISOString().split('T')[0];
                    if (callDates.has(dateStr)) {
                        streak++;
                    } else if (d > 0) {
                        break; // Allow today to not have a call yet
                    }
                }

                // Avg duration (last 7 calls)
                const recentEndedCalls = endedCalls.slice(0, 7);
                const avgDuration = recentEndedCalls.length > 0
                    ? Math.round(recentEndedCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / recentEndedCalls.length)
                    : 0;

                // Duration trend: compare last 3 to previous 3
                const last3Duration = endedCalls.slice(0, 3).reduce((s, c) => s + (c.durationSeconds || 0), 0) / Math.max(endedCalls.slice(0, 3).length, 1);
                const prev3Duration = endedCalls.slice(3, 6).reduce((s, c) => s + (c.durationSeconds || 0), 0) / Math.max(endedCalls.slice(3, 6).length, 1);
                const durationTrend = endedCalls.length >= 4
                    ? (last3Duration > prev3Duration * 1.1 ? 'up' : last3Duration < prev3Duration * 0.9 ? 'down' : 'flat')
                    : 'insufficient';

                // --- Quality ---
                const avgQuality = userEvals.length > 0
                    ? userEvals.reduce((s, e) => s + e.overallScore, 0) / userEvals.length
                    : null;

                const avgDepth = userEvals.length > 0
                    ? userEvals.reduce((s, e) => s + e.depthOfSharingScore, 0) / userEvals.length
                    : null;

                const avgRepetition = userEvals.length > 0
                    ? userEvals.reduce((s, e) => s + e.repetitionScore, 0) / userEvals.length
                    : null;

                // Quality trend: last 5 vs prev 5
                const last5Evals = userEvals.slice(0, 5);
                const prev5Evals = userEvals.slice(5, 10);
                let qualityTrend: 'up' | 'down' | 'flat' | 'insufficient' = 'insufficient';
                if (last5Evals.length >= 3 && prev5Evals.length >= 3) {
                    const recentAvg = last5Evals.reduce((s, e) => s + e.overallScore, 0) / last5Evals.length;
                    const prevAvg = prev5Evals.reduce((s, e) => s + e.overallScore, 0) / prev5Evals.length;
                    qualityTrend = recentAvg - prevAvg > 0.5 ? 'up' : recentAvg - prevAvg < -0.5 ? 'down' : 'flat';
                }

                // Depth trend
                let depthTrend: 'up' | 'down' | 'flat' | 'insufficient' = 'insufficient';
                if (last5Evals.length >= 3 && prev5Evals.length >= 3) {
                    const recentDepth = last5Evals.reduce((s, e) => s + e.depthOfSharingScore, 0) / last5Evals.length;
                    const prevDepth = prev5Evals.reduce((s, e) => s + e.depthOfSharingScore, 0) / prev5Evals.length;
                    depthTrend = recentDepth - prevDepth > 0.3 ? 'up' : recentDepth - prevDepth < -0.3 ? 'down' : 'flat';
                }

                // Quality sparkline (last 14 evals, oldest first)
                const qualityHistory = userEvals
                    .slice(0, 14)
                    .reverse()
                    .map(e => ({
                        date: e.createdAt.toISOString().split('T')[0],
                        score: Math.round(e.overallScore * 10) / 10,
                        depth: Math.round(e.depthOfSharingScore * 10) / 10,
                    }));

                // --- Commitments ---
                const commitments = (plan?.commitments as Array<{ status: string; commitment?: string; madeAt?: string }>) || [];
                const openCommitments = commitments.filter(c => c.status === 'open').length;
                const completedCommitments = commitments.filter(c => c.status === 'completed').length;
                const totalCommitments = commitments.length;
                const staleCommitments = commitments.filter(c => {
                    if (c.status !== 'open') return false;
                    if (!c.madeAt) return true;
                    const madeAt = new Date(c.madeAt);
                    return (now.getTime() - madeAt.getTime()) > 7 * 24 * 60 * 60 * 1000;
                }).length;

                // --- Themes ---
                const themes = (plan?.coachingThemes as Array<{ theme: string; status: string; callCount?: number }>) || [];
                const activeThemes = themes.filter(t => t.status === 'active');
                const resolvedThemes = themes.filter(t => t.status === 'resolved');

                // --- Knowledge ---
                const factCount: number = knowledgeMap.get(u.id) || 0;
                const entityCount: number = entityMap.get(u.id) || 0;
                const correctionCount: number = correctionMap.get(u.id) || 0;

                // --- Onboarding status ---
                const connectorTypes = u.connectors.map(c => c.type);
                const connectedConnectors = u.connectors.filter(c => c.status === 'CONNECTED');
                const syncComplete = connectedConnectors.length >= 3;
                const hasFirstCall = ctx.callCount > 0;
                const hasSecondCall = ctx.callCount > 1;

                // --- Status ---
                let status: 'thriving' | 'steady' | 'needs_attention' | 'onboarding' = 'steady';
                if (!hasFirstCall || daysSinceSignup <= 2) {
                    status = 'onboarding';
                } else if (
                    (avgRepetition !== null && avgRepetition < 5) ||
                    (pickupRate7d !== null && pickupRate7d < 40) ||
                    durationTrend === 'down'
                ) {
                    status = 'needs_attention';
                } else if (
                    qualityTrend === 'up' &&
                    (pickupRate7d === null || pickupRate7d >= 70) &&
                    streak >= 3
                ) {
                    status = 'thriving';
                }

                // --- Today's call ---
                const todayCall = endedCalls.find(c => c.endedAt && c.endedAt >= todayStart);
                const todayEval = todayCall
                    ? userEvals.find(e => e.createdAt >= todayStart)
                    : null;

                // --- Alerts ---
                if (avgRepetition !== null && avgRepetition < 5) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'repetition',
                        severity: 'error',
                        message: `${u.name || u.email}'s repetition score is ${avgRepetition.toFixed(1)} — Mira is being repetitive`,
                        action: 'Review recent transcripts. Identify repeated themes. Update coaching themes or give Mira new angles.',
                    });
                }

                if (staleCommitments >= 3) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'stale_commitments',
                        severity: 'warning',
                        message: `${u.name || u.email} has ${staleCommitments} stale commitments (>7 days, no follow-up)`,
                        action: 'Check if follow-up prompts are firing. Consider parking old commitments.',
                    });
                }

                if (durationTrend === 'down' && ctx.callCount > 5) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'duration_decline',
                        severity: 'warning',
                        message: `${u.name || u.email}'s call duration is declining`,
                        action: 'Read recent transcripts — is Mira losing relevance or is the user just busy?',
                    });
                }

                if (pickupRate7d !== null && pickupRate7d < 40 && ctx.callCount > 3) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'low_pickup',
                        severity: 'warning',
                        message: `${u.name || u.email} pickup rate is ${pickupRate7d}% this week`,
                        action: 'User may be disengaging. Consider adjusting call time or Mira\'s approach.',
                    });
                }

                if (daysSinceSignup <= 7 && !hasFirstCall && daysSinceSignup > 0) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'onboarding_stuck',
                        severity: 'error',
                        message: `${u.name || u.email} signed up ${daysSinceSignup} day(s) ago but hasn't completed a call`,
                        action: 'Check sync status, call scheduling, and phone number.',
                    });
                }

                if (factCount < 10 && ctx.callCount >= 5) {
                    alerts.push({
                        userId: u.id,
                        userName: u.name || u.email,
                        type: 'knowledge_poor',
                        severity: 'warning',
                        message: `${u.name || u.email} has only ${factCount} facts after ${ctx.callCount} calls`,
                        action: 'Knowledge extraction may not be working. Check extraction agent logs.',
                    });
                }

                return {
                    userId: u.id,
                    name: u.name,
                    email: u.email,
                    daysSinceSignup,
                    status,

                    // Engagement
                    callCount: ctx.callCount,
                    lastCallDate: ctx.lastCallDate,
                    totalMinutes: ctx.totalCallMinutes,
                    pickupRate7d,
                    streak,
                    avgDuration,
                    durationTrend,

                    // Quality
                    avgQuality,
                    avgDepth,
                    avgRepetition,
                    qualityTrend,
                    depthTrend,
                    qualityHistory,

                    // Today
                    todayCallDuration: todayCall?.durationSeconds || null,
                    todayQuality: todayEval?.overallScore || null,
                    todayDepth: todayEval?.depthOfSharingScore || null,

                    // Commitments
                    openCommitments,
                    completedCommitments,
                    totalCommitments,
                    staleCommitments,

                    // Themes
                    activeThemes: activeThemes.map(t => t.theme),
                    resolvedThemes: resolvedThemes.length,

                    // Knowledge
                    factCount,
                    entityCount,
                    correctionCount,

                    // Coaching
                    phase: plan?.phase || 'none',

                    // Onboarding
                    syncComplete,
                    connectors: u.connectors.map(c => ({ type: c.type, status: c.status })),
                    hasFirstCall,
                    hasSecondCall,
                };
            })
            // Sort: needs_attention first, then onboarding, then thriving/steady
            .sort((a, b) => {
                const order = { needs_attention: 0, onboarding: 1, steady: 2, thriving: 3 };
                return (order[a.status] ?? 2) - (order[b.status] ?? 2);
            });

        // ------------------------------------------------------------------
        // 6. Headline metrics
        // ------------------------------------------------------------------
        const todayCalls = recentCalls.filter(c => c.endedAt && c.endedAt >= todayStart && c.status === 'ended');
        const todayScheduled = scheduledCalls.filter(s => s.scheduledFor >= todayStart);
        const todayEvals = recentEvals.filter(e => e.createdAt >= todayStart);

        const avgQualityToday = todayEvals.length > 0
            ? todayEvals.reduce((s, e) => s + e.overallScore, 0) / todayEvals.length
            : null;

        const avgDepthToday = todayEvals.length > 0
            ? todayEvals.reduce((s, e) => s + e.depthOfSharingScore, 0) / todayEvals.length
            : null;

        // 7-day quality trend
        const last7Evals = recentEvals.filter(e => e.createdAt >= sevenDaysAgo);
        const prev7Evals = recentEvals.filter(e => e.createdAt >= fourteenDaysAgo && e.createdAt < sevenDaysAgo);
        const qualityTrend7d = last7Evals.length >= 3 && prev7Evals.length >= 3
            ? (last7Evals.reduce((s, e) => s + e.overallScore, 0) / last7Evals.length) -
              (prev7Evals.reduce((s, e) => s + e.overallScore, 0) / prev7Evals.length)
            : null;

        // Total commitments
        let totalOpen = 0;
        let totalCompleted = 0;
        let totalAll = 0;
        for (const u of users) {
            const comms = (u.coachingRelationshipPlan?.commitments as Array<{ status: string }>) || [];
            totalOpen += comms.filter(c => c.status === 'open').length;
            totalCompleted += comms.filter(c => c.status === 'completed').length;
            totalAll += comms.length;
        }

        // Autoresearch insights — what's active, testing, and their impact
        const promptInsights = await prisma.promptInsight.findMany({
            where: { status: { in: ['proposed', 'active', 'validated', 'retired'] } },
            orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            take: 20,
            select: {
                id: true,
                pattern: true,
                recommendation: true,
                category: true,
                scope: true,
                userId: true,
                status: true,
                confidence: true,
                activatedAt: true,
                preActivateAvgScore: true,
                postActivateAvgScore: true,
                callsSinceActivation: true,
                impactDelta: true,
                updatedAt: true,
            },
        }).catch(() => []);

        const insightCards = promptInsights.map(i => ({
            id: i.id,
            pattern: i.pattern,
            recommendation: i.recommendation,
            category: i.category,
            scope: i.scope,
            status: i.status,
            confidence: i.confidence,
            impactDelta: i.impactDelta,
            preScore: i.preActivateAvgScore,
            postScore: i.postActivateAvgScore,
            callsSinceActivation: i.callsSinceActivation,
            activatedAt: i.activatedAt?.toISOString() || null,
            updatedAt: i.updatedAt.toISOString(),
        }));

        // Posture distribution (last 7 days)
        const last7Scheduled = scheduledCalls.filter(s => s.scheduledFor >= sevenDaysAgo);
        const postureDistribution: Record<string, number> = {};
        let signalDrivenCount = 0;
        for (const sc of last7Scheduled) {
            if (sc.primaryPosture) {
                postureDistribution[sc.primaryPosture] = (postureDistribution[sc.primaryPosture] || 0) + 1;
            }
            if (sc.callWorthiness != null) signalDrivenCount++;
        }

        // Average posture match (today)
        const todayPostureEvals = todayEvals.filter(e => e.postureMatch != null);
        const avgPostureMatchToday = todayPostureEvals.length > 0
            ? todayPostureEvals.reduce((s, e) => s + (e.postureMatch ?? 0), 0) / todayPostureEvals.length
            : null;

        return NextResponse.json({
            headline: {
                callsToday: todayCalls.length,
                callsScheduledToday: todayScheduled.length,
                avgQualityToday,
                qualityTrend7d,
                avgDepthToday,
                openCommitments: totalOpen,
                completedCommitments: totalCompleted,
                totalCommitments: totalAll,
                totalUsers: users.length,
                avgPostureMatchToday,
                postureDistribution,
                signalDrivenCalls7d: signalDrivenCount,
            },
            users: userCards,
            alerts,
            insights: insightCards,
        });
    } catch (error) {
        console.error('[Admin PMF Overview]', error);
        return NextResponse.json({ error: 'Failed to load PMF overview' }, { status: 500 });
    }
}
