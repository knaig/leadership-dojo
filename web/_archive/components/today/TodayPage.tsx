'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/skeleton';

// Clarity Dashboard Components
import { TodaysFocusCard } from '@/components/dashboard/TodaysFocusCard';
import { KPICardList } from '@/components/dashboard/KPICard';
import { ConversationsCard } from '@/components/dashboard/ConversationsCard';
import { ClarityAIPanel } from '@/components/dashboard/ClarityAIPanel';
import { YourDayCard } from '@/components/dashboard/YourDayCard';
import { ScenarioPanel } from '@/components/dashboard/ScenarioPanel';

interface TodayPageData {
    user: {
        name: string;
        onboardingComplete: boolean;
    };
    focus: {
        objective: string;
        kpiName?: string;
        confidence?: number;
        escalationPath?: string;
    } | null;
    kpis: Array<{
        id: string;
        name: string;
        targetValue?: number;
        currentValue?: number;
        targetDate?: Date;
        status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'ACHIEVED';
        confidence?: number;
    }>;
    conversations: Array<{
        id: string;
        title: string;
        stakeholderName?: string;
        stakeholderRole?: string;
        scheduledAt?: Date;
        status: 'NOT_STARTED' | 'PREPPING' | 'PREPPED' | 'COMPLETED';
        objective?: string;
        stakes?: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    observations: Array<{
        id: string;
        type: 'insight' | 'pattern' | 'suggestion' | 'warning';
        content: string;
        context?: string;
    }>;
    clarityScore?: number;
    meetings: Array<{
        id: string;
        title: string;
        startTime: Date;
        endTime?: Date;
        riskLevel: 'low' | 'medium' | 'high';
        prepReason?: string;
        suggestedCase?: {
            id: string;
            title: string;
        };
        meetingType?: string;
        attendees?: string[];
    }>;
}

export function TodayPage() {
    const router = useRouter();
    const [dateString, setDateString] = useState<string>('');
    const [greeting, setGreeting] = useState<string>('');

    useEffect(() => {
        setDateString(new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }));

        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 17) setGreeting('Good afternoon');
        else setGreeting('Good evening');
    }, []);

    const [data, setData] = useState<TodayPageData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                // Fetch today data from API
                const res = await fetch('/api/today');
                const json = await res.json();

                if (json.success) {
                    const raw = json.data;

                    // Check if user needs onboarding
                    if (raw.user && !raw.user.onboardingComplete) {
                        // Optionally redirect to onboarding
                        // router.push('/onboarding');
                    }

                    // Deserialize dates
                    if (raw.meetings) {
                        raw.meetings = raw.meetings.map((m: any) => ({
                            ...m,
                            startTime: new Date(m.startTime),
                            endTime: new Date(m.endTime)
                        }));
                    }

                    if (raw.conversations) {
                        raw.conversations = raw.conversations.map((c: any) => ({
                            ...c,
                            scheduledAt: c.scheduledAt ? new Date(c.scheduledAt) : undefined
                        }));
                    }

                    if (raw.kpis) {
                        raw.kpis = raw.kpis.map((k: any) => ({
                            ...k,
                            targetDate: k.targetDate ? new Date(k.targetDate) : undefined
                        }));
                    }

                    setData(raw);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [router]);

    const handlePrepClick = (conv: any) => {
        router.push(`/conversations/${conv.id}`);
    };

    const handleKPIClick = (kpi: any) => {
        router.push(`/kpis/${kpi.id}`);
    };

    if (isLoading) {
        return (
            <AppShell>
                <div className="p-6 max-w-7xl mx-auto space-y-6">
                    <Skeleton className="h-8 w-64 bg-muted" />
                    <Skeleton className="h-24 w-full bg-muted" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Skeleton className="h-48 w-full bg-muted" />
                            <Skeleton className="h-32 w-full bg-muted" />
                        </div>
                        <div className="space-y-4">
                            <Skeleton className="h-64 w-full bg-muted" />
                        </div>
                    </div>
                </div>
            </AppShell>
        );
    }

    // Derive focus from top at-risk KPI or first KPI
    const focusKPI = data?.kpis?.find(k => k.status === 'AT_RISK') || data?.kpis?.[0];
    const derivedFocus = data?.focus || (focusKPI ? {
        objective: `Unblock ${focusKPI.name}`,
        kpiName: focusKPI.name,
        confidence: focusKPI.confidence
    } : null);

    return (
        <AppShell>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <h1 className="text-2xl font-semibold text-foreground">
                        {greeting}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {dateString}
                    </p>
                </header>

                {/* Today's Focus Banner */}
                {derivedFocus && (
                    <TodaysFocusCard
                        objective={derivedFocus.objective}
                        kpiName={derivedFocus.kpiName}
                        confidence={derivedFocus.confidence}
                        escalationPath={derivedFocus.escalationPath}
                        className="mb-6"
                    />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: KPIs + Conversations */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* KPIs */}
                        <KPICardList
                            kpis={data?.kpis || []}
                            onKPIClick={handleKPIClick}
                        />

                        {/* Conversations */}
                        <ConversationsCard
                            conversations={data?.conversations || []}
                            upcomingMeetings={data?.meetings || []}
                            onPrepClick={handlePrepClick}
                            onMeetingSelect={(meeting) => {
                                console.log('Selected meeting:', meeting);
                                router.push(`/conversations/new?dbMeetingId=${meeting.id}`);
                            }}
                            onViewAll={() => router.push('/conversations')}
                        />

                        {/* Schedule (if meetings exist) */}
                        {data?.meetings && data.meetings.length > 0 && (
                            <YourDayCard meetings={data.meetings} />
                        )}
                    </div>

                    {/* Right Column: Scenario Detection + Clarity AI Panel */}
                    <div className="space-y-6">
                        <ScenarioPanel
                            onPrepClick={(scenario) => {
                                console.log('Prep for scenario:', scenario);
                                // TODO: Navigate to prep flow with scenario context
                            }}
                        />
                        <ClarityAIPanel
                            observations={data?.observations || []}
                            clarityScore={data?.clarityScore}
                            onAskQuestion={() => console.log('Ask question')}
                        />
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
