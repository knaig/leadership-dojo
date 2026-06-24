'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Target, AlertTriangle, CheckCircle2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Reusing the same interface
interface KPI {
    id: string;
    name: string;
    description?: string;
    targetValue: number;
    currentValue?: number;
    targetDate: string;
    status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'ACHIEVED';
    confidence?: number;
    priority: number;
}

export default function KPIsPage() {
    const router = useRouter();
    const [kpis, setKPIs] = useState<KPI[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadKPIs = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/kpis');
            const json = await res.json();
            if (json.kpis) {
                setKPIs(json.kpis);
            }
        } catch (e) {
            console.error(e);
            setError('Failed to load KPIs');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadKPIs();
    }, []);

    const updateConfidence = async (kpiId: string, confidence: number) => {
        try {
            await fetch(`/api/kpis/${kpiId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confidence })
            });
            setKPIs(prev => prev.map(k => k.id === kpiId ? { ...k, confidence } : k));
        } catch (e) {
            console.error(e);
        }
    };

    const statusConfig = {
        ON_TRACK: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', label: 'On Track' },
        AT_RISK: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'At Risk' },
        OFF_TRACK: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Off Track' },
        ACHIEVED: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Achieved' }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-background p-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground tracking-tight">Strategy & KPIs</h1>
                        <p className="text-muted-foreground mt-2">
                            Track your top strategic goals and monitor execution confidence.
                        </p>
                    </div>
                    <Button onClick={() => window.location.href = '/chat?q=Help me define a new KPI'} className="bg-indigo-600 hover:bg-indigo-700 text-foreground shadow-lg shadow-indigo-500/20">
                        <Plus className="w-4 h-4 mr-2" /> Add KPI
                    </Button>
                </div>

                {error ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                        <p className="text-muted-foreground">{error}</p>
                        <button onClick={() => { setError(null); loadKPIs(); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                            Try again
                        </button>
                    </div>
                ) : isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-32 w-full bg-muted" />
                        <Skeleton className="h-32 w-full bg-muted" />
                        <Skeleton className="h-32 w-full bg-muted" />
                    </div>
                ) : kpis.length === 0 ? (
                    <Card className="bg-muted border-border border-dashed">
                        <CardContent className="p-16 text-center">
                            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Target className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-medium text-foreground mb-2">No KPIs defined</h3>
                            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                                define your top strategic priorities to give the AI context for your coaching sessions.
                            </p>
                            <Button
                                onClick={() => router.push('/onboarding')}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Set Strategy
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {kpis.sort((a, b) => a.priority - b.priority).map((kpi) => {
                            const config = statusConfig[kpi.status];
                            const StatusIcon = config.icon;
                            const targetDate = new Date(kpi.targetDate);
                            const daysLeft = Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                            return (
                                <Card
                                    key={kpi.id}
                                    className={cn(
                                        'bg-muted border-border hover:border-border transition-all duration-300 group',
                                        kpi.status === 'AT_RISK' && 'border-amber-500/30 bg-amber-500/5',
                                        kpi.status === 'OFF_TRACK' && 'border-red-500/30 bg-red-500/5'
                                    )}
                                >
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-start gap-4">
                                                <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground border border-border">
                                                    P{kpi.priority}
                                                </span>
                                                <div>
                                                    <h3 className="text-xl font-semibold text-foreground group-hover:text-indigo-300 transition-colors">{kpi.name}</h3>
                                                    {kpi.description && (
                                                        <p className="text-sm text-muted-foreground mt-1">{kpi.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={cn('flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-border', config.bg, config.color)}>
                                                <StatusIcon className="w-3.5 h-3.5" />
                                                {config.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between pl-12">
                                            <div className="flex items-center gap-8">
                                                {/* Target Date */}
                                                <div>
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Target Date</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        {daysLeft > 0 && (
                                                            <span className="text-muted-foreground ml-2 text-xs">({daysLeft} days left)</span>
                                                        )}
                                                    </p>
                                                </div>

                                                {/* Confidence Slider */}
                                                <div className="flex-1 min-w-[240px]">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Confidence Level</p>
                                                        <p className={cn(
                                                            'text-sm font-bold',
                                                            (kpi.confidence || 0) >= 70 ? 'text-green-400' :
                                                                (kpi.confidence || 0) >= 40 ? 'text-amber-400' : 'text-red-400'
                                                        )}>
                                                            {kpi.confidence || 0}%
                                                        </p>
                                                    </div>
                                                    <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className={cn("absolute h-full rounded-full transition-all duration-500",
                                                                (kpi.confidence || 0) >= 70 ? 'bg-green-500' :
                                                                    (kpi.confidence || 0) >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                                            )}
                                                            style={{ width: `${kpi.confidence || 0}%` }}
                                                        />
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            value={kpi.confidence || 0}
                                                            onChange={(e) => updateConfidence(kpi.id, parseInt(e.target.value))}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <Button variant="ghost" size="sm" onClick={() => window.location.href = `/chat?q=Help me update my KPI: ${kpi.name}`} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
