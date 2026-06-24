'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, BarChart, TrendingUp, Users, Target } from 'lucide-react';
import Link from 'next/link';

export default function ReportsPage() {
    const reportTypes = [
        {
            title: 'Conversation Analytics',
            description: 'View stats on your meeting preparation and outcomes',
            icon: Users,
            href: '/reports/conversations',
            color: 'indigo'
        },
        {
            title: 'KPI Progress',
            description: 'Track progress against your key performance indicators',
            icon: Target,
            href: '/reports/kpis',
            color: 'green'
        },
        {
            title: 'Decision Journal',
            description: 'Review your decisions and their outcomes',
            icon: BarChart,
            href: '/reports/decisions',
            color: 'purple'
        },
        {
            title: 'Trends & Insights',
            description: 'Analyze patterns and emerging trends',
            icon: TrendingUp,
            href: '/reports/trends',
            color: 'amber'
        }
    ];

    return (
        <AppShell>
            <div className="p-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-white">Reports</h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Analytics and insights across your leadership work
                    </p>
                </div>

                {/* Report Types Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reportTypes.map((report) => {
                        const Icon = report.icon;
                        const colorClasses = {
                            indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
                            green: 'text-green-400 bg-green-500/10 border-green-500/30',
                            purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
                            amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        };

                        return (
                            <Link key={report.href} href={report.href}>
                                <Card className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 cursor-pointer transition-all hover:scale-[1.02]">
                                    <CardContent className="p-6">
                                        <div className={`w-12 h-12 rounded-lg ${report.color === 'indigo' ? 'bg-indigo-500/10' : report.color === 'green' ? 'bg-green-500/10' : report.color === 'purple' ? 'bg-purple-500/10' : 'bg-amber-500/10'} flex items-center justify-center mb-4`}>
                                            <Icon className={`w-6 h-6 ${report.color === 'indigo' ? 'text-indigo-400' : report.color === 'green' ? 'text-green-400' : report.color === 'purple' ? 'text-purple-400' : 'text-amber-400'}`} />
                                        </div>
                                        <h3 className="text-base font-semibold text-white mb-2">
                                            {report.title}
                                        </h3>
                                        <p className="text-sm text-zinc-500">
                                            {report.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>

                {/* Coming Soon Notice */}
                <Card className="bg-zinc-900 border-zinc-800 border-dashed mt-6">
                    <CardContent className="p-8 text-center">
                        <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <h3 className="text-base font-medium text-white mb-2">
                            Reports Coming Soon
                        </h3>
                        <p className="text-sm text-zinc-500 max-w-md mx-auto">
                            We're building powerful analytics dashboards to help you understand your leadership patterns and impact. Check back soon!
                        </p>
                    </CardContent>
                </Card>
            </div>
        </AppShell>
    );
}
