'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Signal as SignalIcon, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Signal {
    id: string;
    signal: string;
    category: 'COMPETITIVE' | 'MARKET' | 'ECONOMIC' | 'REGULATORY' | 'TECHNOLOGICAL' | 'SOCIAL';
    source?: string;
    relevanceScore: number;
    affectedKPIs: string[];
    acknowledged: boolean;
    detectedAt: string;
}

export default function SignalsPage() {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/signals');
                const json = await res.json();
                if (json.signals) {
                    setSignals(json.signals);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const unacknowledged = signals.filter(s => !s.acknowledged);
    const acknowledged = signals.filter(s => s.acknowledged);

    return (
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">External Signals</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Track market trends and external factors
                        </p>
                    </div>
                    <Button
                        onClick={() => window.location.href = '/signals/new'}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Signal
                    </Button>
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-24 w-full bg-zinc-800" />
                        <Skeleton className="h-24 w-full bg-zinc-800" />
                        <Skeleton className="h-24 w-full bg-zinc-800" />
                    </div>
                ) : signals.length === 0 ? (
                    <Card className="bg-zinc-900 border-zinc-800 border-dashed">
                        <CardContent className="p-12 text-center">
                            <SignalIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">No signals tracked yet</h3>
                            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
                                Start monitoring external signals that might impact your goals and decisions.
                            </p>
                            <Button
                                onClick={() => window.location.href = '/signals/new'}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Add First Signal
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Unacknowledged */}
                        {unacknowledged.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Needs Attention ({unacknowledged.length})
                                </h2>
                                <div className="space-y-2">
                                    {unacknowledged.map((signal) => (
                                        <SignalCard key={signal.id} signal={signal} />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Acknowledged */}
                        {acknowledged.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Acknowledged ({acknowledged.length})
                                </h2>
                                <div className="space-y-2">
                                    {acknowledged.map((signal) => (
                                        <SignalCard key={signal.id} signal={signal} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

function SignalCard({ signal }: { signal: Signal }) {
    const categoryConfig = {
        COMPETITIVE: { label: 'Competitive', color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertTriangle },
        MARKET: { label: 'Market', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: TrendingUp },
        ECONOMIC: { label: 'Economic', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: TrendingUp },
        REGULATORY: { label: 'Regulatory', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Info },
        TECHNOLOGICAL: { label: 'Tech', color: 'text-green-400', bg: 'bg-green-500/10', icon: SignalIcon },
        SOCIAL: { label: 'Social', color: 'text-pink-400', bg: 'bg-pink-500/10', icon: Info }
    };

    const config = categoryConfig[signal.category];
    const CategoryIcon = config.icon;

    const relevanceColor = signal.relevanceScore >= 0.7 ? 'text-red-400' :
        signal.relevanceScore >= 0.4 ? 'text-amber-400' : 'text-zinc-500';

    return (
        <Card className={cn(
            'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors',
            !signal.acknowledged && 'border-amber-500/30'
        )}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className={cn('p-2 rounded-lg', config.bg)}>
                        <CategoryIcon className={cn('w-4 h-4', config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', config.bg, config.color)}>
                                {config.label}
                            </span>
                            <span className={cn('text-xs font-medium', relevanceColor)}>
                                {Math.round(signal.relevanceScore * 100)}% relevant
                            </span>
                            <span className="text-xs text-zinc-500">
                                {new Date(signal.detectedAt).toLocaleDateString()}
                            </span>
                        </div>
                        <p className="text-sm text-white font-medium mb-1">
                            {signal.signal}
                        </p>
                        {signal.source && (
                            <p className="text-xs text-zinc-500">
                                Source: {signal.source}
                            </p>
                        )}
                        {signal.affectedKPIs.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {signal.affectedKPIs.map((kpi, idx) => (
                                    <span key={idx} className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                        {kpi}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
