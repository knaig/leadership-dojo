/**
 * MVQS Cron API Route
 *
 * Handles scheduled background sync jobs via Vercel Cron or external scheduler.
 * Jobs are queued to the Worker daemon for execution with real-time Pusher updates.
 *
 * Endpoints:
 * - POST /api/cron/sync-calendar - Queue calendar sync for all active users
 * - POST /api/cron/sync-email - Queue email sync for all active users
 * - POST /api/cron/sync-drive - Queue drive sync for all active users
 * - POST /api/cron/build-profiles - Build stakeholder profiles daily
 * - POST /api/cron/morning-brief - Generate morning briefs for all users (8am)
 * - POST /api/cron/pre-meeting-prep - Check for upcoming meetings (every 15 min)
 * - POST /api/cron/execution-nudge - Check for overdue actions (hourly)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notificationSenderWorker } from '@/lib/workers/notification-sender';
import { renewExpiringDriveChannels } from '@/lib/connectors/drive-watch';
import { renewExpiringCalendarChannels } from '@/lib/connectors/calendar-watch';
import { renewExpiringGmailChannels } from '@/lib/connectors/gmail-watch';

export const dynamic = 'force-dynamic';

/**
 * Queue a pg-boss job via direct SQL INSERT.
 * Avoids pg-boss.start() which times out on Vercel serverless.
 */
async function queueJob(name: string, data: Record<string, any>): Promise<string | null> {
    const payload = JSON.stringify(data);
    const result = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
        VALUES (
            ${name},
            ${payload}::jsonb,
            'created',
            3, 0, 30, 900,
            now(),
            now() + INTERVAL '7 days'
        )
        RETURNING id
    `;
    return result[0]?.id || null;
}

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If no secret configured, allow in development
    if (!cronSecret) {
        return process.env.NODE_ENV === 'development';
    }

    return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Get active users who have connected Google services
 */
async function getActiveUsers(providers?: string[]): Promise<string[]> {
    const connectors = await prisma.dataConnector.findMany({
        where: {
            status: 'CONNECTED',
            provider: providers ? { in: providers } : { in: ['gcal', 'gmail', 'gdrive'] },
        },
        select: { userId: true },
        distinct: ['userId'],
    });

    return connectors.map(c => c.userId);
}

/**
 * Get users with Google OAuth (for Drive sync which may not have explicit connector)
 */
async function getUsersWithGoogleAuth(): Promise<string[]> {
    const accounts = await prisma.account.findMany({
        where: {
            provider: 'google',
            access_token: { not: null }
        },
        select: { userId: true },
        distinct: ['userId'],
    });

    return accounts.map(a => a.userId);
}

/**
 * POST /api/cron/[action]
 *
 * Queue sync jobs for all connected users.
 * Schedule: Every 15 minutes (calendar), Every 30 minutes (email)
 */
export async function POST(request: NextRequest) {
    // Verify authorization
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.pathname.split('/').pop();

    try {
        switch (action) {
            case 'sync-calendar':
                return handleCalendarSync();
            case 'sync-email':
                return handleEmailSync();
            case 'sync-drive':
                return handleDriveSync();
            case 'build-profiles':
                return handleProfileBuild();
            case 'notify-prep-reminders':
                return handleNotificationSend();
            case 'morning-brief':
                return handleMorningBrief();
            case 'pre-meeting-prep':
                return handlePreMeetingPrep();
            case 'execution-nudge':
                return handleExecutionNudge();
            case 'renew-drive-channels':
                return handleRenewDriveChannels();
            case 'renew-watch-channels':
                return handleRenewAllWatchChannels();
            default:
                return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
        }
    } catch (error) {
        console.error('Cron job error:', error);
        return NextResponse.json(
            { error: 'Internal error', message: String(error) },
            { status: 500 }
        );
    }
}

/**
 * Queue calendar sync jobs for all active users.
 * Worker daemon executes with real-time Pusher progress updates.
 */
async function handleCalendarSync() {
    console.log('[CRON] Queueing calendar sync jobs...');

    const users = await getActiveUsers(['gcal']);
    const jobIds: string[] = [];

    for (const userId of users) {
        try {
            const jobId = await queueJob('calendar-sync', { userId });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue calendar sync for ${userId}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} calendar sync jobs`);

    return NextResponse.json({
        success: true,
        action: 'sync-calendar',
        usersQueued: users.length,
        jobIds,
    });
}

/**
 * Queue email sync jobs for all active users.
 * Worker daemon executes with real-time Pusher progress updates.
 */
async function handleEmailSync() {
    console.log('[CRON] Queueing email sync jobs...');

    const users = await getActiveUsers(['gmail']);
    const jobIds: string[] = [];

    for (const userId of users) {
        try {
            const jobId = await queueJob('email-sync', { userId });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue email sync for ${userId}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} email sync jobs`);

    return NextResponse.json({
        success: true,
        action: 'sync-email',
        usersQueued: users.length,
        jobIds,
    });
}

/**
 * Queue drive sync jobs for all users with Google OAuth.
 * Worker daemon executes with real-time Pusher progress updates.
 */
async function handleDriveSync() {
    console.log('[CRON] Queueing drive sync jobs...');

    const users = await getActiveUsers(['gdrive']);
    const jobIds: string[] = [];

    for (const userId of users) {
        try {
            const jobId = await queueJob('drive-sync', { userId });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue drive sync for ${userId}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} drive sync jobs`);

    return NextResponse.json({
        success: true,
        action: 'sync-drive',
        usersQueued: users.length,
        jobIds,
    });
}

