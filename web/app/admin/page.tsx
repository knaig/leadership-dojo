'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Phone,
    Star,
    Heart,
    Target,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertTriangle,
    RefreshCw,
    ChevronRight,
    Flame,
    Clock,
    Brain,
    User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeadlineMetrics {
    callsToday: number;
    callsScheduledToday: number;
    avgQualityToday: number | null;
    qualityTrend7d: number | null;
    avgDepthToday: number | null;
    openCommitments: number;
    completedCommitments: number;
    totalCommitments: number;
    totalUsers: number;
}

interface UserCard {
    userId: string;
    name: string | null;
    email: string;
    daysSinceSignup: number;
    status: 'thriving' | 'steady' | 'needs_attention' | 'onboarding';
    callCount: number;
    lastCallDate: string | null;
    totalMinutes: number;
    pickupRate7d: number | null;
    streak: number;
    avgDuration: number;
    durationTrend: 'up' | 'down' | 'flat' | 'insufficient';
    avgQuality: number | null;
    avgDepth: number | null;
    avgRepetition: number | null;
    qualityTrend: 'up' | 'down' | 'flat' | 'insufficient';
    depthTrend: 'up' | 'down' | 'flat' | 'insufficient';
    qualityHistory: { date: string; score: number; depth: number }[];
    todayCallDuration: number | null;
    todayQuality: number | null;
    todayDepth: number | null;
    openCommitments: number;
    completedCommitments: number;
    totalCommitments: number;
    staleCommitments: number;
    activeThemes: string[];
    resolvedThemes: number;
    factCount: number;
    entityCount: number;
    correctionCount: number;
    phase: string;
    syncComplete: boolean;
    connectors: { type: string; status: string }[];
    hasFirstCall: boolean;
    hasSecondCall: boolean;
}

interface Alert {
    userId: string;
    userName: string;
    type: string;
    severity: 'warning' | 'error';
    message: string;
    action: string;
}

