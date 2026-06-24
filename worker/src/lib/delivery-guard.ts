/**
 * Delivery Guard — DND Windows & Smart Batching
 *
 * Controls when voice calls and nudges can be delivered to users.
 * Respects DND windows, quiet weekends, max daily calls, and preferred call windows.
 */

import { prisma } from './prisma';

interface DeliveryCheck {
    allowed: boolean;
    reason?: string;
    nextWindow?: Date;
}

interface CallWindow {
    start: string; // HH:MM
    end: string;   // HH:MM
    label: string;
}

/**
 * Get the current time in the user's timezone.
 */
function getNowInTimezone(timezone: string): Date {
    const now = new Date();
    // Convert to user's timezone using Intl
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
    const parts = formatter.formatToParts(now);
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
 * Get HH:MM string from a Date (already in user's timezone).
 */
function getTimeString(date: Date): string {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Check if a time string falls within a window (handles overnight windows like 22:00-07:00).
 */
function isInWindow(current: string, windowStart: string, windowEnd: string): boolean {
    if (windowStart <= windowEnd) {
        // Same day range (e.g., 09:00-17:00)
        return current >= windowStart && current <= windowEnd;
    } else {
        // Overnight range (e.g., 22:00-07:00)
        return current >= windowStart || current <= windowEnd;
    }
}

/**
 * Check if a delivery (voice call or nudge) can happen right now for this user.
 *
 * Checks: DND window, quiet weekends, max calls per day.
 * Returns { allowed, reason, nextWindow } so callers can defer if needed.
 */
export async function canDeliverNow(userId: string): Promise<DeliveryCheck> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
    });

    // No preferences = allow everything (defaults haven't been set)
    if (!prefs) {
        return { allowed: true };
    }

    const timezone = prefs.timezone || 'Asia/Kolkata';
    const userNow = getNowInTimezone(timezone);
    const currentTime = getTimeString(userNow);
    const dayOfWeek = userNow.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // 1. Check quiet weekends
    if (prefs.quietWeekends && isWeekend) {
        const nextMonday = getNextDeliveryWindowFromDate(userNow, prefs, timezone);
        return {
            allowed: false,
            reason: 'Quiet weekends enabled — no deliveries on Saturday/Sunday',
            nextWindow: nextMonday,
        };
    }

    // 2. Check DND window (uses dndStart/dndEnd if set, falls back to quietHoursStart/quietHoursEnd)
    const dndStart = prefs.dndStart || prefs.quietHoursStart;
    const dndEnd = prefs.dndEnd || prefs.quietHoursEnd;

    if (dndStart && dndEnd && isInWindow(currentTime, dndStart, dndEnd)) {
        const nextWindow = getNextDeliveryWindowFromDate(userNow, prefs, timezone);
        return {
            allowed: false,
            reason: `In DND window (${dndStart}–${dndEnd})`,
            nextWindow,
        };
    }

    // 3. Check max calls per day
    const maxCalls = prefs.maxCallsPerDay ?? 3;
    if (maxCalls > 0) {
        // Count today's voice calls (in user's timezone)
        const todayStart = new Date(userNow);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(userNow);
        todayEnd.setHours(23, 59, 59, 999);

        // Convert back to UTC for database query
        const utcOffset = new Date().getTime() - userNow.getTime();
        const todayStartUtc = new Date(todayStart.getTime() + utcOffset);
        const todayEndUtc = new Date(todayEnd.getTime() + utcOffset);

        const callsToday = await prisma.voiceCall.count({
            where: {
                userId,
                startedAt: { gte: todayStartUtc, lte: todayEndUtc },
            },
        });

        if (callsToday >= maxCalls) {
            const nextWindow = getNextDeliveryWindowFromDate(userNow, prefs, timezone);
            return {
                allowed: false,
                reason: `Max calls per day reached (${callsToday}/${maxCalls})`,
                nextWindow,
            };
        }
    }

    return { allowed: true };
}

/**
 * Check if a nudge should be batched instead of sent immediately.
 *
 * Returns true if user has batchNudges enabled and it's not during morning brief time.
 * Morning brief window: 07:30–09:00 in user's timezone (nudges delivered inline during this period).
 */
export async function shouldBatchNudge(userId: string): Promise<boolean> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { batchNudges: true, timezone: true },
    });

    if (!prefs?.batchNudges) return false;

    const timezone = prefs.timezone || 'Asia/Kolkata';
    const userNow = getNowInTimezone(timezone);
    const currentTime = getTimeString(userNow);

    // During morning brief window (07:30–09:00), deliver immediately — don't batch
    if (currentTime >= '07:30' && currentTime <= '09:00') {
        return false;
    }

    // Outside morning brief window and batching is on — batch it
    return true;
}

/**
 * Get pending (undelivered) nudges for a user, for inclusion in morning brief.
 */
