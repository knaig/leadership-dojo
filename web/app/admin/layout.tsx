'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, Brain, Phone, Activity, FileText, Settings2, Workflow, FlaskConical, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Users', href: '/admin/users', icon: Users },
    { label: 'Coaching', href: '/admin/coaching', icon: Brain },
    { label: 'Calls', href: '/admin/calls', icon: Phone },
    { label: 'System', href: '/admin/system', icon: Activity },
    { label: 'Prompts', href: '/admin/prompts', icon: FileText },
    { label: 'Config', href: '/admin/config', icon: Settings2 },
    { label: 'Pipeline', href: '/admin/pipeline', icon: Workflow },
    { label: 'AutoResearch', href: '/admin/autoresearch', icon: FlaskConical },
    { label: 'Health', href: '/admin/pipeline-health', icon: HeartPulse },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        fetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.role === 'ADMIN' || data.role === 'CURATOR') {
                    setAuthorized(true);
                } else {
                    router.push('/dashboard');
                }
            })
            .catch(() => router.push('/dashboard'));
    }, [router]);

    if (!authorized) return null;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Top navigation */}
            <nav className="border-b border-border bg-card/50 backdrop-blur-sm px-6 flex-shrink-0">
                <div className="flex items-center gap-1 h-12">
                    <span className="text-sm font-semibold text-primary mr-4 tracking-wide uppercase">Admin</span>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive =
                            tab.href === '/admin'
                                ? pathname === '/admin'
                                : pathname.startsWith(tab.href);

                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Page content */}
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
