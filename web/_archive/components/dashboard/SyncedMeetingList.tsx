'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, ArrowRight, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Meeting {
    id: string;
    title: string;
    startTime: Date;
    endTime?: Date;
    riskLevel?: 'high' | 'medium' | 'low';
    meetingType?: string;
    attendees?: string[];
}

interface SyncedMeetingListProps {
    meetings: Meeting[];
    onPrep: (meeting: Meeting) => void;
}

export function SyncedMeetingList({ meetings, onPrep }: SyncedMeetingListProps) {
    if (!meetings || meetings.length === 0) return null;

    // Filter for future meetings only
    const upcoming = meetings.filter(m => new Date(m.startTime) > new Date());

    if (upcoming.length === 0) return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Select a meeting to prep
            </h3>

            <div className="space-y-2">
                {upcoming.slice(0, 5).map(meeting => (
                    <MeetingItem
                        key={meeting.id}
                        meeting={meeting}
                        onPrep={() => onPrep(meeting)}
                    />
                ))}
            </div>
        </div>
    );
}

function MeetingItem({ meeting, onPrep }: { meeting: Meeting, onPrep: () => void }) {
    const isHighStakes = meeting.riskLevel === 'high';
    const startTime = new Date(meeting.startTime);
    const isToday = new Date().toDateString() === startTime.toDateString();

    return (
        <Card className={cn(
            "bg-card/50 border-border hover:border-primary/30 transition-all",
            isHighStakes && "border-amber-500/20 bg-amber-500/5"
        )}>
            <CardContent className="p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                            "text-xs font-medium",
                            isToday ? "text-primary" : "text-muted-foreground"
                        )}>
                            {isToday ? "Today" : startTime.toLocaleDateString(undefined, { weekday: 'short' })}
                            {' • '}
                            {startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>

                        {isHighStakes && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/50 text-amber-500">
                                High Stakes
                            </Badge>
                        )}

                        {meeting.meetingType && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1 capitalize">
                                {meeting.meetingType}
                            </Badge>
                        )}
                    </div>

                    <h4 className="text-sm font-medium text-foreground truncate">
                        {meeting.title}
                    </h4>

                    <div className="flex items-center gap-2 mt-1">
                        {meeting.attendees && meeting.attendees.length > 0 && (
                            <div className="flex items-center text-xs text-muted-foreground truncate">
                                <User className="w-3 h-3 mr-1" />
                                {meeting.attendees.length} attendee{meeting.attendees.length !== 1 && 's'}
                            </div>
                        )}
                    </div>
                </div>

                <Button size="sm" onClick={onPrep} className="shrink-0 h-8 text-xs">
                    Prep
                    <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
            </CardContent>
        </Card>
    );
}
