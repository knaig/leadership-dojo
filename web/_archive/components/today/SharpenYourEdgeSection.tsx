'use client';

import React, { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SkillCardData {
    id: string;
    name: string;
    insight: string;
    theMove: string;
    whyItWorks: string;
    whenToUse: string;
    readTime: string;
    useIn?: string;
    source?: {
        type: string;
        title: string;
    };
    case?: {
        title: string;
        readTime: string;
        situation: string;
        theMiss: string;
        theFix: string;
        principle: string;
    };
    status: 'pending' | 'committed' | 'tried' | 'skipped';
}

interface SharpenYourEdgeSectionProps {
    skill: SkillCardData | null;
}

export function SharpenYourEdgeSection({ skill }: SharpenYourEdgeSectionProps) {
    const [isCommitted, setIsCommitted] = useState(skill?.status === 'committed');
    const [isCaseExpanded, setIsCaseExpanded] = useState(false);

    if (!skill) return null;

    const handleCommit = async () => {
        setIsCommitted(true);
        // Call API in real impl
    };

    return (
        <CollapsibleSection
            title="Sharpen Your Edge"
            collapsedContent={
                <div className="flex justify-between items-center w-full pr-4">
                    <span className="text-sm font-medium text-foreground truncate">
                        {skill.name} · {skill.readTime}
                        {skill.useIn && <span className="text-muted-foreground font-normal ml-1">· Use in {skill.useIn}</span>}
                    </span>
                </div>
            }
        >
            <div className="p-6 pt-2 bg-muted/30">
                <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
                    {/* Header */}
                    <div className="mb-6">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-foreground tracking-tight uppercase">{skill.name}</h3>
                            <span className="text-xs font-medium text-muted-foreground border border-border px-2 py-0.5 rounded">{skill.readTime}</span>
                        </div>
                        <div className="h-px w-full bg-border mb-4" />

                        {skill.source && (
                            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded w-fit">
                                <span className="uppercase font-bold tracking-wider opacity-70">Context:</span>
                                <span className="font-medium text-foreground truncate max-w-[300px]">{skill.source.title}</span>
                            </div>
                        )}

                        <p className="text-muted-foreground italic font-medium mb-6">"{skill.insight}"</p>

                        <div className="bg-muted p-4 rounded-md border border-border mb-6">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">The Move</h4>
                            <p className="text-foreground font-medium text-lg leading-relaxed">
                                {skill.theMove}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="font-semibold text-foreground">Why it works:</span>
                                <span className="text-muted-foreground ml-1">{skill.whyItWorks}</span>
                            </div>
                            <div>
                                <span className="font-semibold text-foreground">When to use:</span>
                                <span className="text-muted-foreground ml-1">{skill.whenToUse}</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-border dashed">
                        {skill.case && (
                            <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-foreground p-0 h-auto font-normal text-sm"
                                onClick={() => setIsCaseExpanded(!isCaseExpanded)}
                            >
                                <BookOpen className="h-4 w-4 mr-2" />
                                {isCaseExpanded ? 'Hide case' : `Go deeper: "${skill.case.title}" · ${skill.case.readTime}`}
                            </Button>
                        )}

                        <Button
                            onClick={handleCommit}
                            disabled={isCommitted}
                            className={cn(
                                "min-w-[160px]",
                                isCommitted ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 border border-green-200 dark:border-green-800" : "bg-primary text-primary-foreground hover:opacity-90"
                            )}
                        >
                            {isCommitted ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-2" /> Committed
                                </>
                            ) : (
                                <>
                                    I'll try this <ArrowRight className="h-4 w-4 ml-2 opacity-80" />
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Case Expansion */}
                    {isCaseExpanded && skill.case && (
                        <div className="mt-6 pt-6 border-t border-border animate-in slide-in-from-top-2">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground mb-4">
                                <BookOpen className="h-4 w-4" />
                                {skill.case.title}
                            </h4>

                            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                                <div>
                                    <strong className="text-foreground block mb-1">THE SITUATION</strong>
                                    {skill.case.situation}
                                </div>
                                <div className="pl-3 border-l-2 border-red-200 dark:border-red-900">
                                    <strong className="text-red-700 dark:text-red-400 block mb-1">THE MISS</strong>
                                    {skill.case.theMiss}
                                </div>
                                <div className="pl-3 border-l-2 border-green-200 dark:border-green-900">
                                    <strong className="text-green-700 dark:text-green-400 block mb-1">THE FIX</strong>
                                    {skill.case.theFix}
                                </div>
                                <div className="bg-muted p-3 rounded">
                                    <strong className="text-foreground">THE PRINCIPLE:</strong> {skill.case.principle}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </CollapsibleSection>
    );
}
