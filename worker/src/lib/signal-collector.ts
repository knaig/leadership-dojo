/**
 * Signal Collector — Evaluates signals across 6 dimensions to determine
 * whether Mira should call, which posture to use, and when.
 *
 * Signals are ephemeral (computed in-memory, not persisted individually).
 * The result of evaluation is stored on ScheduledCall.
 */

import { prisma } from './prisma';
import { PostureName } from './posture-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface Signal {
    dimension: 'calendar' | 'coaching' | 'outcome' | 'energy' | 'relationship' | 'knowledge';
    type: string;
    strength: number; // 0-1
    postureAffinity: PostureName[];
    detail: string;
}

export interface SignalSnapshot {
    signals: Signal[];
    postureScores: Record<PostureName, number>;
    callWorthiness: number;
    fatigueThreshold: number;
    shouldCall: boolean;
    bestPosture: PostureName;
    reason: string;
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

/**
 * Collect all active signals for a user across 6 dimensions.
 */
export async function collectSignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];

    const results = await Promise.allSettled([
        collectCalendarSignals(userId),
        collectCoachingSignals(userId),
        collectOutcomeSignals(userId),
        collectEnergySignals(userId),
        collectRelationshipSignals(userId),
    ]);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            signals.push(...result.value);
        }
    }

    return signals;
}

/**
 * Evaluate whether a call is worth making right now.
 */
export async function evaluateCallWorthiness(
    userId: string,
    signals: Signal[],
): Promise<SignalSnapshot> {
    // Group signals by posture affinity
    const postureScores: Record<PostureName, number> = {
        celebrate: 0, uplift: 0, prepare: 0, advise: 0, listen: 0,
        nudge: 0, challenge: 0, connect: 0, debrief: 0,
    };
    const postureCounts: Record<PostureName, number> = {
        celebrate: 0, uplift: 0, prepare: 0, advise: 0, listen: 0,
        nudge: 0, challenge: 0, connect: 0, debrief: 0,
    };

    for (const signal of signals) {
        for (const posture of signal.postureAffinity) {
            postureScores[posture] += signal.strength;
            postureCounts[posture]++;
        }
    }

    // Normalize by count (average strength per posture)
    for (const p of Object.keys(postureScores) as PostureName[]) {
        if (postureCounts[p] > 0) {
            postureScores[p] = postureScores[p] / postureCounts[p];
        }
    }

    // Call worthiness = max posture score + 0.3 * second highest
    const sorted = Object.entries(postureScores)
        .sort(([, a], [, b]) => b - a);
    const maxScore = sorted[0]?.[1] ?? 0;
    const secondScore = sorted[1]?.[1] ?? 0;
    const callWorthiness = maxScore + 0.3 * secondScore;
    const bestPosture = (sorted[0]?.[0] ?? 'advise') as PostureName;

    // Fatigue threshold
    const fatigueThreshold = await computeFatigueThreshold(userId);

    const shouldCall = callWorthiness > fatigueThreshold;

    return {
        signals,
        postureScores,
        callWorthiness: Math.round(callWorthiness * 100) / 100,
        fatigueThreshold: Math.round(fatigueThreshold * 100) / 100,
        shouldCall,
        bestPosture,
        reason: shouldCall
            ? `worthiness ${callWorthiness.toFixed(2)} > fatigue ${fatigueThreshold.toFixed(2)}, top posture: ${bestPosture}`
            : `worthiness ${callWorthiness.toFixed(2)} <= fatigue ${fatigueThreshold.toFixed(2)}, suppressing call`,
    };
}

// ============================================================================
// FATIGUE MODEL
// ============================================================================

