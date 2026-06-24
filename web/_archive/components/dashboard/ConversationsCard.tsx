'use client';

import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Clock, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SyncedMeetingList } from './SyncedMeetingList';

interface Conversation {
    id: string;
    title: string;
    stakeholderName?: string;
    stakeholderRole?: string;
    scheduledAt?: Date;
    status: 'NOT_STARTED' | 'PREPPING' | 'PREPPED' | 'COMPLETED';
    objective?: string;
    stakes?: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface Meeting {
    id: string;
    title: string;
    startTime: Date;
    endTime?: Date;
    riskLevel?: 'low' | 'medium' | 'high';
    meetingType?: string;
    attendees?: string[];
}

interface ConversationsCardProps {
    conversations: Conversation[];
    upcomingMeetings?: Meeting[];
    onPrepClick?: (conversation: Conversation) => void;
    onMeetingSelect?: (meeting: Meeting) => void;
    onViewAll?: () => void;
}

export function ConversationsCard({
    conversations,
    upcomingMeetings = [],
    onPrepClick,
    onMeetingSelect,
    onViewAll
}: ConversationsCardProps) {
    const upcoming = conversations
        .filter(c => c.scheduledAt && new Date(c.scheduledAt) > new Date())
        .slice(0, 3);

    const needsPrep = upcoming.filter(c => c.status === 'NOT_STARTED' || c.status === 'PREPPING');

    if (upcoming.length === 0) {
        if (upcomingMeetings.length > 0 && onMeetingSelect) {
            return (
                <div className="space-y-4">
                    <SyncedMeetingList
                        meetings={upcomingMeetings}
                        onPrep={onMeetingSelect}
                    />
                </div>
            );
        }

        return (
            <Card className="bg-card border-border border-dashed">
                <CardContent className="p-6 text-center">
                    <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">No upcoming conversations</p>
                    <button className="text-sm text-primary hover:text-primary/80 font-medium">
                        Add a meeting to prep →
                    </button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Conversations
                    </h3>
                    {needsPrep.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-500">
                            <AlertCircle className="w-3 h-3" />
                            {needsPrep.length} need prep
                        </span>
                    )}
                </div>
                {onViewAll && (
                    <button
                        onClick={onViewAll}
                        className="text-xs text-primary hover:text-primary/80"
                    >
                        View all
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {upcoming.map((conv) => (
                    <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        onPrepClick={() => onPrepClick?.(conv)}
                    />
                ))}
            </div>

            {/* If we have space (less than 3 active), suggest upcoming */}
            {upcoming.length < 3 && upcomingMeetings.length > 0 && onMeetingSelect && (
                <div className="mt-4 pt-4 border-t border-border">
                    <SyncedMeetingList
                        meetings={upcomingMeetings.slice(0, 3 - upcoming.length)}
                        onPrep={onMeetingSelect}
                    />
                </div>
            )}
        </div>
    );
}

interface ConversationItemProps {
    conversation: Conversation;
    onPrepClick?: () => void;
}

function ConversationItem({ conversation, onPrepClick }: ConversationItemProps) {
    const statusConfig = {
        NOT_STARTED: { label: 'Prep Now', variant: 'default' as const },
        PREPPING: { label: 'Continue Prep', variant: 'outline' as const },
        READY: { label: 'Ready', variant: 'secondary' as const },
        PREPPED: { label: 'Ready', variant: 'secondary' as const },
        COMPLETED: { label: 'Done', variant: 'ghost' as const }
    };

    const config = statusConfig[conversation.status as keyof typeof statusConfig] || statusConfig.NOT_STARTED;
    const isToday = conversation.scheduledAt &&
        new Date(conversation.scheduledAt).toDateString() === new Date().toDateString();

    return (
        <Card className={cn(
            'bg-card/50 border-border hover:border-primary/30 transition-colors',
            conversation.status === 'NOT_STARTED' && conversation.stakes === 'HIGH' && 'border-amber-500/30'
        )}>
            <CardContent className="p-3">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {conversation.scheduledAt && (
                                <span className={cn(
                                    'text-xs font-medium',
                                    isToday ? 'text-primary' : 'text-muted-foreground'
                                )}>
                                    {isToday ? 'Today' : new Date(conversation.scheduledAt).toLocaleDateString('en-US', { weekday: 'short' })}
                                    {' '}
                                    {new Date(conversation.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </span>
                            )}
                            {conversation.stakes === 'HIGH' && (
                                <span className="text-xs text-amber-500 font-medium">High Stakes</span>
                            )}
                        </div>
                        <h4 className="text-sm font-medium text-foreground truncate">
                            {conversation.title}
                        </h4>
                        {conversation.stakeholderName && (
                            <p className="text-xs text-muted-foreground truncate">
                                with {conversation.stakeholderName}
                                {conversation.stakeholderRole && ` (${conversation.stakeholderRole})`}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 ml-3">
                        {conversation.status !== 'COMPLETED' && conversation.status !== 'PREPPED' ? (
                            <Button
                                size="sm"
                                variant={config.variant}
                                onClick={onPrepClick}
                                className="text-xs h-7"
                            >
                                {config.label}
                            </Button>
                        ) : (
                            <span className={cn(
                                'text-xs px-2 py-1 rounded',
                                conversation.status === 'PREPPED' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                            )}>
                                {config.label}
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
