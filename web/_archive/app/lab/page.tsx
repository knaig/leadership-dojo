import Link from 'next/link';
import { Shell } from '@/components/v2/Shell';
import {
    MessageSquare,
    GitBranch,
    Target,
    Calendar,
    Signal,
    FileText,
    BookOpen
} from 'lucide-react';

const tools = [
    { href: '/conversations', label: 'Conversations', icon: MessageSquare, desc: 'Analyze chat logs' },
    { href: '/decisions', label: 'Decisions', icon: GitBranch, desc: 'Decision matrix' },
    { href: '/v2/goals', label: 'Strategic Goals', icon: Target, desc: 'OKRs & Goals' },
    { href: '/meetings', label: 'Meetings', icon: Calendar, desc: 'Meeting prep & notes' },
    { href: '/signals', label: 'Signals', icon: Signal, desc: 'Market signals' },
    { href: '/reports', label: 'Reports', icon: FileText, desc: 'Generated reports' },
    { href: '/cases', label: 'Cases', icon: BookOpen, desc: 'Leadership cases' },
];

export default function LabPage() {
    return (
        <Shell>
            <div className="p-8 max-w-5xl mx-auto text-slate-100">
                <header className="mb-12">
                    <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        Research Lab 🧪
                    </h1>
                    <p className="text-slate-400">
                        Experimental tools and legacy modules.
                    </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                            <Link key={tool.href} href={tool.href}>
                                <div className="p-6 rounded-xl border border-white/5 bg-[#161b22] hover:bg-[#1c2128] hover:border-indigo-500/30 transition-all group">
                                    <div className="flex items-center gap-4 mb-3">
                                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 group-hover:text-indigo-300">
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-semibold text-slate-200">{tool.label}</h3>
                                    </div>
                                    <p className="text-sm text-slate-500">{tool.desc}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </Shell>
    );
}
