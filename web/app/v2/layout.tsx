'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomTabs } from '@/components/v2/BottomTabs';
import { WebPushManager } from '@/components/v2/WebPushManager';
import { GoogleScopeGate } from '@/components/v2/GoogleScopeGate';

export default function V2Layout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
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
    }, [router]);

    if (!checked) return null;

    return (
        <GoogleScopeGate>
            <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
                <WebPushManager />
                <BottomTabs />

                {/* Main content — padded for bottom tabs on mobile */}
                <main className="flex-1 flex flex-col overflow-hidden pb-16 lg:pb-0">
                    {children}
                </main>
            </div>
        </GoogleScopeGate>
    );
}
