'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ArrowLeft, Sparkles, Target, MessageSquare, AlertTriangle,
    Check, ChevronDown, ChevronUp, Copy, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationPrep {
    id: string;
    title: string;
    type: string;
    objective?: string;
    scheduledAt?: string;
    status: string;
    stakeholder?: { name: string; role?: string };
    // Prep data
    primaryObjective?: string;
    secondaryObjectives?: string[];
    worstAcceptableOutcome?: string;
    openingHook?: string;
    keyMessages?: Array<{
        message: string;
        shortForm: string;
        supportingData?: string;
    }>;
    anticipatedObjections?: Array<{
        objection: string;
        shortForm: string;
        response: string;
        quickResponse: string;
        likelihood: string;
    }>;
    closingAction?: string;
    quickReference?: {
        objective: string;
        pivots: Record<string, string>;
        closeChecklist: string[];
        avoid: string[];
        use: string[];
    };
}

export default function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [conversation, setConversation] = useState<ConversationPrep | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showQuickRef, setShowQuickRef] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasGeneratedOnce = conversation?.status === 'READY';

    const triggerGeneration = async () => {
        setIsGenerating(true);
        setError(null);
        try {
            const res = await fetch(`/api/conversations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate-prep' })
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Failed to generate prep');
                return;
            }
            if (json.conversation) {
                setConversation(json.conversation);
            }
        } catch (e) {
            setError('Network error — please try again.');
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/conversations/${id}`);
                const json = await res.json();
                if (json.conversation) {
                    setConversation(json.conversation);
                    // Auto-trigger generation if prep hasn't been generated yet
                    if (json.conversation.status === 'PREPPING') {
                        setIsLoading(false);
                        setIsGenerating(true);
                        setError(null);
                        const genRes = await fetch(`/api/conversations/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'generate-prep' })
                        });
                        const genJson = await genRes.json();
                        if (!genRes.ok) {
                            setError(genJson.error || 'Failed to generate prep');
                        } else if (genJson.conversation) {
                            setConversation(genJson.conversation);
                        }
                        setIsGenerating(false);
                        return;
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                setIsGenerating(false);
            }
        };
        load();
    }, [id]);

    if (isLoading || (isGenerating && !hasGeneratedOnce)) {
        return (
            <AppShell>
                <div className="p-6 max-w-4xl mx-auto">
                    {isGenerating ? (
                        <div className="text-center py-16">
                            <Sparkles className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Generating Your Deep Prep...</h2>
                            <p className="text-sm text-muted-foreground">Analyzing meeting context, stakeholders, and preparing your game plan.</p>
                        </div>
                    ) : (
                        <>
                            <Skeleton className="h-8 w-48 mb-4" />
                            <Skeleton className="h-64 w-full" />
                        </>
                    )}
                </div>
            </AppShell>
        );
    }

    if (!conversation) {
        return (
            <AppShell>
                <div className="p-6 max-w-4xl mx-auto text-center">
                    <p className="text-muted-foreground">Conversation not found</p>
                    <Button onClick={() => router.push('/conversations')} className="mt-4">
                        Back to Conversations
                    </Button>
                </div>
            </AppShell>
        );
    }

    const hasPrep = conversation.status === 'READY';

    return (
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => router.push('/conversations')}
                        className="p-2 rounded-lg hover:bg-accent transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-semibold text-foreground">{conversation.title}</h1>
                        {conversation.stakeholder && (
                            <p className="text-sm text-muted-foreground">
                                with {conversation.stakeholder.name}
                                {conversation.stakeholder.role && ` (${conversation.stakeholder.role})`}
                            </p>
                        )}
                    </div>
                    {conversation.scheduledAt && (
                        <div className="text-right">
                            <p className="text-sm text-primary">
                                {new Date(conversation.scheduledAt).toLocaleDateString('en-US', {
                                    weekday: 'short', month: 'short', day: 'numeric'
                                })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {new Date(conversation.scheduledAt).toLocaleTimeString('en-US', {
                                    hour: 'numeric', minute: '2-digit'
                                })}
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <Card className="bg-destructive/10 border-destructive/30 mb-6">
                        <CardContent className="p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm text-destructive">{error}</p>
                                <Button
                                    onClick={triggerGeneration}
                                    disabled={isGenerating}
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10"
                                >
                                    Try Again
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {!hasPrep && !error ? (
                    /* No prep yet - show generation prompt */
                    <Card className="bg-card border-border">
                        <CardContent className="p-8 text-center">
                            <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Generate Your Prep</h2>
                            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                                We&apos;ll analyze your meetings, stakeholders, and goals to create
                                a tailored game plan for this conversation.
                            </p>
                            <div className="mb-6 text-left max-w-md mx-auto p-4 rounded-lg bg-secondary">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Objective</p>
                                <p className="text-sm text-foreground">{conversation.objective || conversation.primaryObjective || 'Not set'}</p>
                            </div>
                            <Button
                                onClick={triggerGeneration}
                                disabled={isGenerating}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[200px]"
                            >
                                {isGenerating ? (
                                    <>
                                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Generate Prep
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    /* Has prep - show full prep view */
                    <div className="space-y-6">
                        {/* Quick Reference Toggle */}
                        <Card
                            className={cn(
                                'bg-primary/10 border-primary/30 cursor-pointer transition-colors',
                                showQuickRef && 'bg-primary/20'
                            )}
                            onClick={() => setShowQuickRef(!showQuickRef)}
                        >
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Target className="w-5 h-5 text-primary" />
                                    <div>
                                        <p className="text-sm font-medium text-foreground">Quick Reference</p>
                                        <p className="text-xs text-primary">{conversation.quickReference?.objective}</p>
                                    </div>
                                </div>
                                {showQuickRef ? (
                                    <ChevronUp className="w-5 h-5 text-primary" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-primary" />
                                )}
                            </CardContent>
                            {showQuickRef && conversation.quickReference && (
                                <CardContent className="pt-0 px-4 pb-4">
                                    <QuickReferenceView quickRef={conversation.quickReference} />
                                </CardContent>
                            )}
                        </Card>

                        {/* Primary Objective */}
                        <Card className="bg-card border-border">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Target className="w-4 h-4" /> Primary Objective
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-lg font-medium text-foreground">{conversation.primaryObjective}</p>
                                {conversation.secondaryObjectives && conversation.secondaryObjectives.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-border">
                                        <p className="text-xs text-muted-foreground/70 mb-2">Secondary</p>
                                        <ul className="space-y-1">
                                            {conversation.secondaryObjectives.map((obj, i) => (
                                                <li key={i} className="text-sm text-muted-foreground">• {obj}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Opening Hook */}
                        {conversation.openingHook && (
                            <Card className="bg-card border-border">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-muted-foreground">Opening Hook</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-foreground/80 italic">"{conversation.openingHook}"</p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Key Messages */}
                        {conversation.keyMessages && conversation.keyMessages.length > 0 && (
                            <Card className="bg-card border-border">
                                <CardHeader>
                                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" /> Key Messages
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {conversation.keyMessages.map((msg, i) => (
                                        <div key={i} className="p-3 rounded-lg bg-secondary/50">
                                            <p className="text-sm text-foreground mb-2">{msg.message}</p>
                                            <div className="flex items-center gap-4 text-xs">
                                                <span className="text-primary">{msg.shortForm}</span>
                                                {msg.supportingData && (
                                                    <span className="text-muted-foreground/70">📊 {msg.supportingData}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Anticipated Objections */}
                        {conversation.anticipatedObjections && conversation.anticipatedObjections.length > 0 && (
                            <Card className="bg-card border-border">
                                <CardHeader>
                                    <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" /> Anticipated Objections
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {conversation.anticipatedObjections.map((obj, i) => (
                                        <ObjectionCard key={i} objection={obj} />
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {/* Closing Action */}
                        {conversation.closingAction && (
                            <Card className="bg-green-500/10 border-green-500/30">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm text-green-400 flex items-center gap-2">
                                        <Check className="w-4 h-4" /> Closing Action
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-foreground">{conversation.closingAction}</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}
            </div>
        </AppShell>
    );
}

function QuickReferenceView({ quickRef }: { quickRef: ConversationPrep['quickReference'] }) {
    if (!quickRef) return null;

    return (
        <div className="space-y-4 pt-4 border-t border-primary/20">
            {/* Pivots */}
            {quickRef.pivots && Object.keys(quickRef.pivots).length > 0 && (
                <div>
                    <p className="text-xs text-primary/80 uppercase mb-2">Pivots</p>
                    <div className="space-y-1">
                        {Object.entries(quickRef.pivots).map(([trigger, response]) => (
                            <div key={trigger} className="flex items-center gap-2 text-sm">
                                <span className="text-amber-400">"{trigger}"</span>
                                <span className="text-muted-foreground/70">→</span>
                                <span className="text-foreground">{response}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Close Checklist */}
            {quickRef.closeChecklist && quickRef.closeChecklist.length > 0 && (
                <div>
                    <p className="text-xs text-primary/80 uppercase mb-2">Close Checklist</p>
                    <ul className="space-y-1">
                        {quickRef.closeChecklist.map((item, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                                <span className="w-4 h-4 rounded border border-border flex-shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Avoid / Use */}
            <div className="grid grid-cols-2 gap-4">
                {quickRef.avoid && quickRef.avoid.length > 0 && (
                    <div>
                        <p className="text-xs text-red-400 uppercase mb-2">⚠️ Avoid</p>
                        <ul className="space-y-1">
                            {quickRef.avoid.map((item, i) => (
                                <li key={i} className="text-xs text-muted-foreground">{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
                {quickRef.use && quickRef.use.length > 0 && (
                    <div>
                        <p className="text-xs text-green-400 uppercase mb-2">✓ Use</p>
                        <ul className="space-y-1">
                            {quickRef.use.map((item, i) => (
                                <li key={i} className="text-xs text-muted-foreground">{item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function ObjectionCard({ objection }: { objection: NonNullable<ConversationPrep['anticipatedObjections']>[0] }) {
    const [expanded, setExpanded] = useState(false);

    const likelihoodColors = {
        VERY_LIKELY: 'text-red-400',
        POSSIBLE: 'text-amber-400',
        UNLIKELY: 'text-muted-foreground/70'
    };

    return (
        <div
            className="p-3 rounded-lg bg-secondary/50 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-amber-400 font-medium">"{objection.shortForm}"</span>
                <span className={cn('text-xs', likelihoodColors[objection.likelihood as keyof typeof likelihoodColors] || 'text-muted-foreground/70')}>
                    {objection.likelihood?.replace('_', ' ')}
                </span>
            </div>
            <p className="text-sm text-muted-foreground">{objection.objection}</p>

            {expanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div>
                        <p className="text-xs text-muted-foreground/70">Quick Response:</p>
                        <p className="text-sm text-green-400">"{objection.quickResponse}"</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground/70">Full Response:</p>
                        <p className="text-sm text-foreground/80">{objection.response}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
