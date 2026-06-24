import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface CallWindow {
    start: string;
    end: string;
    label: string;
}

/**
 * GET /api/preferences/delivery
 * Return current delivery preferences (DND, timezone, quiet weekends, batch, max calls, windows)
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId },
            select: {
                dndStart: true,
                dndEnd: true,
                timezone: true,
                quietWeekends: true,
                batchNudges: true,
                maxCallsPerDay: true,
                preferredCallWindows: true,
                // Include legacy fields for context
                quietHoursStart: true,
                quietHoursEnd: true,
            },
        });

        if (!prefs) {
            // Return defaults
            return NextResponse.json({
                dndStart: null,
                dndEnd: null,
                timezone: 'Asia/Kolkata',
                quietWeekends: true,
                batchNudges: false,
                maxCallsPerDay: 3,
                preferredCallWindows: [],
            });
        }

        return NextResponse.json({
            dndStart: prefs.dndStart ?? prefs.quietHoursStart,
            dndEnd: prefs.dndEnd ?? prefs.quietHoursEnd,
            timezone: prefs.timezone ?? 'Asia/Kolkata',
            quietWeekends: prefs.quietWeekends,
            batchNudges: prefs.batchNudges,
            maxCallsPerDay: prefs.maxCallsPerDay ?? 3,
            preferredCallWindows: (prefs.preferredCallWindows as CallWindow[]) ?? [],
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API] GET /api/preferences/delivery error:', message);
        return NextResponse.json({ error: 'Failed to fetch delivery preferences' }, { status: 500 });
    }
}

/**
 * PATCH /api/preferences/delivery
 * Update delivery preferences
 */
export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            dndStart,
            dndEnd,
            timezone,
            quietWeekends,
            batchNudges,
            maxCallsPerDay,
            preferredCallWindows,
        } = body;

        // Validate time format if provided
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (dndStart !== undefined && dndStart !== null && !timeRegex.test(dndStart)) {
            return NextResponse.json({ error: 'dndStart must be in HH:MM format' }, { status: 400 });
        }
        if (dndEnd !== undefined && dndEnd !== null && !timeRegex.test(dndEnd)) {
            return NextResponse.json({ error: 'dndEnd must be in HH:MM format' }, { status: 400 });
        }

        // Validate maxCallsPerDay
        if (maxCallsPerDay !== undefined && (typeof maxCallsPerDay !== 'number' || maxCallsPerDay < 1 || maxCallsPerDay > 10)) {
            return NextResponse.json({ error: 'maxCallsPerDay must be between 1 and 10' }, { status: 400 });
        }

        // Validate preferredCallWindows
        if (preferredCallWindows !== undefined) {
            if (!Array.isArray(preferredCallWindows)) {
                return NextResponse.json({ error: 'preferredCallWindows must be an array' }, { status: 400 });
            }
            for (const w of preferredCallWindows) {
                if (!w.start || !w.end || !timeRegex.test(w.start) || !timeRegex.test(w.end)) {
                    return NextResponse.json({ error: 'Each call window must have start and end in HH:MM format' }, { status: 400 });
                }
            }
        }

        // Build update data — only include fields that were provided
        const updateData: Record<string, unknown> = {};
        if (dndStart !== undefined) updateData.dndStart = dndStart;
        if (dndEnd !== undefined) updateData.dndEnd = dndEnd;
        if (timezone !== undefined) updateData.timezone = timezone;
        if (quietWeekends !== undefined) updateData.quietWeekends = quietWeekends;
        if (batchNudges !== undefined) updateData.batchNudges = batchNudges;
        if (maxCallsPerDay !== undefined) updateData.maxCallsPerDay = maxCallsPerDay;
        if (preferredCallWindows !== undefined) updateData.preferredCallWindows = preferredCallWindows;

        const prefs = await prisma.userPreferences.upsert({
            where: { userId },
            update: updateData,
            create: {
                userId,
                dndStart: dndStart ?? null,
                dndEnd: dndEnd ?? null,
                timezone: timezone ?? 'Asia/Kolkata',
                quietWeekends: quietWeekends ?? true,
                batchNudges: batchNudges ?? false,
                maxCallsPerDay: maxCallsPerDay ?? 3,
                preferredCallWindows: preferredCallWindows ?? null,
            },
            select: {
                dndStart: true,
                dndEnd: true,
                timezone: true,
                quietWeekends: true,
                batchNudges: true,
                maxCallsPerDay: true,
                preferredCallWindows: true,
            },
        });

        return NextResponse.json(prefs);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API] PATCH /api/preferences/delivery error:', message);
        return NextResponse.json({ error: 'Failed to update delivery preferences' }, { status: 500 });
    }
}
