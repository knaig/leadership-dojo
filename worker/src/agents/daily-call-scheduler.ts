/**
 * Daily Call Scheduler — The brain of Mira's persistent daily call system.
 *
 * Mira calls the user every day at their preferred time. During early days,
 * calls focus on onboarding (learning the user's world). After onboarding,
 * calls blend morning brief content with casual coaching check-ins.
 *
 * Flow: Cron (every 5 min) → scheduleDailyCall → executeDailyCall → Vapi
 *       Vapi webhook → handleCallOutcome → retry/callback/onboarding update
 */

import { prisma } from '../lib/prisma';
import { triggerVoiceCall } from '../lib/vapi-voice';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';
import { collectSignals, evaluateCallWorthiness } from '../lib/signal-collector';
import { selectPosture, PostureContext } from '../lib/posture-engine';
import { computeMaturityLevel } from '../lib/confidence-engine';

// ============================================================================
// TYPES
// ============================================================================

interface OnboardingTopic {
    key: 'coveredRole' | 'coveredStakeholders' | 'coveredGoals' | 'coveredChallenges' | 'coveredWorkStyle' | 'coveredContext';
    label: string;
    description: string;
}

interface DailyCallAgenda {
    callType: 'onboarding' | 'daily_checkin' | 'callback';
    onboardingTopics?: string[];
    briefingContext?: string;
    pendingNudges?: string[];
    commitmentReminders?: string[];
    meetingSummary?: string;
    userRequest?: string;
}

const ONBOARDING_TOPICS: OnboardingTopic[] = [
    { key: 'coveredRole', label: 'role', description: 'Responsibilities, scope, what they own' },
    { key: 'coveredStakeholders', label: 'stakeholders', description: 'Key people, relationships, allies and blockers' },
    { key: 'coveredGoals', label: 'goals', description: 'Success metrics, KPIs, what they are measured on' },
    { key: 'coveredChallenges', label: 'challenges', description: 'Current blockers, what keeps them up at night' },
    { key: 'coveredWorkStyle', label: 'work_style', description: 'Communication preferences, energy patterns, how they work best' },
    { key: 'coveredContext', label: 'context', description: 'Company context, team dynamics, org culture' },
];

// ============================================================================
// 1. SCHEDULE DAILY CALL
// ============================================================================

/**
 * Called by cron every 5 minutes. Checks if a user's daily call time is
 * within the next 5 minutes, and if so, creates a ScheduledCall record.
 *
 * Supports two modes:
 * 1. Standard: single daily call at dailyCallTime
 * 2. Multi-call: repeated calls every callFrequencyMinutes within callWindowStart-callWindowEnd
 */
export async function scheduleDailyCall(userId: string): Promise<void> {
    // Fetch user preferences
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: {
            dailyCallEnabled: true,
            dailyCallTime: true,
            timezone: true,
            preferredChannel: true,
            callScheduleMode: true,
            meetingPrepLeadMinutes: true,
            meetingPrepMinGap: true,
            maxCallsPerDay: true,
            callFrequencyMinutes: true,
            callWindowStart: true,
            callWindowEnd: true,
            quietHoursStart: true,
            quietHoursEnd: true,
        },
    });

    if (!prefs?.dailyCallEnabled || prefs.preferredChannel !== 'voice') {
        return;
    }

    const timezone = prefs.timezone || 'Asia/Kolkata';
    const mode = prefs.callScheduleMode || 'calendar_aware';

    // Signal-driven mode: schedule based on signal evaluation
    if (mode === 'signal_driven') {
        await scheduleSignalDrivenCall(userId, prefs, timezone);
        return;
    }

    // Calendar-aware mode: schedule calls before meetings
    if (mode === 'calendar_aware') {
        await scheduleCalendarAwareCalls(userId, prefs, timezone);
        // Shadow mode: log what signal-driven would have done
        runShadowEvaluation(userId).catch(() => {});
        return;
    }

    // Multi-call mode: repeated calls within a window
    if (prefs.callFrequencyMinutes && prefs.callWindowStart && prefs.callWindowEnd) {
        await scheduleMultiCall(userId, prefs as MultiCallPrefs, timezone);
        return;
    }

    // Fixed-time mode: single daily call at dailyCallTime
    await scheduleFixedTimeCall(userId, prefs, timezone);
}

/**
 * Calendar-aware scheduling: scan today's meetings and place calls
 * in the gap before them. Falls back to dailyCallTime on no-meeting days.
 *
 * Runs every 5 minutes. For each upcoming meeting:
 * - If the meeting starts within [leadMinutes, leadMinutes + 5] from now,
 *   and there's enough gap before it (no overlapping meeting), schedule a call.
 * - Respects maxCallsPerDay.
 * - Falls back to dailyCallTime if no meetings remain today.
 */
