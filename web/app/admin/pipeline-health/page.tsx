'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Activity,
    Database,
    Brain,
    Phone,
    BarChart3,
    Lightbulb,
    ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStage {
    ingest: {
        calendar: { lastSync: string | null; status: string; error: string | null } | null;
        email: { lastSync: string | null; status: string; error: string | null } | null;
    };
    extract: { entities: number; facts: number };
    synthesize: { stakeholderProfiles: number; stakeholderIntelligence: number; coveragePercent: number };
    plan: { phase: string | null; planUpdated: string | null; callCount: number; knownTopics: number; gapTopics: number };
    deliver: { callsLast7d: number; callsLast24h: number; avgDuration: number; withDirective: number; withoutDirective: number };
    evaluate: { evaluationsLast7d: number; avgScore: number | null; unevaluated: number };
    learn: { activeExperiments: number; concludedWithWinner: number; totalExperiments: number };
}

interface UserHealth {
    userId: string;
    userName: string;
    overallHealth: 'healthy' | 'degraded' | 'failing';
    alerts: Array<{ stage: string; severity: 'error' | 'warning' | 'info'; message: string }>;
    pipeline: PipelineStage;
    agentRuns: {
        total48h: number;
        failed: number;
        zeroOutput: number;
        recentFailures: Array<{ agent: string; error: string | null; at: string }>;
    };
}

interface AgentStatus {
    name: string;
    health: 'healthy' | 'warning' | 'critical' | 'stale';
    runs48h: number;
    completed: number;
    failed: number;
    zeroOutput: number;
    avgDurationMs: number | null;
    lastRun: { status: string; at: string; error: string | null } | null;
}

