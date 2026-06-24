'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, MessageSquare, Lightbulb, TrendingUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Observation {
    id: string;
    type: 'insight' | 'pattern' | 'suggestion' | 'warning';
    content: string;
    context?: string;
    timestamp?: Date;
}

interface ClarityAIPanelProps {
    observations: Observation[];
    clarityScore?: number; // 0-100
    onAskQuestion?: () => void;
}

export function ClarityAIPanel({ observations, clarityScore, onAskQuestion }: ClarityAIPanelProps) {
    const typeIcons = {
        insight: Lightbulb,
        pattern: TrendingUp,
        suggestion: Sparkles,
        warning: Sparkles
    };

    const typeColors = {
        insight: 'text-primary',
        pattern: 'text-purple-500',
        suggestion: 'text-amber-500',
        warning: 'text-red-500'
    };

    return (
        <Card className="bg-card border-border h-full">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base font-semibold">Leadership AI</CardTitle>
                    </div>
                    {clarityScore !== undefined && (
                        <ClarityMeter score={clarityScore} />
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Quick Input */}
                <button
                    onClick={onAskQuestion}
                    className={cn(
                        'w-full p-3 rounded-lg',
                        'bg-muted/50 hover:bg-muted border border-border hover:border-primary/30',
                        'flex items-center gap-3 transition-colors text-left'
                    )}
                >
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">What are you facing today?</span>
                </button>

                {/* Observations */}
                <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Context-Aware Insights
                    </h4>

                    {observations.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                            No insights yet. Connect your calendar to get contextual observations.
                        </p>
                    ) : (
                        observations.slice(0, 3).map((obs) => {
                            const Icon = typeIcons[obs.type];
                            return (
                                <div
                                    key={obs.id}
                                    className="p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/30 transition-colors"
                                >
                                    <div className="flex items-start gap-2">
                                        <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', typeColors[obs.type])} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-foreground">{obs.content}</p>
                                            {obs.context && (
                                                <p className="text-xs text-muted-foreground mt-1">{obs.context}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

interface ClarityMeterProps {
    score: number;
}

function ClarityMeter({ score }: ClarityMeterProps) {
    const label = score >= 70 ? 'Sharp' : score >= 40 ? 'Focused' : 'Fuzzy';
    const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Weekly</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all', color)}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
    );
}

