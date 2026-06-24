"use client";

import { useState } from "react";
import { CaseData } from "@/types/case-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ContextSection } from "./ContextSection";
import { MentalModelSection } from "./MentalModelSection";
import { ChallengeSection } from "./ChallengeSection";
import { RevealSection } from "./RevealSection";
import { X, Play } from "lucide-react";
import { useRouter } from "next/navigation";

interface CaseModalProps {
    caseData: CaseData;
    isOpen: boolean;
    onClose: () => void;
}

export function CaseModal({ caseData, isOpen, onClose }: CaseModalProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showReveal, setShowReveal] = useState(false);
    const router = useRouter();

    const handleOptionSelect = (letter: string) => {
        setSelectedOption(letter);
        setShowReveal(true);
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-background border border-border rounded-2xl w-full max-w-[900px] max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header (Sticky) */}
                <div className="p-6 md:p-8 pb-6 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10 flex justify-between items-start">
                    <div>
                        <div className="flex gap-3 mb-4 flex-wrap">
                            <Badge variant="outline" className="border-accent text-accent bg-accent/10 hover:bg-accent/20 cursor-default">
                                {caseData.duration}
                            </Badge>
                            <Badge variant="outline" className="border-purple-500 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 cursor-default">
                                {caseData.category}
                            </Badge>
                            {caseData.relevantMeeting && (
                                <Badge variant="outline" className="border-red-500 text-red-400 bg-red-500/10 hover:bg-red-500/20 cursor-default">
                                    Prep for {formatTime(caseData.relevantMeeting.startTime)}
                                </Badge>
                            )}
                        </div>
                        <h2 className="text-2xl md:text-3xl font-serif font-light mb-2 text-foreground">{caseData.title}</h2>
                        <p className="text-muted-foreground text-sm md:text-base">{caseData.subtitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 md:p-8 space-y-8 flex-1">
                    {/* Section 1: Your Context */}
                    <ContextSection
                        meeting={caseData.relevantMeeting}
                        stakeholders={caseData.stakeholders}
                    />

                    {/* Section 2: Mental Model */}
                    <MentalModelSection model={caseData.mentalModel} />

                    {/* Section 3: Game Plan (Talking Points) - Inline for now or reuse component */}
                    <section>
                        <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                            💬 Talking Points
                        </h4>
                        <div className="grid gap-3">
                            {caseData.talkingPoints.map((tp, idx) => (
                                <div key={idx} className="bg-secondary p-4 rounded-lg border border-border">
                                    <div className="font-medium text-amber-500 mb-1">{tp.label}</div>
                                    <p className="text-sm text-muted-foreground">"{tp.script}"</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Section 4: Quantitative & Visual (Placeholder for MVP, easy to add) */}
                    {/* We can skip for exactly matching prompt logic which omits them in some views, but adds in others. 
              The prompt says "Multi-modal output", so let's render the diagram title at least if we can't do full chart.
           */}
                    {caseData.visualDiagram && (
                        <section>
                            <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                                🗺️ Strategy Map
                            </h4>
                            <div className="bg-card border border-border p-4 rounded-xl text-center text-sm text-muted-foreground min-h-[100px] flex items-center justify-center">
                                [Mermaid Chart: {caseData.visualDiagram.title}]
                            </div>
                        </section>
                    )}

                    {/* Section 5: The Challenge */}
                    <ChallengeSection
                        challenge={caseData.challenge}
                        selectedOption={selectedOption}
                        onSelect={handleOptionSelect}
                    />

                    {/* Section 7: The Reveal (hidden until option selected) */}
                    {showReveal && (
                        <RevealSection reveal={caseData.reveal} />
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-border flex gap-3 justify-end bg-background sticky bottom-0">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => router.push('/lab')}>
                        <Play className="w-4 h-4 mr-2" /> Match Practice
                    </Button>
                </div>
            </div>
        </div>
    );
}