async function scheduleCalendarAwareCalls(
    userId: string,
    prefs: {
        dailyCallTime: string;
        meetingPrepLeadMinutes: number | null;
        meetingPrepMinGap: number | null;
        maxCallsPerDay: number | null;
        quietHoursStart: string;
        quietHoursEnd: string;
    },
    timezone: string,
): Promise<void> {
    const leadMinutes = prefs.meetingPrepLeadMinutes ?? 15;
    const minGap = prefs.meetingPrepMinGap ?? 12;
    const maxCalls = prefs.maxCallsPerDay ?? 3;

    const nowUTC = new Date();
    const userNow = getTimeInTimezone(nowUTC, timezone);

    // Compute today's boundaries in UTC
    const todayStart = new Date(userNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(userNow);
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartUTC = convertLocalToUTC(todayStart, timezone);
    const todayEndUTC = convertLocalToUTC(todayEnd, timezone);

    // How many calls already scheduled/completed today?
    const todayCallCount = await prisma.scheduledCall.count({
        where: {
            userId,
            scheduledFor: { gte: todayStartUTC, lte: todayEndUTC },
            status: { in: ['pending', 'calling', 'completed'] },
            retryOf: null,
        },
    });

    if (todayCallCount >= maxCalls) {
        return; // Hit daily cap
    }

    // Check for any pending call already queued (don't stack)
    const pendingCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            status: { in: ['pending', 'calling'] },
            retryOf: null,
        },
    });
    if (pendingCall) {
        return; // Already have a call waiting
    }

    // Fetch today's upcoming meetings (not cancelled)
    const upcomingMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: nowUTC },
            endTime: { lte: todayEndUTC },
            status: { not: 'cancelled' },
        },
        select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            meetingCategory: true,
            participants: true,
        },
        orderBy: { startTime: 'asc' },
    });

    // Find the next meeting we can prep for
    for (let i = 0; i < upcomingMeetings.length; i++) {
        const meeting = upcomingMeetings[i];
        const meetingStartLocal = getTimeInTimezone(meeting.startTime, timezone);
        const minutesUntilMeeting = (meetingStartLocal.getTime() - userNow.getTime()) / (60 * 1000);

        // Only consider meetings starting within [leadMinutes - 2, leadMinutes + 5] from now
        // The -2 gives us a small buffer so we don't miss meetings at the edge
        if (minutesUntilMeeting < (leadMinutes - 2) || minutesUntilMeeting > (leadMinutes + 5)) {
            continue;
        }

        // Check if there's enough gap before this meeting (no prior meeting ending too close)
        if (i > 0) {
            const prevMeeting = upcomingMeetings[i - 1];
            const prevEndLocal = getTimeInTimezone(prevMeeting.endTime, timezone);
            const gapMinutes = (meetingStartLocal.getTime() - prevEndLocal.getTime()) / (60 * 1000);
            if (gapMinutes < minGap) {
                continue; // Not enough gap — back-to-back meetings
            }
        }

        // Also check if user is currently in a meeting (don't call during meetings)
        const currentMeeting = await prisma.meetingSyncRecord.findFirst({
            where: {
                userId,
                startTime: { lte: nowUTC },
                endTime: { gte: nowUTC },
                status: { not: 'cancelled' },
            },
        });
        if (currentMeeting) {
            continue; // User is in a meeting right now
        }

        // Check if we already scheduled a call for this meeting
        const existingPrepCall = await prisma.scheduledCall.findFirst({
            where: {
                userId,
                meetingId: meeting.id,
                status: { notIn: ['cancelled'] },
            },
        });
        if (existingPrepCall) {
            continue; // Already prepped for this meeting
        }

        // Check quiet hours
        if (isInQuietHours(userNow, prefs.quietHoursStart, prefs.quietHoursEnd)) {
            continue;
        }

        // Schedule the prep call!
        const callType = await determineCallType(userId);
        const agenda = await buildDailyCallAgenda(userId);

        // Schedule the call for now (it'll be picked up by the executor within 5 min)
        await prisma.scheduledCall.create({
            data: {
                userId,
                scheduledFor: nowUTC,
                callType,
                meetingId: meeting.id,
                status: 'pending',
                agenda: {
                    ...(agenda as object),
                    prepForMeeting: {
                        title: meeting.title,
                        startsAt: meeting.startTime.toISOString(),
                        category: meeting.meetingCategory,
                        participants: meeting.participants,
                    },
                } as object,
            },
        });

        console.log(`[DailyCall] Calendar-aware: scheduled ${callType} for ${userId.substring(0, 8)}, ${leadMinutes}min before "${meeting.title}"`);
        return; // One call at a time
    }

    // No meetings to prep for — check if we should fall back to daily check-in
    // Only do the fallback if there are no meetings at all today AND no calls today
    if (upcomingMeetings.length === 0 && todayCallCount === 0) {
        await scheduleFixedTimeCall(userId, prefs, timezone);
    }
}

/**
 * Check if current time is within quiet hours (DND window).
 */
// ============================================================================
// DAY PLANNER — Pre-schedules the day's calls before the user wakes up
// ============================================================================

/**
 * Run once per user at ~6 AM local time. Evaluates signals, scans the calendar,
 * and pre-schedules all calls for the day with specific times and postures.
 *
 * The 15-min cron can still add/remove calls as events change during the day.
 */
