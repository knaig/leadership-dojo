'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface CollapsibleSectionProps {
    title: string;
    isExpanded?: boolean;
    defaultOpen?: boolean;
    onToggle?: () => void;
    collapsedContent?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    headerRight?: React.ReactNode;
}

export function CollapsibleSection({
    title,
    isExpanded: controlledExpanded,
    defaultOpen,
    onToggle,
    collapsedContent,
    children,
    className,
    headerRight
}: CollapsibleSectionProps) {
    const [internalExpanded, setInternalExpanded] = useState(defaultOpen ?? false);

    const isExpanded = controlledExpanded ?? internalExpanded;
    const toggle = onToggle ?? (() => setInternalExpanded(!isExpanded));

    return (
        <div className={cn("border border-border rounded-lg bg-card overflow-hidden transition-all duration-200 shadow-sm", className)}>
            {/* Header / Collapsed State */}
            <div
                className={cn(
                    "p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors",
                    isExpanded ? "border-b border-border" : ""
                )}
                onClick={toggle}
            >
                <div className="flex items-center gap-4 flex-1 overflow-hidden">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0 w-32 md:w-48">
                        {title}
                    </h3>

                    {!isExpanded && collapsedContent && (
                        <div className="flex-1 overflow-hidden">
                            {collapsedContent}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 pl-4 shrink-0">
                    {headerRight}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full text-muted-foreground">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}
