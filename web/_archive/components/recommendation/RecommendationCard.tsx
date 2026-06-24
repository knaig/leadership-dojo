
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertCircle,
    CheckCircle2,
    ArrowRight,
    BookOpen,
    Target,
    BarChart3,
    Bell,
    Trophy
} from 'lucide-react';
import { cn } from '@/lib/utils';
// We'll define a local interface that matches the Prisma shape we expect from API
// to avoid strict dependency on generated client in client components if possible, 
// but importing from @prisma/client is fine for types usually.
import { FeedbackType, RecommendationStatus } from '@prisma/client';

interface RecommendationProp {
    id: string;
    type: FeedbackType;
    capacity: string;
    status: RecommendationStatus;

    evidenceObservation: string | null;
    evidenceBenchmark: string | null;

    actionSummary: string;
    actionBullets: any; // Mapped to Json in Prisma

    relatedCase?: {
        id: string;
        title: string;
    } | null;

    targetMeetingId?: string | null;
}

const typeConfig = {
    INTERVENTION: { icon: AlertCircle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', label: 'Action Needed' },
    NUDGE: { icon: Bell, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', label: 'Nudge' },
    OBSERVATION: { icon: BarChart3, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', label: 'Observation' },
    CELEBRATION: { icon: Trophy, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', label: 'Achievement' },
    // Fallbacks
    WEEKLY_DIGEST: { icon: BookOpen, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', label: 'Digest' },
};

export function RecommendationCard({ recommendation }: { recommendation: RecommendationProp }) {
    const [isCommitting, setIsCommitting] = useState(false);
    const [status, setStatus] = useState(recommendation.status);

    const config = typeConfig[recommendation.type] || typeConfig['NUDGE'];
    const Icon = config.icon;

    const handleCommit = async () => {
        setIsCommitting(true);
        try {
            const res = await fetch(`/api/recommendations/${recommendation.id}/commit`, {
                method: 'POST'
            });
            if (res.ok) {
                setStatus('COMMITTED');
            }
        } catch (error) {
            console.error('Failed to commit:', error);
        } finally {
            setIsCommitting(false);
        }
    };

    if (status === 'COMMITTED') {
        return (
            <Card className="bg-muted border-border overflow-hidden transition-all duration-300">
                <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                            </div>
                            <div>
                                <Badge variant="outline" className="mb-2 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20">
                                    Committed
                                </Badge>
                                <h3 className="font-medium text-foreground">
                                    You're practicing: {recommendation.actionSummary}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    We'll check in with you later to see how it went.
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("overflow-hidden transition-all duration-300 hover:shadow-md border-l-4", config.border,
            recommendation.type === 'INTERVENTION' ? 'shadow-sm' : ''
        )}>
            {/* Header / Evidence Section */}
            <div className={cn("p-5 border-b", config.bg, config.border)}>
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("bg-card/80 backdrop-blur-sm border-0 shadow-sm font-medium", config.color)}>
                            {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide opacity-60">
                            • {recommendation.capacity}
                        </span>
                    </div>
                    {/* Optional: Dismiss button could go here */}
                </div>

                <div className="flex gap-4">
                    <div className="mt-1">
                        <Icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <div className="flex-1 space-y-2">
                        {recommendation.evidenceObservation && (
                            <p className="text-sm text-foreground/90 leading-relaxed font-medium">
                                {recommendation.evidenceObservation}
                            </p>
                        )}
                        {recommendation.evidenceBenchmark && (
                            <p className="text-xs text-muted-foreground italic">
                                {recommendation.evidenceBenchmark}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Section */}
            <CardContent className="p-5 pt-6 bg-card">
                <div className="mb-6">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider mb-4">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        Try This
                    </h4>

                    <div className="space-y-4">
                        <p className="text-lg font-medium text-foreground">
                            {recommendation.actionSummary}
                        </p>

                        {recommendation.actionBullets && Array.isArray(recommendation.actionBullets) && (
                            <ul className="space-y-2.5">
                                {(recommendation.actionBullets as string[]).map((bullet, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-muted-foreground text-sm">
                                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mt-2 shrink-0" />
                                        <span>{bullet}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Footer / CTA */}
                <div className="flex items-center justify-between gap-4 pt-2">
                    {recommendation.relatedCase ? (
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Want to go deeper?</p>
                            <a href={`/cases/${recommendation.relatedCase.id}`} className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 truncate">
                                <BookOpen className="h-3.5 w-3.5" />
                                {recommendation.relatedCase.title}
                            </a>
                        </div>
                    ) : (
                        <div className="flex-1" /> // Spacer
                    )}

                    <Button
                        onClick={handleCommit}
                        disabled={isCommitting}
                        className={cn("shadow-sm min-w-[140px]",
                            recommendation.type === 'INTERVENTION'
                                ? "bg-orange-600 hover:bg-orange-700 text-white"
                                : "bg-foreground hover:bg-foreground/90 text-background"
                        )}
                    >
                        {isCommitting ? 'Committing...' : "I'll try this"}
                        <ArrowRight className="h-4 w-4 ml-2 opacity-90" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
