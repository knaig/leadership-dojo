'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Brain,
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
    Clock,
    Ban,
    Zap,
    Eye,
    ChevronDown,
    ChevronRight,
    Pencil,
    Save,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutoresearchArea {
    id: string;
    name: string;
    category: 'coaching' | 'intelligence' | 'engagement' | 'operations' | 'knowledge';
    priority: number;
    description: string;
    status: 'active' | 'dormant' | 'planned' | 'blocked';
    statusReason: string;
    dataRequired: string;
    dataAvailable: string;
    resultsAchieved: number;
    resultsDetail: string;
    verifiedByAdmin: number;
    lastRunAt: string | null;
    impactSummary: string | null;
}

interface InsightDetail {
    id: string;
    pattern: string;
    recommendation: string;
    category: string;
    scope: string;
    status: string;
    confidence: number;
    impactDelta: number | null;
    preScore: number | null;
    postScore: number | null;
    callsSinceActivation: number;
    activatedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface Summary {
    total: number;
    active: number;
    dormant: number;
    planned: number;
    blocked: number;
    totalResults: number;
    totalVerified: number;
}

interface AgentHealth {
    name: string;
    health: 'healthy' | 'warning' | 'critical' | 'stale';
    last24h: {
        runs: number;
        completed: number;
        failures: number;
        skipped: number;
        zeroOutput: number;
        avgDurationMs: number | null;
        totalItemsProcessed: number;
    };
    lastRun: {
        status: string;
        startedAt: string;
        durationMs: number | null;
        itemsProcessed: number;
        outputSummary: string | null;
        errorMessage: string | null;
    } | null;
}

interface CallSchedule {
    userId: string;
    userName: string;
    config: {
        enabled: boolean;
        channel: string;
        time: string | null;
        frequency: number | null;
        window: string | null;
        maxRetries: number;
        retryAfterMin: number;
        timezone: string;
    };
    today: {
        total: number;
        completed: number;
        noAnswer: number;
        pending: number;
        calling: number;
        retried: number;
        calls: Array<{
            scheduledFor: string;
            callType: string;
            status: string;
            outcome: string | null;
            isRetry: boolean;
            retryCount: number;
            completedAt: string | null;
        }>;
    };
}

interface AgentHealthData {
    agents: AgentHealth[];
    alerts: Array<{ agent: string; issue: string; severity: string; detail: string }>;
    callSchedules: CallSchedule[];
    summary: {
        totalAgents: number;
        healthy: number;
        warning: number;
        critical: number;
        stale: number;
        callsToday: number;
        callsCompleted: number;
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusConfig = {
    active: { label: 'Active', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: Zap },
    dormant: { label: 'Dormant', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock },
    planned: { label: 'Planned', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: Eye },
    blocked: { label: 'Blocked', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: Ban },
};

const categoryConfig: Record<string, { label: string; color: string }> = {
    coaching: { label: 'Coaching', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    intelligence: { label: 'Intelligence', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    engagement: { label: 'Engagement', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
    operations: { label: 'Operations', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    knowledge: { label: 'Knowledge', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

const healthConfig: Record<string, { label: string; color: string }> = {
    healthy: { label: 'Healthy', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    warning: { label: 'Warning', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    critical: { label: 'Critical', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
    stale: { label: 'Stale', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

const callStatusColors: Record<string, string> = {
    completed: 'text-green-400',
    no_answer: 'text-amber-400',
    pending: 'text-blue-400',
    calling: 'text-cyan-400',
    failed: 'text-red-400',
};

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Area Row
// ---------------------------------------------------------------------------

function AreaRow({ area, expanded, onToggle }: {
    area: AutoresearchArea;
    expanded: boolean;
    onToggle: () => void;
}) {
    const st = statusConfig[area.status];
    const cat = categoryConfig[area.category] || categoryConfig.knowledge;
    const StIcon = st.icon;
    const isBlocked = area.status === 'blocked';

    return (
        <div className={cn(
            'border-b border-border last:border-b-0',
            isBlocked && 'bg-red-500/[0.02]',
        )}>
            {/* Summary row */}
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
                {/* Priority */}
                <span className="text-[11px] font-mono text-muted-foreground w-5 flex-shrink-0 text-center">
                    {area.priority}
                </span>

                {/* Expand icon */}
                {expanded
                    ? <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                    : <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                }

                {/* Name + category */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{area.name}</span>
                        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', cat.color)}>
                            {cat.label}
                        </Badge>
                    </div>
                </div>

                {/* Status */}
                <Badge variant="outline" className={cn('text-[10px] px-2 py-0 flex items-center gap-1', st.color)}>
                    <StIcon size={10} />
                    {st.label}
                </Badge>

                {/* Results */}
                <div className="flex items-center gap-1 w-16 justify-end flex-shrink-0">
                    <span className={cn(
                        'text-sm font-semibold tabular-nums',
                        area.resultsAchieved > 0 ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                        {area.resultsAchieved}
                    </span>
                    <span className="text-[10px] text-muted-foreground">results</span>
                </div>

                {/* Verified */}
                <div className="flex items-center gap-1 w-16 justify-end flex-shrink-0">
                    {area.verifiedByAdmin > 0 ? (
                        <>
                            <CheckCircle2 size={12} className="text-green-400" />
                            <span className="text-sm font-semibold text-green-400 tabular-nums">
                                {area.verifiedByAdmin}
                            </span>
                        </>
                    ) : (
                        <span className="text-[10px] text-muted-foreground">--</span>
                    )}
                </div>

                {/* Last run */}
                <span className="text-[11px] text-muted-foreground w-16 text-right flex-shrink-0 tabular-nums">
                    {timeAgo(area.lastRunAt)}
                </span>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-4 pb-4 pl-12 space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {area.description}
                    </p>

                    {/* Status reason */}
                    <div className={cn(
                        'text-xs p-2.5 rounded-lg',
                        isBlocked ? 'bg-red-500/5 border border-red-500/10 text-red-300' : 'bg-muted/50 text-foreground'
                    )}>
                        {area.statusReason}
                    </div>

                    {/* Data grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Data Required</p>
                            <p className="text-xs text-foreground">{area.dataRequired}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Data Available</p>
                            <p className="text-xs text-foreground">{area.dataAvailable}</p>
                        </div>
                    </div>

                    {/* Results detail */}
                    {area.resultsDetail && (
                        <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Results Detail</p>
                            <p className="text-xs text-foreground">{area.resultsDetail}</p>
                        </div>
                    )}

                    {/* Impact */}
                    {area.impactSummary && (
                        <div className={cn(
                            'text-xs p-2 rounded-lg',
                            area.impactSummary.includes('SILENT FAILURE')
                                ? 'bg-red-500/5 border border-red-500/10 text-red-300'
                                : 'bg-green-500/5 border border-green-500/10 text-green-300'
                        )}>
                            {area.impactSummary}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Insight row (for the detail section)
// ---------------------------------------------------------------------------

const insightStatusColors: Record<string, string> = {
    proposed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    active: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    validated: 'bg-green-500/10 text-green-400 border-green-500/20',
    retired: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function InsightRow({ insight }: { insight: InsightDetail }) {
    const hasImpact = insight.impactDelta !== null && insight.callsSinceActivation > 0;

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', insightStatusColors[insight.status] || '')}>
                        {insight.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{insight.category}</span>
                    <span className="text-[10px] text-muted-foreground">
                        {insight.scope === 'system' ? 'system-wide' : 'per-user'}
                    </span>
                </div>
                <p className="text-xs text-foreground leading-relaxed">{insight.recommendation}</p>
                <p className="text-[10px] text-muted-foreground mt-1 italic">{insight.pattern}</p>
                {hasImpact && (
                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                        <span className="text-muted-foreground">
                            {insight.callsSinceActivation} calls tested
                        </span>
                        {insight.preScore !== null && insight.postScore !== null && (
                            <span className={cn(
                                'font-medium',
                                (insight.impactDelta || 0) > 0 ? 'text-green-400' :
                                (insight.impactDelta || 0) < 0 ? 'text-red-400' : 'text-muted-foreground'
                            )}>
                                {insight.preScore.toFixed(1)} → {insight.postScore.toFixed(1)}
                                {' '}({(insight.impactDelta || 0) > 0 ? '+' : ''}{(insight.impactDelta || 0).toFixed(1)})
                            </span>
                        )}
                        <span className="text-muted-foreground">
                            conf: {(insight.confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Call Schedule Editor (inline)
// ---------------------------------------------------------------------------

function CallScheduleEditor({
    schedule,
    onSaved,
}: {
    schedule: CallSchedule;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        dailyCallEnabled: schedule.config.enabled,
        dailyCallTime: schedule.config.time || '07:45',
        callFrequencyMinutes: schedule.config.frequency,
        callWindowStart: schedule.config.window?.split('-')[0] || '',
        callWindowEnd: schedule.config.window?.split('-')[1] || '',
        dailyCallMaxRetries: schedule.config.maxRetries,
        dailyCallRetryAfterMin: schedule.config.retryAfterMin,
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                dailyCallEnabled: form.dailyCallEnabled,
                dailyCallTime: form.dailyCallTime,
                callFrequencyMinutes: form.callFrequencyMinutes || null,
                callWindowStart: form.callWindowStart || null,
                callWindowEnd: form.callWindowEnd || null,
                dailyCallMaxRetries: form.dailyCallMaxRetries,
                dailyCallRetryAfterMin: form.dailyCallRetryAfterMin,
            };
            const res = await fetch(`/api/admin/call-scheduling/${schedule.userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Save failed: ${err.error || res.statusText}`);
                return;
            }
            setEditing(false);
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <button
                onClick={() => setEditing(true)}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Edit call schedule"
            >
                <Pencil size={12} />
            </button>
        );
    }

    return (
        <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Edit Schedule — {schedule.userName}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        <Save size={10} />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                        onClick={() => setEditing(false)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Enabled toggle */}
                <label className="flex items-center gap-2 text-xs">
                    <input
                        type="checkbox"
                        checked={form.dailyCallEnabled}
                        onChange={e => setForm(f => ({ ...f, dailyCallEnabled: e.target.checked }))}
                        className="rounded border-border"
                    />
                    Enabled
                </label>

                {/* Daily call time */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Call Time</label>
                    <input
                        type="time"
                        value={form.dailyCallTime}
                        onChange={e => setForm(f => ({ ...f, dailyCallTime: e.target.value }))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>

                {/* Frequency */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Frequency (min)</label>
                    <input
                        type="number"
                        value={form.callFrequencyMinutes ?? ''}
                        onChange={e => setForm(f => ({
                            ...f,
                            callFrequencyMinutes: e.target.value ? parseInt(e.target.value) : null,
                        }))}
                        placeholder="null = once/day"
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>

                {/* Max retries */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Max Retries</label>
                    <input
                        type="number"
                        value={form.dailyCallMaxRetries}
                        onChange={e => setForm(f => ({ ...f, dailyCallMaxRetries: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>

                {/* Window start */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Window Start</label>
                    <input
                        type="time"
                        value={form.callWindowStart}
                        onChange={e => setForm(f => ({ ...f, callWindowStart: e.target.value }))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>

                {/* Window end */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Window End</label>
                    <input
                        type="time"
                        value={form.callWindowEnd}
                        onChange={e => setForm(f => ({ ...f, callWindowEnd: e.target.value }))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>

                {/* Retry after */}
                <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Retry After (min)</label>
                    <input
                        type="number"
                        value={form.dailyCallRetryAfterMin}
                        onChange={e => setForm(f => ({ ...f, dailyCallRetryAfterMin: parseInt(e.target.value) || 60 }))}
                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                    />
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PageSkeleton() {
    return (
        <div className="p-6 space-y-4">
            <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="rounded-2xl border-border">
                        <CardContent className="p-4 space-y-2">
                            <Skeleton className="h-3 w-16 bg-muted" />
                            <Skeleton className="h-8 w-12 bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-muted rounded-lg" />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AutoresearchPage() {
    const [areas, setAreas] = useState<AutoresearchArea[]>([]);
    const [insights, setInsights] = useState<InsightDetail[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [healthData, setHealthData] = useState<AgentHealthData | null>(null);
    const [experiments, setExperiments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [resAuto, resHealth, resExp] = await Promise.all([
                fetch('/api/admin/autoresearch'),
                fetch('/api/admin/agent-health'),
                fetch('/api/admin/experiments'),
            ]);
            if (!resAuto.ok) throw new Error('Failed to load autoresearch data');
            const data = await resAuto.json();
            setAreas(data.areas || []);
            setInsights(data.insights || []);
            setSummary(data.summary || null);

            if (resHealth.ok) {
                setHealthData(await resHealth.json());
            }
            if (resExp.ok) {
                const expData = await resExp.json();
                setExperiments(expData.experiments || []);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (loading) return <PageSkeleton />;

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
                <button
                    onClick={loadData}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                >
                    Try again
                </button>
            </div>
        );
    }

    const blockedAreas = areas.filter(a => a.status === 'blocked');

    return (
        <div className="p-6 space-y-6 bg-background min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">
                        AutoResearch
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Self-improving feedback loops across coaching, intelligence, and engagement
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <Card className="rounded-2xl border-border">
                        <CardContent className="p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
                            <p className="text-2xl font-bold text-green-400">{summary.active}</p>
                            <p className="text-[10px] text-muted-foreground">of {summary.total} areas</p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-border">
                        <CardContent className="p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dormant</p>
                            <p className="text-2xl font-bold text-amber-400">{summary.dormant}</p>
                            <p className="text-[10px] text-muted-foreground">waiting for data</p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-border">
                        <CardContent className="p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Planned</p>
                            <p className="text-2xl font-bold text-slate-400">{summary.planned}</p>
                            <p className="text-[10px] text-muted-foreground">not yet built</p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-border">
                        <CardContent className="p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Results</p>
                            <p className="text-2xl font-bold text-foreground">{summary.totalResults}</p>
                            <p className="text-[10px] text-muted-foreground">across all areas</p>
                        </CardContent>
                    </Card>
                    <Card className="rounded-2xl border-border">
                        <CardContent className="p-3">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Verified</p>
                            <p className="text-2xl font-bold text-foreground">{summary.totalVerified}</p>
                            <p className="text-[10px] text-muted-foreground">by admin</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Blocked alert */}
            {blockedAreas.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            {blockedAreas.length} area{blockedAreas.length > 1 ? 's' : ''} blocked
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {blockedAreas.map(a => a.name).join(', ')} — agents running but producing zero results
                        </p>
                    </div>
                </div>
            )}

            {/* Status table */}
            <Card className="rounded-2xl border-border overflow-hidden">
                <CardHeader className="pb-0 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        AutoResearch Areas
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 mt-3">
                    {/* Table header */}
                    <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                        <span className="w-5 text-center">#</span>
                        <span className="w-4" /> {/* expand icon */}
                        <span className="flex-1">Area</span>
                        <span className="w-20 text-center">Status</span>
                        <span className="w-16 text-right">Results</span>
                        <span className="w-16 text-right">Verified</span>
                        <span className="w-16 text-right">Last Run</span>
                    </div>

                    {/* Rows */}
                    {areas.map(area => (
                        <AreaRow
                            key={area.id}
                            area={area}
                            expanded={expanded.has(area.id)}
                            onToggle={() => toggleExpand(area.id)}
                        />
                    ))}
                </CardContent>
            </Card>

            {/* Prompt Insights detail (existing autoresearch results) */}
            {insights.length > 0 && (
                <Card className="rounded-2xl border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Coaching Strategy Insights
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {insights.length} total
                            </Badge>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground">
                            Auto-discovered from call evaluation analysis
                        </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                            {insights.map(insight => (
                                <InsightRow key={insight.id} insight={insight} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Call Scheduling Status */}
            {healthData && healthData.callSchedules.length > 0 && (
                <Card className="rounded-2xl border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Clock className="w-4 h-4 text-cyan-400" />
                            Call Scheduling
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {healthData.summary.callsCompleted}/{healthData.summary.callsToday} today
                            </Badge>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground">
                            Mira&apos;s auto-calling schedule per user
                        </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-3">
                            {healthData.callSchedules.map(schedule => (
                                <div key={schedule.userId} className="p-3 rounded-xl border border-border">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-foreground">
                                                {schedule.userName}
                                            </span>
                                            <Badge variant="outline" className={cn(
                                                'text-[9px] px-1.5 py-0',
                                                schedule.config.enabled
                                                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                                    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            )}>
                                                {schedule.config.enabled ? 'enabled' : 'disabled'}
                                            </Badge>
                                            <CallScheduleEditor schedule={schedule} onSaved={loadData} />
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">
                                            {schedule.config.timezone}
                                        </span>
                                    </div>

                                    {/* Config row */}
                                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-2">
                                        {schedule.config.time && (
                                            <span>Time: {schedule.config.time}</span>
                                        )}
                                        {schedule.config.frequency && (
                                            <span>Every {schedule.config.frequency}min</span>
                                        )}
                                        {schedule.config.window && (
                                            <span>Window: {schedule.config.window}</span>
                                        )}
                                        <span>Max retries: {schedule.config.maxRetries}</span>
                                        <span>Channel: {schedule.config.channel}</span>
                                    </div>

                                    {/* Today's calls */}
                                    {schedule.today.total > 0 ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3 text-[11px]">
                                                <span className="text-green-400 font-medium">
                                                    {schedule.today.completed} completed
                                                </span>
                                                {schedule.today.noAnswer > 0 && (
                                                    <span className="text-amber-400">
                                                        {schedule.today.noAnswer} no answer
                                                    </span>
                                                )}
                                                {schedule.today.pending > 0 && (
                                                    <span className="text-blue-400">
                                                        {schedule.today.pending} pending
                                                    </span>
                                                )}
                                                {schedule.today.calling > 0 && (
                                                    <span className="text-cyan-400">
                                                        {schedule.today.calling} calling
                                                    </span>
                                                )}
                                                {schedule.today.retried > 0 && (
                                                    <span className="text-muted-foreground">
                                                        {schedule.today.retried} retried
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {schedule.today.calls.map((call, i) => (
                                                    <span
                                                        key={i}
                                                        className={cn(
                                                            'text-[10px] px-1.5 py-0.5 rounded border border-border',
                                                            callStatusColors[call.status] || 'text-muted-foreground'
                                                        )}
                                                        title={`${call.callType} — ${call.outcome || call.status}${call.isRetry ? ' (retry #' + call.retryCount + ')' : ''}`}
                                                    >
                                                        {new Date(call.scheduledFor).toLocaleTimeString('en-IN', {
                                                            hour: '2-digit', minute: '2-digit', timeZone: schedule.config.timezone
                                                        })}
                                                        {' '}{call.status}
                                                        {call.isRetry && ' R'}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground italic">
                                            No calls scheduled today
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Agent Health */}
            {healthData && healthData.agents.length > 0 && (
                <Card className="rounded-2xl border-border overflow-hidden">
                    <CardHeader className="pb-0 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-blue-400" />
                            Agent Health (24h)
                            <div className="ml-auto flex items-center gap-2 text-[10px]">
                                {healthData.summary.healthy > 0 && (
                                    <span className="text-green-400">{healthData.summary.healthy} healthy</span>
                                )}
                                {healthData.summary.warning > 0 && (
                                    <span className="text-amber-400">{healthData.summary.warning} warning</span>
                                )}
                                {healthData.summary.critical > 0 && (
                                    <span className="text-red-400">{healthData.summary.critical} critical</span>
                                )}
                                {healthData.summary.stale > 0 && (
                                    <span className="text-slate-400">{healthData.summary.stale} stale</span>
                                )}
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 mt-3">
                        {/* Alerts */}
                        {healthData.alerts.length > 0 && (
                            <div className="px-4 pb-3 space-y-1">
                                {healthData.alerts.map((alert, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            'text-xs p-2 rounded-lg flex items-center gap-2',
                                            alert.severity === 'error'
                                                ? 'bg-red-500/5 border border-red-500/10 text-red-300'
                                                : 'bg-amber-500/5 border border-amber-500/10 text-amber-300'
                                        )}
                                    >
                                        <AlertTriangle size={12} />
                                        <span className="font-medium">{alert.agent}</span>
                                        <span className="text-muted-foreground">—</span>
                                        <span>{alert.detail}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Agent table header */}
                        <div className="flex items-center gap-3 px-4 py-2 border-y border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                            <span className="flex-1">Agent</span>
                            <span className="w-16 text-center">Health</span>
                            <span className="w-12 text-right">Runs</span>
                            <span className="w-12 text-right">Fail</span>
                            <span className="w-14 text-right">Items</span>
                            <span className="w-16 text-right">Avg ms</span>
                            <span className="w-16 text-right">Last Run</span>
                        </div>

                        {/* Agent rows */}
                        {healthData.agents.map(agent => {
                            const hc = healthConfig[agent.health] || healthConfig.healthy;
                            return (
                                <div
                                    key={agent.name}
                                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/20"
                                >
                                    <span className="flex-1 text-sm text-foreground font-mono text-xs">
                                        {agent.name}
                                    </span>
                                    <span className="w-16 text-center">
                                        <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', hc.color)}>
                                            {hc.label}
                                        </Badge>
                                    </span>
                                    <span className="w-12 text-right text-xs tabular-nums text-foreground">
                                        {agent.last24h.runs}
                                    </span>
                                    <span className={cn(
                                        'w-12 text-right text-xs tabular-nums',
                                        agent.last24h.failures > 0 ? 'text-red-400 font-medium' : 'text-muted-foreground'
                                    )}>
                                        {agent.last24h.failures}
                                    </span>
                                    <span className="w-14 text-right text-xs tabular-nums text-foreground">
                                        {agent.last24h.totalItemsProcessed}
                                    </span>
                                    <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                                        {agent.last24h.avgDurationMs !== null
                                            ? agent.last24h.avgDurationMs > 1000
                                                ? `${(agent.last24h.avgDurationMs / 1000).toFixed(1)}s`
                                                : `${agent.last24h.avgDurationMs}ms`
                                            : '—'}
                                    </span>
                                    <span className="w-16 text-right text-[11px] tabular-nums text-muted-foreground">
                                        {agent.lastRun ? timeAgo(agent.lastRun.startedAt) : 'never'}
                                    </span>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            )}

            {/* A/B Experiments */}
            {experiments.length > 0 && (
                <Card className="rounded-2xl border-border overflow-hidden">
                    <CardHeader className="pb-0 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-400" />
                            Coaching Experiments (A/B)
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {experiments.filter((e: any) => e.status === 'active').length} active
                            </Badge>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground">
                            Controlled experiments testing coaching strategies per user
                        </p>
                    </CardHeader>
                    <CardContent className="p-0 mt-3">
                        <div className="flex items-center gap-3 px-4 py-2 border-y border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                            <span className="flex-1">Dimension</span>
                            <span className="w-20">User</span>
                            <span className="w-24">KPI</span>
                            <span className="w-14 text-center">Status</span>
                            <span className="w-20 text-center">Progress</span>
                            <span className="w-16 text-center">A avg</span>
                            <span className="w-16 text-center">B avg</span>
                            <span className="w-16 text-center">Winner</span>
                        </div>
                        {experiments.map((exp: any) => (
                            <div key={exp.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/20">
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium text-foreground">{exp.dimension.replace(/_/g, ' ')}</span>
                                    <p className="text-[10px] text-muted-foreground truncate">{exp.hypothesis}</p>
                                </div>
                                <span className="w-20 text-[11px] text-muted-foreground truncate">{exp.userName}</span>
                                <span className="w-24 text-[11px] text-muted-foreground font-mono">{exp.primaryKpi.replace('Score', '')}</span>
                                <span className="w-14 text-center">
                                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0',
                                        exp.status === 'active' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                        exp.status === 'concluded' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    )}>
                                        {exp.status}
                                    </Badge>
                                </span>
                                <span className="w-20 text-center text-[11px] tabular-nums text-muted-foreground">
                                    {exp.progress.a}/{exp.progress.target} vs {exp.progress.b}/{exp.progress.target}
                                </span>
                                <span className="w-16 text-center text-xs tabular-nums">
                                    {exp.results.variantAAvgKpi?.toFixed(1) ?? '—'}
                                </span>
                                <span className="w-16 text-center text-xs tabular-nums">
                                    {exp.results.variantBAvgKpi?.toFixed(1) ?? '—'}
                                </span>
                                <span className={cn('w-16 text-center text-xs font-medium',
                                    exp.results.winner === 'A' || exp.results.winner === 'B' ? 'text-green-400' :
                                    exp.results.winner === 'inconclusive' ? 'text-amber-400' : 'text-muted-foreground'
                                )}>
                                    {exp.results.winner || '—'}
                                    {exp.results.pValue != null && (
                                        <span className="text-[9px] text-muted-foreground block">
                                            p={exp.results.pValue.toFixed(3)}
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
