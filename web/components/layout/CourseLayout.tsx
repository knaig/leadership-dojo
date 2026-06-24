'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen,
    BarChart2,
    Settings,
    Menu,
    X,
    ChevronRight,
    Award,
    TrendingUp,
    Target,
    Database
} from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming you have a utils file, if not I'll create inline

const CLUSTERS = [
    { title: "Self-Leadership", slug: "self-leadership", icon: "🧠" },
    { title: "Communication", slug: "communication", icon: "💬" },
    { title: "Relationship & Trust", slug: "relationship-trust", icon: "🤝" },
    { title: "Team Leadership", slug: "team-leadership", icon: "👥" },
    { title: "Decision Making", slug: "decision-execution", icon: "⚖️" },
    { title: "Strategy & Systems", slug: "strategy-systems", icon: "♟️" },
    { title: "Influence", slug: "influence-negotiation", icon: "🗣️" },
    { title: "Institutional", slug: "institutional-thinking", icon: "🏛️" },
    { title: "Care-Offer Design", slug: "care-offer-design", icon: "❤️" }, // New Twin Concept
];

export default function CourseLayout({ children }: { children: ReactNode }) {
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const pathname = usePathname();

    const variants = {
        hidden: { opacity: 0, x: -20 },
        enter: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 20 },
    };

    return (
        <div className="flex h-screen bg-[#0A0E14] text-[#E6E8EB] font-sans selection:bg-blue-500/30">
            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 bg-[#111827] border-r border-[#1F2937] transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
                    !isSidebarOpen && "lg:w-[70px]"
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center h-16 px-4 border-b border-[#1F2937]">
                        {isSidebarOpen ? (
                            <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                                Leadership.OS
                            </span>
                        ) : (
                            <span className="mx-auto font-bold text-blue-400">OS</span>
                        )}
                        <button
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            className="ml-auto p-1 rounded hover:bg-[#1F2937] text-gray-400"
                        >
                            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto py-4 space-y-1">
                        <NavItem
                            href="/dashboard"
                            icon={<BarChart2 size={20} />}
                            label="Overview"
                            isOpen={isSidebarOpen}
                            isActive={pathname === '/dashboard'}
                        />
                        <NavItem
                            href="/growth"
                            icon={<TrendingUp size={20} />}
                            label="Growth"
                            isOpen={isSidebarOpen}
                            isActive={pathname.startsWith('/growth')}
                        />
                        <NavItem
                            href="/missions"
                            icon={<Target size={20} />}
                            label="Missions"
                            isOpen={isSidebarOpen}
                            isActive={pathname.startsWith('/missions')}
                        />
                        <NavItem
                            href="/settings/connectors"
                            icon={<Database size={20} />}
                            label="Data Sources"
                            isOpen={isSidebarOpen}
                            isActive={pathname.startsWith('/settings')}
                        />
                        <div className="px-4 py-2 mt-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {isSidebarOpen && "Curriculum"}
                        </div>

                        {CLUSTERS.map(cluster => (
                            <Link
                                key={cluster.slug}
                                href={`/dashboard/course?cluster=${cluster.slug}`} // Mock link for now
                                className={cn(
                                    "flex items-center px-4 py-3 text-sm font-medium transition-colors border-l-2 border-transparent hover:bg-[#1F2937] hover:text-white group",
                                    pathname.includes(cluster.slug)
                                        ? "bg-[#1F2937] border-blue-500 text-white"
                                        : "text-gray-400"
                                )}
                            >
                                <span className="mr-3">{cluster.icon}</span>
                                {isSidebarOpen && (
                                    <span>{cluster.title}</span>
                                )}
                            </Link>
                        ))}
                    </nav>

                    {/* User Profile / Admin Link */}
                    <div className="p-4 border-t border-[#1F2937]">
                        <Link href="/admin" className="flex items-center gap-3 text-sm text-gray-400 hover:text-white">
                            <Settings size={20} />
                            {isSidebarOpen && "Admin Console"}
                        </Link>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0A0E14]">
                {/* Top Bar for Mobile Toggle */}
                <div className="lg:hidden flex items-center h-16 px-4 border-b border-[#1F2937] bg-[#111827]">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-400">
                        <Menu size={24} />
                    </button>
                    <span className="ml-4 font-bold">Leadership.OS</span>
                </div>

                {/* Content with Transition */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1F2937]">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial="hidden"
                            animate="enter"
                            exit="exit"
                            variants={variants}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="min-h-full p-6 lg:p-10 w-full"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}

function NavItem({ href, icon, label, isOpen, isActive }: any) {
    return (
        <Link
            href={href}
            className={cn(
                "flex items-center px-4 py-3 text-sm font-medium transition-colors border-l-2 border-transparent hover:bg-[#1F2937] hover:text-white",
                isActive
                    ? "bg-[#1F2937] border-blue-500 text-white"
                    : "text-gray-400"
            )}
        >
            <span className={cn("mr-3", !isOpen && "mx-auto mr-0")}>{icon}</span>
            {isOpen && <span>{label}</span>}
        </Link>
    )
}
