import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/agent-health
 *
 * Returns health status for all agents based on AgentRun records,
 * plus call scheduling status for all users.
 */
export async function GET() {
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

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Agent Run Stats ──

    const recentRuns = await prisma.agentRun.findMany({
        where: { startedAt: { gte: sevenDaysAgo } },
        select: {
            agentName: true,
            status: true,
            startedAt: true,
            durationMs: true,
            itemsProcessed: true,
            itemsSkipped: true,
            errorMessage: true,
            outputSummary: true,
        },
        orderBy: { startedAt: 'desc' },
    });

    // Group by agent
    const agentMap = new Map<string, typeof recentRuns>();
    for (const run of recentRuns) {
        if (!agentMap.has(run.agentName)) agentMap.set(run.agentName, []);
        agentMap.get(run.agentName)!.push(run);
    }

    const agents = Array.from(agentMap.entries()).map(([name, runs]) => {
        const last24h = runs.filter(r => r.startedAt >= twentyFourHoursAgo);
        const last7d = runs;

        const failures24h = last24h.filter(r => r.status === 'failed');
        const completed24h = last24h.filter(r => r.status === 'completed');
        const avgDuration24h = completed24h.length > 0
            ? Math.round(completed24h.reduce((s, r) => s + (r.durationMs || 0), 0) / completed24h.length)
            : null;

        const failures7d = last7d.filter(r => r.status === 'failed');
        const completed7d = last7d.filter(r => r.status === 'completed');
        const avgDuration7d = completed7d.length > 0
            ? Math.round(completed7d.reduce((s, r) => s + (r.durationMs || 0), 0) / completed7d.length)
            : null;

        // Zero-output detection: completed runs that processed 0 items
        const zeroOutputRuns = completed24h.filter(r => r.itemsProcessed === 0);

        const lastRun = runs[0]; // Most recent
        let health: 'healthy' | 'warning' | 'critical' | 'stale' = 'healthy';
        if (last24h.length === 0) health = 'stale';
        else if (failures24h.length > completed24h.length) health = 'critical';
        else if (zeroOutputRuns.length >= 3) health = 'warning';
        else if (failures24h.length > 0) health = 'warning';

        return {
            name,
            last24h: {
                runs: last24h.length,
                completed: completed24h.length,
                failures: failures24h.length,
                skipped: last24h.filter(r => r.status === 'skipped').length,
                zeroOutput: zeroOutputRuns.length,
                avgDurationMs: avgDuration24h,
                totalItemsProcessed: completed24h.reduce((s, r) => s + r.itemsProcessed, 0),
            },
            last7d: {
                runs: last7d.length,
                failures: failures7d.length,
                avgDurationMs: avgDuration7d,
            },
            lastRun: lastRun ? {
                status: lastRun.status,
                startedAt: lastRun.startedAt.toISOString(),
                durationMs: lastRun.durationMs,
                itemsProcessed: lastRun.itemsProcessed,
                outputSummary: lastRun.outputSummary?.substring(0, 200),
                errorMessage: lastRun.errorMessage?.substring(0, 200),
            } : null,
            health,
        };
    });

    // Sort: critical first, then warning, then stale, then healthy
    const healthOrder = { critical: 0, warning: 1, stale: 2, healthy: 3 };
    agents.sort((a, b) => healthOrder[a.health] - healthOrder[b.health]);

    // ── Alerts ──

    const alerts: Array<{ agent: string; issue: string; severity: 'warning' | 'error'; detail: string }> = [];

    for (const agent of agents) {
        if (agent.health === 'critical') {
            alerts.push({
                agent: agent.name,
                issue: 'high_failure_rate',
                severity: 'error',
                detail: `${agent.last24h.failures} failures in last 24h (${agent.last24h.completed} successes)`,
            });
        }
        if (agent.health === 'stale') {
            alerts.push({
                agent: agent.name,
                issue: 'no_runs_24h',
                severity: 'warning',
                detail: `No runs in last 24 hours. Last run: ${agent.lastRun?.startedAt || 'never'}`,
            });
        }
        if (agent.last24h.zeroOutput >= 3) {
            alerts.push({
                agent: agent.name,
                issue: 'zero_output',
                severity: 'warning',
                detail: `${agent.last24h.zeroOutput} runs produced 0 results in last 24h`,
            });
        }
    }

    // ── Call Scheduling Status ──

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const [callPrefs, todayCalls] = await Promise.all([
        prisma.userPreferences.findMany({
            select: {
                userId: true,
                dailyCallEnabled: true,
                dailyCallTime: true,
                preferredChannel: true,
                callFrequencyMinutes: true,
                callWindowStart: true,
                callWindowEnd: true,
                dailyCallMaxRetries: true,
                dailyCallRetryAfterMin: true,
                timezone: true,
                user: { select: { name: true, email: true } },
            },
        }),
        prisma.scheduledCall.findMany({
            where: {
                scheduledFor: { gte: todayStart, lte: todayEnd },
            },
            select: {
                userId: true,
                scheduledFor: true,
                callType: true,
                status: true,
                outcome: true,
                retryOf: true,
                retryCount: true,
                voiceCallId: true,
                completedAt: true,
            },
            orderBy: { scheduledFor: 'desc' },
        }),
    ]);

    // Group today's calls by user
    const callsByUser = new Map<string, typeof todayCalls>();
    for (const call of todayCalls) {
        if (!callsByUser.has(call.userId)) callsByUser.set(call.userId, []);
        callsByUser.get(call.userId)!.push(call);
    }

    const callSchedules = callPrefs.map(pref => {
        const userCalls = callsByUser.get(pref.userId) || [];
        const completed = userCalls.filter(c => c.status === 'completed');
        const noAnswer = userCalls.filter(c => c.status === 'no_answer');
        const pending = userCalls.filter(c => c.status === 'pending');
        const calling = userCalls.filter(c => c.status === 'calling');

        return {
            userId: pref.userId,
            userName: pref.user.name || pref.user.email,
            config: {
                enabled: pref.dailyCallEnabled,
                channel: pref.preferredChannel,
                time: pref.dailyCallTime,
                frequency: pref.callFrequencyMinutes,
                window: pref.callWindowStart && pref.callWindowEnd
                    ? `${pref.callWindowStart}-${pref.callWindowEnd}`
                    : null,
                maxRetries: pref.dailyCallMaxRetries,
                retryAfterMin: pref.dailyCallRetryAfterMin,
                timezone: pref.timezone,
            },
            today: {
                total: userCalls.length,
                completed: completed.length,
                noAnswer: noAnswer.length,
                pending: pending.length,
                calling: calling.length,
                retried: userCalls.filter(c => c.retryOf !== null).length,
                calls: userCalls.map(c => ({
                    scheduledFor: c.scheduledFor.toISOString(),
                    callType: c.callType,
                    status: c.status,
                    outcome: c.outcome,
                    isRetry: c.retryOf !== null,
                    retryCount: c.retryCount,
                    completedAt: c.completedAt?.toISOString() || null,
                })),
            },
        };
    });

    return NextResponse.json({
        agents,
        alerts,
        callSchedules,
        summary: {
            totalAgents: agents.length,
            healthy: agents.filter(a => a.health === 'healthy').length,
            warning: agents.filter(a => a.health === 'warning').length,
            critical: agents.filter(a => a.health === 'critical').length,
            stale: agents.filter(a => a.health === 'stale').length,
            totalAlerts: alerts.length,
            callsToday: todayCalls.length,
            callsCompleted: todayCalls.filter(c => c.status === 'completed').length,
        },
    });
}