interface PipelineData {
    systemHealth: 'healthy' | 'degraded' | 'failing';
    systemAlerts: Array<{ severity: 'error' | 'warning'; message: string }>;
    users: UserHealth[];
    agents: AgentStatus[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const healthColors: Record<string, string> = {
    healthy: 'text-green-400',
    degraded: 'text-amber-400',
    failing: 'text-red-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
    stale: 'text-slate-400',
};

const healthBg: Record<string, string> = {
    healthy: 'bg-green-500/10 border-green-500/20',
    degraded: 'bg-amber-500/10 border-amber-500/20',
    failing: 'bg-red-500/10 border-red-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
    critical: 'bg-red-500/10 border-red-500/20',
    stale: 'bg-slate-500/10 border-slate-500/20',
};

const stageIcons: Record<string, typeof Activity> = {
    ingest: Database,
    extract: Brain,
    synthesize: Lightbulb,
    plan: BarChart3,
    deliver: Phone,
    evaluate: Activity,
    learn: Lightbulb,
    agents: AlertCircle,
};

const stageLabels: Record<string, string> = {
    ingest: 'Ingest (Sync)',
    extract: 'Extract (Knowledge)',
    synthesize: 'Synthesize (Intelligence)',
    plan: 'Plan (Directive)',
    deliver: 'Deliver (Calls)',
    evaluate: 'Evaluate (KPIs)',
    learn: 'Learn (Experiments)',
    agents: 'Agent Runs',
};

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Pipeline Flow Diagram (per user)
// ---------------------------------------------------------------------------

function PipelineFlow({ pipeline }: { pipeline: PipelineStage }) {
    const stages = [
        {
            key: 'ingest',
            label: 'Sync',
            icon: Database,
            ok: !!(pipeline.ingest.calendar?.lastSync || pipeline.ingest.email?.lastSync),
            detail: [
                pipeline.ingest.calendar?.lastSync ? `Cal: ${timeAgo(pipeline.ingest.calendar.lastSync)}` : 'Cal: --',
                pipeline.ingest.email?.lastSync ? `Email: ${timeAgo(pipeline.ingest.email.lastSync)}` : 'Email: --',
            ].join(' | '),
        },
        {
            key: 'extract',
            label: 'Knowledge',
            icon: Brain,
            ok: pipeline.extract.entities > 0,
            detail: `${pipeline.extract.entities} entities, ${pipeline.extract.facts} facts`,
        },
        {
            key: 'synthesize',
            label: 'Intel',
            icon: Lightbulb,
            ok: pipeline.synthesize.coveragePercent > 10,
            detail: `${pipeline.synthesize.stakeholderIntelligence}/${pipeline.synthesize.stakeholderProfiles} (${pipeline.synthesize.coveragePercent}%)`,
        },
        {
            key: 'plan',
            label: 'Plan',
            icon: BarChart3,
            ok: !!pipeline.plan.phase,
            detail: pipeline.plan.phase ? `${pipeline.plan.phase} (call #${pipeline.plan.callCount})` : 'No plan',
        },
        {
            key: 'deliver',
            label: 'Calls',
            icon: Phone,
            ok: pipeline.deliver.callsLast7d > 0,
            detail: `${pipeline.deliver.callsLast24h} today, ${pipeline.deliver.callsLast7d} /7d, ${pipeline.deliver.withDirective}/${pipeline.deliver.callsLast7d} w/directive`,
        },
        {
            key: 'evaluate',
            label: 'Evaluate',
            icon: Activity,
            ok: pipeline.evaluate.unevaluated <= 2,
            detail: `${pipeline.evaluate.evaluationsLast7d} evals, avg ${pipeline.evaluate.avgScore?.toFixed(1) ?? '--'}, ${pipeline.evaluate.unevaluated} pending`,
        },
        {
            key: 'learn',
            label: 'Learn',
            icon: Lightbulb,
            ok: pipeline.learn.activeExperiments > 0 || pipeline.learn.concludedWithWinner > 0,
            detail: `${pipeline.learn.activeExperiments} active, ${pipeline.learn.concludedWithWinner} winners`,
        },
    ];

    return (
        <div className="flex items-center gap-1 overflow-x-auto py-2">
            {stages.map((stage, i) => {
                const Icon = stage.icon;
                return (
                    <div key={stage.key} className="flex items-center gap-1">
                        <div className={cn(
                            'flex flex-col items-center px-2 py-1.5 rounded-lg border min-w-[80px]',
                            stage.ok ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
                        )}>
                            <Icon size={12} className={stage.ok ? 'text-green-400' : 'text-red-400'} />
                            <span className="text-[9px] font-medium text-foreground mt-0.5">{stage.label}</span>
                            <span className="text-[8px] text-muted-foreground text-center leading-tight mt-0.5">{stage.detail}</span>
                        </div>
                        {i < stages.length - 1 && (
                            <ArrowRight size={10} className="text-muted-foreground flex-shrink-0" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// User Health Card
// ---------------------------------------------------------------------------

function UserHealthCard({ user }: { user: UserHealth }) {
    const [expanded, setExpanded] = useState(user.overallHealth !== 'healthy');

    return (
        <div className={cn('rounded-xl border', healthBg[user.overallHealth])}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}

                {user.overallHealth === 'healthy' ? (
                    <CheckCircle2 size={14} className="text-green-400" />
                ) : user.overallHealth === 'failing' ? (
                    <XCircle size={14} className="text-red-400" />
                ) : (
                    <AlertCircle size={14} className="text-amber-400" />
                )}

                <span className="text-sm font-medium text-foreground">{user.userName}</span>

                <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 ml-1', healthBg[user.overallHealth])}>
                    {user.overallHealth}
                </Badge>

                {user.alerts.length > 0 && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                        {user.alerts.filter(a => a.severity === 'error').length} errors,{' '}
                        {user.alerts.filter(a => a.severity === 'warning').length} warnings
                    </span>
                )}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3">
                    {/* Pipeline flow diagram */}
                    <PipelineFlow pipeline={user.pipeline} />

                    {/* Alerts */}
                    {user.alerts.length > 0 && (
                        <div className="space-y-1">
                            {user.alerts.map((alert, i) => {
                                const StageIcon = stageIcons[alert.stage] || AlertCircle;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'text-xs p-2 rounded-lg flex items-center gap-2',
                                            alert.severity === 'error'
                                                ? 'bg-red-500/10 border border-red-500/10 text-red-300'
                                                : 'bg-amber-500/10 border border-amber-500/10 text-amber-300'
                                        )}
                                    >
                                        <StageIcon size={11} className="flex-shrink-0" />
                                        <span className="font-medium text-[10px] uppercase">{stageLabels[alert.stage] || alert.stage}</span>
                                        <span className="text-muted-foreground">—</span>
                                        <span>{alert.message}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Agent failures */}
                    {user.agentRuns.recentFailures.length > 0 && (
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Recent Agent Failures</p>
                            <div className="space-y-1">
                                {user.agentRuns.recentFailures.map((f, i) => (
                                    <div key={i} className="text-[11px] text-red-300 bg-red-500/5 rounded px-2 py-1 font-mono">
                                        <span className="font-medium">{f.agent}</span>
                                        <span className="text-muted-foreground"> {timeAgo(f.at)} — </span>
                                        {f.error}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PipelineHealthPage() {
    const [data, setData] = useState<PipelineData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/pipeline-health');
            if (!res.ok) throw new Error('Failed to load pipeline health');
            setData(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    if (loading) {
        return (
            <div className="p-6 flex items-center gap-3 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading pipeline health...
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-6 flex flex-col items-center gap-4">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
                <button onClick={loadData} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-background min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                        Pipeline Health
                        {data.systemHealth === 'healthy' ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                        ) : data.systemHealth === 'failing' ? (
                            <XCircle className="w-5 h-5 text-red-400" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-amber-400" />
                        )}
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        End-to-end monitoring: Ingest → Extract → Synthesize → Plan → Deliver → Evaluate → Learn
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* System alerts */}
            {data.systemAlerts.length > 0 && (
                <div className="space-y-1">
                    {data.systemAlerts.map((alert, i) => (
                        <div
                            key={i}
                            className={cn(
                                'text-sm p-3 rounded-xl flex items-center gap-2 font-medium',
                                alert.severity === 'error'
                                    ? 'bg-red-500/10 border border-red-500/20 text-red-300'
                                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                            )}
                        >
                            <AlertTriangle size={14} />
                            {alert.message}
                        </div>
                    ))}
                </div>
            )}

            {/* Per-user pipeline health */}
            <Card className="rounded-2xl border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-foreground">
                        User Pipelines
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                    {data.users.map(user => (
                        <UserHealthCard key={user.userId} user={user} />
                    ))}
                </CardContent>
            </Card>

            {/* System-wide agent health */}
            <Card className="rounded-2xl border-border overflow-hidden">
                <CardHeader className="pb-0 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" />
                        Agent Health (48h)
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 mt-3">
                    <div className="flex items-center gap-3 px-4 py-2 border-y border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                        <span className="flex-1">Agent</span>
                        <span className="w-16 text-center">Health</span>
                        <span className="w-10 text-right">Runs</span>
                        <span className="w-10 text-right">OK</span>
                        <span className="w-10 text-right">Fail</span>
                        <span className="w-10 text-right">0-out</span>
                        <span className="w-14 text-right">Avg</span>
                        <span className="w-16 text-right">Last</span>
                    </div>
                    {data.agents.map(agent => (
                        <div
                            key={agent.name}
                            className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20"
                        >
                            <span className="flex-1 text-xs font-mono text-foreground">{agent.name}</span>
                            <span className="w-16 text-center">
                                <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', healthBg[agent.health])}>
                                    {agent.health}
                                </Badge>
                            </span>
                            <span className="w-10 text-right text-xs tabular-nums">{agent.runs48h}</span>
                            <span className="w-10 text-right text-xs tabular-nums text-green-400">{agent.completed}</span>
                            <span className={cn('w-10 text-right text-xs tabular-nums', agent.failed > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground')}>
                                {agent.failed}
                            </span>
                            <span className={cn('w-10 text-right text-xs tabular-nums', agent.zeroOutput >= 3 ? 'text-amber-400' : 'text-muted-foreground')}>
                                {agent.zeroOutput}
                            </span>
                            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                                {agent.avgDurationMs !== null
                                    ? agent.avgDurationMs > 1000
                                        ? `${(agent.avgDurationMs / 1000).toFixed(1)}s`
                                        : `${agent.avgDurationMs}ms`
                                    : '—'}
                            </span>
                            <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">
                                {agent.lastRun ? timeAgo(agent.lastRun.at) : 'never'}
                            </span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
