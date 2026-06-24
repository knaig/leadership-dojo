'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodaysFocusCardProps {
    objective: string;
    escalationPath?: string;
    kpiName?: string;
    confidence?: number;
    className?: string;
}

export function TodaysFocusCard({
    objective,
    escalationPath,
    kpiName,
    confidence,
    className
}: TodaysFocusCardProps) {
    const isAtRisk = confidence !== undefined && confidence < 50;

    return (
        <Card className={cn(
            'bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/30',
            className
        )}>
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-400">
                                Today's Focus
                            </span>
                            {isAtRisk && (
                                <span className="flex items-center gap-1 text-xs text-amber-400">
                                    <AlertTriangle className="w-3 h-3" />
                                    At Risk
                                </span>
                            )}
                        </div>
                        <h2 className="text-xl font-semibold text-white mb-2">
                            {objective}
                        </h2>
                        {escalationPath && (
                            <p className="text-sm text-zinc-400">
                                {escalationPath}
                            </p>
                        )}
                        {kpiName && (
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-xs text-zinc-500">Linked to:</span>
                                <span className="text-xs font-medium text-zinc-300">{kpiName}</span>
                                {confidence !== undefined && (
                                    <span className={cn(
                                        "text-xs font-semibold",
                                        confidence >= 70 ? "text-green-400" :
                                            confidence >= 40 ? "text-amber-400" :
                                                "text-red-400"
                                    )}>
                                        {confidence}% confident
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <button className="p-2 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 transition-colors">
                        <ArrowRight className="w-5 h-5 text-indigo-400" />
                    </button>
                </div>
            </CardContent>
        </Card>
    );
}
