'use client';

import { ReactNode } from 'react';

interface ResponseAreaProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    minChars?: number;
    isSubmitting?: boolean;
}

export default function ResponseArea({
    value,
    onChange,
    onSubmit,
    placeholder = "Type your response...",
    minChars = 50,
    isSubmitting = false
}: ResponseAreaProps) {
    const isValid = value.trim().length >= minChars;
    const charsLeft = Math.max(0, minChars - value.trim().length);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 relative group">
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={isSubmitting}
                    className="w-full h-full bg-[#1A1F29]/50 border border-[#ffffff]/10 rounded-xl p-6 text-lg text-[#E6E8EB] placeholder-[#9CA3AF]/50 focus:outline-none focus:border-[#3B82F6]/50 focus:bg-[#1A1F29] focus:ring-4 focus:ring-[#3B82F6]/5 transition-all resize-none leading-relaxed"
                    autoFocus
                />
                {/* Subtle glow effect on focus handled by ring */}
            </div>

            <div className="mt-4 flex items-center justify-between shrink-0 h-12">
                <div className={`text-xs font-medium transition-colors duration-300 ${isValid ? 'text-[#10B981]' : 'text-[#525252]'
                    }`}>
                    {isValid ? (
                        <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                            Response length adequate
                        </span>
                    ) : (
                        <span>{charsLeft} more characters needed</span>
                    )}
                </div>

                <button
                    onClick={onSubmit}
                    disabled={!isValid || isSubmitting}
                    className={`
            px-8 h-12 rounded-lg font-bold text-sm tracking-wide transition-all duration-300
            ${isValid && !isSubmitting
                            ? 'bg-[#E6E8EB] text-[#0A0E14] hover:bg-white hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                            : 'bg-[#2A2F39] text-[#525252] cursor-not-allowed opacity-50'}
          `}
                >
                    {isSubmitting ? 'ANALYZING...' : 'SUBMIT ACTION'}
                </button>
            </div>
        </div>
    );
}