export async function planDayForUser(userId: string): Promise<void> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: {
            dailyCallEnabled: true,
            preferredChannel: true,
            dailyCallTime: true,
            timezone: true,
            callScheduleMode: true,
            maxCallsPerDay: true,
            quietHoursStart: true,
            quietHoursEnd: true,
            meetingPrepLeadMinutes: true,
            primaryArchetype: true,
        },
    });

    if (!prefs?.dailyCallEnabled || prefs.preferredChannel !== 'voice') return;

    const timezone = prefs.timezone || 'Asia/Kolkata';
    const now = new Date();
    const localNow = getTimeInTimezone(now, timezone);
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Only run if it's early morning (5-7 AM local) and no plan exists today
    const localHour = localNow.getHours();
    if (localHour < 5 || localHour > 7) return;

    const existingPlanned = await prisma.scheduledCall.count({
        where: { userId, scheduledFor: { gte: todayStart, lt: todayEnd }, status: 'pending' },
    });
    if (existingPlanned > 0) return; // already planned

    // Get today's meetings
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: now, lt: todayEnd },
            status: { not: 'cancelled' },
        },
        select: {
            id: true, title: true, startTime: true, endTime: true,
            meetingCategory: true, participants: true,
        },
        orderBy: { startTime: 'asc' },
    });

    // Collect signals for posture
    const signals = await collectSignals(userId);
    const personalContext = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true },
    }).catch(() => null);
    const callCount = personalContext?.callCount ?? 0;

    const maturityLevel = await computeMaturityLevel(userId).catch(() =>
        callCount < 5 ? 'LEARNING' as const : callCount < 15 ? 'OBSERVING' as const : 'COACHING' as const
    );

    const maxCalls = prefs.maxCallsPerDay ?? 3;
    const leadMin = prefs.meetingPrepLeadMinutes ?? 15;
    const plannedCalls: Array<{ time: Date; type: string; meetingId?: string; posture: string }> = [];

    // 1. Morning call at preferred time
    const [morningH, morningM] = (prefs.dailyCallTime || '07:45').split(':').map(Number);
    const morningLocal = new Date(localNow);
    morningLocal.setHours(morningH, morningM, 0, 0);
    const morningUTC = convertLocalToUTC(morningLocal, timezone);

    if (morningUTC > now) {
        const postureCtx: PostureContext = {
            callType: callCount < 5 ? 'onboarding' : 'daily_checkin',
            callCount,
            maturityLevel,
            archetype: prefs.primaryArchetype || null,
            hasRecentLanded: signals.some(s => s.type === 'recent_landed'),
            hasRecentMissed: signals.some(s => s.type === 'recent_missed'),
            overdueCommitmentCount: signals.filter(s => s.type === 'stale_commitment').length,
            meetingCount: meetings.length,
            isLightDay: meetings.length <= 2,
        };
        const posture = selectPosture(postureCtx);
        plannedCalls.push({
            time: morningUTC,
            type: callCount < 5 ? 'onboarding' : 'daily_checkin',
            posture: posture.primary,
        });
    }

    // 2. Pre-meeting prep calls for high-stakes meetings
    for (const meeting of meetings) {
        if (plannedCalls.length >= maxCalls) break;

        const isHighStakes = meeting.meetingCategory === 'NEEDLE_MOVER' ||
            (meeting.participants && Array.isArray(meeting.participants) && (meeting.participants as string[]).length >= 5);

        if (!isHighStakes) continue;

        const prepTime = new Date(meeting.startTime.getTime() - leadMin * 60 * 1000);
        if (prepTime <= now) continue;

        // Don't schedule too close to another planned call (30-min gap)
        const tooClose = plannedCalls.some(pc =>
            Math.abs(pc.time.getTime() - prepTime.getTime()) < 30 * 60 * 1000
        );
        if (tooClose) continue;

        plannedCalls.push({
            time: prepTime,
            type: 'daily_checkin',
            meetingId: meeting.id,
            posture: 'prepare',
        });
    }

    // 3. Post-meeting debrief for the highest-stakes meeting (schedule tentatively)
    const topMeeting = meetings.find(m => m.meetingCategory === 'NEEDLE_MOVER');
    if (topMeeting && plannedCalls.length < maxCalls) {
        const debriefTime = new Date(topMeeting.endTime.getTime() + 20 * 60 * 1000);
        if (debriefTime < todayEnd) {
            const tooClose = plannedCalls.some(pc =>
                Math.abs(pc.time.getTime() - debriefTime.getTime()) < 30 * 60 * 1000
            );
            if (!tooClose) {
                plannedCalls.push({
                    time: debriefTime,
                    type: 'daily_checkin',
                    meetingId: topMeeting.id,
                    posture: 'debrief',
                });
            }
        }
    }

    // Create ScheduledCall records
    for (const plan of plannedCalls) {
        await prisma.scheduledCall.create({
            data: {
                userId,
                scheduledFor: plan.time,
                callType: plan.type,
                status: 'pending',
                primaryPosture: plan.posture,
                meetingId: plan.meetingId,
                agenda: {
                    plannedAt: now.toISOString(),
                    source: 'day_planner',
                    ...(plan.meetingId ? { prepForMeetingId: plan.meetingId } : {}),
                } as object,
            },
        });
    }

    if (plannedCalls.length > 0) {
        const summary = plannedCalls.map(p => {
            const localTime = getTimeInTimezone(p.time, timezone);
            return `${localTime.getHours()}:${String(localTime.getMinutes()).padStart(2, '0')} ${p.posture}${p.meetingId ? ' (meeting)' : ''}`;
        }).join(', ');
        console.log(`[DayPlanner] user=${userId.substring(0, 8)} planned ${plannedCalls.length} calls: ${summary}`);
    }
}

/**
 * Dispatch day planner for all voice-enabled users.
 * Should run via cron every 15 min (same as scheduler) — the function
 * self-gates to only execute during the 5-7 AM local window.
 */
