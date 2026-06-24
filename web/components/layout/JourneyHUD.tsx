'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCourse } from '@/lib/course/CourseContext';

export default function JourneyHUD() {
    const [isOpen, setIsOpen] = useState(false);

    // Note: In real usage, this component needs to be wrapped in CourseProvider
    // We might mock/inject context if used inside a Case page that isn't server-rendered with the full tree.
    // For now, assume it's available or failing gracefully.

    return (
        <>
            {/* Toggle Tab */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed left-0 top-24 z-50 bg-[#0A0E14] border-r border-t border-b border-white/10 rounded-r-lg p-2 hover:bg-[#1F2937] transition-colors"
            >
                <svg className={`w-5 h-5 text-[#3B82F6] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
            </button>

            {/* Drawer */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed left-0 top-0 h-full w-80 bg-[#0A0E14]/95 backdrop-blur-xl border-r border-white/10 z-40 p-6 pt-24 shadow-2xl"
                    >
                        <h3 className="text-[#9CA3AF] text-xs font-bold uppercase tracking-widest mb-6">Course Progress</h3>

                        <div className="space-y-6">
                            {/* Current Context */}
                            <div className="p-4 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/20">
                                <div className="text-[#3B82F6] font-bold text-sm mb-1">Current Mission</div>
                                <div className="text-white font-serif">Papua New Guinea</div>
                                <div className="w-full bg-gray-700 h-1 mt-3 rounded-full overflow-hidden">
                                    <div className="bg-[#3B82F6] w-1/3 h-full" />
                                </div>
                                <div className="text-xs text-[#9CA3AF] mt-1 text-right">33% Complete</div>
                            </div>

                            {/* Next Up */}
                            <div>
                                <div className="text-[#9CA3AF] text-xs mb-2">Up Next</div>
                                <div className="flex items-center gap-3 opacity-50">
                                    <div className="w-8 h-8 rounded-full border border-gray-600 flex items-center justify-center text-xs">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                    <div className="text-sm">Brazil Case</div>
                                </div>
                            </div>

                            {/* Leaderboard Snippet (Social) */}
                            <div className="border-t border-white/10 pt-6">
                                <div className="text-[#9CA3AF] text-xs mb-3">Cohort Activity</div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 text-xs">
                                        <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">JD</div>
                                        <span className="text-gray-400">Jane completed PNG</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
