'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export function TopNav() {
    const pathname = usePathname();
    const [unreadCount, setUnreadCount] = useState(0);

    // Fetch unread notification count
    useEffect(() => {
        const fetchCount = () => {
            fetch('/api/notifications/unread-count')
                .then(res => res.json())
                .then(data => setUnreadCount(data.count || 0))
                .catch(() => setUnreadCount(0));
        };

        fetchCount();

        // Refresh every 5 minutes (was 30s — caused excessive DB transfer)
        const interval = setInterval(fetchCount, 300000);
        return () => clearInterval(interval);
    }, []);

    const LINKS = [
        { label: 'Briefing', href: '/dashboard' },
        { label: 'Context', href: '/dashboard/context' },
        { label: 'Syllabus', href: '/dashboard/course' },
        { label: 'War Room', href: '/builder' },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 bg-gradient-to-b from-background/95 to-background/0 backdrop-blur-sm border-b border-border/30">
            {/* Brand */}
            <div className="flex items-center gap-8">
                <Link href="/dashboard" className="font-serif font-bold text-xl tracking-tight text-foreground">
                    <span className="text-primary">{BRAND.name}</span>
                </Link>

                {/* Minimal Links */}
                <div className="flex items-center gap-6">
                    {LINKS.map((link) => {
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`text-sm font-medium transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-6">
                {/* Notification Bell - links to chat where notification dropdown lives */}
                <Link href="/dashboard" className="relative group" title={unreadCount > 0 ? `${unreadCount} new insight${unreadCount > 1 ? 's' : ''}` : 'Open chat'}>
                    <Bell size={20} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-medium animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Link>

                <div className="text-xs font-bold tracking-widest text-primary uppercase border border-primary/30 px-3 py-1 rounded-full">
                    Alpha Access
                </div>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-serif border border-border">
                    US
                </div>
            </div>
        </nav>
    );
}