export async function dispatchDayPlanner(): Promise<void> {
    return withAgentRun('day-planner', undefined, 'cron', async (ctx) => {
        const users = await prisma.userPreferences.findMany({
            where: { dailyCallEnabled: true, preferredChannel: 'voice' },
            select: { userId: true },
        });

        for (const { userId } of users) {
            try {
                await planDayForUser(userId);
                ctx.itemsProcessed++;
            } catch (error: unknown) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[DayPlanner] Failed for ${userId.substring(0, 8)}: ${errMsg}`);
                ctx.itemsSkipped++;
            }
        }

        ctx.logs.push(`Day planner checked ${users.length} users`);
    });
}

function isInQuietHours(userNow: Date, quietStart: string, quietEnd: string): boolean {
    const nowMinutes = userNow.getHours() * 60 + userNow.getMinutes();
    const [startH, startM] = quietStart.split(':').map(Number);
    const [endH, endM] = quietEnd.split(':').map(Number);
    if (isNaN(startH) || isNaN(endH)) return false;

    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    // Handle overnight quiet hours (e.g., 21:00 - 08:00)
    if (startMin > endMin) {
        return nowMinutes >= startMin || nowMinutes < endMin;
    }
    return nowMinutes >= startMin && nowMinutes < endMin;
}

/**
 * Determine whether to use onboarding or daily_checkin call type.
 */
async function determineCallType(userId: string): Promise<string> {
    const onboarding = await prisma.onboardingProgress.findUnique({
        where: { userId },
    });

    const completedCallCount = await prisma.voiceCall.count({
        where: { userId, status: 'ended' },
    });

    let isOnboarding = !onboarding || !onboarding.onboardingComplete;
    if (isOnboarding && completedCallCount >= 10) {
        console.log(`[DailyCall] Graduating ${userId.substring(0, 8)} to daily calls (${completedCallCount} calls, onboarding topics still collecting in background)`);
        isOnboarding = false;
    }
    return isOnboarding ? 'onboarding' : 'daily_checkin';
}

/**
 * Fixed-time mode: schedule a single daily call at dailyCallTime.
 * Uses a wider 7-minute window (up from 5) to reduce misses with the 5-min cron.
 */
async function scheduleFixedTimeCall(
    userId: string,
    prefs: { dailyCallTime: string; quietHoursStart: string; quietHoursEnd: string },
    timezone: string,
): Promise<void> {
    const dailyCallTime = prefs.dailyCallTime || '07:45';
    const [hours, minutes] = dailyCallTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
        console.warn(`[DailyCall] Invalid dailyCallTime "${dailyCallTime}" for user ${userId.substring(0, 8)}`);
        return;
    }

    const nowUTC = new Date();
    const userNow = getTimeInTimezone(nowUTC, timezone);
    const callTimeToday = new Date(userNow);
    callTimeToday.setHours(hours, minutes, 0, 0);

    // Wider window (7 min) to avoid the cron-alignment miss
    const diffMs = callTimeToday.getTime() - userNow.getTime();
    if (diffMs < -2 * 60 * 1000 || diffMs > 5 * 60 * 1000) {
        return;
    }

    // Check quiet hours
    if (isInQuietHours(userNow, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        return;
    }

    const callTimeUTC = convertLocalToUTC(callTimeToday, timezone);

    // Check if already scheduled today
    const todayStart = new Date(userNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(userNow);
    todayEnd.setHours(23, 59, 59, 999);
    const todayStartUTC = convertLocalToUTC(todayStart, timezone);
    const todayEndUTC = convertLocalToUTC(todayEnd, timezone);

    const existingCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            scheduledFor: { gte: todayStartUTC, lte: todayEndUTC },
            status: { in: ['pending', 'calling', 'completed'] },
            retryOf: null,
        },
    });

    if (existingCall) {
        return;
    }

    const callType = await determineCallType(userId);
    const agenda = await buildDailyCallAgenda(userId);

    await prisma.scheduledCall.create({
        data: {
            userId,
            scheduledFor: callTimeUTC,
            callType,
            status: 'pending',
            agenda: agenda as object,
        },
    });

    console.log(`[DailyCall] Fixed-time: scheduled ${callType} for ${userId.substring(0, 8)} at ${callTimeUTC.toISOString()}`);
}

// ============================================================================
// MULTI-CALL SCHEDULING — repeated calls within a time window
// ============================================================================

interface MultiCallPrefs {
    callFrequencyMinutes: number;
    callWindowStart: string;   // HH:MM
    callWindowEnd: string;     // HH:MM
    dailyCallTime: string;
    timezone: string | null;
}

/**
 * Schedule calls at regular intervals (e.g., every 60 min from 10:00-19:00).
 * Only schedules the NEXT upcoming call, not all at once.
 */
async function scheduleMultiCall(
    userId: string,
    prefs: MultiCallPrefs,
    timezone: string,
): Promise<void> {
    const freqMin = prefs.callFrequencyMinutes;
    const [startH, startM] = prefs.callWindowStart.split(':').map(Number);
    const [endH, endM] = prefs.callWindowEnd.split(':').map(Number);

    if ([startH, startM, endH, endM].some(isNaN)) {
        console.warn(`[DailyCall] Invalid multi-call window for user ${userId.substring(0, 8)}`);
        return;
    }

    const nowUTC = new Date();
    const userNow = getTimeInTimezone(nowUTC, timezone);

    // Build window boundaries for today
    const windowStart = new Date(userNow);
    windowStart.setHours(startH, startM, 0, 0);
    const windowEnd = new Date(userNow);
    windowEnd.setHours(endH, endM, 0, 0);

    // Outside the call window — nothing to do
    if (userNow < windowStart || userNow > windowEnd) {
        return;
    }

    // Find the most recent call for this user today
    const todayStart = new Date(userNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(userNow);
    todayEnd.setHours(23, 59, 59, 999);

    const todayStartUTC = convertLocalToUTC(todayStart, timezone);
    const todayEndUTC = convertLocalToUTC(todayEnd, timezone);

    // Check for any pending call already scheduled
    const pendingCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            scheduledFor: { gte: todayStartUTC, lte: todayEndUTC },
            status: { in: ['pending', 'calling'] },
            retryOf: null,
        },
    });

    if (pendingCall) {
        return; // Already have a pending call waiting
    }

    // Find the last completed/no_answer call today
    const lastCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            scheduledFor: { gte: todayStartUTC, lte: todayEndUTC },
            retryOf: null,
        },
        orderBy: { scheduledFor: 'desc' },
    });

    // Determine the next call time
    let nextCallLocal: Date;
    if (!lastCall) {
        // No calls yet today — schedule at window start or now, whichever is later
        nextCallLocal = userNow > windowStart ? userNow : windowStart;
    } else {
        // Schedule freqMin after the last scheduled call
        const lastCallLocal = getTimeInTimezone(lastCall.scheduledFor, timezone);
        nextCallLocal = new Date(lastCallLocal.getTime() + freqMin * 60 * 1000);
    }

    // Check if next call is within the 5-minute cron window and within call window
    const diffMs = nextCallLocal.getTime() - userNow.getTime();
    if (diffMs < 0 || diffMs > 5 * 60 * 1000) {
        return; // Not within the 5-minute window
    }
    if (nextCallLocal > windowEnd) {
        return; // Past the call window end
    }

    const nextCallUTC = convertLocalToUTC(nextCallLocal, timezone);

    // Determine call type
    const onboarding = await prisma.onboardingProgress.findUnique({
        where: { userId },
    });
    const isOnboarding = !onboarding || !onboarding.onboardingComplete;
    const callType = isOnboarding ? 'onboarding' : 'daily_checkin';

    const agenda = await buildDailyCallAgenda(userId);

    await prisma.scheduledCall.create({
        data: {
            userId,
            scheduledFor: nextCallUTC,
            callType,
            status: 'pending',
            agenda: agenda as object,
        },
    });

    const callNum = lastCall ? 'next' : 'first';
    console.log(`[DailyCall] Multi-call: scheduled ${callNum} ${callType} for ${userId.substring(0, 8)} at ${nextCallUTC.toISOString()} (every ${freqMin}min)`);
}

// ============================================================================
// 2. EXECUTE DAILY CALL
// ============================================================================

/**
 * Called when it's time to make a scheduled call. Triggers the voice call
 * via Vapi and handles retry logic if the call doesn't connect.
 */
export async function executeDailyCall(scheduledCallId: string): Promise<void> {
    const scheduledCall = await prisma.scheduledCall.findUnique({
        where: { id: scheduledCallId },
    });

    if (!scheduledCall) {
        console.warn(`[DailyCall] ScheduledCall ${scheduledCallId} not found`);
        return;
    }

    if (scheduledCall.status !== 'pending') {
        console.log(`[DailyCall] ScheduledCall ${scheduledCallId} already in status "${scheduledCall.status}", skipping`);
        return;
    }

    const userId = scheduledCall.userId;

    // Update status to calling
    await prisma.scheduledCall.update({
        where: { id: scheduledCallId },
        data: { status: 'calling' },
    });

    // Map our call types to VoiceCallType
    const voiceCallType = scheduledCall.callType === 'onboarding' ? 'onboarding'
        : scheduledCall.meetingId ? 'pre_meeting_prep'
        : 'daily_checkin';

    try {
        // Pass pre-selected posture from signal-driven scheduling if available
        const postureOverride = scheduledCall.primaryPosture
            ? { primary: scheduledCall.primaryPosture, secondary: scheduledCall.secondaryPosture || undefined }
            : undefined;

        const success = await triggerVoiceCall({
            userId,
            callType: voiceCallType as 'onboarding' | 'daily_checkin' | 'pre_meeting_prep',
            meetingId: scheduledCall.meetingId || undefined,
            posture: postureOverride,
        });

        if (!success) {
            console.log(`[DailyCall] Call didn't connect for user ${userId.substring(0, 8)}`);

            await prisma.scheduledCall.update({
                where: { id: scheduledCallId },
                data: { status: 'no_answer', outcome: 'no_answer' },
            });

            // Schedule retry if within limits
            await scheduleRetry(scheduledCallId, userId);
        }
        // If success, the call is in progress — outcome will be handled by handleCallOutcome
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[DailyCall] Failed to trigger call for ${userId.substring(0, 8)}: ${errMsg}`);

        await prisma.scheduledCall.update({
            where: { id: scheduledCallId },
            data: { status: 'no_answer', outcome: 'error' },
        });

        await scheduleRetry(scheduledCallId, userId);
    }
}

/**
 * Schedule a retry call if the original didn't connect and retries remain.
 */
async function scheduleRetry(originalCallId: string, userId: string): Promise<void> {
    const originalCall = await prisma.scheduledCall.findUnique({
        where: { id: originalCallId },
    });

    if (!originalCall) return;

    // Get retry settings
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { dailyCallRetryAfterMin: true, dailyCallMaxRetries: true },
    });

    const retryAfterMin = prefs?.dailyCallRetryAfterMin ?? 60;
    const maxRetries = prefs?.dailyCallMaxRetries ?? 1;

    // Track retry count from the root call
    const rootCallId = originalCall.retryOf || originalCall.id;
    const currentRetryCount = originalCall.retryCount;

    if (currentRetryCount >= maxRetries) {
        console.log(`[DailyCall] Max retries (${maxRetries}) reached for user ${userId.substring(0, 8)}`);
        return;
    }

    const retryAt = new Date(Date.now() + retryAfterMin * 60 * 1000);

    await prisma.scheduledCall.create({
        data: {
            userId,
            scheduledFor: retryAt,
            callType: originalCall.callType,
            status: 'pending',
            retryOf: rootCallId,
            retryCount: currentRetryCount + 1,
            agenda: (originalCall.agenda as object) || undefined,
            // Carry posture forward from original call
            primaryPosture: originalCall.primaryPosture,
            secondaryPosture: originalCall.secondaryPosture,
            triggerSignals: originalCall.triggerSignals || undefined,
            callWorthiness: originalCall.callWorthiness,
        },
    });

    console.log(`[DailyCall] Retry ${currentRetryCount + 1}/${maxRetries} scheduled for ${retryAt.toISOString()} posture=${originalCall.primaryPosture || 'none'}`);
}

// ============================================================================
// 3. HANDLE CALL OUTCOME
// ============================================================================

/**
 * Called from the Vapi webhook after a call ends. Updates the ScheduledCall
 * status and handles callbacks, onboarding progress, etc.
 */
export async function handleCallOutcome(
    userId: string,
    voiceCallId: string,
    outcome: string,
    callbackTime?: Date,
): Promise<void> {
    // Find the most recent calling/pending ScheduledCall for this user
    const scheduledCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            status: { in: ['calling', 'pending'] },
        },
        orderBy: { scheduledFor: 'desc' },
    });

    if (!scheduledCall) {
        console.warn(`[DailyCall] No active ScheduledCall found for user ${userId.substring(0, 8)} (voiceCallId: ${voiceCallId})`);
        return;
    }

    // Update the scheduled call
    await prisma.scheduledCall.update({
        where: { id: scheduledCall.id },
        data: {
            status: outcome === 'completed' ? 'completed' : outcome === 'call_later' ? 'rescheduled' : outcome,
            outcome,
            voiceCallId,
            completedAt: new Date(),
            callbackTime: callbackTime || null,
        },
    });

    console.log(`[DailyCall] Call outcome for ${userId.substring(0, 8)}: ${outcome}`);

    // Handle "call me later" — schedule a callback
    if (outcome === 'call_later' && callbackTime) {
        await prisma.scheduledCall.create({
            data: {
                userId,
                scheduledFor: callbackTime,
                callType: 'callback',
                status: 'pending',
                agenda: (scheduledCall.agenda as object) || undefined,
            },
        });
        console.log(`[DailyCall] Callback scheduled for ${callbackTime.toISOString()}`);
    }

    // Handle completed calls — update onboarding progress if applicable
    if (outcome === 'completed' && scheduledCall.callType === 'onboarding') {
        await updateOnboardingProgress(userId, voiceCallId);
    }
}

/**
 * Analyze the call transcript and update onboarding progress.
 */
async function updateOnboardingProgress(userId: string, voiceCallId: string): Promise<void> {
    // Fetch the voice call transcript
    const voiceCall = await prisma.voiceCall.findFirst({
        where: {
            OR: [
                { id: voiceCallId },
                { vapiCallId: voiceCallId },
            ],
        },
        select: { transcript: true },
    });

    if (!voiceCall?.transcript) {
        console.log(`[DailyCall] No transcript found for voice call ${voiceCallId}, skipping onboarding update`);
        return;
    }

    // Use LLM to analyze what topics were covered
    try {
        const config = await getUserLLMConfig(userId);
        if (config.provider === 'none') return;

        const analysisPrompt = `Analyze this coaching call transcript and determine which onboarding topics were meaningfully discussed by the USER.

TRANSCRIPT:
${voiceCall.transcript}

LAYER 1 — THE PERSON:
- story: Did they share how they got to where they are, their career journey, what shaped them?
- drives_and_values: Did they reveal what motivates them, personal values, what they care about deeply?
- life: Did they share about family, interests, hobbies, what they do outside work?

LAYER 2 — THE LEADER:
- role: Did they discuss their responsibilities, scope, what they own?
- stakeholders: Did they mention key people, relationships, allies/blockers?
- leadership_style: Did they reveal how they make decisions, communicate, handle conflict?

LAYER 3 — THE AMBITION:
- goals: Did they discuss what success looks like, KPIs, aspirations?
- challenges: Did they discuss current blockers, frustrations, what keeps them up?
- growth: Did they share what they want to get better at, skills they're developing?

Respond ONLY with a JSON object mapping topic keys to boolean values.
Example: {"story": false, "drives_and_values": true, "life": false, "role": true, "stakeholders": true, "leadership_style": false, "goals": false, "challenges": false, "growth": false}`;

        const result = await withLLMRetry(
            () => generateText(config, analysisPrompt, { userId }),
            { label: 'OnboardingAnalysis' },
        );

        // Parse the JSON response
        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) return;

        const covered = JSON.parse(jsonMatch[0]) as Record<string, boolean>;

        // Build the update data — only set fields to true, never back to false
        const updateData: Record<string, boolean | number | Date> = {
            totalOnboardingCalls: { increment: 1 } as unknown as number,
            lastOnboardingCallAt: new Date(),
        };

        // Layer 1: The Person
        if (covered.story) updateData.coveredStory = true;
        if (covered.drives_and_values) updateData.coveredDrivesAndValues = true;
        if (covered.life) updateData.coveredLife = true;
        // Layer 2: The Leader
        if (covered.role) updateData.coveredRole = true;
        if (covered.stakeholders) updateData.coveredStakeholders = true;
        if (covered.leadership_style) updateData.coveredLeadershipStyle = true;
        // Layer 3: The Ambition
        if (covered.goals) updateData.coveredGoals = true;
        if (covered.challenges) updateData.coveredChallenges = true;
        if (covered.growth) updateData.coveredGrowth = true;

        const progress = await prisma.onboardingProgress.upsert({
            where: { userId },
            create: {
                userId,
                coveredStory: covered.story || false,
                coveredDrivesAndValues: covered.drives_and_values || false,
                coveredLife: covered.life || false,
                coveredRole: covered.role || false,
                coveredStakeholders: covered.stakeholders || false,
                coveredLeadershipStyle: covered.leadership_style || false,
                coveredGoals: covered.goals || false,
                coveredChallenges: covered.challenges || false,
                coveredGrowth: covered.growth || false,
                totalOnboardingCalls: 1,
                lastOnboardingCallAt: new Date(),
            },
            update: updateData,
        });

        // Check if all 9 topics are now covered
        const allCovered =
            progress.coveredStory && progress.coveredDrivesAndValues && progress.coveredLife &&
            progress.coveredRole && progress.coveredStakeholders && progress.coveredLeadershipStyle &&
            progress.coveredGoals && progress.coveredChallenges && progress.coveredGrowth;

        if (allCovered && !progress.onboardingComplete) {
            await prisma.onboardingProgress.update({
                where: { userId },
                data: { onboardingComplete: true },
            });
            console.log(`[DailyCall] Onboarding complete for user ${userId.substring(0, 8)}!`);
        }

        console.log(`[DailyCall] Onboarding progress updated for ${userId.substring(0, 8)}: ${JSON.stringify(covered)}`);
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[DailyCall] Failed to analyze onboarding transcript: ${errMsg}`);
    }
}

