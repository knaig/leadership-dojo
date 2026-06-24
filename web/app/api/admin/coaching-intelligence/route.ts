import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/coaching-intelligence
 * System-wide coaching intelligence dashboard for admin.
 * Per-user summary + system metrics.
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
        // Get all users with voice calls
        const users = await prisma.user.findMany({
            where: { voiceCalls: { some: { status: 'ended' } } },
            select: {
                id: true,
                name: true,
                email: true,
                personalContext: {
                    select: { callCount: true, lastCallDate: true, totalCallMinutes: true },
                },
                coachingRelationshipPlan: {
                    select: {
                        phase: true,
                        coachingThemes: true,
                        commitments: true,
                        personalityProfile: true,
                    },
                },
            },
        });

        // Get recent evaluations per user
        const recentEvals = await prisma.callEvaluation.findMany({
            where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            orderBy: { createdAt: 'desc' },
            select: {
                userId: true,
                overallScore: true,
                createdAt: true,
            },
        });

        // Group evaluations by user
        const evalsByUser = new Map<string, typeof recentEvals>();
        for (const ev of recentEvals) {
            const arr = evalsByUser.get(ev.userId) || [];
            arr.push(ev);
            evalsByUser.set(ev.userId, arr);
        }

        // Today's calls
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayCalls = await prisma.voiceCall.count({
            where: { status: 'ended', endedAt: { gte: todayStart } },
        });

        const todayEvals = await prisma.callEvaluation.findMany({
            where: { createdAt: { gte: todayStart } },
            select: { overallScore: true },
        });

        const avgQualityToday = todayEvals.length > 0
            ? todayEvals.reduce((s, e) => s + e.overallScore, 0) / todayEvals.length
            : null;

        // Build per-user summaries
        const userSummaries = users.map(u => {
            const userEvals = evalsByUser.get(u.id) || [];
            const avgQuality = userEvals.length > 0
                ? userEvals.reduce((s, e) => s + e.overallScore, 0) / userEvals.length
                : null;

            // Quality trend: compare last 5 to previous 5
            const last5 = userEvals.slice(0, 5);
            const prev5 = userEvals.slice(5, 10);
            let qualityTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
            if (last5.length >= 3 && prev5.length >= 3) {
                const recentAvg = last5.reduce((s, e) => s + e.overallScore, 0) / last5.length;
                const prevAvg = prev5.reduce((s, e) => s + e.overallScore, 0) / prev5.length;
                qualityTrend = recentAvg - prevAvg > 0.5 ? 'improving'
                    : recentAvg - prevAvg < -0.5 ? 'declining'
                    : 'stable';
            }

            const plan = u.coachingRelationshipPlan;
            const themes = plan?.coachingThemes as { theme: string; status: string }[] || [];
            const commitments = plan?.commitments as { status: string }[] || [];
            const personality = plan?.personalityProfile as Record<string, unknown> || {};

            return {
                userId: u.id,
                name: u.name,
                email: u.email,
                callCount: u.personalContext?.callCount || 0,
                lastCallDate: u.personalContext?.lastCallDate,
                totalMinutes: u.personalContext?.totalCallMinutes || 0,
                phase: plan?.phase || 'unknown',
                avgQuality,
                qualityTrend,
                activeThemes: themes.filter(t => t.status === 'active').map(t => t.theme),
                openCommitments: commitments.filter(c => c.status === 'open').length,
                archetype: (personality as Record<string, Record<string, string>>)?.archetype?.primary || null,
                confidenceLevel: (personality as Record<string, string>)?.confidenceLevel || null,
            };
        });

        // System metrics
        const totalCommitments = await prisma.coachingRelationshipPlan.findMany({
            select: { commitments: true },
        });
        let totalOpen = 0;
        let totalCompleted = 0;
        for (const plan of totalCommitments) {
            const comms = plan.commitments as { status: string }[] || [];
            totalOpen += comms.filter(c => c.status === 'open').length;
            totalCompleted += comms.filter(c => c.status === 'completed').length;
        }

        return NextResponse.json({
            users: userSummaries,
            systemMetrics: {
                totalCallsToday: todayCalls,
                avgQualityToday,
                commitmentCompletionRate: totalOpen + totalCompleted > 0
                    ? totalCompleted / (totalOpen + totalCompleted)
                    : null,
                totalUsers: users.length,
            },
        });
    } catch (error) {
        console.error('[Admin Coaching Intelligence]', error);
        return NextResponse.json({ error: 'Failed to load coaching intelligence' }, { status: 500 });
    }
}
