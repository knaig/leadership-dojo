'use client';

import { motion } from 'framer-motion';
import SituationCard from '../shared/SituationCard';
import ResponseArea from '../shared/ResponseArea';

interface OpeningTemplateProps {
    roundType: string;
    situation: string;
    question: string;
    response: string;
    previousResponses: string[];
    isSubmitting: boolean;
    onResponseChange: (value: string) => void;
    onSubmit: () => void;
}

export default function OpeningTemplate({
    roundType,
    situation,
    question,
    response,
    previousResponses,
    isSubmitting,
    onResponseChange,
    onSubmit
}: OpeningTemplateProps) {
    return (
        <div className="h-full w-full grid grid-cols-1 lg:grid-cols-2">
            {/* Left: Situation Intelligence */}
            <div className="h-full p-6 lg:p-8 lg:border-r border-[#ffffff]/5">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="h-full"
                >
                    <SituationCard
                        roundType={roundType}
                        situation={situation}
                        previousResponses={previousResponses}
                    />
                </motion.div>
            </div>

            {/* Right: Action Area */}
            <div className="h-full p-6 lg:p-12 flex flex-col justify-center bg-[#0A0E14]">
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="w-full max-w-xl mx-auto flex flex-col h-[80vh]" // Constrain height to keep it focused
                >
                    <div className="mb-8">
                        <h2 className="text-[#3B82F6] text-xs font-bold uppercase tracking-widest mb-4">
                            Your Objective
                        </h2>
                        <h3 className="text-xl lg:text-3xl font-medium text-[#E6E8EB] leading-tight">
                            {question}
                        </h3>
                    </div>

                    <div className="flex-1 min-h-0">
                        <ResponseArea
                            value={response}
                            onChange={onResponseChange}
                            onSubmit={onSubmit}
                            isSubmitting={isSubmitting}
                        />
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