// ============================================================================
// 4. BUILD DAILY CALL AGENDA
// ============================================================================

/**
 * Determines what the daily call should cover, adapting based on
 * onboarding status, today's schedule, and pending items.
 */
export async function buildDailyCallAgenda(userId: string): Promise<DailyCallAgenda> {
    const onboarding = await prisma.onboardingProgress.findUnique({
        where: { userId },
    });

    const isOnboarding = !onboarding || !onboarding.onboardingComplete;

    if (isOnboarding) {
        return buildOnboardingAgenda(onboarding);
    }

    return buildCheckinAgenda(userId);
}

/**
 * Build agenda for an onboarding call — picks the next uncovered topic.
 */
function buildOnboardingAgenda(
    progress: { coveredRole: boolean; coveredStakeholders: boolean; coveredGoals: boolean; coveredChallenges: boolean; coveredWorkStyle: boolean; coveredContext: boolean } | null,
): DailyCallAgenda {
    const uncovered: string[] = [];

    for (const topic of ONBOARDING_TOPICS) {
        if (!progress || !progress[topic.key]) {
            uncovered.push(topic.label);
        }
    }

    // Prioritize: role first, then stakeholders, then goals, etc.
    // The order in ONBOARDING_TOPICS is already the priority order
    return {
        callType: 'onboarding',
        onboardingTopics: uncovered.slice(0, 2), // Focus on 1-2 topics per call
    };
}

