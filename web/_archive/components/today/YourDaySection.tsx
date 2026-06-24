'use client';

import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export interface DayMeeting {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    importance: 'high' | 'routine';
    needsPrep: boolean;
    status: 'upcoming' | 'prepped' | 'in_progress' | 'done';
}

interface YourDaySectionProps {
    meetings: DayMeeting[];
}

export function YourDaySection({ meetings }: YourDaySectionProps) {
    if (!meetings || meetings.length === 0) {
        return (
            <CollapsibleSection
                title="Your Day"
                collapsedContent={<span className="text-sm text-muted-foreground">No meetings scheduled</span>}
            >
                <div className="p-6 text-center text-muted-foreground text-sm">Clear schedule today.</div>
            </CollapsibleSection>
        );
    }

    const meetingCount = meetings.length;
    const prepCount = meetings.filter(m => m.needsPrep).length;

    // Collapsed Summary
    const summary = `${meetingCount} meetings${prepCount > 0 ? ` · ${prepCount} need prep` : ''}`;

    return (
        <CollapsibleSection
            title="Your Day"
            collapsedContent={<span className="text-sm font-medium text-foreground">{summary}</span>}
        >
            <div className="p-6 space-y-0">
                {meetings.map((meeting, idx) => (
                    <MeetingRow key={meeting.id} meeting={meeting} isLast={idx === meetings.length - 1} />
                ))}
            </div>
        </CollapsibleSection>
    );
}

function MeetingRow({ meeting, isLast }: { meeting: DayMeeting, isLast: boolean }) {
    const durationMinutes = (meeting.endTime.getTime() - meeting.startTime.getTime()) / (1000 * 60);
    // Visual proportion logic could go here, but fixed height is safer for now.

    const isHighStakes = meeting.importance === 'high';

    return (
        <div className={cn("flex gap-4 relative", isLast ? "" : "pb-6")}>
            {/* Timeline Line */}
            {!isLast && <div className="absolute left-[3.25rem] top-8 bottom-0 w-px bg-border" />}

            {/* Time Column */}
            <div className="w-12 text-right shrink-0 pt-1">
                <span className="text-xs font-bold text-muted-foreground">
                    {meeting.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' AM', 'a').replace(' PM', 'p')}
                </span>
            </div>

            {/* Visual Bar */}
            <div className={cn(
                "w-1.5 rounded-full shrink-0 mt-1.5 h-full min-h-[3rem]",
                isHighStakes ? "bg-foreground" : "bg-border"
            )} style={{
                height: Math.max(32, durationMinutes * 0.8) // roughly 1px per min scale?
            }} />

            {/* Content */}
            <div className="flex-1 pt-0.5 pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className={cn("text-sm font-semibold", isHighStakes ? "text-foreground" : "text-muted-foreground")}>
                            {meeting.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            {/* Shorten time range */}
                            {durationMinutes} min
                        </p>
                    </div>

                    {meeting.needsPrep && (
                        <Button size="sm" variant="ghost" className="text-amber-600 bg-amber-50 hover:bg-amber-100 h-7 text-xs px-2.5 ml-2">
                            ⚠ Prep <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
