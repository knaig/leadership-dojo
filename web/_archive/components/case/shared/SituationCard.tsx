'use client';

import { motion } from 'framer-motion';

interface SituationCardProps {
    roundType: string;
    situation: string;
    previousResponses?: string[];
}

export default function SituationCard({
    roundType,
    situation,
    previousResponses = []
}: SituationCardProps) {

    // Dynamic border color based on round type
    const getAccentColor = () => {
        switch (roundType) {
            case 'builder_trap': return '#F59E0B'; // Warning Amber
            case 'legitimacy_challenge': return '#EF4444'; // Danger Red
            case 'narrative_moment': return '#8B5CF6'; // Story Purple
            default: return '#3B82F6'; // Info Blue
        }
    };

    const accentColor = getAccentColor();

    return (
        <div className="h-full flex flex-col relative">
            {/* Label */}
            <h2 className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2"
                style={{ color: accentColor }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                Incoming Intelligence
            </h2>

            {/* Main Card */}
            <div
                className="flex-1 overflow-y-auto custom-scrollbar bg-[#1A1F29]/30 border rounded-xl p-8 lg:p-10 relative overflow-hidden group"
                style={{ borderColor: `${accentColor}30` }} // 30 is hex opacity
            >
                {/* Decorative background flash */}
                <div
                    className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none"
                />

                <p className="text-xl lg:text-2xl font-serif text-[#E6E8EB] leading-relaxed whitespace-pre-line relative z-10">
                    {situation}
                </p>

                {/* History Snippet if available */}
                {previousResponses.length > 0 && (
                    <div className="mt-12 pt-8 border-t border-[#ffffff]/5">
                        <h3 className="text-[10px] font-bold text-[#525252] uppercase tracking-[0.2em] mb-4">
                            Previous Action
                        </h3>
                        <p className="text-sm text-[#9CA3AF]/70 italic line-clamp-3 pl-4 border-l border-[#ffffff]/10">
                            "{previousResponses[previousResponses.length - 1]}"
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
