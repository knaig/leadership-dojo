import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';

// Mock types for now, replace with actual types later
interface Meeting {
    id: string;
    title: string;
    startTime: Date;
    endTime?: Date;
    riskLevel?: 'low' | 'medium' | 'high';
    prepReason?: string;
    suggestedCase?: {
        id: string;
        title: string;
    };
    meetingType?: string;
    attendees?: string[];
}

export function YourDayCard({ meetings }: { meetings: Meeting[] }) {
    if (!meetings || meetings.length === 0) {
        return (
            <Card className="bg-card border-border h-full">
                <CardHeader>
                    <CardTitle className="font-serif font-light text-foreground">Your Day</CardTitle>
                    <p className="text-muted-foreground text-sm">Schedule + suggested prep</p>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground italic">No meetings scheduled today.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card border-border h-full">
            <CardHeader>
                <CardTitle className="font-serif font-light text-foreground">Your Day</CardTitle>
                <p className="text-muted-foreground text-sm">Schedule + suggested prep</p>
            </CardHeader>
            <CardContent>
                <div className="space-y-0 pl-2">
                    {meetings.map((meeting, i) => (
                        <TimelineItem
                            key={meeting.id}
                            meeting={meeting}
                            isLast={i === meetings.length - 1}
                        />
                    ))}
                </div>
                <Link
                    href="/meetings"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 inline-block"
                >
                    View full gameplan →
                </Link>
            </CardContent>
        </Card>
    );
}

function TimelineItem({ meeting, isLast }: { meeting: Meeting; isLast: boolean }) {
    const riskColors = {
        low: 'bg-green-500/15 text-green-500',
        medium: 'bg-amber-500/15 text-amber-500',
        high: 'bg-red-500/15 text-red-500'
    };

    const riskEmoji = { low: '🟢', medium: '🟠', high: '🔴' };

    // Format time (e.g. 10:00 AM)
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <div className="flex gap-4 pb-6 relative group">
            {/* Timeline connector */}
            {!isLast && (
                <div className="absolute left-[17px] top-9 bottom-0 w-px bg-border group-last:hidden" />
            )}

            {/* Dot */}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs bg-secondary border border-border mt-0.5`}>
                {/* Using simple emoji for now, or could use Lucide icons */}
                {meeting.riskLevel === 'high' ? '🔴' : meeting.riskLevel === 'medium' ? '🟠' : '🟢'}
            </div>

            {/* Content */}
            <div className="flex-1 pt-1">
                <div className="flex justify-between items-start">
                    <div className="text-sm font-medium text-foreground">{meeting.title}</div>
                    <div className="text-xs font-mono text-muted-foreground">
                        {formatTime(meeting.startTime)}
                    </div>
                </div>

                <div className="text-xs text-muted-foreground mt-1">
                    {meeting.suggestedCase ? (
                        <div className="flex flex-col gap-1">
                            <span>{meeting.prepReason}</span>
                            <Link href={`/learning/case/${meeting.suggestedCase.id}`} className="text-accent hover:underline flex items-center gap-1">
                                Strategy: {meeting.suggestedCase.title} →
                            </Link>
                        </div>
                    ) : (
                        <span className="opacity-70">Routine — no prep needed</span>
                    )}
                </div>
            </div>
        </div>
    );
}