async function computeFatigueThreshold(userId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [callsToday, lastCall, prefs] = await Promise.all([
        prisma.scheduledCall.count({
            where: {
                userId,
                createdAt: { gte: startOfDay },
                status: { in: ['completed', 'calling'] },
            },
        }),
        prisma.scheduledCall.findFirst({
            where: {
                userId,
                status: 'completed',
                completedAt: { not: null },
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
        }),
        prisma.userPreferences.findUnique({
            where: { userId },
            select: {
                fatigueProfile: true,
                callPacingStyle: true,
                maxCallsPerDay: true,
            },
        }),
    ]);

    const fatigueProfile = prefs?.fatigueProfile as { baseThreshold?: number; recoveryRate?: number } | null;
    let threshold = fatigueProfile?.baseThreshold ?? 0.4;

    // Each call today raises the bar
    const recoveryRate = fatigueProfile?.recoveryRate ?? 0.15;
    threshold += callsToday * recoveryRate;

    // Recency penalty
    if (lastCall?.completedAt) {
        const hoursSince = (now.getTime() - lastCall.completedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 1) threshold += 0.3;
        else if (hoursSince < 2) threshold += 0.2;
    }

    // Pacing style adjustments
    if (prefs?.callPacingStyle === 'quick') threshold += 0.1;
    if (prefs?.callPacingStyle === 'deep') threshold -= 0.1;

    // Hard limit
    const maxCalls = prefs?.maxCallsPerDay ?? 3;
    if (callsToday >= maxCalls) threshold = 999; // block

    return Math.max(0, threshold);
}

// ============================================================================
// DIMENSION COLLECTORS
// ============================================================================

async function collectCalendarSignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const fortyFiveMinAgo = new Date(now.getTime() - 45 * 60 * 1000);

    const [upcomingMeetings, recentEndedMeetings, todayMeetingCount] = await Promise.all([
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: now, lte: twoHoursFromNow },
                status: { not: 'cancelled' },
            },
            select: { title: true, startTime: true, endTime: true, meetingCategory: true, participants: true },
            orderBy: { startTime: 'asc' },
            take: 5,
        }).catch(() => []),
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                endTime: { gte: fortyFiveMinAgo, lte: now },
                status: { not: 'cancelled' },
            },
            select: { title: true, meetingCategory: true },
            take: 3,
        }).catch(() => []),
        prisma.meetingSyncRecord.count({
            where: {
                userId,
                startTime: {
                    gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
                },
                status: { not: 'cancelled' },
            },
        }).catch(() => 0),
    ]);

    // High-stakes meeting approaching
    for (const m of upcomingMeetings) {
        const durationMin = m.endTime ? (m.endTime.getTime() - m.startTime.getTime()) / (1000 * 60) : 30;
        const isHighStakes = m.meetingCategory === 'NEEDLE_MOVER' ||
            (m.participants && Array.isArray(m.participants) && (m.participants as string[]).length >= 5) ||
            durationMin >= 60;
        if (isHighStakes) {
            signals.push({
                dimension: 'calendar',
                type: 'meeting_imminent',
                strength: 0.8,
                postureAffinity: ['prepare'],
                detail: `High-stakes meeting "${m.title}" in next 2h`,
            });
            break; // one is enough
        }
    }

    // Meeting just ended
    if (recentEndedMeetings.length > 0) {
        const best = recentEndedMeetings[0];
        signals.push({
            dimension: 'calendar',
            type: 'meeting_just_ended',
            strength: best.meetingCategory === 'NEEDLE_MOVER' ? 0.8 : 0.6,
            postureAffinity: ['debrief'],
            detail: `"${best.title}" ended recently`,
        });
    }

    // Dense day
    if (todayMeetingCount >= 6) {
        signals.push({
            dimension: 'calendar',
            type: 'dense_day',
            strength: 0.5,
            postureAffinity: ['uplift'],
            detail: `${todayMeetingCount} meetings today`,
        });
    }

    // Light day
    if (todayMeetingCount <= 2) {
        signals.push({
            dimension: 'calendar',
            type: 'light_day',
            strength: 0.4,
            postureAffinity: ['connect', 'advise'],
            detail: `Only ${todayMeetingCount} meetings today`,
        });
    }

    return signals;
}

