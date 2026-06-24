'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, ArrowRight, CheckCircle2, AlertCircle, Play, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// Define the FeedItem type locally matching API response
export type FeedItem =
    | { type: 'INTERVENTION'; id: string; title: string; evidence: string; action: string; meetingTime?: string; meetingTitle?: string }
    | { type: 'NUDGE'; id: string; capacity: string; evidenceObservation: string; actionSummary: string; actionBullets: string[]; status: string }
    | { type: 'CELEBRATION'; id: string; title: string; message: string; capacity: string; newScore: number };

interface FeedCardProps {
    item: FeedItem;
}

export function FeedCard({ item }: FeedCardProps) {
    const [isCommitting, setIsCommitting] = useState(false);
    const [status, setStatus] = useState(item.type === 'NUDGE' ? item.status : 'PENDING');

    // Handle styles based on type
    const styles = {
        INTERVENTION: { border: 'border-l-orange-500', badge: 'bg-orange-100 text-orange-800', icon: AlertCircle, iconColor: 'text-orange-600' },
        NUDGE: { border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-800', icon: Play, iconColor: 'text-yellow-600' },
        CELEBRATION: { border: 'border-l-green-500', badge: 'bg-green-100 text-green-800', icon: Trophy, iconColor: 'text-green-600' }
    }[item.type];

    const handleCommit = async () => {
        setIsCommitting(true);
        try {
            const res = await fetch(`/api/recommendations/${item.id}/commit`, { method: 'POST' });
            if (res.ok) {
                setStatus('COMMITTED');
            }
        } catch (error) {
            console.error('Failed to commit', error);
        } finally {
            setIsCommitting(false);
        }
    };

    // Render COMMITTED state
    if (status === 'COMMITTED') {
        return (
            <Card className="bg-muted border-border mb-4">
                <CardContent className="p-5 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                        <Badge variant="outline" className="mb-2 bg-green-50 text-green-700 border-green-200">Committed</Badge>
                        <p className="font-medium text-foreground">
                            You're practicing: {item.type === 'NUDGE' ? item.actionSummary : 'this action'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">We'll check in later to see how it went.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("overflow-hidden border-l-4 mb-6 shadow-sm hover:shadow-md transition-shadow", styles.border)}>
            {/* Context / Evidence Section */}
            <div className="bg-muted p-5 border-b border-border">
                <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className={cn("font-medium", styles.badge)}>
                        {item.type}
                    </Badge>
                    {(item.type === 'NUDGE' || item.type === 'CELEBRATION') && (
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide opacity-70">
                            • {item.capacity}
                        </span>
                    )}
                    {item.type === 'INTERVENTION' && item.meetingTime && (
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide opacity-70">
                            • {new Date(item.meetingTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                    )}
                </div>

                <div className="flex gap-3">
                    <styles.icon className={cn("h-5 w-5 shrink-0", styles.iconColor)} />
                    <div className="space-y-1">
                        {item.type === 'INTERVENTION' ? (
                            <>
                                <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                                <p className="text-sm text-muted-foreground">{item.evidence}</p>
                            </>
                        ) : item.type === 'NUDGE' ? (
                            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                                "{item.evidenceObservation}"
                            </p>
                        ) : (
                            // Celebration
                            <p className="text-sm text-muted-foreground">{item.message}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Section */}
            <CardContent className="p-5 pt-6">
                {item.type === 'CELEBRATION' ? (
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider mb-4">
                            New Milestone
                        </h4>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="text-3xl font-bold text-green-600">{item.newScore.toFixed(1)}</div>
                            <div className="h-2 flex-1 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${(item.newScore / 5) * 100}%` }} />
                            </div>
                        </div>
                        <Button className="w-full bg-foreground text-background" variant="outline">
                            View Progress
                        </Button>
                    </div>
                ) : (
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider mb-4">
                            <Target className="h-4 w-4 text-muted-foreground" />
                            Try This
                        </h4>

                        <div className="mb-6">
                            <p className="text-lg font-medium text-foreground mb-3">
                                {item.type === 'NUDGE' ? item.actionSummary : item.action}
                            </p>

                            {item.type === 'NUDGE' && item.actionBullets && (
                                <ul className="space-y-2">
                                    {item.actionBullets.map((bullet, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 mt-2 shrink-0" />
                                            {bullet}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            {/* Placeholder for Case Link */}
                            <div className="text-xs text-muted-foreground font-medium">

                            </div>

                            <Button
                                onClick={handleCommit}
                                disabled={isCommitting}
                                className={cn("min-w-[140px]",
                                    item.type === 'INTERVENTION' ? "bg-orange-600 hover:bg-orange-700" : "bg-foreground hover:bg-foreground/90 text-background"
                                )}
                            >
                                {isCommitting ? 'Committing...' : "I'll try this"}
                                <ArrowRight className="h-4 w-4 ml-2 opacity-80" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
