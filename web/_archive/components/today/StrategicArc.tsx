'use client';

import { CollapsibleSection } from './CollapsibleSection';
import { cn } from '@/lib/utils';

// Types
export interface Milestone {
    label: string;
    date: Date;
    status: 'completed' | 'today' | 'upcoming';
}

export interface StrategicArcData {
    title: string;
    startDate: Date;
    endDate: Date;
    currentDay: number;
    totalDays: number;
    milestones: Milestone[];
    todayStakes?: string;
}

interface StrategicArcProps {
    arc: StrategicArcData;
}

export function StrategicArc({ arc }: StrategicArcProps) {
    // Strategic Arc is unique - it doesn't really collapse in the same way, 
    // or it is "Always Visible" as per prompt. 
    // However, for consistency we can put it in a card or section.
    // The prompt says "Section 1: Strategic Arc (Always Visible)"
    // So maybe we don't use CollapsibleSection here, or we use it but always expanded/locked?
    // Let's implement the visual component first.

    return (
        <div className="border border-border rounded-lg bg-card p-6 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    {arc.title}
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                    Day {arc.currentDay} of {arc.totalDays}
                </span>
            </div>

            <div className="relative mb-8">
                {/* Progress Bar Background */}
                <div className="h-1 bg-muted w-full rounded-full absolute top-1/2 -translate-y-1/2" />

                {/* Active Progress */}
                <div
                    className="h-1 bg-blue-500 rounded-full absolute top-1/2 -translate-y-1/2 transition-all duration-1000"
                    style={{ width: `${(arc.currentDay / arc.totalDays) * 100}%` }}
                />

                {/* Milestones */}
                <div className="relative flex justify-between w-full">
                    {arc.milestones.map((m, idx) => {
                        // Determine position based on date relative to start/end could be complex
                        // For MVP, user prompt shows specific milestones at specific spots.
                        // We'll simplisticly justify-between them for now, or if we had real dates we'd calculate %.

                        // Let's assume start/end are milestones 0 and N? 
                        // Or just render them relative to the container if we had % positioning.
                        // For simplicity in this layout, let's just use flex-row with justify-between
                        // effectively spacing them out evenly which is a "good enough" V1 approximation 
                        // if the milestones are roughly equidistant. 

                        const isCompleted = m.status === 'completed';
                        const isToday = m.status === 'today';

                        return (
                            <div key={idx} className="flex flex-col items-center group">
                                {/* Dot */}
                                <div className={cn(
                                    "w-3 h-3 rounded-full border-2 z-10 bg-white mb-2 transition-colors",
                                    isCompleted ? "border-blue-500 bg-blue-500" :
                                        isToday ? "border-blue-500 bg-card" : "border-border bg-card"
                                )} />

                                {/* Label */}
                                <div className="text-center absolute top-5 w-32 -ml-0">
                                    <div className="text-xs font-bold text-foreground/80">{m.label}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                        {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {arc.todayStakes && (
                <div className="mt-8 pt-4 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Today's Stakes:</span>
                    {arc.todayStakes}
                </div>
            )}
        </div>
    );
}
