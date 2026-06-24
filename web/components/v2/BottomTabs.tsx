'use client';
import { Home, Calendar, MessageCircle, Users, Target, Gauge, GraduationCap, Trophy, Settings, LogOut, Shield, Brain, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { useUnreadStore } from '@/lib/stores/unread-store';
import { useAdminRole } from '@/lib/hooks/useAdminRole';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';
import { VoiceCallButton } from '@/components/voice/VoiceCallButton';

// Mobile bottom bar — limited to 5 most-used tabs
const MOBILE_TABS = [
    { icon: Home, label: 'Home', href: '/dashboard' },
    { icon: MessageCircle, label: BRAND.name, href: '/chat' },
    { icon: Calendar, label: 'Meetings', href: '/meetings' },
    { icon: Users, label: 'People', href: '/stakeholders' },
    { icon: Settings, label: 'Settings', href: '/settings' },
];

// Desktop sidebar — focused nav for early adopters
const DESKTOP_TABS = [
    { icon: Home, label: 'Home', href: '/dashboard' },
    { icon: MessageCircle, label: BRAND.name, href: '/chat' },
    { icon: Calendar, label: 'Meetings', href: '/meetings' },
    { icon: Users, label: 'People', href: '/stakeholders' },
    { icon: Target, label: 'Goals', href: '/goals' },
];

export function BottomTabs() {
    const pathname = usePathname();
    const { signOut } = useClerk();
    const { unreadCount } = useUnreadStore();
    const { isAdmin } = useAdminRole();

    const renderTab = (tab: typeof MOBILE_TABS[0], iconSize: number, labelSize: string) => {
        const isActive = tab.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === tab.href || pathname.startsWith(tab.href + '/');
        const isMira = tab.href === '/chat';

        return (
            <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors relative
                    ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                `}
                title={tab.label}
            >
                <tab.icon size={iconSize} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className={`${labelSize} font-medium`}>{tab.label}</span>
                {isMira && unreadCount > 0 && (
                    <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
            </Link>
        );
    };

    return (
        <>
            {/* Mobile: Bottom tab bar */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border lg:hidden safe-area-bottom">
                <div className="flex items-center justify-around h-16 px-2">
                    {MOBILE_TABS.slice(0, 2).map(tab => renderTab(tab, 22, 'text-[10px]'))}
                    <div className="flex flex-col items-center gap-0.5">
                        <VoiceCallButton compact />
                        <span className="text-[10px] font-medium text-muted-foreground">Call</span>
                    </div>
                    {MOBILE_TABS.slice(2).map(tab => renderTab(tab, 22, 'text-[10px]'))}
                </div>
            </nav>

            {/* Desktop: Left sidebar */}
            <aside className="hidden lg:flex flex-col w-[72px] flex-shrink-0 border-r border-border bg-card h-full items-center py-4 gap-0.5">
                <MiraLogo size={36} className="mb-4" />
                {DESKTOP_TABS.map(tab => renderTab(tab, 20, 'text-[9px]'))}
                <div className="mt-auto flex flex-col items-center gap-3">
                    <VoiceCallButton compact />
                    {isAdmin && renderTab({ icon: Shield, label: 'Admin', href: '/admin' }, 20, 'text-[9px]')}
                    {renderTab({ icon: Settings, label: 'Settings', href: '/settings' }, 20, 'text-[9px]')}
                    <button
                        onClick={() => signOut({ redirectUrl: '/' })}
                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-muted-foreground hover:text-red-400 transition-colors"
                        title="Sign out"
                    >
                        <LogOut size={20} strokeWidth={1.8} />
                        <span className="text-[9px] font-medium">Sign out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
