import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/coaching-intelligence/daily-brief
 * Today's coaching intelligence brief for admin.
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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Today's calls with evaluations
        const todayCalls = await prisma.voiceCall.findMany({
            where: {
                status: 'ended',
                endedAt: { gte: todayStart },
            },
            orderBy: { endedAt: 'desc' },
            select: {
                id: true,
                userId: true,
                callType: true,
                durationSeconds: true,
                summary: true,
                endedAt: true,
                user: { select: { name: true, email: true } },
                evaluation: {
                    select: {
                        overallScore: true,
                        whatWorked: true,
                        whatToImprove: true,
                        commitmentsExtracted: true,
                        newInfoLearned: true,
                    },
                },
            },
        });

        // Notable moments — calls with very high or very low scores
        const notableCalls = todayCalls.filter(c => {
            const score = c.evaluation?.overallScore;
            return score !== undefined && score !== null && (score >= 8 || score <= 4);
        });

        // Commitment tracking summary
        const plans = await prisma.coachingRelationshipPlan.findMany({
            select: { userId: true, commitments: true },
        });

        let totalOpen = 0;
        let totalOverdue = 0;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const plan of plans) {
            const comms = plan.commitments as { status: string; madeAt: string }[] || [];
            for (const c of comms) {
                if (c.status === 'open') {
                    totalOpen++;
                    if (new Date(c.madeAt) < sevenDaysAgo) {
                        totalOverdue++;
                    }
                }
            }
        }

        // Calls scheduled but not completed today
        const scheduledToday = await prisma.scheduledCall.count({
            where: {
                scheduledFor: { gte: todayStart },
                status: { in: ['pending', 'completed', 'no_answer'] },
            },
        });

        const completedToday = todayCalls.length;

        // Quality scores today
        const todayEvals = todayCalls
            .map(c => c.evaluation?.overallScore)
            .filter((s): s is number => s !== undefined && s !== null);

        const avgQuality = todayEvals.length > 0
            ? todayEvals.reduce((s, e) => s + e, 0) / todayEvals.length
            : null;

        // Alerts
        const alerts: string[] = [];
        if (todayEvals.some(s => s <= 3)) {
            alerts.push('Low quality call detected — review recommended');
        }
        if (totalOverdue > 0) {
            alerts.push(`${totalOverdue} overdue commitments across users`);
        }
        if (scheduledToday > 0 && completedToday / scheduledToday < 0.5) {
            alerts.push('Low call completion rate today');
        }

        return NextResponse.json({
            date: todayStart.toISOString(),
            calls: todayCalls.map(c => ({
                userId: c.userId,
                userName: c.user.name,
                callType: c.callType,
                durationSeconds: c.durationSeconds,
                summary: c.summary?.substring(0, 200),
                endedAt: c.endedAt,
                qualityScore: c.evaluation?.overallScore || null,
                whatWorked: c.evaluation?.whatWorked || [],
                newInfoLearned: c.evaluation?.newInfoLearned || [],
                commitmentsExtracted: c.evaluation?.commitmentsExtracted || [],
            })),
            notableMoments: notableCalls.map(c => ({
                userId: c.userId,
                userName: c.user.name,
                score: c.evaluation?.overallScore,
                type: (c.evaluation?.overallScore || 0) >= 8 ? 'highlight' : 'concern',
                summary: c.summary?.substring(0, 200),
            })),
            metrics: {
                totalCallsToday: completedToday,
                scheduledToday,
                avgQuality,
                commitments: { open: totalOpen, overdue: totalOverdue },
            },
            alerts,
        });
    } catch (error) {
        console.error('[Admin Daily Brief]', error);
        return NextResponse.json({ error: 'Failed to generate daily brief' }, { status: 500 });
    }
}
