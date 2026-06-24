import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';

// GET /api/admin/calls — Voice call observation: list calls with full context
export async function GET(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const callType = searchParams.get('callType');
    const templateName = searchParams.get('templateName');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = { status: 'ended' };
    if (userId) where.userId = userId;
    if (callType) where.callType = callType;
    if (templateName) where.promptTemplateName = templateName;

    const [calls, total] = await Promise.all([
        prisma.voiceCall.findMany({
            where,
            include: {
                user: { select: { name: true, email: true, jobTitle: true } },
                meeting: { select: { title: true, startTime: true } },
                evaluation: {
                    select: {
                        overallScore: true,
                        postureMatch: true,
                        timingMatch: true,
                        selectedPosture: true,
                    },
                },
            },
            orderBy: { startedAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.voiceCall.count({ where }),
    ]);

    // Enrich calls with ScheduledCall posture data
    const callIds = calls.map(c => c.id);
    const scheduledCalls = callIds.length > 0 ? await prisma.scheduledCall.findMany({
        where: { voiceCallId: { in: callIds } },
        select: {
            voiceCallId: true,
            primaryPosture: true,
            secondaryPosture: true,
            triggerSignals: true,
            callWorthiness: true,
            fatigueThreshold: true,
        },
    }) : [];

    const scheduledCallMap = new Map(scheduledCalls.map(sc => [sc.voiceCallId, sc]));
    const enrichedCalls = calls.map(c => ({
        ...c,
        scheduling: scheduledCallMap.get(c.id) || null,
    }));

    // Compute aggregate metrics
    const postureMatchScores = calls
        .map(c => c.evaluation?.postureMatch)
        .filter((s): s is number => s != null);

    const postureCounts: Record<string, number> = {};
    for (const sc of scheduledCalls) {
        if (sc.primaryPosture) {
            postureCounts[sc.primaryPosture] = (postureCounts[sc.primaryPosture] || 0) + 1;
        }
    }

    const metrics = {
        totalCalls: total,
        avgDuration: calls.length > 0
            ? Math.round(calls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / calls.length)
            : 0,
        withObservation: calls.filter(c => c.assembledPrompt).length,
        bySource: {
            database: calls.filter(c => c.promptTemplateName && c.promptTemplateVersion && c.promptTemplateVersion > 0).length,
            hardcoded: calls.filter(c => !c.promptTemplateName || c.promptTemplateVersion === 0).length,
        },
        // Posture intelligence
        avgPostureMatch: postureMatchScores.length > 0
            ? Math.round(postureMatchScores.reduce((s, v) => s + v, 0) / postureMatchScores.length * 10) / 10
            : null,
        postureDistribution: postureCounts,
        signalDrivenCalls: scheduledCalls.filter(sc => sc.callWorthiness != null).length,
    };

    return NextResponse.json({ calls: enrichedCalls, total, metrics });
}

/**
 * POST /api/admin/calls — Trigger a call for a specific user
 * Body: { userId: string, callType?: string }
 * callType: 'onboarding' | 'daily_checkin' | 'morning_brief' | 'general' (default: auto-detect)
 */
export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { userId, callType } = body;

    if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, phoneNumber: true },
    });

    if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!targetUser.phoneNumber) {
        return NextResponse.json({ error: 'User has no phone number' }, { status: 400 });
    }

    // Auto-detect call type if not specified
    let resolvedCallType = callType || 'general';
    if (resolvedCallType === 'general' || resolvedCallType === 'auto') {
        const onboarding = await prisma.onboardingProgress.findUnique({ where: { userId } }).catch(() => null);
        resolvedCallType = (!onboarding || !onboarding.onboardingComplete) ? 'onboarding' : 'daily_checkin';
    }

    // Queue the call via pg-boss
    try {
        const payload = JSON.stringify({ userId, trigger: resolvedCallType === 'morning_brief' ? 'MORNING_BRIEF' : undefined });

        if (resolvedCallType === 'morning_brief') {
            // Morning brief goes through proactive-agent
            await prisma.$queryRaw`
                INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
                VALUES ('proactive-agent', ${payload}::jsonb, 'created', 2, 0, 30, 300, now(), now() + interval '1 day')
            `;
        } else {
            // Voice calls go through execute-scheduled-calls after creating a ScheduledCall
            await prisma.scheduledCall.create({
                data: {
                    userId,
                    scheduledFor: new Date(),
                    callType: resolvedCallType,
                    status: 'pending',
                    agenda: { callType: resolvedCallType },
                },
            });
        }

        return NextResponse.json({
            success: true,
            userId,
            userName: targetUser.name,
            callType: resolvedCallType,
            message: `Call queued for ${targetUser.name || userId}. Worker will pick it up within 5 minutes.`,
        });
    } catch (error: any) {
        console.error('[Admin Calls] Error triggering call:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
