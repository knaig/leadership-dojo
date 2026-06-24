'use client';
import { Home, Users, Target, MessageSquare, Settings, LogOut, BarChart3, Crown, Calendar, Trophy, GraduationCap, Gauge } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useUnreadStore } from '@/lib/stores/unread-store';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';

type FeaturePhase = 'ONBOARDING' | 'ENGAGED' | 'POWER_USER';
type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE';

interface NavItem {
    icon: any;
    label: string;
    href: string;
    minPhase: FeaturePhase;
    minTier?: SubscriptionTier;
}

const PHASE_ORDER: FeaturePhase[] = ['ONBOARDING', 'ENGAGED', 'POWER_USER'];
const TIER_ORDER: SubscriptionTier[] = ['FREE', 'PRO', 'ENTERPRISE'];

function meetsPhase(current: FeaturePhase, required: FeaturePhase): boolean {
    return PHASE_ORDER.indexOf(current) >= PHASE_ORDER.indexOf(required);
}

function meetsTier(current: SubscriptionTier, required?: SubscriptionTier): boolean {
    if (!required) return true;
    return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(required);
}

const ALL_NAV_ITEMS: NavItem[] = [
    { icon: Home, label: BRAND.name, href: '/dashboard', minPhase: 'ONBOARDING' },
    { icon: MessageSquare, label: 'Chat', href: '/chat', minPhase: 'ONBOARDING' },
    { icon: Calendar, label: 'Meetings', href: '/meetings', minPhase: 'ONBOARDING' },
    { icon: Users, label: 'People', href: '/stakeholders', minPhase: 'ONBOARDING' },
    { icon: Target, label: 'Goals', href: '/goals', minPhase: 'ONBOARDING' },
    { icon: Gauge, label: 'KPIs', href: '/kpis', minPhase: 'ENGAGED' },
    // { icon: GraduationCap, label: 'Coaching', href: '/coaching', minPhase: 'ENGAGED' },
    { icon: Trophy, label: 'Wins', href: '/wins', minPhase: 'ENGAGED' },
];

export function Sidebar() {
    const pathname = usePathname();
    const { signOut } = useClerk();
    const [phase, setPhase] = useState<FeaturePhase>('ONBOARDING');
    const [tier, setTier] = useState<SubscriptionTier>('FREE');
    const [isAdmin, setIsAdmin] = useState(false);
    const { unreadCount, clearUnread } = useUnreadStore();

    // Clear unread when user navigates to chat
    useEffect(() => {
        if (pathname === '/dashboard') {
            clearUnread();
        }
    }, [pathname, clearUnread]);

    useEffect(() => {
        // Fetch user's feature phase and subscription tier
        fetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.featurePhase) setPhase(data.featurePhase);
                if (data.tier) setTier(data.tier);
                if (data.role === 'ADMIN' || data.role === 'CURATOR') setIsAdmin(true);
            })
            .catch(() => { /* default to ONBOARDING */ });
    }, []);

    const visibleItems = ALL_NAV_ITEMS.filter(
        item => meetsPhase(phase, item.minPhase) && meetsTier(tier, item.minTier)
    );

    return (
        <div className="flex flex-col items-center h-full py-6 gap-8">
            <MiraLogo size={36} className="mb-4" />

            <nav className="flex flex-col gap-6 w-full px-2">
                {visibleItems.map((item) => {
                    const isActive = item.href === '/dashboard'
                        ? pathname === '/dashboard'
                        : pathname === item.href || pathname.startsWith(item.href + '/');
                    const isMira = item.href === '/dashboard' || item.href === '/chat';
                    const showBadge = item.href === '/chat' && unreadCount > 0 && !isActive;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={isMira ? clearUnread : undefined}
                            className={`p-3 rounded-xl transition-all duration-200 flex flex-col items-center gap-1 group relative
                                ${isActive
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }
                            `}
                        >
                            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                            {showBadge && (
                                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                            )}
                            <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity absolute left-16 bg-popover text-popover-foreground px-2 py-1 rounded border border-border whitespace-nowrap z-50 pointer-events-none shadow-lg">
                                {item.label}
                            </span>
                        </Link>
                    )
                })}
            </nav>

            <div className="mt-auto flex flex-col gap-4">
                {isAdmin && (
                    <Link
                        href="/admin"
                        className="p-3 text-amber-600/60 hover:text-amber-600 transition-colors flex justify-center"
                        title="Admin Panel"
                    >
                        <Crown size={22} />
                    </Link>
                )}
                <Link
                    href="/settings"
                    className="p-3 text-muted-foreground hover:text-foreground transition-colors flex justify-center"
                >
                    <Settings size={22} />
                </Link>
                <button
                    onClick={() => signOut({ redirectUrl: '/' })}
                    className="p-3 text-muted-foreground hover:text-red-400 transition-colors flex justify-center"
                    title="Sign out"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </div>
    );
}
