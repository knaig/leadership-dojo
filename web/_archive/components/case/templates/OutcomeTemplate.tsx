'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { addReflectionDebt, getReflectionDebt } from '@/lib/config/accountability';

interface OutcomeTemplateProps {
    caseId: string;
    coachingData: any; // Ideally typed
    responses: string[];
}

export default function OutcomeTemplate({
    caseId,
    coachingData,
    responses
}: OutcomeTemplateProps) {
    const router = useRouter();
    const [debtAdded, setDebtAdded] = useState(false);

    // Add reflection debt when case is completed
    useEffect(() => {
        if (!debtAdded) {
            addReflectionDebt(caseId);
            setDebtAdded(true);
        }
    }, [caseId, debtAdded]);

    return (
        <div className="h-full w-full overflow-y-auto custom-scrollbar bg-[#0A0E14] p-8 lg:p-12">
            <div className="max-w-6xl mx-auto">

                <header className="mb-12">
                    <h1 className="text-4xl font-serif text-white mb-4">Simulation Complete</h1>
                    <p className="text-[#9CA3AF] text-lg">Analysis of your decision patterns</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    {/* Score / Mode Card */}
                    <div className="col-span-1 bg-[#1A1F29] border border-[#ffffff]/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                        <div className="w-32 h-32 rounded-full border-4 border-[#3B82F6] flex items-center justify-center mb-6">
                            <span className="text-4xl font-bold text-white">B</span>
                        </div>
                        <h2 className="text-xl font-bold text-[#E6E8EB] mb-2">Builder Mode</h2>
                        <p className="text-sm text-[#9CA3AF]">Your dominant operating model in this session.</p>
                    </div>

                    {/* Main Insight */}
                    <div className="col-span-2 bg-[#1A1F29] border border-[#ffffff]/10 rounded-2xl p-8">
                        <h3 className="text-[#3B82F6] text-xs font-bold uppercase tracking-widest mb-4">Key Observation</h3>
                        <p className="text-xl leading-relaxed text-[#E6E8EB]">
                            You excelled at identifying technical constraints but consistently underestimated the political capital required to move them.
                        </p>
                        <div className="mt-6 flex gap-4">
                            <div className="px-4 py-2 bg-[#F59E0B]/10 rounded text-[#F59E0B] text-sm">⚠️ High Risk: Stakeholder Alienation</div>
                            <div className="px-4 py-2 bg-[#10B981]/10 rounded text-[#10B981] text-sm">✅ High Impact: Technical Clarity</div>
                        </div>
                    </div>
                </div>

                {/* Mandatory Reflection Notice */}
                <div className="bg-[#3B82F6]/10 border border-[#3B82F6] rounded-2xl p-8 mb-8">
                    <h3 className="text-[#3B82F6] text-lg font-bold mb-3">📝 Reflection Required</h3>
                    <p className="text-[#E6E8EB] mb-4">
                        Before practicing another case, you must reflect on what happened in the real meetings you've had since your last reflection.
                    </p>
                    <p className="text-[#9CA3AF] text-sm">
                        This isn't optional. You've accumulated reflection debt. After 2 skipped reflections, practice mode locks.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                        onClick={() => router.push('/reflect')}
                        className="px-8 py-4 bg-[#3B82F6] text-white rounded-lg font-bold hover:bg-[#2563EB] transition-colors shadow-lg shadow-[#3B82F6]/20"
                    >
                        Reflect on This Case →
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="px-8 py-4 bg-[#E6E8EB]/10 border border-[#E6E8EB]/20 text-[#E6E8EB] rounded-lg font-bold hover:bg-[#E6E8EB]/20 transition-colors"
                    >
                        Return to Headquarters
                    </button>
                </div>

            </div>
        </div>
    );
}
