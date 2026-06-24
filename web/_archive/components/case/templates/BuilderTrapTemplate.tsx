'use client';

import { motion } from 'framer-motion';
import SituationCard from '../shared/SituationCard';
import ResponseArea from '../shared/ResponseArea';

interface BuilderTrapTemplateProps {
    roundType: string;
    situation: string;
    question: string;
    response: string;
    previousResponses: string[];
    isSubmitting: boolean;
    onResponseChange: (value: string) => void;
    onSubmit: () => void;
}

export default function BuilderTrapTemplate({
    roundType,
    situation,
    question,
    response,
    previousResponses,
    isSubmitting,
    onResponseChange,
    onSubmit
}: BuilderTrapTemplateProps) {
    return (
        <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 bg-[#0A0E14] relative overflow-hidden">

            {/* Ambient Warning Glow */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-[#F59E0B]/5 to-transparent blur-3xl opacity-50" />
            </div>

            {/* Center Focused Layout */}
            <div className="lg:col-start-3 lg:col-span-8 h-full flex flex-col p-6 lg:p-8 relative z-10">

                {/* Top: Situation */}
                <div className="flex-1 min-h-0 mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="h-full"
                    >
                        <SituationCard
                            roundType={roundType}
                            situation={situation}
                            previousResponses={previousResponses}
                        />
                    </motion.div>
                </div>

                {/* Bottom: Action (Distinct "Decision Point" Look) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="shrink-0 bg-[#1A1F29] border border-[#F59E0B]/20 rounded-xl p-8 shadow-[0_0_50px_rgba(245,158,11,0.05)]"
                >
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        <div className="lg:w-1/3">
                            <h2 className="text-[#F59E0B] text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
                                Critical Decision
                            </h2>
                            <h3 className="text-xl font-medium text-[#E6E8EB] leading-snug">
                                {question}
                            </h3>
                        </div>

                        <div className="lg:w-2/3 w-full h-48">
                            <ResponseArea
                                value={response}
                                onChange={onResponseChange}
                                onSubmit={onSubmit}
                                isSubmitting={isSubmitting}
                                placeholder="What is your immediate move?"
                            />
                        </div>
                    </div>
                </motion.div>

            </div>
        </div>
    );
}