/**
 * Build agenda for a post-onboarding daily check-in.
 * Blends morning brief content with coaching nudges.
 */
async function buildCheckinAgenda(userId: string): Promise<DailyCallAgenda> {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's meetings
    const todayMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: now, lte: endOfDay },
            status: { not: 'cancelled' },
        },
        select: {
            title: true,
            startTime: true,
            meetingCategory: true,
            participants: true,
        },
        orderBy: { startTime: 'asc' },
        take: 10,
    });

    // Build a meeting summary
    let meetingSummary: string | undefined;
    if (todayMeetings.length > 0) {
        const meetingLines = todayMeetings.map(m => {
            const time = m.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const category = m.meetingCategory ? ` [${m.meetingCategory}]` : '';
            return `${time} — ${m.title}${category}`;
        });
        meetingSummary = meetingLines.join('\n');
    }

    // Fetch pending nudges
    const pendingNudges = await prisma.pendingNudge.findMany({
        where: { userId, delivered: false },
        select: { content: true, priority: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
    });

    // Fetch overdue commitments
    const overdueActions = await prisma.relationshipAction.findMany({
        where: {
            goal: { userId },
            status: 'IN_PROGRESS',
            dueDate: { lt: now },
        },
        select: { description: true },
        take: 3,
    });

    return {
        callType: 'daily_checkin',
        meetingSummary,
        pendingNudges: pendingNudges.length > 0 ? pendingNudges.map(n => n.content) : undefined,
        commitmentReminders: overdueActions.length > 0 ? overdueActions.map(a => a.description) : undefined,
    };
}