async function handleProfileBuild() {
    console.log('[CRON] Starting profile build...');

    // Get all stakeholders that need profile refresh
    const staleProfiles = await prisma.stakeholderProfile.findMany({
        where: {
            OR: [
                { lastValidatedAt: null },
                { lastValidatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            ],
            interactionCount: { gte: 3 }, // Only profiles with enough data
        },
        take: 50, // Limit batch size
    });

    console.log(`[CRON] Found ${staleProfiles.length} profiles to build`);

    // Profile building would go here
    // For now, just mark as validated
    for (const profile of staleProfiles) {
        await prisma.stakeholderProfile.update({
            where: { id: profile.id },
            data: { lastValidatedAt: new Date() },
        });
    }

    return NextResponse.json({
        success: true,
        action: 'build-profiles',
        profilesProcessed: staleProfiles.length,
    });
}

async function handleNotificationSend() {
    console.log('[CRON] Starting notification sender...');

    // Process notifications
    const results = await notificationSenderWorker();

    console.log(`[CRON] Notification process completed`);

    return NextResponse.json({
        success: true,
        action: 'notify-prep-reminders',
        results,
    });
}

/**
 * Queue morning brief jobs for all users.
 * Schedule: Daily at 8am in user's timezone (or UTC default)
 */
async function handleMorningBrief() {
    console.log('[CRON] Queueing morning brief jobs...');

    const users = await prisma.user.findMany({
        select: { id: true },
        where: {
            OR: [
                { preferences: null },
                { preferences: { enableProactivePrompts: true } }
            ]
        }
    });

    const jobIds: string[] = [];

    for (const user of users) {
        try {
            const jobId = await queueJob('proactive-agent', {
                userId: user.id,
                trigger: 'MORNING_BRIEF'
            });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue morning brief for ${user.id}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} morning brief jobs`);

    return NextResponse.json({
        success: true,
        action: 'morning-brief',
        usersQueued: users.length,
        jobIds,
    });
}

/**
 * Check for upcoming meetings and queue pre-meeting prep jobs.
 * Schedule: Every 15 minutes
 */
async function handlePreMeetingPrep() {
    console.log('[CRON] Checking for upcoming meetings...');

    const users = await getActiveUsers(['gcal']);
    const jobIds: string[] = [];

    for (const userId of users) {
        try {
            const jobId = await queueJob('proactive-agent', {
                userId,
                trigger: 'PRE_MEETING_PREP'
            });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue pre-meeting prep for ${userId}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} pre-meeting prep checks`);

    return NextResponse.json({
        success: true,
        action: 'pre-meeting-prep',
        usersChecked: users.length,
        jobIds,
    });
}

/**
 * Check for overdue actions and queue execution nudge jobs.
 * Schedule: Hourly
 */
async function handleExecutionNudge() {
    console.log('[CRON] Checking for overdue actions...');

    // Find users with overdue actions
    const usersWithOverdue = await prisma.relationshipAction.findMany({
        where: {
            status: 'IN_PROGRESS',
            dueDate: { lt: new Date() }
        },
        select: {
            goal: { select: { userId: true } }
        },
        distinct: ['goalId']
    });

    const uniqueUserIds = [...new Set(usersWithOverdue.map(a => a.goal.userId))];
    const jobIds: string[] = [];

    for (const userId of uniqueUserIds) {
        try {
            const jobId = await queueJob('proactive-agent', {
                userId,
                trigger: 'EXECUTION_NUDGE'
            });
            if (jobId) jobIds.push(jobId);
        } catch (err) {
            console.error(`[CRON] Failed to queue execution nudge for ${userId}:`, err);
        }
    }

    console.log(`[CRON] Queued ${jobIds.length} execution nudge jobs`);

    return NextResponse.json({
        success: true,
        action: 'execution-nudge',
        usersNudged: uniqueUserIds.length,
        jobIds,
    });
}

/**
 * Renew expiring Drive watch channels.
 * Schedule: Daily
 */
async function handleRenewDriveChannels() {
    console.log('[CRON] Renewing expiring Drive watch channels...');

    const result = await renewExpiringDriveChannels();

    console.log(`[CRON] Renewed ${result.renewed}, failed ${result.failed}`);

    return NextResponse.json({
        success: true,
        action: 'renew-drive-channels',
        renewed: result.renewed,
        failed: result.failed,
    });
}

/**
 * Renew all expiring watch channels (calendar, drive, gmail).
 * Schedule: Daily
 */
async function handleRenewAllWatchChannels() {
    console.log('[CRON] Renewing all expiring watch channels...');

    const [cal, drive, gmail] = await Promise.all([
        renewExpiringCalendarChannels(),
        renewExpiringDriveChannels(),
        renewExpiringGmailChannels(),
    ]);

    const totalRenewed = cal.renewed + drive.renewed + gmail.renewed;
    const totalFailed = cal.failed + drive.failed + gmail.failed;

    console.log(`[CRON] Watch channels: renewed=${totalRenewed}, failed=${totalFailed}`);

    return NextResponse.json({
        success: true,
        action: 'renew-watch-channels',
        calendar: cal,
        drive,
        gmail,
    });
}

// Also support GET for Vercel Cron (which uses GET by default)
export async function GET(request: NextRequest) {
    return POST(request);
}
