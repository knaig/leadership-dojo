'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPI {
    id: string;
    name: string;
    targetValue?: number;
    currentValue?: number;
    targetDate?: Date;
    status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'ACHIEVED';
    confidence?: number;
    blocker?: string;
}

interface KPICardProps {
    kpi: KPI;
    priority: number;
    onClick?: () => void;
}

export function KPICard({ kpi, priority, onClick }: KPICardProps) {
    const statusConfig = {
        ON_TRACK: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'On Track' },
        AT_RISK: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'At Risk' },
        OFF_TRACK: { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Off Track' },
        ACHIEVED: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Achieved' }
    };

    const config = statusConfig[kpi.status];
    const StatusIcon = config.icon;

    const confidenceColor = kpi.confidence
        ? kpi.confidence >= 70 ? 'text-green-500'
            : kpi.confidence >= 40 ? 'text-amber-500'
                : 'text-red-500'
        : 'text-muted-foreground';

    return (
        <Card
            className={cn(
                'bg-card border-border hover:border-primary/30 transition-colors cursor-pointer',
                kpi.status === 'AT_RISK' && 'border-amber-500/30',
                kpi.status === 'OFF_TRACK' && 'border-red-500/30'
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {priority}
                        </span>
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', config.bg, config.color)}>
                            {config.label}
                        </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>

                <h3 className="text-base font-semibold text-foreground mb-2 line-clamp-2">
                    {kpi.name}
                </h3>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {kpi.targetDate && (
                            <span className="text-xs text-muted-foreground">
                                Target: {new Date(kpi.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        )}
                    </div>
                    {kpi.confidence !== undefined && (
                        <span className={cn('text-sm font-semibold', confidenceColor)}>
                            {kpi.confidence}%
                        </span>
                    )}
                </div>

                {kpi.blocker && (
                    <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs text-amber-600 dark:text-amber-300">
                            <span className="font-semibold">Blocker:</span> {kpi.blocker}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

interface KPICardListProps {
    kpis: KPI[];
    onKPIClick?: (kpi: KPI) => void;
}

export function KPICardList({ kpis, onKPIClick }: KPICardListProps) {
    if (kpis.length === 0) {
        return (
            <Card className="bg-card border-border border-dashed">
                <CardContent className="p-6 text-center">
                    <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">No KPIs set yet</p>
                    <button className="text-sm text-primary hover:text-primary/80 font-medium">
                        Set your top 3 goals →
                    </button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Your KPIs</h3>
                <span className="text-xs text-muted-foreground">{kpis.length} goals</span>
            </div>
            {kpis.slice(0, 3).map((kpi, i) => (
                <KPICard
                    key={kpi.id}
                    kpi={kpi}
                    priority={i + 1}
                    onClick={() => onKPIClick?.(kpi)}
                />
            ))}
        </div>
    );
}

