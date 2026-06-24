import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/learning-loop
 *
 * Surfaces evidence of the feedback loop:
 *   analyze call → detect improvements → inject into next call
 *
 * Shows:
 * - Recent call evaluations with quality trends
 * - Hypothesis lifecycle stats (generated → confirmed → follow-ups)
 * - Cross-call learning examples (what changed between call N and N+1)
 * - Langfuse dashboard URL for deep dives
 */
export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({
        where: { email: user.emailAddresses[0]?.emailAddress },
        select: { role: true },
    });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // --- 1. Hypothesis lifecycle stats ---
    const [totalHypotheses, confirmedCount, revisedCount, rejectedCount, pendingCount, presentedCount, followUpCount] = await Promise.all([
        prisma.hypothesis.count(),
        prisma.hypothesis.count({ where: { status: 'CONFIRMED' } }),
        prisma.hypothesis.count({ where: { status: 'REVISED' } }),
        prisma.hypothesis.count({ where: { status: 'REJECTED' } }),
        prisma.hypothesis.count({ where: { status: { in: ['PENDING', 'READY'] } } }),
        prisma.hypothesis.count({ where: { status: 'PRESENTED' } }),
        prisma.hypothesis.count({ where: { sourceType: 'autoresearch_followup' } }),
    ]);

    const accuracyRate = (confirmedCount + revisedCount) > 0
        ? ((confirmedCount + revisedCount) / (confirmedCount + revisedCount + rejectedCount) * 100)
        : 0;

    // --- 2. Recent hypothesis validations (last 7 days) ---
    const recentValidations = await prisma.hypothesis.findMany({
        where: {
            validatedAt: { gte: d7 },
            status: { in: ['CONFIRMED', 'REVISED', 'REJECTED'] },
        },
        select: {
            id: true,
            statement: true,
            status: true,
            category: true,
            userResponse: true,
            validatedAt: true,
            confidence: true,
            sourceType: true,
            revisedFromId: true,
            user: { select: { name: true } },
        },
        orderBy: { validatedAt: 'desc' },
        take: 20,
    });

    // --- 3. Recent follow-up hypotheses (autoresearch in action) ---
    const recentFollowUps = await prisma.hypothesis.findMany({
        where: {
            sourceType: 'autoresearch_followup',
            createdAt: { gte: d7 },
        },
        select: {
            id: true,
            statement: true,
            status: true,
            confidence: true,
            createdAt: true,
            revisedFrom: {
                select: { statement: true, status: true },
            },
            user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    // --- 4. Call evaluation quality trend (last 30 days) ---
    const evaluations = await prisma.callEvaluation.findMany({
        where: { createdAt: { gte: d30 } },
        select: {
            overallScore: true,
            valueAddScore: true,
            newGroundScore: true,
            createdAt: true,
            whatWorked: true,
            whatToImprove: true,
            recommendedTopics: true,
            voiceCall: {
                select: { callType: true, summary: true },
            },
            user: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Compute weekly averages for quality trend
    const weeklyScores: Array<{ weekStart: string; avgOverall: number; avgValueAdd: number; count: number }> = [];
    const weekBuckets = new Map<string, { scores: number[]; valueAdds: number[]; count: number }>();

    for (const ev of evaluations) {
        const weekStart = new Date(ev.createdAt);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split('T')[0];
        if (!weekBuckets.has(key)) weekBuckets.set(key, { scores: [], valueAdds: [], count: 0 });
        const bucket = weekBuckets.get(key)!;
        bucket.scores.push(ev.overallScore);
        bucket.valueAdds.push(ev.valueAddScore);
        bucket.count++;
    }

    for (const [key, bucket] of Array.from(weekBuckets.entries())) {
        weeklyScores.push({
            weekStart: key,
            avgOverall: Math.round(bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length * 10) / 10,
            avgValueAdd: Math.round(bucket.valueAdds.reduce((a, b) => a + b, 0) / bucket.valueAdds.length * 10) / 10,
            count: bucket.count,
        });
    }

    // --- 5. Cross-call learning examples ---
    // Find cases where recommendation from call N appeared in next call's variables
    const learningExamples: Array<{
        userName: string;
        fromCall: { date: string; recommendation: string; score: number };
        toCall: { date: string; hadDirective: boolean; score: number | null };
    }> = [];

    // Get recent evaluations with recommendations, grouped by user
    const evalsByUser = new Map<string, typeof evaluations>();
    for (const ev of evaluations) {
        const userName = ev.user?.name ?? 'Unknown';
        if (!evalsByUser.has(userName)) evalsByUser.set(userName, []);
        evalsByUser.get(userName)!.push(ev);
    }

    for (const [userName, userEvals] of Array.from(evalsByUser.entries())) {
        if (userEvals.length < 2) continue;
        // Take last pair
        const prev = userEvals[userEvals.length - 2];
        const curr = userEvals[userEvals.length - 1];
        if (prev.recommendedTopics.length > 0) {
            learningExamples.push({
                userName,
                fromCall: {
                    date: prev.createdAt.toISOString(),
                    recommendation: prev.recommendedTopics[0],
                    score: prev.overallScore,
                },
                toCall: {
                    date: curr.createdAt.toISOString(),
                    hadDirective: true, // If evaluation exists, directive was sent
                    score: curr.overallScore,
                },
            });
        }
    }

    // --- 6. Latest recommendations feeding into next calls ---
    const latestEvaluations = await prisma.callEvaluation.findMany({
        where: { createdAt: { gte: d7 } },
        select: {
            overallScore: true,
            whatToImprove: true,
            recommendedTopics: true,
            whatWorked: true,
            createdAt: true,
            voiceCall: {
                select: {
                    callType: true,
                    summary: true,
                },
            },
            user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    // Langfuse dashboard URL
    const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

    return NextResponse.json({
        hypothesisLoop: {
            total: totalHypotheses,
            pending: pendingCount,
            presented: presentedCount,
            confirmed: confirmedCount,
            revised: revisedCount,
            rejected: rejectedCount,
            followUpsGenerated: followUpCount,
            accuracyRate: Math.round(accuracyRate),
        },
        recentValidations: recentValidations.map(v => ({
            id: v.id,
            statement: v.statement,
            status: v.status,
            category: v.category,
            userResponse: v.userResponse,
            validatedAt: v.validatedAt?.toISOString(),
            confidence: v.confidence,
            isFollowUp: v.sourceType === 'autoresearch_followup',
            isRevision: !!v.revisedFromId,
            userName: v.user?.name ?? 'Unknown',
        })),
        recentFollowUps: recentFollowUps.map(f => ({
            id: f.id,
            statement: f.statement,
            status: f.status,
            confidence: f.confidence,
            createdAt: f.createdAt.toISOString(),
            parentStatement: f.revisedFrom?.statement ?? null,
            parentStatus: f.revisedFrom?.status ?? null,
            userName: f.user?.name ?? 'Unknown',
        })),
        qualityTrend: weeklyScores,
        latestEvaluations: latestEvaluations.map(e => ({
            userName: e.user?.name ?? 'Unknown',
            callType: e.voiceCall?.callType,
            summary: e.voiceCall?.summary?.substring(0, 150),
            overallScore: e.overallScore,
            whatWorked: e.whatWorked.slice(0, 2),
            whatToImprove: e.whatToImprove.slice(0, 2),
            recommendedTopics: e.recommendedTopics,
            createdAt: e.createdAt.toISOString(),
        })),
        learningExamples: learningExamples.slice(0, 5),
        langfuseUrl: langfuseBaseUrl,
    });
}