// ============================================================================
// 5. TRIGGER FIRST CALL
// ============================================================================

/**
 * Called immediately when a user first signs up and chooses voice.
 * Creates a ScheduledCall with callType 'onboarding' and executes it now.
 */
export async function triggerFirstCall(userId: string): Promise<void> {
    // Create the scheduled call record
    const scheduledCall = await prisma.scheduledCall.create({
        data: {
            userId,
            scheduledFor: new Date(),
            callType: 'onboarding',
            status: 'pending',
            agenda: {
                callType: 'onboarding',
                onboardingTopics: ['role', 'stakeholders'],
            },
        },
    });

    console.log(`[DailyCall] First call created for new user ${userId.substring(0, 8)}`);

    // Execute immediately
    await executeDailyCall(scheduledCall.id);
}

// ============================================================================
// CRON DISPATCHER — finds pending calls that need execution
// ============================================================================

/**
 * Called by the cron-daily-call-scheduler worker. Finds all users with
 * daily calls enabled and schedules their calls if needed.
 */
export async function dispatchDailyCallScheduler(): Promise<void> {
    return withAgentRun('daily-call-scheduler', undefined, 'cron', async (ctx) => {
        const users = await prisma.userPreferences.findMany({
            where: {
                dailyCallEnabled: true,
                preferredChannel: 'voice',
            },
            select: { userId: true },
        });

        for (const { userId } of users) {
            try {
                // Skip users without voiceAutoSchedule enabled
                const prefs = await prisma.userPreferences.findUnique({
                    where: { userId },
                    select: { voiceAutoSchedule: true },
                });
                if (!prefs?.voiceAutoSchedule) {
                    ctx.itemsSkipped++;
                    continue;
                }

                await scheduleDailyCall(userId);
                ctx.itemsProcessed++;
            } catch (error: unknown) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[DailyCall] Schedule failed for ${userId.substring(0, 8)}: ${errMsg}`);
                ctx.itemsSkipped++;
            }
        }

        ctx.logs.push(`Checked ${users.length} users`);
        console.log(`[DailyCall] Scheduler checked ${users.length} users`);
    });
}

/**
 * Called by the execute-scheduled-call worker. Finds all pending calls
 * that are due and executes them.
 */
export async function dispatchPendingCalls(): Promise<void> {
    return withAgentRun('daily-call-executor', undefined, 'cron', async (ctx) => {
        const now = new Date();

        const pendingCalls = await prisma.scheduledCall.findMany({
            where: {
                status: 'pending',
                scheduledFor: { lte: now },
            },
            orderBy: { scheduledFor: 'asc' },
            take: 20,
        });

        for (const call of pendingCalls) {
            try {
                await executeDailyCall(call.id);
                ctx.itemsProcessed++;
            } catch (error: unknown) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[DailyCall] Execute failed for call ${call.id}: ${errMsg}`);
                ctx.itemsSkipped++;
            }
        }

        if (pendingCalls.length > 0) {
            ctx.logs.push(`Executed ${pendingCalls.length} pending calls`);
            console.log(`[DailyCall] Executed ${pendingCalls.length} pending calls`);
        }
    });
}

// ============================================================================
// TIMEZONE HELPERS
// ============================================================================

/**
 * Get a Date object representing the current time in the user's timezone.
 * The returned Date's getHours()/getMinutes() etc. reflect the local time.
 */
function getTimeInTimezone(utcDate: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(utcDate);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '0';

    return new Date(
        parseInt(get('year')),
        parseInt(get('month')) - 1,
        parseInt(get('day')),
        parseInt(get('hour')),
        parseInt(get('minute')),
        parseInt(get('second')),
    );
}

/**
 * Convert a "local" Date (whose hour/minute represent the user's timezone)
 * back to a proper UTC Date.
 */
function convertLocalToUTC(localDate: Date, timezone: string): Date {
    // Get the current UTC offset for this timezone by comparing
    // a known UTC time with its representation in the timezone
    const now = new Date();
    const utcNow = getTimeInTimezone(now, 'UTC');
    const tzNow = getTimeInTimezone(now, timezone);
    const offsetMs = tzNow.getTime() - utcNow.getTime();

    return new Date(localDate.getTime() - offsetMs);
}

// ============================================================================
// SIGNAL-DRIVEN SCHEDULING (Phase 3)
// ============================================================================

/**
 * Signal-driven scheduling: evaluate signals, compute posture and worthiness,
 * schedule a call only when signals justify it.
 */
