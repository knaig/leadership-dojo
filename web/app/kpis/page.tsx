'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Target, TrendingUp, AlertTriangle, CheckCircle2, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/kpis');
                const json = await res.json();
                if (json.kpis) {
                    setKPIs(json.kpis);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const updateConfidence = async (kpiId: string, confidence: number) => {
        try {
            await fetch(`/api/kpis/${kpiId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confidence })
            });
            setKPIs(kpis.map(k => k.id === kpiId ? { ...k, confidence } : k));
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
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">Your KPIs</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Track your top goals and confidence levels
                        </p>
                    </div>
                    <Button className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" /> Add KPI
                    </Button>
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-32 w-full bg-zinc-800" />
                        <Skeleton className="h-32 w-full bg-zinc-800" />
                        <Skeleton className="h-32 w-full bg-zinc-800" />
                    </div>
                ) : kpis.length === 0 ? (
                    <Card className="bg-zinc-900 border-zinc-800 border-dashed">
                        <CardContent className="p-12 text-center">
                            <Target className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">No KPIs set</h3>
                            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
                                Set your top 3 goals to get clarity on what matters most.
                            </p>
                            <Button
                                onClick={() => router.push('/onboarding')}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Set Your Goals
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
                                        'bg-zinc-900 border-zinc-800',
                                        kpi.status === 'AT_RISK' && 'border-amber-500/30',
                                        kpi.status === 'OFF_TRACK' && 'border-red-500/30'
                                    )}
                                >
                                    <CardContent className="p-6">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-start gap-3">
                                                <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-lg font-bold text-zinc-400">
                                                    {kpi.priority}
                                                </span>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-white">{kpi.name}</h3>
                                                    {kpi.description && (
                                                        <p className="text-sm text-zinc-500 mt-1">{kpi.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={cn('flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full', config.bg, config.color)}>
                                                <StatusIcon className="w-3.5 h-3.5" />
                                                {config.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-6">
                                                {/* Target Date */}
                                                <div>
                                                    <p className="text-xs text-zinc-500">Target</p>
                                                    <p className="text-sm text-white">
                                                        {targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        {daysLeft > 0 && (
                                                            <span className="text-zinc-500 ml-1">({daysLeft}d)</span>
                                                        )}
                                                    </p>
                                                </div>

                                                {/* Confidence Slider */}
                                                <div className="flex-1 min-w-[200px]">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <p className="text-xs text-zinc-500">Confidence</p>
                                                        <p className={cn(
                                                            'text-sm font-semibold',
                                                            (kpi.confidence || 0) >= 70 ? 'text-green-400' :
                                                                (kpi.confidence || 0) >= 40 ? 'text-amber-400' : 'text-red-400'
                                                        )}>
                                                            {kpi.confidence || 0}%
                                                        </p>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={kpi.confidence || 0}
                                                        onChange={(e) => updateConfidence(kpi.id, parseInt(e.target.value))}
                                                        className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
                                                    />
                                                </div>
                                            </div>

                                            <Button variant="ghost" size="sm" className="text-zinc-400">
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
        </AppShell>
    );
}
