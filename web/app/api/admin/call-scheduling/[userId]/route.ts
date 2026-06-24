import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/call-scheduling/[userId]
 *
 * Admin-only endpoint to update a user's call scheduling preferences.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId: adminId } = await auth();
    if (!adminId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await params;
    const body = await request.json();

    // Validate fields
    const allowedFields = [
        'dailyCallEnabled',
        'dailyCallTime',
        'callScheduleMode',
        'meetingPrepLeadMinutes',
        'meetingPrepMinGap',
        'maxCallsPerDay',
        'callFrequencyMinutes',
        'callWindowStart',
        'callWindowEnd',
        'dailyCallMaxRetries',
        'dailyCallRetryAfterMin',
    ];

    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
        if (field in body) {
            const val = body[field];

            // Type validation
            if (field === 'dailyCallEnabled' && typeof val !== 'boolean') {
                return NextResponse.json({ error: `${field} must be boolean` }, { status: 400 });
            }
            if (field === 'dailyCallTime' && typeof val === 'string' && !/^\d{2}:\d{2}$/.test(val)) {
                return NextResponse.json({ error: `${field} must be HH:MM` }, { status: 400 });
            }
            if ((field === 'callWindowStart' || field === 'callWindowEnd') && val !== null && typeof val === 'string' && !/^\d{2}:\d{2}$/.test(val)) {
                return NextResponse.json({ error: `${field} must be HH:MM or null` }, { status: 400 });
            }
            if ((field === 'callFrequencyMinutes' || field === 'dailyCallMaxRetries' || field === 'dailyCallRetryAfterMin'
                || field === 'meetingPrepLeadMinutes' || field === 'meetingPrepMinGap' || field === 'maxCallsPerDay')
                && val !== null && typeof val !== 'number') {
                return NextResponse.json({ error: `${field} must be a number or null` }, { status: 400 });
            }
            if (field === 'callScheduleMode' && !['calendar_aware', 'fixed_time'].includes(val)) {
                return NextResponse.json({ error: `${field} must be calendar_aware or fixed_time` }, { status: 400 });
            }

            updateData[field] = val;
        }
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Upsert — creates default preferences if they don't exist yet
    const updated = await prisma.userPreferences.upsert({
        where: { userId },
        create: {
            userId,
            ...updateData,
        },
        update: updateData,
        select: {
            dailyCallEnabled: true,
            dailyCallTime: true,
            callScheduleMode: true,
            meetingPrepLeadMinutes: true,
            meetingPrepMinGap: true,
            maxCallsPerDay: true,
            callFrequencyMinutes: true,
            callWindowStart: true,
            callWindowEnd: true,
            dailyCallMaxRetries: true,
            dailyCallRetryAfterMin: true,
        },
    });

    return NextResponse.json({ updated });
}
