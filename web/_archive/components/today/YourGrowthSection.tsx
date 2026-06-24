'use client';

import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';

export interface GrowthSnapshot {
    capacities: {
        code: string;
        name: string;
        score: number;
        trend: 'up' | 'stable' | 'down' | 'new';
    }[];

    weeklyFocus: {
        capacityName: string;
        currentScore: number;
        targetScore: number;
        completedPractices: string[]; // Descriptions
        requiredPractices: number;
    };
}

interface YourGrowthSectionProps {
    growth: GrowthSnapshot;
}

export function YourGrowthSection({ growth }: YourGrowthSectionProps) {
    if (!growth) return null;

    // Mini chart for collapsed state
    const MiniChart = () => (
        <div className="flex gap-2 items-end h-8">
            {growth.capacities.slice(0, 6).map((cap, i) => (
                <div key={i} className="flex flex-col justify-end h-full gap-0.5">
                    <div
                        className="w-4 bg-muted-foreground/40 rounded-t-sm opacity-60"
                        style={{ height: `${(cap.score / 5) * 100}%` }}
                    />
                </div>
            ))}
        </div>
    );

    return (
        <CollapsibleSection title="Your Growth" defaultOpen={true} collapsedContent={<MiniChart />}>
            <div className="p-6">
                {/* Main Capacity Grid */}
                <div className="grid grid-cols-6 gap-2 mb-8 bg-muted/30 p-4 rounded-xl border border-border">
                    {growth.capacities.map((cap) => (
                        <div key={cap.code} className="flex flex-col items-center text-center">
                            <span className="text-[10px] font-bold text-muted-foreground mb-2">{cap.code}</span>

                            {/* Bar */}
                            <div className="h-16 w-full flex items-end justify-center px-1 mb-2">
                                <div
                                    className={cn(
                                        "w-full max-w-[24px] rounded-t-sm transition-all relative group",
                                        cap.score >= 3 ? "bg-primary" : "bg-muted"
                                    )}
                                    style={{ height: `${(cap.score / 5) * 100}%` }}
                                >
                                    {/* Tooltip on hover (naive) */}
                                    <div className="hidden group-hover:block absolute bottom-full mb-1 bg-popover text-popover-foreground text-xs px-1 py-0.5 rounded whitespace-nowrap z-10 shadow-sm border border-border">
                                        {cap.name}: {cap.score}
                                    </div>
                                </div>
                            </div>

                            <span className="text-xs font-bold text-foreground">{cap.score.toFixed(1)}</span>

                            <div className="mt-1">
                                {cap.trend === 'up' && <ArrowUp className="h-3 w-3 text-green-500" />}
                                {cap.trend === 'down' && <ArrowDown className="h-3 w-3 text-red-500" />}
                                {cap.trend === 'stable' && <div className="h-0.5 w-2 bg-muted-foreground/30 my-1" />}
                                {cap.trend === 'new' && <span className="text-[9px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-100 px-1 rounded">NEW</span>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Weekly Focus */}
                <div className="border-t border-border pt-6">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">This Week's Focus</h4>

                    <div className="flex justify-between items-end mb-2">
                        <h3 className="text-lg font-bold text-foreground">{growth.weeklyFocus.capacityName}</h3>
                        <span className="text-sm font-medium text-muted-foreground">
                            {growth.weeklyFocus.currentScore.toFixed(1)} → {growth.weeklyFocus.targetScore.toFixed(1)}
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-2 w-full bg-muted rounded-full mb-6">
                        <div className="absolute top-0 left-0 h-full bg-primary rounded-full" style={{ width: '66%' }} />
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-foreground">Progress: {growth.weeklyFocus.completedPractices.length} of {growth.weeklyFocus.requiredPractices} practices completed</p>
                        <ul className="space-y-2">
                            {growth.weeklyFocus.completedPractices.map((practice, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <CheckBoxIcon checked />
                                    <span className="line-through opacity-70">{practice}</span>
                                </li>
                            ))}
                            {/* Empty slots */}
                            {Array.from({ length: growth.weeklyFocus.requiredPractices - growth.weeklyFocus.completedPractices.length }).map((_, i) => (
                                <li key={`empty-${i}`} className="flex items-start gap-2 text-sm text-muted-foreground/50">
                                    <CheckBoxIcon checked={false} />
                                    <span>One more practice to hit target</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
}

function CheckBoxIcon({ checked }: { checked: boolean }) {
    if (checked) {
        return (
            <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <ArrowRight className="h-3 w-3 text-green-600" />
                {/* Checkmark icon would be better */}
            </div>
        );
    }
    return (
        <div className="h-5 w-5 rounded-full border border-border shrink-0" />
    );
}