async function collectCoachingSignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];

    const [overdueActions, plan] = await Promise.all([
        prisma.relationshipAction.findMany({
            where: {
                goal: { userId },
                status: 'IN_PROGRESS',
                dueDate: { lt: new Date() },
            },
            select: { description: true, dueDate: true },
            take: 5,
        }).catch(() => []),
        prisma.coachingRelationshipPlan.findUnique({
            where: { userId },
            select: { coachingThemes: true },
        }).catch(() => null),
    ]);

    // Stale commitments
    if (overdueActions.length > 0) {
        const daysOverdue = overdueActions[0].dueDate
            ? Math.floor((Date.now() - overdueActions[0].dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 3;
        signals.push({
            dimension: 'coaching',
            type: 'stale_commitment',
            strength: Math.min(0.6 + daysOverdue * 0.05, 0.85),
            postureAffinity: ['nudge'],
            detail: `${overdueActions.length} overdue commitment(s)`,
        });
    }

    // Active coaching themes
    if (plan?.coachingThemes) {
        const themes = plan.coachingThemes as Array<{ status: string; theme: string; callCount?: number }>;
        const active = themes.filter(t => t.status === 'active');
        const recurring = active.filter(t => (t.callCount ?? 0) >= 3);
        if (recurring.length > 0) {
            signals.push({
                dimension: 'coaching',
                type: 'recurring_theme',
                strength: 0.6,
                postureAffinity: ['advise', 'challenge'],
                detail: `Recurring theme: ${recurring[0].theme}`,
            });
        }
    }

    // Onboarding gaps
    const progress = await prisma.onboardingProgress.findUnique({
        where: { userId },
    }).catch(() => null);

    if (progress) {
        const uncovered: string[] = [];
        if (!progress.coveredStory) uncovered.push('story');
        if (!progress.coveredDrivesAndValues) uncovered.push('drives_and_values');
        if (!progress.coveredLife) uncovered.push('life');
        if (!progress.coveredRole) uncovered.push('role');
        if (!progress.coveredStakeholders) uncovered.push('stakeholders');
        if (!progress.coveredLeadershipStyle) uncovered.push('leadership_style');
        if (!progress.coveredGoals) uncovered.push('goals');
        if (!progress.coveredChallenges) uncovered.push('challenges');
        if (!progress.coveredGrowth) uncovered.push('growth');

        if (uncovered.length > 0 && uncovered.length < 9) {
            signals.push({
                dimension: 'coaching',
                type: 'onboarding_gap',
                strength: 0.55,
                postureAffinity: ['connect', 'listen'],
                detail: `Onboarding gaps: ${uncovered.slice(0, 3).join(', ')}`,
            });
        }
    }

    return signals;
}

async function collectOutcomeSignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const recentOutcomes = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            outcomeResult: { in: ['LANDED', 'MISSED', 'PARTIAL'] },
            endTime: { gte: fortyEightHoursAgo },
        },
        select: { outcomeResult: true, title: true },
        orderBy: { endTime: 'desc' },
        take: 5,
    }).catch(() => []);

    const landed = recentOutcomes.filter(o => o.outcomeResult === 'LANDED');
    const missed = recentOutcomes.filter(o => o.outcomeResult === 'MISSED');

    if (landed.length > 0) {
        signals.push({
            dimension: 'outcome',
            type: 'recent_landed',
            strength: landed.length >= 3 ? 0.85 : 0.75,
            postureAffinity: ['celebrate'],
            detail: landed.length >= 3
                ? `Win streak: ${landed.length} outcomes landed`
                : `Outcome LANDED: "${landed[0].title}"`,
        });
    }

    if (missed.length > 0) {
        signals.push({
            dimension: 'outcome',
            type: 'recent_missed',
            strength: missed.length >= 2 ? 0.8 : 0.65,
            postureAffinity: ['uplift', 'debrief'],
            detail: missed.length >= 2
                ? `${missed.length} consecutive misses`
                : `Outcome MISSED: "${missed[0].title}"`,
        });
    }

    return signals;
}