interface InsightCard {
    id: string;
    pattern: string;
    recommendation: string;
    category: string;
    scope: string;
    status: 'proposed' | 'active' | 'validated' | 'retired';
    confidence: number;
    impactDelta: number | null;
    preScore: number | null;
    postScore: number | null;
    callsSinceActivation: number;
    activatedAt: string | null;
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMinutes(totalSeconds: number): string {
    const mins = Math.round(totalSeconds / 60);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

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

function TrendIcon({ trend, size = 14 }: { trend: string; size?: number }) {
    if (trend === 'up') return <TrendingUp size={size} className="text-green-400" />;
    if (trend === 'down') return <TrendingDown size={size} className="text-red-400" />;
    if (trend === 'flat') return <Minus size={size} className="text-muted-foreground" />;
    return null;
}

const statusConfig = {
    thriving: { label: 'Thriving', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    steady: { label: 'Steady', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    needs_attention: { label: 'Needs Attention', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
    onboarding: { label: 'Onboarding', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({ data, dataKey, color, height = 32 }: {
    data: Record<string, unknown>[];
    dataKey: string;
    color?: string;
    height?: number;
}) {
    if (!data.length) return <span className="text-xs text-muted-foreground">--</span>;
    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
                <Line
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color || 'hsl(var(--primary))'}
                    strokeWidth={1.5}
                    dot={false}
                />
                <YAxis domain={['auto', 'auto']} hide />
                <XAxis dataKey="date" hide />
                <Tooltip
                    content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                            <div className="bg-card border border-border rounded px-2 py-1 text-xs shadow-lg">
                                {(payload[0].value as number).toFixed(1)}
                            </div>
                        );
                    }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

// ---------------------------------------------------------------------------
// Headline Card
// ---------------------------------------------------------------------------

function HeadlineCard({
    icon: Icon,
    label,
    value,
    sub,
    trend,
    color,
}: {
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
    value: string;
    sub?: string;
    trend?: number | null;
    color?: string;
}) {
    return (
        <Card className="rounded-2xl border-border">
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                            {label}
                        </p>
                        <p className={cn('text-2xl font-bold tracking-tight', color || 'text-foreground')}>
                            {value}
                        </p>
                        {sub && (
                            <p className="text-xs text-muted-foreground">{sub}</p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className="p-2 rounded-xl bg-primary/10">
                            <Icon className="w-4 h-4 text-primary" size={16} />
                        </div>
                        {trend !== undefined && trend !== null && (
                            <span className={cn(
                                'text-[10px] font-medium',
                                trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-muted-foreground'
                            )}>
                                {trend > 0 ? '+' : ''}{trend.toFixed(1)} 7d
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// User Card
// ---------------------------------------------------------------------------

function UserCardComponent({ user }: { user: UserCard }) {
    const status = statusConfig[user.status];
    const displayName = user.name || user.email.split('@')[0];

    // Build narrative
    let narrative = '';
    if (user.status === 'onboarding') {
        const syncedCount = user.connectors.filter(c => c.status === 'CONNECTED').length;
        narrative = `Day ${user.daysSinceSignup}. ${syncedCount}/3 connectors synced. `;
        if (user.hasFirstCall) {
            narrative += `First call completed. ${user.hasSecondCall ? 'Second call done — past initial hurdle.' : 'Watching for second call.'}`;
        } else {
            narrative += 'Awaiting first call.';
        }
    } else if (user.todayCallDuration) {
        narrative = `Today: ${formatDuration(user.todayCallDuration)} call`;
        if (user.todayDepth) narrative += `, depth ${user.todayDepth.toFixed(1)}`;
        if (user.todayQuality) narrative += `, quality ${user.todayQuality.toFixed(1)}`;
        narrative += '. ';
    } else {
        const lastCall = timeAgo(user.lastCallDate);
        narrative = `Last call: ${lastCall}. `;
    }

    if (user.status !== 'onboarding') {
        if (user.avgRepetition !== null && user.avgRepetition < 5) {
            narrative += `Repetition score ${user.avgRepetition.toFixed(1)} — Mira is being repetitive. `;
        }
        if (user.durationTrend === 'down') {
            narrative += 'Call duration declining. ';
        }
        if (user.durationTrend === 'up') {
            narrative += 'Call duration growing. ';
        }
        if (user.depthTrend === 'up') {
            narrative += 'Trust deepening. ';
        }
        if (user.staleCommitments > 0) {
            narrative += `${user.staleCommitments} stale commitment${user.staleCommitments > 1 ? 's' : ''}. `;
        }
        if (user.qualityTrend === 'up') {
            narrative += 'Quality improving.';
        }
    }

    return (
        <Link href={`/admin/coaching?user=${user.userId}`}>
            <Card className={cn(
                'rounded-2xl border-border hover:border-primary/30 transition-all cursor-pointer group',
                user.status === 'needs_attention' && 'border-red-500/20',
            )}>
                <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                                user.status === 'thriving' ? 'bg-green-500/10 text-green-400' :
                                user.status === 'needs_attention' ? 'bg-red-500/10 text-red-400' :
                                user.status === 'onboarding' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-primary/10 text-primary'
                            )}>
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">{displayName}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    Call {user.callCount} &middot; Day {user.daysSinceSignup} &middot; {user.phase}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn('text-[10px] px-2 py-0', status.color)}>
                                {status.label}
                            </Badge>
                            <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                    </div>

                    {/* Narrative */}
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        {narrative.trim()}
                    </p>

                    {/* Metrics row */}
                    <div className="flex items-center gap-3 text-[11px] flex-wrap">
                        {user.pickupRate7d !== null && (
                            <div className="flex items-center gap-1">
                                <Phone size={11} className="text-muted-foreground" />
                                <span className={cn(
                                    'font-medium',
                                    user.pickupRate7d >= 70 ? 'text-green-400' :
                                    user.pickupRate7d >= 40 ? 'text-amber-400' : 'text-red-400'
                                )}>
                                    {user.pickupRate7d}%
                                </span>
                            </div>
                        )}

                        {user.streak > 0 && (
                            <div className="flex items-center gap-1">
                                <Flame size={11} className="text-orange-400" />
                                <span className="font-medium text-foreground">{user.streak}d</span>
                            </div>
                        )}

                        {user.avgQuality !== null && (
                            <div className="flex items-center gap-1">
                                <Star size={11} className="text-amber-400" />
                                <span className="font-medium text-foreground">{user.avgQuality.toFixed(1)}</span>
                                <TrendIcon trend={user.qualityTrend} size={11} />
                            </div>
                        )}

                        {user.avgDepth !== null && (
                            <div className="flex items-center gap-1">
                                <Heart size={11} className="text-pink-400" />
                                <span className="font-medium text-foreground">{user.avgDepth.toFixed(1)}</span>
                                <TrendIcon trend={user.depthTrend} size={11} />
                            </div>
                        )}

                        {user.totalCommitments > 0 && (
                            <div className="flex items-center gap-1">
                                <Target size={11} className="text-blue-400" />
                                <span className="font-medium text-foreground">
                                    {user.completedCommitments}/{user.totalCommitments}
                                </span>
                            </div>
                        )}

                        {user.factCount > 0 && (
                            <div className="flex items-center gap-1">
                                <Brain size={11} className="text-purple-400" />
                                <span className="font-medium text-foreground">{user.factCount}</span>
                            </div>
                        )}

                        {user.avgDuration > 0 && (
                            <div className="flex items-center gap-1">
                                <Clock size={11} className="text-muted-foreground" />
                                <span className="font-medium text-foreground">
                                    {formatMinutes(user.avgDuration)}
                                </span>
                                <TrendIcon trend={user.durationTrend} size={11} />
                            </div>
                        )}
                    </div>

                    {/* Sparkline */}
                    {user.qualityHistory.length >= 3 && (
                        <div className="mt-3 h-8">
                            <Sparkline data={user.qualityHistory} dataKey="score" />
                        </div>
                    )}

                    {/* Active themes */}
                    {user.activeThemes.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                            {user.activeThemes.slice(0, 3).map(theme => (
                                <span key={theme} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                    {theme}
                                </span>
                            ))}
                            {user.activeThemes.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                    +{user.activeThemes.length - 3}
                                </span>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}

// ---------------------------------------------------------------------------
// Alert Card
// ---------------------------------------------------------------------------

function AlertCard({ alert }: { alert: Alert }) {
    const iconMap: Record<string, typeof AlertTriangle> = {
        repetition: RefreshCw,
        stale_commitments: Target,
        duration_decline: TrendingDown,
        low_pickup: Phone,
        onboarding_stuck: Clock,
        knowledge_poor: Brain,
    };
    const Icon = iconMap[alert.type] || AlertTriangle;

    return (
        <div className={cn(
            'flex items-start gap-3 p-3 rounded-xl',
            alert.severity === 'error' ? 'bg-red-500/5 border border-red-500/10' : 'bg-amber-500/5 border border-amber-500/10'
        )}>
            <Icon className={cn(
                'w-4 h-4 mt-0.5 flex-shrink-0',
                alert.severity === 'error' ? 'text-red-400' : 'text-amber-400'
            )} />
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.action}</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Autoresearch Insights
// ---------------------------------------------------------------------------

const insightStatusConfig = {
    proposed: { label: 'Proposed', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
    active: { label: 'Testing', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    validated: { label: 'Proven', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    retired: { label: 'Retired', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function InsightCardComponent({ insight }: { insight: InsightCard }) {
    const status = insightStatusConfig[insight.status] || insightStatusConfig.proposed;
    const hasImpact = insight.impactDelta !== null && insight.callsSinceActivation > 0;

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-border">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', status.color)}>
                        {status.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{insight.category}</span>
                    {insight.scope !== 'system' && (
                        <span className="text-[10px] text-muted-foreground">• per-user</span>
                    )}
                </div>
                <p className="text-xs text-foreground leading-relaxed">{insight.recommendation}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{insight.pattern}</p>
                {hasImpact && (
                    <div className="flex items-center gap-3 mt-2 text-[11px]">
                        <span className="text-muted-foreground">
                            {insight.callsSinceActivation} calls since activation
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
// Skeletons
// ---------------------------------------------------------------------------

function PageSkeleton() {
    return (
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="rounded-2xl border-border">
                        <CardContent className="p-4 space-y-2">
                            <Skeleton className="h-3 w-20 bg-muted" />
                            <Skeleton className="h-8 w-16 bg-muted" />
                            <Skeleton className="h-3 w-24 bg-muted" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            {[...Array(3)].map((_, i) => (
                <Card key={i} className="rounded-2xl border-border">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Skeleton className="w-8 h-8 rounded-full bg-muted" />
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-24 bg-muted" />
                                <Skeleton className="h-3 w-32 bg-muted" />
                            </div>
                        </div>
                        <Skeleton className="h-3 w-full bg-muted" />
                        <Skeleton className="h-3 w-3/4 bg-muted" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Metric legend
// ---------------------------------------------------------------------------

function MetricLegend() {
    const items = [
        { icon: Phone, label: 'Pickup rate (7d)', color: 'text-muted-foreground' },
        { icon: Flame, label: 'Streak (days)', color: 'text-orange-400' },
        { icon: Star, label: 'Avg quality /10', color: 'text-amber-400' },
        { icon: Heart, label: 'Trust depth /10', color: 'text-pink-400' },
        { icon: Target, label: 'Commitments done/total', color: 'text-blue-400' },
        { icon: Brain, label: 'Knowledge facts', color: 'text-purple-400' },
        { icon: Clock, label: 'Avg call duration', color: 'text-muted-foreground' },
    ];

    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {items.map(({ icon: Icon, label, color }) => (
                <span key={label} className="flex items-center gap-1">
                    <Icon size={10} className={color} />
                    {label}
                </span>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminOverviewPage() {
    const [headline, setHeadline] = useState<HeadlineMetrics | null>(null);
    const [users, setUsers] = useState<UserCard[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [insights, setInsights] = useState<InsightCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/pmf-overview');
            if (!res.ok) throw new Error('Failed to load PMF data');
            const data = await res.json();
            setHeadline(data.headline);
            setUsers(data.users || []);
            setAlerts(data.alerts || []);
            setInsights(data.insights || []);
        } catch (e) {
            console.error('Admin PMF overview error:', e);
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) return <PageSkeleton />;

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <p className="text-muted-foreground">{error}</p>
                <button
                    onClick={() => loadData()}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (!headline) return null;

    const commitmentRate = headline.totalCommitments > 0
        ? Math.round((headline.completedCommitments / headline.totalCommitments) * 100)
        : null;

    return (
        <div className="p-6 space-y-6 bg-background min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">
                        Does Mira Matter?
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {headline.totalUsers} users &middot; PMF signals at a glance
                    </p>
                </div>
                <button
                    onClick={() => loadData()}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Headline metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <HeadlineCard
                    icon={Phone}
                    label="Calls Today"
                    value={`${headline.callsToday}/${headline.callsScheduledToday}`}
                    sub={headline.callsScheduledToday > 0
                        ? `${Math.round((headline.callsToday / headline.callsScheduledToday) * 100)}% pickup`
                        : 'No calls scheduled'}
                />
                <HeadlineCard
                    icon={Star}
                    label="Avg Quality"
                    value={headline.avgQualityToday !== null ? headline.avgQualityToday.toFixed(1) : '--'}
                    sub="/10"
                    trend={headline.qualityTrend7d}
                    color={
                        headline.avgQualityToday !== null
                            ? headline.avgQualityToday >= 7 ? 'text-green-400'
                            : headline.avgQualityToday >= 5 ? 'text-amber-400'
                            : 'text-red-400'
                            : undefined
                    }
                />
                <HeadlineCard
                    icon={Heart}
                    label="Trust Depth"
                    value={headline.avgDepthToday !== null ? headline.avgDepthToday.toFixed(1) : '--'}
                    sub="/10 avg depth today"
                />
                <HeadlineCard
                    icon={Target}
                    label="Commitments"
                    value={`${headline.openCommitments} open`}
                    sub={commitmentRate !== null
                        ? `${commitmentRate}% completion rate (${headline.completedCommitments}/${headline.totalCommitments})`
                        : 'No commitments yet'}
                />
                {(headline as Record<string, unknown>).avgPostureMatchToday != null && (
                    <HeadlineCard
                        icon={Star}
                        label="Posture Match"
                        value={((headline as Record<string, unknown>).avgPostureMatchToday as number).toFixed(1)}
                        sub={`/10 · ${(headline as Record<string, unknown>).signalDrivenCalls7d ?? 0} signal-driven (7d)`}
                    />
                )}
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <Card className="rounded-2xl border-border border-red-500/10">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            Needs Attention
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {alerts.length}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                            {alerts.map((alert, i) => (
                                <AlertCard key={`${alert.userId}-${alert.type}-${i}`} alert={alert} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Autoresearch Insights */}
            {insights.length > 0 && (
                <Card className="rounded-2xl border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-400" />
                            Autoresearch Loop
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {insights.filter(i => i.status === 'active').length} testing
                                {insights.filter(i => i.status === 'validated').length > 0 &&
                                    ` · ${insights.filter(i => i.status === 'validated').length} proven`}
                            </Badge>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground">
                            Self-discovered coaching strategies from call evaluation data
                        </p>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                            {insights
                                .filter(i => i.status !== 'retired')
                                .map(insight => (
                                    <InsightCardComponent key={insight.id} insight={insight} />
                                ))}
                        </div>
                        {insights.filter(i => i.status === 'retired').length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-2">
                                {insights.filter(i => i.status === 'retired').length} retired insight(s) not shown
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* User cards */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-foreground">Per-User Status</h2>
                    <MetricLegend />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {users.map(user => (
                        <UserCardComponent key={user.userId} user={user} />
                    ))}
                </div>
                {users.length === 0 && (
                    <div className="flex flex-col items-center py-12 text-center">
                        <UserIcon className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No users with activity yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
