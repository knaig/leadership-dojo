'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/v2/Sidebar';
import { WebPushManager } from '@/components/v2/WebPushManager';

export function Shell({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        // Don't redirect if already on onboarding page
        if (pathname === '/onboarding') {
            setChecked(true);
            return;
        }

        fetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.onboardingComplete === false) {
                    router.push('/onboarding');
                } else {
                    setChecked(true);
                }
            })
            .catch(() => setChecked(true));
    }, [pathname, router]);

    if (!checked) return null;

    return (
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
            <WebPushManager />

            {/* 1. Left: Navigation */}
            <aside className="w-[80px] flex-shrink-0 border-r border-border bg-background relative z-20">
                <Sidebar />
            </aside>

            {/* 2. Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative bg-background">
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