async function collectEnergySignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];
    const now = new Date();

    // Check day of week
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 5) { // Friday
        signals.push({
            dimension: 'energy',
            type: 'friday_afternoon',
            strength: 0.4,
            postureAffinity: ['connect', 'celebrate'],
            detail: 'Friday — decompression window',
        });
    }
    if (dayOfWeek === 1) { // Monday
        signals.push({
            dimension: 'energy',
            type: 'monday_morning',
            strength: 0.35,
            postureAffinity: ['prepare'],
            detail: 'Monday — fresh start energy',
        });
    }

    // Afternoon energy dip (14:00-16:00)
    const hour = now.getHours();
    if (hour >= 14 && hour <= 16) {
        signals.push({
            dimension: 'energy',
            type: 'known_low_energy_time',
            strength: 0.35,
            postureAffinity: ['uplift', 'connect'],
            detail: 'Afternoon energy dip window',
        });
    }

    // Calendar fragmentation: many short meetings today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: todayStart, lt: todayEnd },
            status: { not: 'cancelled' },
        },
        select: { startTime: true, endTime: true },
    }).catch(() => []);

    const shortMeetings = todayMeetings.filter(m => {
        const dur = (m.endTime.getTime() - m.startTime.getTime()) / (1000 * 60);
        return dur <= 20;
    });
    if (shortMeetings.length >= 4) {
        signals.push({
            dimension: 'energy',
            type: 'high_fragmentation',
            strength: 0.5,
            postureAffinity: ['uplift'],
            detail: `${shortMeetings.length} short meetings — high fragmentation`,
        });
    }

    return signals;
}

async function collectRelationshipSignals(userId: string): Promise<Signal[]> {
    const signals: Signal[] = [];
    const now = new Date();

    const [lastCall, recentEvals, personalThread] = await Promise.all([
        prisma.scheduledCall.findFirst({
            where: { userId, status: 'completed' },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
        }).catch(() => null),
        prisma.callEvaluation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { engagementScore: true, depthOfSharingScore: true, valueAddScore: true },
        }).catch(() => []),
        prisma.personalThread.findFirst({
            where: {
                userId,
                stage: { in: ['planted', 'growing'] },
                lastTouched: { lte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
            },
        }).catch(() => null),
    ]);

    // No call in 24h+
    if (lastCall?.completedAt) {
        const hoursSince = (now.getTime() - lastCall.completedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince >= 24) {
            signals.push({
                dimension: 'relationship',
                type: 'no_recent_call',
                strength: Math.min(0.6 + (hoursSince - 24) * 0.02, 0.85),
                postureAffinity: ['advise', 'connect', 'prepare'],
                detail: `No call in ${Math.round(hoursSince)}h`,
            });
        }
    }

    // Engagement trending down
    if (recentEvals.length >= 3) {
        const recent3 = recentEvals.slice(0, 3);
        const avgEngagement = recent3.reduce((s, e) => s + (e.engagementScore ?? 5), 0) / 3;
        if (avgEngagement < 5) {
            signals.push({
                dimension: 'relationship',
                type: 'engagement_trending_down',
                strength: 0.55,
                postureAffinity: ['challenge', 'connect', 'listen'],
                detail: `Avg engagement ${avgEngagement.toFixed(1)} over last 3 calls`,
            });
        }

        // Depth trending up
        const avgDepth = recent3.reduce((s, e) => s + (e.depthOfSharingScore ?? 5), 0) / 3;
        if (avgDepth > 7) {
            signals.push({
                dimension: 'relationship',
                type: 'depth_trending_up',
                strength: 0.5,
                postureAffinity: ['listen', 'connect'],
                detail: `User opening up — avg depth ${avgDepth.toFixed(1)}`,
            });
        }

        // Value trending down
        const avgValue = recent3.reduce((s, e) => s + (e.valueAddScore ?? 5), 0) / 3;
        if (avgValue < 5) {
            signals.push({
                dimension: 'relationship',
                type: 'value_trending_down',
                strength: 0.55,
                postureAffinity: ['challenge', 'connect'],
                detail: `Value-add trending down: ${avgValue.toFixed(1)}`,
            });
        }
    }

    // Personal thread ready to water
    if (personalThread) {
        signals.push({
            dimension: 'relationship',
            type: 'thread_ready',
            strength: 0.5,
            postureAffinity: ['connect'],
            detail: `Thread "${personalThread.topic}" ready to water`,
        });
    }

    return signals;
}
