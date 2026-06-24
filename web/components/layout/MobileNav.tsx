'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, MessageSquare, Target, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const mobileNavItems = [
    { href: '/', label: 'Today', icon: Home },
    { href: '/conversations', label: 'Prep', icon: MessageSquare },
    { href: '/kpis', label: 'KPIs', icon: Target },
    { href: '/settings', label: 'Settings', icon: Settings }
];

export function MobileNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0f0f12] border-t border-zinc-800 lg:hidden z-50">
            <div className="flex items-center justify-around h-16 px-4 safe-area-pb">
                {mobileNavItems.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors',
                                isActive ? 'text-indigo-400' : 'text-zinc-500'
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
