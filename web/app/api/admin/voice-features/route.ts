import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/voice-features
 * List all users with their voice feature flag status.
 */
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            preferences: {
                select: {
                    dailyCallEnabled: true,
                    voiceAutoSchedule: true,
                    voicePreMeetingPrep: true,
                    voicePostMeetingDebrief: true,
                    voiceProactiveNudge: true,
                    voiceFridayRitual: true,
                    voiceWeeklyReflection: true,
                },
            },
            subscription: {
                select: {
                    userCategory: true,
                    tier: true,
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    return NextResponse.json({
        users: users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            category: (u.subscription as any)?.userCategory || 'customer',
            tier: u.subscription?.tier || 'FREE',
            voiceFeatures: u.preferences ? {
                dailyCallEnabled: u.preferences.dailyCallEnabled,
                autoSchedule: (u.preferences as any).voiceAutoSchedule ?? false,
                preMeetingPrep: (u.preferences as any).voicePreMeetingPrep ?? false,
                postMeetingDebrief: (u.preferences as any).voicePostMeetingDebrief ?? false,
                proactiveNudge: (u.preferences as any).voiceProactiveNudge ?? false,
                fridayRitual: (u.preferences as any).voiceFridayRitual ?? false,
                weeklyReflection: (u.preferences as any).voiceWeeklyReflection ?? false,
            } : null,
        })),
    });
}

/**
 * POST /api/admin/voice-features
 * Toggle voice features for a specific user.
 *
 * Body: {
 *   targetUserId: string,
 *   features: {
 *     autoSchedule?: boolean,
 *     preMeetingPrep?: boolean,
 *     postMeetingDebrief?: boolean,
 *     proactiveNudge?: boolean,
 *     fridayRitual?: boolean,
 *     weeklyReflection?: boolean,
 *   }
 * }
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { targetUserId, features } = await req.json();
    if (!targetUserId || !features) {
        return NextResponse.json({ error: 'targetUserId and features required' }, { status: 400 });
    }

    // Build update data from provided features
    const updateData: Record<string, boolean> = {};
    if (features.autoSchedule !== undefined) updateData.voiceAutoSchedule = features.autoSchedule;
    if (features.preMeetingPrep !== undefined) updateData.voicePreMeetingPrep = features.preMeetingPrep;
    if (features.postMeetingDebrief !== undefined) updateData.voicePostMeetingDebrief = features.postMeetingDebrief;
    if (features.proactiveNudge !== undefined) updateData.voiceProactiveNudge = features.proactiveNudge;
    if (features.fridayRitual !== undefined) updateData.voiceFridayRitual = features.fridayRitual;
    if (features.weeklyReflection !== undefined) updateData.voiceWeeklyReflection = features.weeklyReflection;

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No features to update' }, { status: 400 });
    }

    // Upsert preferences (create if doesn't exist)
    await prisma.userPreferences.upsert({
        where: { userId: targetUserId },
        create: {
            userId: targetUserId,
            ...updateData,
        },
        update: updateData,
    });

    // Log the change
    console.log(`[Admin] Voice features updated for ${targetUserId.substring(0, 8)}: ${JSON.stringify(updateData)} by ${userId.substring(0, 8)}`);

    return NextResponse.json({ success: true, updated: updateData });
}

/**
 * PUT /api/admin/voice-features
 * Bulk enable/disable a feature for all users or a category.
 *
 * Body: {
 *   feature: string,        // e.g. "autoSchedule"
 *   enabled: boolean,
 *   category?: string,      // optional: "internal", "premium_lead", "customer"
 * }
 */
export async function PUT(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { feature, enabled, category } = await req.json();
    if (!feature || enabled === undefined) {
        return NextResponse.json({ error: 'feature and enabled required' }, { status: 400 });
    }

    const featureMap: Record<string, string> = {
        autoSchedule: 'voiceAutoSchedule',
        preMeetingPrep: 'voicePreMeetingPrep',
        postMeetingDebrief: 'voicePostMeetingDebrief',
        proactiveNudge: 'voiceProactiveNudge',
        fridayRitual: 'voiceFridayRitual',
        weeklyReflection: 'voiceWeeklyReflection',
    };

    const dbField = featureMap[feature];
    if (!dbField) {
        return NextResponse.json({ error: `Unknown feature: ${feature}` }, { status: 400 });
    }

    // Get target user IDs
    let targetUserIds: string[];
    if (category) {
        const subs = await prisma.subscription.findMany({
            where: { userCategory: category },
            select: { userId: true },
        });
        targetUserIds = subs.map(s => s.userId);
    } else {
        const users = await prisma.user.findMany({ select: { id: true } });
        targetUserIds = users.map(u => u.id);
    }

    // Bulk update
    let updated = 0;
    for (const uid of targetUserIds) {
        await prisma.userPreferences.upsert({
            where: { userId: uid },
            create: { userId: uid, [dbField]: enabled },
            update: { [dbField]: enabled },
        });
        updated++;
    }

    console.log(`[Admin] Bulk voice feature update: ${feature}=${enabled} for ${updated} users (category: ${category || 'all'}) by ${userId.substring(0, 8)}`);

    return NextResponse.json({ success: true, feature, enabled, usersUpdated: updated });
}
