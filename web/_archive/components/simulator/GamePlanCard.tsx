
"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2, User, ChevronDown, ChevronUp, Lock, Unlock, BookOpen, Calculator, BarChart2 } from "lucide-react";
import mermaid from "mermaid";

interface GamePlanCardProps {
    plan: {
        identifiedStakeholders?: string[];
        strategy: string;
        talkingPoints: string[];
        selectedModel: {
            name: string;
            source: string;
            reason: string;
        };
        caseChallenge: {
            title: string;
            content: string;
        };
        caseSolution: {
            title: string;
            content: string;
        };
        quantitativeAnalysis: {
            title: string;
            content: string;
        };
        visualDiagram: {
            title: string;
            type: string;
            code: string;
        };
    };
}

export function GamePlanCard({ plan }: GamePlanCardProps) {
    const [reveal, setReveal] = useState(false);
    const mermaidRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (reveal && plan.visualDiagram?.code && mermaidRef.current) {
            mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
            mermaid.run({ nodes: [mermaidRef.current] });
        }
    }, [reveal, plan.visualDiagram]);

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

            {/* 1. Header & Stakeholders */}
            <div className="bg-primary/5 p-6 border-b border-border">
                <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                        {plan.identifiedStakeholders?.map((name, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-xs font-medium text-muted-foreground">
                                <User className="w-3 h-3" />
                                {name}
                            </span>
                        ))}
                    </div>
                    <div>
                        <span className="text-xs font-bold tracking-wider text-primary uppercase">The Approach</span>
                        <h3 className="text-2xl font-serif font-bold text-foreground mt-1 leading-tight">
                            {plan.strategy}
                        </h3>
                    </div>
                </div>
            </div>

            {/* 2. THE CHALLENGE (Problem Statement) */}
            <div className="p-6 bg-card border-b border-border">
                <div className="flex items-start gap-3">
                    <div className="bg-yellow-100 dark:bg-yellow-900 p-2 rounded-lg shrink-0">
                        <Lock className="w-5 h-5 text-yellow-700 dark:text-yellow-300" />
                    </div>
                    <div>
                        <h4 className="font-bold text-lg text-foreground mb-1">{plan.caseChallenge.title}</h4>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            {plan.caseChallenge.content}
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. REVEAL SECTION */}
            {!reveal ? (
                <div className="p-8 bg-muted/30 text-center">
                    <p className="text-sm text-muted-foreground mb-4 font-medium italic">
                        Take a moment. How would you handle this scenario?
                    </p>
                    <button
                        onClick={() => setReveal(true)}
                        className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-bold shadow-md hover:opacity-90 transition-all flex items-center gap-2 mx-auto"
                    >
                        <Unlock className="w-4 h-4" />
                        Reveal Strategic Unlock
                    </button>
                </div>
            ) : (
                <div className="animate-in fade-in duration-700">

                    {/* 4. THE SOLUTION & MENTAL MODEL */}
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border border-b border-border">
                        <div className="p-6 bg-card">
                            <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-primary" />
                                {plan.caseSolution.title}
                            </h4>
                            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line mb-4">
                                {plan.caseSolution.content}
                            </p>

                            {/* Citation */}
                            <div className="mt-4 p-3 bg-muted rounded-lg border border-border text-xs">
                                <span className="font-bold block text-foreground mb-1">Apply: {plan.selectedModel.name}</span>
                                <span className="text-muted-foreground block italic">"{plan.selectedModel.reason}"</span>
                                <span className="text-muted-foreground/60 block mt-1">— {plan.selectedModel.source}</span>
                            </div>
                        </div>

                        {/* 5. VISUAL DIAGRAM */}
                        <div className="p-6 bg-card flex flex-col items-center justify-center min-h-[300px]">
                            <h4 className="font-bold text-foreground mb-2 flex items-center gap-2 self-start">
                                <BarChart2 className="w-4 h-4 text-primary" />
                                {plan.visualDiagram.title}
                            </h4>
                            <div className="w-full flex-1 flex items-center justify-center bg-background/50 rounded-lg border border-border p-4 overflow-hidden">
                                <div className="mermaid text-xs" ref={mermaidRef}>
                                    {plan.visualDiagram.code}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 6. QUANTITATIVE & TACTICS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                        <div className="p-6 bg-card">
                            <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-green-500" />
                                {plan.quantitativeAnalysis.title}
                            </h4>
                            <div className="text-sm text-foreground/80 font-mono bg-muted/50 p-4 rounded-lg border border-border">
                                {plan.quantitativeAnalysis.content}
                            </div>
                        </div>

                        <div className="p-6 bg-card">
                            <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                Talking Points
                            </h4>
                            <ul className="space-y-3">
                                {plan.talkingPoints?.map((point, i) => (
                                    <li key={i} className="flex gap-3 text-sm text-foreground/90">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0"></span>
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
