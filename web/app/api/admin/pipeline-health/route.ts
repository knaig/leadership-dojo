import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pipeline-health
 *
 * Full pipeline monitoring — detects silent failures, broken connections,
 * and stale data across the entire Mira system. Think of it as a health
 * check that traces data flow end-to-end:
 *
 * INGEST (sync) → EXTRACT (knowledge) → SYNTHESIZE (intelligence) →
 * PLAN (call planning) → DELIVER (calls) → EVALUATE (KPIs) → LEARN (experiments)
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Per-user pipeline health ──
    const users = await prisma.user.findMany({
        where: { voiceCalls: { some: {} } },
        select: {
            id: true,
            name: true,
            email: true,
        },
    });

    const userHealthPromises = users.map(async (user) => {
        const [
            syncStatus,
            knowledgeEntities,
            knowledgeFacts,
            stakeholderProfiles,
            stakeholderIntel,
            personalContext,
            relationshipPlan,
            recentCalls,
            recentEvals,
            experiments,
            agentRuns,
        ] = await Promise.all([
            prisma.syncStatus.findMany({
                where: { userId: user.id },
                select: { connector: true, status: true, lastSyncAt: true, lastError: true },
            }),
            prisma.knowledgeEntity.count({ where: { userId: user.id } }),
            prisma.knowledgeFact.count({ where: { userId: user.id } }),
            prisma.stakeholderProfile.count({ where: { userId: user.id } }),
            prisma.stakeholderIntelligence.count({ where: { userId: user.id } }),
            prisma.personalContext.findUnique({
                where: { userId: user.id },
                select: { callCount: true, knownTopics: true, gapTopics: true, updatedAt: true },
            }),
            prisma.coachingRelationshipPlan.findUnique({
                where: { userId: user.id },
                select: { phase: true, updatedAt: true },
            }),
            prisma.voiceCall.findMany({
                where: { userId: user.id, endedAt: { gte: d7 } },
                select: { id: true, status: true, durationSeconds: true, transcript: true, endedAt: true, sentVariables: true },
                orderBy: { endedAt: 'desc' },
                take: 20,
            }),
            prisma.callEvaluation.findMany({
                where: { userId: user.id, createdAt: { gte: d7 } },
                select: { id: true, overallScore: true, voiceCallId: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.coachingExperiment.findMany({
                where: { userId: user.id },
                select: { id: true, dimension: true, status: true, variantACallCount: true, variantBCallCount: true, winner: true },
            }),
            prisma.agentRun.findMany({
                where: { userId: user.id, startedAt: { gte: h48 } },
                select: { agentName: true, status: true, startedAt: true, durationMs: true, errorMessage: true, itemsProcessed: true },
                orderBy: { startedAt: 'desc' },
            }),
        ]);

        // ── Compute pipeline stage health ──
        const alerts: Array<{ stage: string; severity: 'error' | 'warning' | 'info'; message: string }> = [];

        // INGEST: Check sync freshness
        const calSync = syncStatus.find(s => s.connector === 'calendar');
        const emailSync = syncStatus.find(s => s.connector === 'email');
        if (calSync?.lastSyncAt && calSync.lastSyncAt < h24) {
            alerts.push({ stage: 'ingest', severity: 'warning', message: `Calendar not synced in ${Math.round((now.getTime() - calSync.lastSyncAt.getTime()) / 3600000)}h` });
        }
        if (emailSync?.lastSyncAt && emailSync.lastSyncAt < h24) {
            alerts.push({ stage: 'ingest', severity: 'warning', message: `Email not synced in ${Math.round((now.getTime() - emailSync.lastSyncAt.getTime()) / 3600000)}h` });
        }
        if (calSync?.lastError) {
            alerts.push({ stage: 'ingest', severity: 'error', message: `Calendar sync error: ${calSync.lastError.substring(0, 100)}` });
        }
        if (emailSync?.lastError) {
            alerts.push({ stage: 'ingest', severity: 'error', message: `Email sync error: ${emailSync.lastError.substring(0, 100)}` });
        }

        // EXTRACT: Knowledge graph population
        if (knowledgeEntities === 0 && (personalContext?.callCount ?? 0) > 2) {
            alerts.push({ stage: 'extract', severity: 'error', message: 'No knowledge entities despite 2+ calls — extraction may be broken' });
        }
        if (knowledgeFacts === 0 && knowledgeEntities > 0) {
            alerts.push({ stage: 'extract', severity: 'warning', message: 'Entities exist but no facts — fact extraction may be stuck' });
        }

        // SYNTHESIZE: Stakeholder intelligence
        if (stakeholderProfiles > 5 && stakeholderIntel === 0) {
            alerts.push({ stage: 'synthesize', severity: 'error', message: `${stakeholderProfiles} stakeholder profiles but 0 intelligence records — synthesis silent failure` });
        }
        const intelRatio = stakeholderProfiles > 0 ? stakeholderIntel / stakeholderProfiles : 0;
        if (stakeholderProfiles > 10 && intelRatio < 0.1) {
            alerts.push({ stage: 'synthesize', severity: 'warning', message: `Only ${(intelRatio * 100).toFixed(0)}% stakeholders have intelligence (${stakeholderIntel}/${stakeholderProfiles})` });
        }

        // PLAN: Relationship plan exists?
        if (!relationshipPlan && (personalContext?.callCount ?? 0) > 3) {
            alerts.push({ stage: 'plan', severity: 'warning', message: 'No CoachingRelationshipPlan despite 3+ calls' });
        }

        // DELIVER: Calls happening?
        const endedCalls = recentCalls.filter(c => c.status === 'ended');
        const callsLast24h = endedCalls.filter(c => c.endedAt && c.endedAt >= h24);
        if (callsLast24h.length === 0 && endedCalls.length > 0) {
            const lastCall = endedCalls[0];
            const hoursSince = lastCall.endedAt ? Math.round((now.getTime() - lastCall.endedAt.getTime()) / 3600000) : null;
            if (hoursSince && hoursSince > 48) {
                alerts.push({ stage: 'deliver', severity: 'warning', message: `No calls in ${hoursSince}h` });
            }
        }

        // DELIVER: Calls with context?
        const callsWithoutDirective = endedCalls.filter(c => {
            const vars = c.sentVariables as Record<string, unknown> | null;
            return !vars?.callDirective;
        });
        if (callsWithoutDirective.length > 0 && endedCalls.length > 3) {
            const pct = Math.round(callsWithoutDirective.length / endedCalls.length * 100);
            if (pct > 50) {
                alerts.push({ stage: 'deliver', severity: 'warning', message: `${pct}% of recent calls had no callDirective — planning may be broken` });
            }
        }

        // EVALUATE: Calls being evaluated?
        const unevaluated = endedCalls.filter(c =>
            c.transcript && (c.durationSeconds ?? 0) > 30 &&
            !recentEvals.some(e => e.voiceCallId === c.id)
        );
        if (unevaluated.length > 3) {
            alerts.push({ stage: 'evaluate', severity: 'error', message: `${unevaluated.length} calls unevaluated — evaluation pipeline may be stuck` });
        }

        // LEARN: Experiments running?
        const activeExperiments = experiments.filter(e => e.status === 'active');
        const concludedWithWinner = experiments.filter(e => e.winner === 'A' || e.winner === 'B');

        // AGENT RUNS: Check for failures
        const failedRuns = agentRuns.filter(r => r.status === 'failed');
        const zeroOutputRuns = agentRuns.filter(r => r.status === 'completed' && r.itemsProcessed === 0);
        if (failedRuns.length > 3) {
            const agents = [...new Set(failedRuns.map(r => r.agentName))];
            alerts.push({ stage: 'agents', severity: 'error', message: `${failedRuns.length} agent failures in 48h: ${agents.join(', ')}` });
        }
        if (zeroOutputRuns.length > 5) {
            alerts.push({ stage: 'agents', severity: 'warning', message: `${zeroOutputRuns.length} agent runs produced 0 items in 48h` });
        }

        // Compute overall health
        const errorCount = alerts.filter(a => a.severity === 'error').length;
        const warningCount = alerts.filter(a => a.severity === 'warning').length;
        let overallHealth: 'healthy' | 'degraded' | 'failing' = 'healthy';
        if (errorCount > 0) overallHealth = 'failing';
        else if (warningCount > 2) overallHealth = 'degraded';

        return {
            userId: user.id,
            userName: user.name || user.email,
            overallHealth,
            alerts,
            pipeline: {
                ingest: {
                    calendar: calSync ? { lastSync: calSync.lastSyncAt?.toISOString(), status: calSync.status, error: calSync.lastError } : null,
                    email: emailSync ? { lastSync: emailSync.lastSyncAt?.toISOString(), status: emailSync.status, error: emailSync.lastError } : null,
                },
                extract: {
                    entities: knowledgeEntities,
                    facts: knowledgeFacts,
                },
                synthesize: {
                    stakeholderProfiles,
                    stakeholderIntelligence: stakeholderIntel,
                    coveragePercent: stakeholderProfiles > 0 ? Math.round(stakeholderIntel / stakeholderProfiles * 100) : 0,
                },
                plan: {
                    phase: relationshipPlan?.phase || null,
                    planUpdated: relationshipPlan?.updatedAt?.toISOString() || null,
                    callCount: personalContext?.callCount ?? 0,
                    knownTopics: (personalContext?.knownTopics as string[])?.length ?? 0,
                    gapTopics: (personalContext?.gapTopics as string[])?.length ?? 0,
                },
                deliver: {
                    callsLast7d: endedCalls.length,
                    callsLast24h: callsLast24h.length,
                    avgDuration: endedCalls.length > 0 ? Math.round(endedCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / endedCalls.length) : 0,
                    withDirective: endedCalls.length - callsWithoutDirective.length,
                    withoutDirective: callsWithoutDirective.length,
                },
                evaluate: {
                    evaluationsLast7d: recentEvals.length,
                    avgScore: recentEvals.length > 0 ? Math.round(recentEvals.reduce((s, e) => s + e.overallScore, 0) / recentEvals.length * 10) / 10 : null,
                    unevaluated: unevaluated.length,
                },
                learn: {
                    activeExperiments: activeExperiments.length,
                    concludedWithWinner: concludedWithWinner.length,
                    totalExperiments: experiments.length,
                },
            },
            agentRuns: {
                total48h: agentRuns.length,
                failed: failedRuns.length,
                zeroOutput: zeroOutputRuns.length,
                recentFailures: failedRuns.slice(0, 5).map(r => ({
                    agent: r.agentName,
                    error: r.errorMessage?.substring(0, 150),
                    at: r.startedAt.toISOString(),
                })),
            },
        };
    });

    const userHealth = await Promise.all(userHealthPromises);

    // ── System-wide agent health ──
    const systemAgentRuns = await prisma.agentRun.findMany({
        where: { startedAt: { gte: h48 } },
        select: { agentName: true, status: true, durationMs: true, itemsProcessed: true, errorMessage: true, startedAt: true },
        orderBy: { startedAt: 'desc' },
    });

    const agentMap = new Map<string, typeof systemAgentRuns>();
    for (const run of systemAgentRuns) {
        if (!agentMap.has(run.agentName)) agentMap.set(run.agentName, []);
        agentMap.get(run.agentName)!.push(run);
    }

    const systemAgents = Array.from(agentMap.entries()).map(([name, runs]) => {
        const completed = runs.filter(r => r.status === 'completed');
        const failed = runs.filter(r => r.status === 'failed');
        const zeroOutput = completed.filter(r => r.itemsProcessed === 0);

        let health: 'healthy' | 'warning' | 'critical' | 'stale' = 'healthy';
        if (failed.length > completed.length) health = 'critical';
        else if (zeroOutput.length >= 3) health = 'warning';
        else if (failed.length > 0) health = 'warning';

        return {
            name,
            health,
            runs48h: runs.length,
            completed: completed.length,
            failed: failed.length,
            zeroOutput: zeroOutput.length,
            avgDurationMs: completed.length > 0
                ? Math.round(completed.reduce((s, r) => s + (r.durationMs || 0), 0) / completed.length)
                : null,
            lastRun: runs[0] ? {
                status: runs[0].status,
                at: runs[0].startedAt.toISOString(),
                error: runs[0].errorMessage?.substring(0, 150),
            } : null,
        };
    });

    // Sort: critical first
    const healthOrder: Record<string, number> = { critical: 0, warning: 1, stale: 2, healthy: 3 };
    systemAgents.sort((a, b) => (healthOrder[a.health] ?? 3) - (healthOrder[b.health] ?? 3));

    // ── System-wide alerts ──
    const systemAlerts: Array<{ severity: 'error' | 'warning'; message: string }> = [];
    const failingUsers = userHealth.filter(u => u.overallHealth === 'failing');
    if (failingUsers.length > 0) {
        systemAlerts.push({
            severity: 'error',
            message: `${failingUsers.length} user(s) in failing state: ${failingUsers.map(u => u.userName).join(', ')}`,
        });
    }
    const criticalAgents = systemAgents.filter(a => a.health === 'critical');
    if (criticalAgents.length > 0) {
        systemAlerts.push({
            severity: 'error',
            message: `${criticalAgents.length} agent(s) critical: ${criticalAgents.map(a => a.name).join(', ')}`,
        });
    }

    return NextResponse.json({
        systemHealth: failingUsers.length > 0 ? 'failing' : criticalAgents.length > 0 ? 'degraded' : 'healthy',
        systemAlerts,
        users: userHealth,
        agents: systemAgents,
    });
    } catch (error) {
        console.error('[pipeline-health] Error:', error);
        return NextResponse.json({ error: 'Internal error', detail: String(error) }, { status: 500 });
    }
}
