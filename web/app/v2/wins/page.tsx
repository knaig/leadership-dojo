'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, Target, CheckCircle2, Calendar, Loader2, BarChart3, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface WeeklyTrend {
    weekStart: string;
    outcomesSet: number;
    outcomesLanded: number;
    totalMeetings: number;
    commitmentsFulfilled: number;
    commitmentsMade: number;
    totalHours: number;
}

interface RecentOutcome {
    id: string; title: string; startTime: string;
    desiredOutcome: string | null; outcomeResult: string; meetingCategory: string | null;
}

interface WinsData {
    stats: {
        streak: number;
        outcomeHitRate: number | null;
        previousHitRate: number | null;
        outcomesSet: number;
        outcomesLanded: number;
        totalMeetingsThisWeek: number;
        commitmentsMade: number;
        commitmentsFulfilled: number;
    };
    weeklyTrend: WeeklyTrend[];
    meetings: any[];
    recentOutcomes: RecentOutcome[];
    strategic: {
        categoryBreakdown: Record<string, number>;
        timeAllocation: { totalHours: number; totalCategorized: number };
        patternInsights: string[];
        recurringWithNoValue: any[];
    };
}

export default function WinsPage() {
    const [data, setData] = useState<WinsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tz = new Date().getTimezoneOffset();
        fetch(`/api/today?tz=${tz}`)
            .then(res => res.ok ? res.json() : null)
            .then(json => { if (json?.success) setData(json.data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 overflow-y-auto w-full mx-auto w-full p-4">
                <div className="text-center py-12 text-sm text-muted-foreground">
                    <p>Unable to load data</p>
                </div>
            </div>
        );
    }

    const { stats: streak, weeklyTrend, recentOutcomes, strategic } = data;
    const hitRateDelta = streak.outcomeHitRate !== null && streak.previousHitRate !== null
        ? streak.outcomeHitRate - streak.previousHitRate
        : null;
    const categoryBreakdown = strategic?.categoryBreakdown || {};
    const totalCategorized = strategic?.timeAllocation?.totalCategorized || 0;
    const patternInsights = strategic?.patternInsights || [];
    const recurringWithNoValue = strategic?.recurringWithNoValue || [];

    const isNew = streak.outcomesSet === 0 && weeklyTrend.length === 0;
    const totalMeetingsSynced = weeklyTrend.reduce((sum, w) => sum + w.totalMeetings, 0) + (streak.totalMeetingsThisWeek || 0);
    const totalOutcomesLanded = weeklyTrend.reduce((sum, w) => sum + w.outcomesLanded, 0) + streak.outcomesLanded;
    const totalOutcomesSet = weeklyTrend.reduce((sum, w) => sum + w.outcomesSet, 0) + streak.outcomesSet;
    const overallHitRate = totalOutcomesSet > 0 ? Math.round((totalOutcomesLanded / totalOutcomesSet) * 100) : null;

    return (
        <div className="flex-1 overflow-y-auto w-full mx-auto w-full p-4 space-y-4">
            <h1 className="text-xl font-semibold text-foreground">Your Effectiveness</h1>

            {/* New user — onboarding state */}
            {isNew && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <TrendingUp size={20} className="text-primary" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-foreground">Your dashboard is warming up</div>
                                <div className="text-xs text-muted-foreground">Here&apos;s how it works</div>
                            </div>
                        </div>
                        <div className="space-y-3 pl-1">
                            {[
                                { label: 'Set a goal before a meeting', desc: 'Tap any meeting on Home and tell Mira what you want from it' },
                                { label: 'Log the result after', desc: 'Landed, partial, or missed — one tap on the review card' },
                                { label: 'Watch your patterns emerge', desc: 'After a week, you\'ll see trends and where you\'re sharpest' },
                            ].map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="text-xs text-primary font-bold">{i + 1}</span>
                                    </div>
                                    <div>
                                        <div className="text-sm text-foreground">{step.label}</div>
                                        <div className="text-xs text-muted-foreground">{step.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Link href="/dashboard" className="block text-center text-sm text-primary font-medium hover:text-primary/80 pt-2">
                            Go to Home to get started
                        </Link>
                    </div>

                    {data.meetings.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                <Calendar size={14} />
                                <span className="text-xs font-medium uppercase tracking-wider">Calendar Connected</span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">{data.meetings.length}</div>
                            <div className="text-xs text-muted-foreground">meetings today — ready to track</div>
                        </div>
                    )}
                </div>
            )}

            {/* Active users */}
            {!isNew && (
                <>
                    {/* Effectiveness + Follow-through */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                            <div>
                                <div className="text-3xl font-bold text-foreground">
                                    {streak.outcomeHitRate !== null ? `${streak.outcomeHitRate}%` : '--'}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    meeting effectiveness
                                    {hitRateDelta !== null && hitRateDelta !== 0 && (
                                        <span className={hitRateDelta > 0 ? ' text-emerald-500' : ' text-red-400'}>
                                            {' '}{hitRateDelta > 0 ? '+' : ''}{hitRateDelta}% vs last week
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-foreground">
                                    {streak.commitmentsMade > 0
                                        ? `${Math.round((streak.commitmentsFulfilled / streak.commitmentsMade) * 100)}%`
                                        : '--'}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    follow-through rate
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                <Target size={14} />
                                <span className="text-xs font-medium uppercase tracking-wider">Outcomes</span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                                {streak.outcomesLanded}<span className="text-base text-muted-foreground">/{streak.outcomesSet}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">landed this week</div>
                            {streak.outcomesSet > 0 && (
                                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 rounded-full"
                                        style={{ width: `${(streak.outcomesLanded / streak.outcomesSet) * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                <CheckCircle2 size={14} />
                                <span className="text-xs font-medium uppercase tracking-wider">Commitments</span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                                {streak.commitmentsFulfilled}<span className="text-base text-muted-foreground">/{streak.commitmentsMade}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">fulfilled this week</div>
                            {streak.commitmentsMade > 0 && (
                                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${(streak.commitmentsFulfilled / streak.commitmentsMade) * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* All-Time Stats */}
                    {totalMeetingsSynced > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-3">
                                <BarChart3 size={14} />
                                <span className="text-xs font-medium uppercase tracking-wider">All Time</span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <div className="text-lg font-bold text-foreground">{totalMeetingsSynced}</div>
                                    <div className="text-[10px] text-muted-foreground">meetings tracked</div>
                                </div>
                                <div>
                                    <div className="text-lg font-bold text-foreground">
                                        {overallHitRate !== null ? `${overallHitRate}%` : '--'}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">overall effectiveness</div>
                                </div>
                                <div>
                                    <div className="text-lg font-bold text-foreground">{weeklyTrend.length}</div>
                                    <div className="text-[10px] text-muted-foreground">weeks tracked</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom row: Trend + Breakdown + Recent Outcomes */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Weekly Trend */}
                    {weeklyTrend.length > 1 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingUp size={14} className="text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Effectiveness Trend</span>
                            </div>
                            <div className="space-y-3">
                                {weeklyTrend.map((week, i) => {
                                    const hitRate = week.outcomesSet > 0
                                        ? Math.round((week.outcomesLanded / week.outcomesSet) * 100)
                                        : 0;
                                    const weekLabel = new Date(week.weekStart).toLocaleDateString([], { month: 'short', day: 'numeric' });
                                    const isLatest = i === weeklyTrend.length - 1;

                                    return (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className={`text-xs w-16 flex-shrink-0 ${isLatest ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                                {weekLabel}
                                            </span>
                                            <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isLatest ? 'bg-primary' : 'bg-primary/50'}`}
                                                    style={{ width: `${hitRate}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs w-10 text-right ${isLatest ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>
                                                {week.outcomesSet > 0 ? `${hitRate}%` : '-'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="text-[10px] text-muted-foreground text-center mt-3">Meeting effectiveness by week</div>
                        </div>
                    )}

                    {/* Meeting Volume */}
                    {streak.totalMeetingsThisWeek > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                <Calendar size={14} />
                                <span className="text-xs font-medium uppercase tracking-wider">This Week</span>
                            </div>
                            <div className="text-sm text-foreground">
                                {streak.totalMeetingsThisWeek} meetings
                                {streak.outcomesSet > 0 && streak.totalMeetingsThisWeek > 0 && (
                                    <span className="text-muted-foreground">
                                        {' '}&middot; goals set for {Math.round((streak.outcomesSet / streak.totalMeetingsThisWeek) * 100)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Meeting Type Breakdown */}
                    {totalCategorized > 0 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 size={14} className="text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Where Your Time Goes</span>
                            </div>
                            <div className="space-y-3">
                                {Object.entries(categoryBreakdown).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).map(([cat, count]) => {
                                    const pct = Math.round((count / totalCategorized) * 100);
                                    const label = cat === 'NEEDLE_MOVER' ? 'Needle Movers' : cat === 'OPERATIONAL' ? 'Operational' : cat === 'GROWTH' ? 'Growth' : cat.replace('_', ' ');
                                    const isNeedle = cat === 'NEEDLE_MOVER';
                                    return (
                                        <div key={cat}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-sm ${isNeedle ? 'text-emerald-500 font-medium' : 'text-foreground'}`}>{label}</span>
                                                <span className="text-xs text-muted-foreground">{count} meetings · {pct}%</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${isNeedle ? 'bg-emerald-500' : 'bg-primary/40'}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {recurringWithNoValue.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-border">
                                    <div className="text-xs text-red-400 font-medium mb-1">Low-value recurring meetings</div>
                                    {recurringWithNoValue.map((m: any, i: number) => (
                                        <div key={i} className="text-xs text-muted-foreground truncate">· {m.title || m}</div>
                                    ))}
                                </div>
                            )}

                            {/* 50/25/25 Rule — ideal vs actual */}
                            <div className="mt-4 pt-3 border-t border-border">
                                <div className="text-xs font-medium text-muted-foreground mb-3">The 50/25/25 Rule</div>
                                <div className="text-[10px] text-muted-foreground mb-3">
                                    Top performers spend ~50% on needle movers, ~25% on growth, ~25% on ops.
                                </div>
                                {(() => {
                                    const nm = categoryBreakdown['NEEDLE_MOVER'] || 0;
                                    const gr = categoryBreakdown['GROWTH'] || 0;
                                    const op = totalCategorized - nm - gr;
                                    const nmPct = totalCategorized > 0 ? Math.round((nm / totalCategorized) * 100) : 0;
                                    const grPct = totalCategorized > 0 ? Math.round((gr / totalCategorized) * 100) : 0;
                                    const opPct = totalCategorized > 0 ? Math.round((op / totalCategorized) * 100) : 0;

                                    const bars = [
                                        { label: 'Needle Movers', actual: nmPct, ideal: 50, color: 'bg-emerald-500', idealColor: 'bg-emerald-500/20' },
                                        { label: 'Growth', actual: grPct, ideal: 25, color: 'bg-blue-500', idealColor: 'bg-blue-500/20' },
                                        { label: 'Operational', actual: opPct, ideal: 25, color: 'bg-muted-foreground/50', idealColor: 'bg-muted-foreground/10' },
                                    ];
                                    return (
                                        <div className="space-y-3">
                                            {bars.map(b => (
                                                <div key={b.label}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs text-foreground">{b.label}</span>
                                                        <span className="text-[10px] text-muted-foreground">{b.actual}% actual · {b.ideal}% ideal</span>
                                                    </div>
                                                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                                                        <div className={`absolute inset-y-0 left-0 ${b.idealColor} rounded-full`} style={{ width: `${b.ideal}%` }} />
                                                        <div className={`absolute inset-y-0 left-0 ${b.color} rounded-full`} style={{ width: `${b.actual}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Recent Outcomes Log */}
                    {recentOutcomes && recentOutcomes.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <Target size={14} className="text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Outcomes</span>
                            </div>
                            <div className="space-y-2">
                                {recentOutcomes.slice(0, 8).map(o => (
                                    <div key={o.id} className="flex items-center gap-3 py-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                            o.outcomeResult === 'LANDED' ? 'text-emerald-500 bg-emerald-500/10' :
                                            o.outcomeResult === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10' :
                                            'text-red-400 bg-red-400/10'
                                        }`}>{o.outcomeResult === 'LANDED' ? 'Landed' : o.outcomeResult === 'PARTIAL' ? 'Partial' : 'Missed'}</span>
                                        <span className="text-sm truncate flex-1">{o.title}</span>
                                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{new Date(o.startTime).toLocaleDateString([], { weekday: 'short' })}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    </div>{/* end bottom row grid */}

                    {/* Pattern Insights */}
                    {patternInsights.length > 0 && (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <div className="text-xs font-medium text-primary mb-2">Mira&apos;s Observations</div>
                            <div className="space-y-2">
                                {patternInsights.map((insight, i) => (
                                    <div key={i} className="text-sm leading-relaxed">· {insight}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* CTA to chat */}
                    <Link
                        href="/chat?prep=What patterns do you see in my meetings?"
                        className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 hover:border-primary/40 transition-colors"
                    >
                        <TrendingUp size={16} className="text-primary" />
                        <span className="text-sm text-foreground flex-1">Ask Mira about your patterns</span>
                        <ArrowRight size={12} className="text-primary" />
                    </Link>
                </>
            )}
        </div>
    );
}
