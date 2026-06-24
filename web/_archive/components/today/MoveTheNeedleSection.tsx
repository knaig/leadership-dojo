'use client';

import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { Target, Zap, Send, Rocket, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type NeedleMoverType = 'meeting_outcome' | 'unblock' | 'commitment' | 'strategic';

export interface NeedleMover {
    id: string;
    type: NeedleMoverType;
    headline: string;
    subline: string;
    whyItMatters: string;

    // Meeting details
    meeting?: {
        time: Date;
        attendees: string[];
        watchFor: string[];
        yourPlay: string[];
    };

    // Blocking details
    blocking?: {
        person: string;
        waitingDays: number;
    };

    status: 'pending' | 'prepped' | 'done';
}

interface MoveTheNeedleSectionProps {
    items: NeedleMover[];
}

export function MoveTheNeedleSection({ items }: MoveTheNeedleSectionProps) {
    // If no items, we could hide the section or show empty state
    if (!items || items.length === 0) return null;

    // Collapsed summary: Just show the headlines joined by middot
    const summaryLine = items.map(i => `${getIcon(i.type).emoji} ${i.headline}`).join(' · ');

    return (
        <CollapsibleSection
            title="Move the Needle Today"
            collapsedContent={
                <p className="text-sm font-medium text-foreground truncate">
                    {summaryLine}
                </p>
            }
        >
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30">
                {items.map(item => (
                    <NeedleMoverCard key={item.id} item={item} />
                ))}
            </div>
        </CollapsibleSection>
    );
}

function NeedleMoverCard({ item }: { item: NeedleMover }) {
    const iconData = getIcon(item.type);
    const Icon = iconData.icon;

    if (item.status === 'done' || item.status === 'prepped') {
        // Perhaps render completed state?
    }

    return (
        <div className="bg-card border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3 mb-4">
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", iconData.bg)}>
                    <Icon className={cn("h-4 w-4", iconData.color)} />
                </div>
                <div>
                    <h4 className="font-bold text-foreground text-sm">{item.headline.toUpperCase()}</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.subline}</p>
                </div>
            </div>

            {item.meeting ? (
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground border-l-2 border-border pl-3 italic">
                        "{item.whyItMatters}"
                    </p>

                    <div className="flex gap-2 mt-4">
                        <Button size="sm" variant="outline" className="w-full text-xs h-8">
                            See prep <ArrowRight className="h-3 w-3 ml-1.5 opacity-60" />
                        </Button>
                    </div>
                </div>
            ) : item.blocking ? (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded w-fit">
                        <AlertTriangle className="h-3 w-3" />
                        Waiting {item.blocking.waitingDays} days
                    </div>
                    <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                        {item.whyItMatters}
                    </p>
                    <Button size="sm" className="w-full text-xs h-8 bg-primary text-primary-foreground mt-2">
                        View & Unblock <ArrowRight className="h-3 w-3 ml-1.5 opacity-60" />
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{item.whyItMatters}</p>
                </div>
            )}
        </div>
    );
}

function getIcon(type: NeedleMoverType) {
    switch (type) {
        case 'meeting_outcome': return { icon: Target, emoji: '🎯', bg: 'bg-blue-100', color: 'text-blue-600' };
        case 'unblock': return { icon: Zap, emoji: '⚡', bg: 'bg-amber-100', color: 'text-amber-600' };
        case 'commitment': return { icon: Send, emoji: '📤', bg: 'bg-purple-100', color: 'text-purple-600' };
        case 'strategic': return { icon: Rocket, emoji: '🚀', bg: 'bg-green-100', color: 'text-green-600' };
    }
}
