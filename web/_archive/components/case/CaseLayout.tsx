'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CaseLayoutProps {
    children: ReactNode;
    country: string;
    title: string;
    roundNumber?: number;
    totalRounds?: number;
    roundType?: string;
    isIntro?: boolean;
}

import JourneyHUD from '../layout/JourneyHUD';

export default function CaseLayout({
    children,
    country,
    title,
    roundNumber,
    totalRounds,
    roundType,
    isIntro = false
}: CaseLayoutProps) {
    return (
        <div className="h-screen w-full bg-[#1a1a1a] text-[#e8e3d8] overflow-hidden flex flex-col relative selection:bg-[#D4A574] selection:text-[#1a1a1a]">

            {/* Journey HUD (Persistent Navigation) */}
            <JourneyHUD />

            {/* Dynamic Background Effects */}
            <div className="absolute inset-0 pointer-events-none z-0">
                {/* Subtle gradient blob in top right */}
                <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-[#D4A574]/5 rounded-full blur-[120px]" />
                {/* Subtle gradient blob in bottom left */}
                <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#8B9D83]/5 rounded-full blur-[100px]" />
            </div>

            {/* Header */}
            <header className="shrink-0 h-16 border-b border-[#2a2a2a] flex items-center justify-between px-6 lg:px-12 z-20 backdrop-blur-sm bg-[#1a1a1a]/80">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-xs mono tracking-widest text-[#6a6558]">CASE STUDY</span>
                        <span className="text-sm font-light tracking-wide text-[#e8e3d8]">{country.toUpperCase()}</span>
                    </div>

                    {!isIntro && roundNumber && totalRounds && (
                        <>
                            <div className="h-8 w-px bg-[#2a2a2a]" />
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded bg-[#2a2a2a] border border-[#3a3a3a] text-[10px] mono text-[#a09588] tracking-wider">
                                    ROUND {roundNumber} / {totalRounds}
                                </span>
                                {roundType && (
                                    <span className="text-xs font-light text-[#D4A574] tracking-wide">
                                        {roundType.replace(/_/g, ' ').toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="text-[10px] mono tracking-[0.2em] text-[#6a6558]">
                    COSS \ LEADERSHIP
                </div>
            </header>

            {/* Main Viewport */}
            <main className="flex-1 relative z-10 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
