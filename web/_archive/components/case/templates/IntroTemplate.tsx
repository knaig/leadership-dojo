'use client';

import { motion } from 'framer-motion';

interface IntroTemplateProps {
    country: string;
    title: string;
    context: {
        political_landscape: string;
        recent_events: string;
        cultural_factors: string;
        your_position: string;
    };
    onStart: () => void;
}

export default function IntroTemplate({
    country,
    title,
    context,
    onStart
}: IntroTemplateProps) {
    return (
        <div className="h-full w-full grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">

            {/* Left: Hero Title */}
            <div className="lg:col-span-7 p-8 lg:p-20 flex flex-col justify-center relative">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="relative z-10"
                >
                    <div className="inline-block px-3 py-1 bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-full text-[#3B82F6] text-xs font-bold tracking-widest mb-6">
                        INCOMING BRIEFING
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-serif font-medium text-white mb-6 leading-[1.1]">
                        {country}
                    </h1>
                    <h2 className="text-xl lg:text-2xl text-[#9CA3AF] font-light max-w-2xl leading-relaxed mb-12">
                        {title}
                    </h2>

                    <button
                        onClick={onStart}
                        className="group relative inline-flex items-center gap-3 px-8 py-4 bg-[#E6E8EB] hover:bg-white text-black rounded-lg transition-all duration-300 transform hover:translate-x-1"
                    >
                        <span className="font-bold tracking-wide">BEGIN ASSIGNMENT</span>
                        <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                </motion.div>

                {/* Decorative Grid Background */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
                />
            </div>

            {/* Right: Context Cards */}
            <div className="lg:col-span-5 bg-[#0A0E14]/30 border-l border-[#ffffff]/5 p-8 lg:p-12 overflow-y-auto custom-scrollbar backdrop-blur-sm">
                <div className="space-y-8 max-w-lg mx-auto lg:mx-0">

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                    >
                        <h3 className="text-xs font-bold text-[#525252] uppercase tracking-[0.2em] mb-4">Your Position</h3>
                        <div className="bg-[#1A1F29]/50 border border-[#ffffff]/10 p-6 rounded-xl hover:border-[#3B82F6]/30 transition-colors">
                            <p className="text-[#E6E8EB] leading-relaxed relative pl-4 border-l-2 border-[#3B82F6]">
                                {context.your_position}
                            </p>
                        </div>
                    </motion.div>

                    {['political_landscape', 'recent_events', 'cultural_factors'].map((key, i) => (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + (i * 0.1), duration: 0.6 }}
                        >
                            <h3 className="text-xs font-bold text-[#525252] uppercase tracking-[0.2em] mb-4">
                                {key.replace('_', ' ')}
                            </h3>
                            <p className="text-[#9CA3AF] leading-relaxed text-sm">
                                {(context as any)[key]}
                            </p>
                        </motion.div>
                    ))}

                </div>
            </div>
        </div>
    );
}
