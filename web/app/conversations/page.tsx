'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, MessageSquare, Clock, AlertCircle, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conversation {
    id: string;
    title: string;
    stakeholder?: { name: string; role?: string };
    scheduledAt?: string;
    status: 'NOT_STARTED' | 'PREPPING' | 'PREPPED' | 'COMPLETED';
    objective?: string;
    type: string;
}

export default function ConversationsPage() {
    const router = useRouter();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/conversations');
                const json = await res.json();
                if (json.conversations) {
                    setConversations(json.conversations);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const upcoming = conversations.filter(c =>
        c.scheduledAt && new Date(c.scheduledAt) > new Date() && c.status !== 'COMPLETED'
    );
    const needsPrep = upcoming.filter(c => c.status === 'NOT_STARTED');
    const past = conversations.filter(c => c.status === 'COMPLETED');

    const statusConfig = {
        NOT_STARTED: { label: 'Prep Now', color: 'text-amber-400', bg: 'bg-amber-500/10' },
        PREPPING: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-500/10' },
        READY: { label: 'Ready', color: 'text-green-400', bg: 'bg-green-500/10' },
        PREPPED: { label: 'Ready', color: 'text-green-400', bg: 'bg-green-500/10' },
        COMPLETED: { label: 'Done', color: 'text-zinc-400', bg: 'bg-zinc-700/50' }
    };

    return (
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-white">Conversations</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            Prepare for high-stakes meetings
                        </p>
                    </div>
                    <Button
                        onClick={() => router.push('/conversations/new')}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Prep
                    </Button>
                </div>

                {/* Alert: Needs Prep */}
                {needsPrep.length > 0 && (
                    <Card className="bg-amber-500/10 border-amber-500/30 mb-6">
                        <CardContent className="p-4 flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400" />
                            <span className="text-sm text-amber-300">
                                {needsPrep.length} conversation{needsPrep.length > 1 ? 's' : ''} need prep before they happen
                            </span>
                        </CardContent>
                    </Card>
                )}

                {isLoading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                        <Skeleton className="h-20 w-full bg-zinc-800" />
                    </div>
                ) : conversations.length === 0 ? (
                    <Card className="bg-zinc-900 border-zinc-800 border-dashed">
                        <CardContent className="p-12 text-center">
                            <MessageSquare className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white mb-2">No conversations yet</h3>
                            <p className="text-sm text-zinc-500 mb-4 max-w-sm mx-auto">
                                Add a meeting you want to prepare for. We'll help you craft your approach.
                            </p>
                            <Button
                                onClick={() => router.push('/conversations/new')}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" /> Add First Conversation
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {/* Upcoming */}
                        {upcoming.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Upcoming ({upcoming.length})
                                </h2>
                                <div className="space-y-2">
                                    {upcoming.map((conv) => (
                                        <ConversationRow
                                            key={conv.id}
                                            conversation={conv}
                                            onClick={() => router.push(`/conversations/${conv.id}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Past */}
                        {past.length > 0 && (
                            <section>
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                                    Completed ({past.length})
                                </h2>
                                <div className="space-y-2">
                                    {past.map((conv) => (
                                        <ConversationRow
                                            key={conv.id}
                                            conversation={conv}
                                            onClick={() => router.push(`/conversations/${conv.id}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

function ConversationRow({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
    const statusConfig = {
        NOT_STARTED: { label: 'Prep Now', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
        PREPPING: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock },
        READY: { label: 'Ready', color: 'text-green-400', bg: 'bg-green-500/10', icon: Check },
        PREPPED: { label: 'Ready', color: 'text-green-400', bg: 'bg-green-500/10', icon: Check },
        COMPLETED: { label: 'Done', color: 'text-zinc-400', bg: 'bg-zinc-700/50', icon: Check }
    };

    const config = statusConfig[conversation.status as keyof typeof statusConfig] || statusConfig.NOT_STARTED;
    const StatusIcon = config.icon;

    const scheduledDate = conversation.scheduledAt ? new Date(conversation.scheduledAt) : null;
    const isToday = scheduledDate?.toDateString() === new Date().toDateString();

    return (
        <Card
            className={cn(
                'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors',
                conversation.status === 'NOT_STARTED' && 'border-amber-500/30'
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            {scheduledDate && (
                                <span className={cn(
                                    'text-xs font-medium',
                                    isToday ? 'text-indigo-400' : 'text-zinc-500'
                                )}>
                                    {isToday ? 'Today' : scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    {' at '}
                                    {scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </span>
                            )}
                            <span className={cn('text-xs px-2 py-0.5 rounded-full', config.bg, config.color)}>
                                {config.label}
                            </span>
                        </div>
                        <h3 className="text-base font-medium text-white truncate">
                            {conversation.title}
                        </h3>
                        {conversation.stakeholder && (
                            <p className="text-sm text-zinc-500 truncate">
                                with {conversation.stakeholder.name}
                                {conversation.stakeholder.role && ` (${conversation.stakeholder.role})`}
                            </p>
                        )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-zinc-600 ml-3" />
                </div>
            </CardContent>
        </Card>
    );
}
