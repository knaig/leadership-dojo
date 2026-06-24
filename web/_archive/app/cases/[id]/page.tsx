'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadCaseById } from '@/lib/cases/loader';
import type { Case } from '@/lib/cases/types';

import CaseLayout from '@/components/case/CaseLayout';
import IntroTemplate from '@/components/case/templates/IntroTemplate';
import OpeningTemplate from '@/components/case/templates/OpeningTemplate';
import BuilderTrapTemplate from '@/components/case/templates/BuilderTrapTemplate';
import NarrativeTemplate from '@/components/case/templates/NarrativeTemplate';
import OutcomeTemplate from '@/components/case/templates/OutcomeTemplate';

export default function CasePage() {
    const params = useParams();
    const router = useRouter();
    const [caseData, setCaseData] = useState<Case | null>(null);
    const [currentRound, setCurrentRound] = useState(0);
    const [response, setResponse] = useState('');
    const [responses, setResponses] = useState<string[]>([]);
    const [layoutState, setLayoutState] = useState<'intro' | 'round' | 'outcome'>('intro');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        if (params.id) {
            const data = loadCaseById(params.id as string);
            setCaseData(data || null);
        }
    }, [params.id]);

    if (!caseData) return <div className="h-screen bg-[#0A0E14] flex items-center justify-center text-[#525252]">INITIALIZING SECURE CONNECTION...</div>;

    const handleStart = () => {
        setLayoutState('round');
    };

    const handleSubmit = async () => {
        if (response.trim().length < 20) return; // Lower threshold as some framing tasks might be short

        setIsAnalyzing(true);
        // Simulate analysis pattern
        await new Promise(resolve => setTimeout(resolve, 2000));

        const newResponses = [...responses, response];
        setResponses(newResponses);
        setResponse('');
        setIsAnalyzing(false);

        if (currentRound < caseData.rounds.length - 1) {
            setCurrentRound(currentRound + 1);
        } else {
            setLayoutState('outcome');
        }
    };

    // Render Logic ==========================================

    // 1. INTRO
    if (layoutState === 'intro') {
        return (
            <CaseLayout country={caseData.country} title={caseData.title} isIntro={true}>
                <IntroTemplate
                    country={caseData.country}
                    title={caseData.title}
                    context={caseData.context}
                    onStart={handleStart}
                />
            </CaseLayout>
        );
    }

    // 2. OUTCOME
    if (layoutState === 'outcome') {
        return (
            <CaseLayout country={caseData.country} title={caseData.title} isIntro={true}>
                <OutcomeTemplate
                    caseId={caseData.id}
                    coachingData={{}}
                    responses={responses}
                />
            </CaseLayout>
        );
    }

    // 3. ROUNDS
    const round = caseData.rounds[currentRound];

    // Select Template based on Round Type
    let TemplateComponent = OpeningTemplate; // Default

    switch (round.type) {
        case 'builder_trap':
        case 'legitimacy_challenge':
            TemplateComponent = BuilderTrapTemplate;
            break;
        case 'narrative_moment':
            TemplateComponent = NarrativeTemplate;
            break;
        case 'opening':
        case 'response_analysis':
        default:
            TemplateComponent = OpeningTemplate;
            break;
    }

    return (
        <CaseLayout
            country={caseData.country}
            title={caseData.title}
            roundNumber={currentRound + 1}
            totalRounds={caseData.rounds.length}
            roundType={round.type}
        >
            {isAnalyzing ? (
                <div className="h-full w-full flex flex-col items-center justify-center bg-[#0A0E14]">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 border-4 border-[#3B82F6]/20 border-t-[#3B82F6] rounded-full animate-spin" />
                        <span className="text-xs font-bold tracking-[0.2em] text-[#525252] animate-pulse">ANALYZING DECISION MATRIX</span>
                    </div>
                </div>
            ) : (
                <TemplateComponent
                    roundType={round.type}
                    situation={round.situation}
                    question={round.prompt}
                    response={response}
                    previousResponses={responses}
                    isSubmitting={isAnalyzing}
                    onResponseChange={setResponse}
                    onSubmit={handleSubmit}
                />
            )}
        </CaseLayout>
    );
}
