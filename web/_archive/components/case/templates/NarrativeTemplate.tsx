'use client';

import { motion } from 'framer-motion';
import SituationCard from '../shared/SituationCard';
import ResponseArea from '../shared/ResponseArea';

interface NarrativeTemplateProps {
    roundType: string;
    situation: string;
    question: string;
    response: string;
    previousResponses: string[];
    isSubmitting: boolean;
    onResponseChange: (value: string) => void;
    onSubmit: () => void;
}

export default function NarrativeTemplate({
    roundType,
    situation,
    question,
    response,
    previousResponses,
    isSubmitting,
    onResponseChange,
    onSubmit
}: NarrativeTemplateProps) {
    return (
        <div className="h-full w-full flex flex-col lg:flex-row">

            {/* Left Column: The Story so far (Narrative focus) */}
            <div className="flex-1 p-8 lg:p-16 flex flex-col justify-center bg-[#0A0E14] relative">
                <div className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/5 to-transparent pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1 }}
                    className="max-w-2xl mx-auto w-full"
                >
                    <h2 className="text-[#8B5CF6] text-xs font-bold uppercase tracking-widest mb-6">
                        Unfolding Narrative
                    </h2>
                    <div className="prose prose-invert prose-lg max-w-none">
                        <p className="font-serif text-2xl leading-relaxed text-[#E6E8EB] whitespace-pre-line">
                            {situation}
                        </p>
                    </div>
                </motion.div>
            </div>

            {/* Right Column: Communication/Framing Task */}
            <div className="lg:w-[450px] xl:w-[500px] border-l border-[#ffffff]/5 bg-[#0D1117] flex flex-col p-8 lg:p-10 shadow-2xl z-10">
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="h-full flex flex-col"
                >
                    <div className="mb-8">
                        <h3 className="text-[#9CA3AF] text-xs font-bold uppercase tracking-widest mb-4">
                            Communication Strategy
                        </h3>
                        <p className="text-lg font-medium text-white mb-2">
                            {question}
                        </p>
                        <p className="text-sm text-[#525252]">
                            Craft your message carefully. Words matter here.
                        </p>
                    </div>

                    <div className="flex-1">
                        <ResponseArea
                            value={response}
                            onChange={onResponseChange}
                            onSubmit={onSubmit}
                            isSubmitting={isSubmitting}
                            minChars={20} // Maybe shorter for framing tasks? Keeping 50 for consistency usually.
                        />
                    </div>
                </motion.div>
            </div>

        </div>
    );
}