async function scheduleSignalDrivenCall(
    userId: string,
    prefs: {
        dailyCallTime: string;
        quietHoursStart: string;
        quietHoursEnd: string;
        maxCallsPerDay?: number | null;
    },
    timezone: string,
): Promise<void> {
    const now = new Date();
    const localNow = getTimeInTimezone(now, timezone);
    const hour = localNow.getHours();
    const minute = localNow.getMinutes();
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // Guard: quiet hours
    if (isInQuietHours(localNow, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        return;
    }

    // Guard: check if in a meeting right now
    const inMeeting = await prisma.meetingSyncRecord.findFirst({
        where: {
            userId,
            startTime: { lte: now },
            endTime: { gte: now },
            status: { not: 'cancelled' },
        },
    }).catch(() => null);
    if (inMeeting) return;

    // Guard: max calls per day
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const callsToday = await prisma.scheduledCall.count({
        where: {
            userId,
            createdAt: { gte: startOfDay },
            status: { in: ['completed', 'calling', 'pending'] },
        },
    });
    const maxCalls = prefs.maxCallsPerDay ?? 3;
    if (callsToday >= maxCalls) return;

    // Guard: 30-min gap from last call
    const lastCall = await prisma.scheduledCall.findFirst({
        where: {
            userId,
            status: { in: ['completed', 'calling'] },
            completedAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) },
        },
    }).catch(() => null);
    if (lastCall) return;

    // Guard: pending call already exists
    const pendingCall = await prisma.scheduledCall.findFirst({
        where: { userId, status: 'pending' },
    }).catch(() => null);
    if (pendingCall) return;

    // Collect signals and evaluate
    const signals = await collectSignals(userId);
    const evaluation = await evaluateCallWorthiness(userId, signals);

    // Min 1/day guarantee: force a call if past preferred morning time and no call today
    const completedToday = await prisma.scheduledCall.count({
        where: {
            userId,
            createdAt: { gte: startOfDay },
            status: 'completed',
        },
    });
    const [prefHour] = (prefs.dailyCallTime || '07:45').split(':').map(Number);
    const pastMorning = hour > (prefHour + 2); // 2 hours past preferred time
    const forceDailyCall = completedToday === 0 && pastMorning;

    // Onboarding override: first 7 days, guarantee 1 call/day
    const personalContext = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true },
    }).catch(() => null);
    const callCount = personalContext?.callCount ?? 0;
    const onboardingOverride = callCount < 7 && completedToday === 0 && hour >= prefHour;

    if (!evaluation.shouldCall && !forceDailyCall && !onboardingOverride) {
        console.log(`[SignalScheduler] user=${userId.substring(0, 8)} worthiness=${evaluation.callWorthiness} fatigue=${evaluation.fatigueThreshold} — suppressed`);
        return;
    }

    // Select posture
    const maturityLevel = await computeMaturityLevel(userId).catch(() =>
        callCount < 5 ? 'LEARNING' as const : callCount < 15 ? 'OBSERVING' as const : 'COACHING' as const
    );

    const userPrefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { primaryArchetype: true },
    }).catch(() => null);

    const postureCtx: PostureContext = {
        callType: 'daily_checkin',
        callCount,
        maturityLevel,
        archetype: userPrefs?.primaryArchetype || null,
        hasRecentLanded: signals.some(s => s.type === 'recent_landed'),
        hasRecentMissed: signals.some(s => s.type === 'recent_missed'),
        overdueCommitmentCount: signals.filter(s => s.type === 'stale_commitment').length,
        meetingCount: signals.filter(s => s.dimension === 'calendar' && s.type === 'meeting_imminent').length,
        isLightDay: signals.some(s => s.type === 'light_day'),
        depthTrendingUp: signals.some(s => s.type === 'depth_trending_up'),
        engagementTrendingDown: signals.some(s => s.type === 'engagement_trending_down'),
    };

    const posture = selectPosture(postureCtx);

    // Determine call type
    const isOnboarding = callCount < 5;
    const callType = isOnboarding ? 'onboarding' : 'daily_checkin';

    // Serialize signals for storage (strip detail for compact storage)
    const signalsForStorage = signals.map(s => ({
        dimension: s.dimension,
        type: s.type,
        strength: s.strength,
        postureAffinity: s.postureAffinity,
    }));

    // Create ScheduledCall with posture + signals
    await prisma.scheduledCall.create({
        data: {
            userId,
            scheduledFor: now,
            callType,
            status: 'pending',
            primaryPosture: posture.primary,
            secondaryPosture: posture.secondary,
            triggerSignals: signalsForStorage as object[],
            callWorthiness: evaluation.callWorthiness,
            fatigueThreshold: evaluation.fatigueThreshold,
        },
    });

    const reason = forceDailyCall ? 'daily guarantee' : onboardingOverride ? 'onboarding guarantee' : evaluation.reason;
    console.log(`[SignalScheduler] user=${userId.substring(0, 8)} posture=${posture.primary} worthiness=${evaluation.callWorthiness} reason="${reason}" — scheduled`);
}

/**
 * Shadow evaluation: log what signal-driven scheduling would have decided,
 * without changing behavior. Used for observing signal quality.
 */
async function runShadowEvaluation(userId: string): Promise<void> {
    try {
        const signals = await collectSignals(userId);
        if (signals.length === 0) return;

        const evaluation = await evaluateCallWorthiness(userId, signals);

        const maturityLevel = await computeMaturityLevel(userId).catch(() => 'LEARNING' as const);
        const personalContext = await prisma.personalContext.findUnique({
            where: { userId },
            select: { callCount: true },
        }).catch(() => null);

        const postureCtx: PostureContext = {
            callType: 'daily_checkin',
            callCount: personalContext?.callCount ?? 0,
            maturityLevel,
            hasRecentLanded: signals.some(s => s.type === 'recent_landed'),
            hasRecentMissed: signals.some(s => s.type === 'recent_missed'),
            overdueCommitmentCount: signals.filter(s => s.type === 'stale_commitment').length,
        };

        const posture = selectPosture(postureCtx);

        console.log(`[Shadow] user=${userId.substring(0, 8)} posture=${posture.primary} worthiness=${evaluation.callWorthiness} fatigue=${evaluation.fatigueThreshold} shouldCall=${evaluation.shouldCall} signals=${signals.length}`);
    } catch (err) {
        // Shadow mode is non-critical — never fail the real scheduling
    }
}

