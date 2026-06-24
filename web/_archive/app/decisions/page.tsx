'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, GitBranch, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Decision {
    id: string;
    title: string;
    context?: string;
    status: 'PENDING' | 'DECIDED' | 'IMPLEMENTED' | 'ABANDONED';
    decidedAt?: string;
    createdAt: string;
}

export default function DecisionsPage() {
    const router = useRouter();
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/decisions');
                const json = await res.json();
                if (json.decisions) {
                    setDecisions(json.decisions);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const pending = decisions.filter(d => d.status === 'PENDING');
    const decided = decisions.filter(d => d.status === 'DECIDED' || d.status === 'IMPLEMENTED');
    const abandoned = decisions.filter(d => d.status === 'ABANDONED');

    return (
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">Decisions</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Track and document key decisions
                        </p>
                    </div>
                    <Button
                        onClick={() => router.push('/decisions/new')}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Log Decision
                    </Button>
                </div>

                {isLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                    </div>
                ) : decisions.length === 0 ? (
                    <Card className="bg-zinc-900 border-zinc-800 border-dashed">
                        <CardContent className="p-12 text-center">
                            <GitBranch className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">No decisions yet</h3>
                            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
                                Document important decisions to maintain clarity and alignment.
                            </p>
                            <Button
                                onClick={() => router.push('/decisions/new')}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Log First Decision
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Pending */}
                        {pending.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Pending ({pending.length})
                                </h2>
                                <div className="space-y-2">
                                    {pending.map((decision) => (
                                        <DecisionRow
                                            key={decision.id}
                                            decision={decision}
                                            onClick={() => router.push(`/decisions/${decision.id}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Decided */}
                        {decided.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Decided ({decided.length})
                                </h2>
                                <div className="space-y-2">
                                    {decided.map((decision) => (
                                        <DecisionRow
                                            key={decision.id}
                                            decision={decision}
                                            onClick={() => router.push(`/decisions/${decision.id}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Abandoned */}
                        {abandoned.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Abandoned ({abandoned.length})
                                </h2>
                                <div className="space-y-2">
                                    {abandoned.map((decision) => (
                                        <DecisionRow
                                            key={decision.id}
                                            decision={decision}
                                            onClick={() => router.push(`/decisions/${decision.id}`)}
                                        />
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

function DecisionRow({ decision, onClick }: { decision: Decision; onClick: () => void }) {
    const statusConfig = {
        PENDING: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: HelpCircle },
        DECIDED: { label: 'Decided', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
        IMPLEMENTED: { label: 'Implemented', color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: CheckCircle2 },
        ABANDONED: { label: 'Abandoned', color: 'text-zinc-400', bg: 'bg-zinc-700/50', icon: AlertCircle }
    };

    const config = statusConfig[decision.status];
    const StatusIcon = config.icon;

    return (
        <Card
            className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <StatusIcon className="w-4 h-4" />
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', config.bg, config.color)}>
                                {config.label}
                            </span>
                            <span className="text-xs text-zinc-500">
                                {new Date(decision.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <h3 className="text-base font-medium text-white">
                            {decision.title}
                        </h3>
                        {decision.context && (
                            <p className="text-sm text-zinc-500 mt-1 line-clamp-1">
                                {decision.context}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
