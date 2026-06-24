'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import CourseLayout from '@/components/layout/CourseLayout';

type CoachingDashboardProps = {
    caseData: {
        title: string;
        id: string;
    };
};

export default function CoachingDashboard({ caseData }: CoachingDashboardProps) {
    return (
        <CourseLayout>
            <div className="min-h-screen text-[#E6E8EB] p-8">
                {/* Header Widget */}
                <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
                    <div>
                        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white mb-2 block transition-colors">← Back to Dashboard</Link>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Post-Mortem Analysis</h1>
                        <p className="text-gray-400">Case: <span className="text-white font-serif">{caseData.title}</span></p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-[#111827] border border-white/10 rounded-lg px-6 py-3 text-center">
                            <div className="text-xs uppercase text-gray-500 font-bold tracking-wider">Seniority Score</div>
                            <div className="text-3xl font-bold text-blue-400">72<span className="text-sm text-gray-500">/100</span></div>
                        </div>
                    </div>
                </div>

                {/* 2-Column Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Column: Narrative Replay (Markdown-like) */}
                    <div className="lg:col-span-8 space-y-8 animate-fade-in">
                        {/* Summary Card */}
                        <section className="bg-[#111827] rounded-xl border border-white/5 p-8">
                            <h2 className="text-xl font-serif text-white mb-4 border-b border-white/5 pb-2">The Reality</h2>
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                <p className="mb-4">
                                    The project failed not because of code, but because of <strong>timing</strong>.
                                    By building the prototype <em>before</em> securing political air-cover, you threatened the
                                    Ministry's control.
                                </p>
                                <blockquote className="border-l-4 border-red-500 pl-4 italic text-gray-400 my-4">
                                    "In Government, a solution without a champion is just a target."
                                </blockquote>
                                <p>
                                    When the protests started, you had no allies to defend the grant. The Minister
                                    cut ties to save face.
                                </p>
                            </div>
                        </section>

                        {/* Action Steps */}
                        <section className="bg-[#111827] rounded-xl border border-white/5 p-8">
                            <h2 className="text-xl font-serif text-white mb-4 border-b border-white/5 pb-2">Corrective Actions</h2>
                            <ul className="space-y-4">
                                <li className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                                    <div>
                                        <h4 className="text-white font-bold">Map before you Build</h4>
                                        <p className="text-sm text-gray-400">Spend the first 2 weeks purely on 'Stakeholder Discovery'.</p>
                                    </div>
                                </li>
                                <li className="flex gap-4 items-start">
                                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                                    <div>
                                        <h4 className="text-white font-bold">Find the Champion</h4>
                                        <p className="text-sm text-gray-400">Identify one powerful insider who <em>needs</em> this to succeed.</p>
                                    </div>
                                </li>
                            </ul>
                        </section>
                    </div>

                    {/* Right Column: Psych Widgets (The "Deep" Analysis) */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Cognitive Hygiene Widget */}
                        <div className="bg-[#111827] rounded-xl border border-white/5 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Cognitive Mode</h3>
                                <span className="text-xs text-red-400 border border-red-400/20 px-2 py-1 rounded">System 1 Detected</span>
                            </div>
                            <div className="relative h-2 bg-gray-800 rounded-full mb-2 overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 bg-red-500 w-[80%] rounded-full"></div>
                                <div className="absolute right-0 top-0 bottom-0 w-[20%] text-right pr-1 text-[8px] text-gray-600">Sys 2</div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                You reacted <strong>impulsively</strong> to the timeline pressure.
                                You sought to "please" the PM (Social Compliance Bias) rather than analyzing the risk (System 2).
                            </p>
                        </div>

                        {/* Biases Widget */}
                        <div className="bg-[#111827] rounded-xl border border-white/5 p-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Biases Identified</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between group cursor-help">
                                    <span className="text-sm text-gray-300 border-b border-dotted border-gray-600">Action Bias</span>
                                    <span className="text-xs text-red-400 font-mono">HIGH</span>
                                </div>
                                <div className="flex items-center justify-between group cursor-help">
                                    <span className="text-sm text-gray-300 border-b border-dotted border-gray-600">Authority Bias</span>
                                    <span className="text-xs text-orange-400 font-mono">MED</span>
                                </div>
                            </div>
                        </div>

                        {/* Pattern Widget */}
                        <div className="bg-gradient-to-b from-blue-900/10 to-[#111827] rounded-xl border border-blue-500/20 p-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-4">Your Pattern</h3>
                            <div className="text-center py-4">
                                <div className="text-4xl">🏗️</div>
                                <div className="text-xl font-bold text-white mt-2">The Builder</div>
                                <p className="text-xs text-blue-200/60 mt-2 px-4">
                                    You solve problems with code/features, ignoring the human/political system.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

                <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s ease-out; }
      `}</style>
            </div>
        </CourseLayout>
    );
}