export async function getPendingNudges(userId: string): Promise<Array<{
    id: string;
    trigger: string;
    content: string;
    priority: string;
    createdAt: Date;
}>> {
    return prisma.pendingNudge.findMany({
        where: { userId, delivered: false },
        orderBy: [
            { priority: 'asc' }, // urgent first (alphabetical: "low" > "normal" > "urgent" — reversed below)
            { createdAt: 'asc' },
        ],
        select: {
            id: true,
            trigger: true,
            content: true,
            priority: true,
            createdAt: true,
        },
    });
}

/**
 * Mark pending nudges as delivered (after they've been included in a morning brief).
 */
export async function markNudgesDelivered(nudgeIds: string[], batchedIntoId?: string): Promise<void> {
    await prisma.pendingNudge.updateMany({
        where: { id: { in: nudgeIds } },
        data: {
            delivered: true,
            deliveredAt: new Date(),
            ...(batchedIntoId ? { batchedIntoId } : {}),
        },
    });
}

/**
 * Save a nudge for later delivery (batching).
 */
export async function savePendingNudge(params: {
    userId: string;
    trigger: string;
    content: string;
    priority?: string;
    context?: Record<string, unknown>;
}): Promise<string> {
    const nudge = await prisma.pendingNudge.create({
        data: {
            userId: params.userId,
            trigger: params.trigger,
            content: params.content,
            priority: params.priority || 'normal',
            context: (params.context as object) || null,
        },
    });
    return nudge.id;
}

/**
 * Calculate the next available delivery window for a user.
 *
 * Considers DND end time, quiet weekends, and preferred call windows.
 */
export async function getNextDeliveryWindow(userId: string): Promise<Date> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
    });

    const timezone = prefs?.timezone || 'Asia/Kolkata';
    const userNow = getNowInTimezone(timezone);

    if (!prefs) {
        // No preferences — next window is right now
        return new Date();
    }

    return getNextDeliveryWindowFromDate(userNow, prefs, timezone);
}

/**
 * Internal: calculate next delivery window from a given time.
 */
function getNextDeliveryWindowFromDate(
    userNow: Date,
    prefs: {
        dndStart?: string | null;
        dndEnd?: string | null;
        quietHoursStart?: string;
        quietHoursEnd?: string;
        quietWeekends?: boolean;
        preferredCallWindows?: unknown;
        timezone?: string | null;
    },
    timezone: string,
): Date {
    const dndEnd = prefs.dndEnd || prefs.quietHoursEnd || '08:00';
    const candidate = new Date(userNow);

    // If we're in DND, jump to DND end time
    const currentTime = getTimeString(userNow);
    const dndStart = prefs.dndStart || prefs.quietHoursStart || '22:00';

    if (isInWindow(currentTime, dndStart, dndEnd)) {
        const [endH, endM] = dndEnd.split(':').map(Number);
        candidate.setHours(endH, endM, 0, 0);

        // If DND end is before current time (overnight DND, e.g., 22:00-07:00 and it's 23:00),
        // the end time is tomorrow
        if (candidate <= userNow) {
            candidate.setDate(candidate.getDate() + 1);
        }
    }

    // Skip weekends if quiet weekends enabled
    if (prefs.quietWeekends) {
        const day = candidate.getDay();
        if (day === 6) {
            // Saturday — skip to Monday
            candidate.setDate(candidate.getDate() + 2);
        } else if (day === 0) {
            // Sunday — skip to Monday
            candidate.setDate(candidate.getDate() + 1);
        }
    }

    // If preferred call windows are set, snap to the next one
    const windows = prefs.preferredCallWindows as CallWindow[] | null;
    if (windows && Array.isArray(windows) && windows.length > 0) {
        const candidateTime = getTimeString(candidate);
        // Find the next window that starts after current candidate time
        const nextWindow = windows
            .sort((a, b) => a.start.localeCompare(b.start))
            .find(w => w.start > candidateTime);

        if (nextWindow) {
            const [h, m] = nextWindow.start.split(':').map(Number);
            candidate.setHours(h, m, 0, 0);
        } else {
            // All windows have passed today — use first window tomorrow
            const firstWindow = windows.sort((a, b) => a.start.localeCompare(b.start))[0];
            const [h, m] = firstWindow.start.split(':').map(Number);
            candidate.setDate(candidate.getDate() + 1);
            candidate.setHours(h, m, 0, 0);

            // Skip weekends again if needed
            if (prefs.quietWeekends) {
                const day = candidate.getDay();
                if (day === 6) candidate.setDate(candidate.getDate() + 2);
                else if (day === 0) candidate.setDate(candidate.getDate() + 1);
            }
        }
    }

    // Convert back to UTC for pg-boss scheduling
    const utcOffset = new Date().getTime() - getNowInTimezone(timezone).getTime();
    return new Date(candidate.getTime() + utcOffset);
}
