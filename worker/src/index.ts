
import dotenv from 'dotenv';
import path from 'path';
import * as Sentry from '@sentry/node';
const { PgBoss } = require('pg-boss');
import { interviewerAgent } from './agents/interviewer';
import { calendarSyncAgent } from './agents/calendar-sync';
import { emailSyncAgent } from './agents/email-sync';
import { driveSyncAgent } from './agents/drive-sync';
import { proactiveAgent, checkPreMeetingPrep, generateMorningBrief, /* handleDocumentActivity, */ generateContextDeepening, checkPostMeetingReview, ProactiveTrigger, generateFridayRitual, generateWeeklyReflectionMessage } from './agents/proactive-agent';
import { synthesizeUserIntelligence } from './agents/intelligence-synthesis-agent';
import { synthesizeStakeholderIntelligence } from './agents/stakeholder-synthesis-agent';
import { synthesizeDomainContext } from './agents/domain-synthesis-agent';
import { startWhatsAppListener, stopWhatsAppListener, queueWhatsAppExtraction } from './agents/whatsapp-listener';
import { extractCalendarFacts } from './agents/knowledge/calendar-fact-extractor';
import { extractEmailFacts } from './agents/knowledge/email-fact-extractor';
import { extractDocumentFacts } from './agents/knowledge/document-fact-extractor';
import { extractChatFacts } from './agents/knowledge/chat-fact-extractor';
import { extractMeetingNotesFacts } from './agents/knowledge/meeting-notes-fact-extractor';
import { extractVoiceFacts } from './agents/knowledge/voice-fact-extractor';
import { detectCommunities } from './agents/knowledge/community-detection-agent';
import { runConfidenceDecayAllUsers } from './agents/knowledge/confidence-decay';
import { generateWeeklyPatternSnapshot, checkCommitmentReminders } from './agents/meeting-champion';
import { enrichStakeholders } from './agents/stakeholder-enrichment-agent';
import { detectPatterns } from './agents/pattern-detector';
import { dispatchDailyCallScheduler, dispatchPendingCalls, dispatchDayPlanner } from './agents/daily-call-scheduler';
import { evaluateCall } from './agents/call-evaluation-agent';
import { deepAnalyzeRelationship } from './agents/coaching-relationship-agent';
import { computeWeeklyTrajectoryAllUsers } from './agents/coaching-trajectory-agent';
import { runPostCallAnalysisTracked } from './agents/post-call-analysis-agent';
import { runHypothesisGenerationAllUsers } from './agents/hypothesis-engine';
import { runGitHubSync } from './agents/github-sync';
import { extractGitHubFacts } from './agents/knowledge/github-fact-extractor';
import { flushLangfuse } from './lib/langfuse';
import { prisma } from './lib/prisma';
import { autoSetupWatchChannels, renewExpiringWatchChannels } from './lib/watch-channels';
import { shouldDeliverViaVoice, triggerVoiceCall } from './lib/vapi-voice';
import { publishMessage, publishSystemEvent } from './lib/pusher';
import { sendPushToUser } from './lib/web-push';

// Load env from root .env.local in development only
if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

// Validate required env vars at startup — fail loud, not silent
const REQUIRED_ENV = [
    'DATABASE_URL',
    'VAPI_API_KEY',
    'VAPI_PHONE_NUMBER_ID',
    'VAPI_ASSISTANT_ONBOARDING',
    'VAPI_ASSISTANT_DAILY',
    'VAPI_ASSISTANT_MEETING',
    'ENCRYPTION_SECRET',
];
const RECOMMENDED_ENV = [
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
    'PUSHER_APP_ID',
    'PUSHER_KEY',
    'PUSHER_SECRET',
];
const missingRequired = REQUIRED_ENV.filter(k => !process.env[k]);
const missingRecommended = RECOMMENDED_ENV.filter(k => !process.env[k]);
if (missingRequired.length > 0) {
    console.error(`❌ FATAL: Missing required env vars: ${missingRequired.join(', ')}`);
    console.error('   Worker cannot function correctly without these. Exiting.');
    process.exit(1);
}
if (missingRecommended.length > 0) {
    console.warn(`⚠️  Missing recommended env vars: ${missingRecommended.join(', ')}`);
}

// Initialize Sentry for error monitoring
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        environment: process.env.NODE_ENV || 'production',
    });
    console.log('✅ Sentry initialized');
}

/**
 * Get active users who have connected a specific Google service
 */
async function getActiveUsers(providers: string[]): Promise<string[]> {
    const connectors = await prisma.dataConnector.findMany({
        where: {
            status: 'CONNECTED',
            provider: { in: providers },
        },
        select: { userId: true },
        distinct: ['userId'],
    });
    return connectors.map(c => c.userId);
}

/**
 * Check if a user has an active watch channel AND a recent sync (< 45 min).
 * If both are true, cron polling can skip this user — watch channel handles it.
 */
async function hasRecentWatchSync(userId: string, connector: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - 45 * 60 * 1000);
    const [recentSync, activeWatch] = await Promise.all([
        prisma.syncStatus.findFirst({
            where: { userId, connector, status: 'idle', lastSyncAt: { gt: cutoff } },
            select: { id: true },
        }),
        prisma.watchChannel.findFirst({
            where: { userId, connector, expiration: { gt: new Date() } },
            select: { id: true },
        }),
    ]);
    return !!(recentSync && activeWatch);
}

/**
 * Self-heal: Ensure every Google Account has DataConnector + SyncStatus records.
 * Prevents silent exclusion from cron syncs when OAuth callback missed creating them.
 */
async function selfHealConnectors(): Promise<void> {
    console.log('[SelfHeal] Checking for missing connectors and sync status records...');

    const googleAccounts = await prisma.account.findMany({
        where: { provider: 'google', refresh_token: { not: null } },
        select: { id: true, userId: true, scope: true },
    });

    let connectorsFixed = 0;
    let syncStatusFixed = 0;
    let watchChannelsCreated = 0;

    const connectorDefs = [
        { type: 'CALENDAR' as const, provider: 'gcal', scope: 'calendar', syncConnector: 'calendar' },
        { type: 'EMAIL' as const, provider: 'gmail', scope: 'gmail', syncConnector: 'email' },
        { type: 'DOCUMENTS' as const, provider: 'gdrive', scope: 'drive', syncConnector: 'drive' },
    ];

    for (const account of googleAccounts) {
        const scope = account.scope || '';

        for (const def of connectorDefs) {
            if (!scope.includes(def.scope)) continue;

            // Ensure DataConnector exists
            const connector = await prisma.dataConnector.findFirst({
                where: { userId: account.userId, provider: def.provider },
            });
            if (!connector) {
                await prisma.dataConnector.create({
                    data: {
                        userId: account.userId,
                        type: def.type,
                        provider: def.provider,
                        status: 'CONNECTED',
                        accountId: account.id,
                        syncFrequency: 60,
                        permissions: {},
                    },
                });
                connectorsFixed++;
            }

            // Ensure SyncStatus exists
            const syncStatus = await prisma.syncStatus.findUnique({
                where: { userId_connector: { userId: account.userId, connector: def.syncConnector } },
            });
            if (!syncStatus) {
                await prisma.syncStatus.create({
                    data: { userId: account.userId, connector: def.syncConnector, status: 'idle' },
                });
                syncStatusFixed++;
            }

            // Ensure active WatchChannel exists (non-blocking)
            try {
                const activeChannel = await prisma.watchChannel.findFirst({
                    where: { userId: account.userId, connector: def.syncConnector, expiration: { gt: new Date() } },
                });
                if (!activeChannel) {
                    await autoSetupWatchChannels(account.userId, def.syncConnector as 'calendar' | 'drive' | 'gmail');
                    watchChannelsCreated++;
                }
            } catch (e: any) {
                console.warn(`[SelfHeal] Watch channel setup failed for ${account.userId.substring(0, 8)}/${def.syncConnector}: ${e.message}`);
            }
        }
    }

    console.log(`[SelfHeal] Fixed: ${connectorsFixed} connectors, ${syncStatusFixed} sync statuses, ${watchChannelsCreated} watch channels for ${googleAccounts.length} Google accounts`);
}

// ---------- Health Check HTTP Server ----------
// Render pings this to know the worker is alive. If pg-boss stops processing,
// the /health endpoint will report unhealthy and Render will restart the service.
import http from 'http';

let lastJobProcessedAt = Date.now();
const HEALTH_STALE_MS = 15 * 60 * 1000; // 15 minutes with no job = unhealthy

function startHealthServer() {
    const port = parseInt(process.env.PORT || '10000', 10);
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const staleSince = Date.now() - lastJobProcessedAt;
            const healthy = staleSince < HEALTH_STALE_MS;
            res.writeHead(healthy ? 200 : 503);
            res.end(JSON.stringify({
                status: healthy ? 'ok' : 'stale',
                lastJobProcessedAgo: `${Math.round(staleSince / 1000)}s`,
                uptime: `${Math.round(process.uptime())}s`,
            }));
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });
    server.listen(port, () => console.log(`Health check listening on :${port}`));
}

function markJobProcessed() {
    lastJobProcessedAt = Date.now();
}

// ---------- Graceful Shutdown & Error Handling ----------
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    Sentry.captureException(err);
    Promise.all([Sentry.flush(2000), flushLangfuse()]).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
    Sentry.captureException(reason);
});

async function startDaemon() {
    console.log('🦁 OpenClaw Daemon Starting...');

    // Start health check server immediately so Render knows we're booting
    startHealthServer();

    // Startup environment checks
    if (!process.env.ENCRYPTION_SECRET) {
        throw new Error('ENCRYPTION_SECRET environment variable must be set. All sync and LLM operations will fail without it.');
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.warn('⚠️ GOOGLE_CLIENT_ID/SECRET not set — Google sync will be disabled');
    }

    const key = process.env.GEMINI_API_KEY || '';
    console.log(`🔑 GEMINI_API_KEY: ${key ? `set (length: ${key.length})` : 'NOT SET'}`);

    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('Database connection string is not set');
    }

    // 1. Initialize Queue (PgBoss)
    const boss = new PgBoss(connectionString);

    boss.on('error', (error: any) => console.error('Boss Error:', error));

    await boss.start();
    console.log('✅ Queue System (pg-boss) Connected');

    // 1b. Self-heal: ensure all Google accounts have connectors + sync status + watch channels
    try {
        await selfHealConnectors();
    } catch (e: any) {
        console.error('[SelfHeal] Failed (non-fatal):', e.message);
    }

    try {
        await boss.createQueue('sentinel-poll');
        await boss.createQueue('agent-interviewer');
        await boss.createQueue('calendar-sync');
        await boss.createQueue('email-sync');
        await boss.createQueue('drive-sync');
        await boss.createQueue('proactive-agent');
        await boss.createQueue('cron-sync-calendar');
        await boss.createQueue('cron-sync-email');
        await boss.createQueue('cron-sync-drive');
        await boss.createQueue('cron-morning-brief');
        await boss.createQueue('cron-pre-meeting-prep');
        await boss.createQueue('cron-execution-nudge');
        await boss.createQueue('cron-post-meeting-review');
        await boss.createQueue('cron-context-deepening');
        await boss.createQueue('cron-intel-synthesis');
        await boss.createQueue('intel-synthesis');

        // Knowledge Graph queues
        await boss.createQueue('knowledge-extract-calendar');
        await boss.createQueue('knowledge-extract-email');
        await boss.createQueue('knowledge-extract-document');
        await boss.createQueue('knowledge-extract-chat');
        await boss.createQueue('knowledge-extract-meeting-notes');
        await boss.createQueue('knowledge-extract-voice');
        await boss.createQueue('cron-extract-voice');
        await boss.createQueue('knowledge-community-detect');
        await boss.createQueue('cron-community-detection');
        await boss.createQueue('cron-confidence-decay');
        await boss.createQueue('cron-renew-watch-channels');

        // Stakeholder & Domain synthesis queues
        await boss.createQueue('stakeholder-synthesis');
        await boss.createQueue('cron-stakeholder-synthesis');
        await boss.createQueue('domain-synthesis');
        await boss.createQueue('cron-domain-synthesis');

        // WhatsApp queues
        await boss.createQueue('whatsapp-connect');
        await boss.createQueue('cron-whatsapp-extract');

        // Stakeholder enrichment queues
        await boss.createQueue('stakeholder-enrichment');
        await boss.createQueue('cron-stakeholder-enrichment');

        // Meeting Champion queues
        await boss.createQueue('cron-weekly-meeting-patterns');
        await boss.createQueue('cron-stakeholder-importance');
        await boss.createQueue('stakeholder-importance');
        await boss.createQueue('meeting-notes-sync');
        await boss.createQueue('cron-meeting-notes-sync');
        await boss.createQueue('identity-resolution');
        await boss.createQueue('cron-commitment-reminders');

        // Friday Ritual & Weekly Reflection queues
        await boss.createQueue('cron-friday-ritual');
        await boss.createQueue('cron-weekly-reflection');

        // Pattern Detection queue
        await boss.createQueue('cron-pattern-detection');

        // Daily Call Scheduler queues
        await boss.createQueue('cron-daily-call-scheduler');
        await boss.createQueue('cron-day-planner');
        await boss.createQueue('execute-scheduled-calls');

        // Coaching Intelligence queues
        await boss.createQueue('call-evaluation');
        await boss.createQueue('post-call-analysis');
        await boss.createQueue('cron-call-evaluation-poll');
        await boss.createQueue('cron-post-call-analysis-poll');
        await boss.createQueue('cron-coaching-trajectory');
        await boss.createQueue('cron-relationship-analysis');
        await boss.createQueue('cron-admin-daily-brief');
        await boss.createQueue('cron-prompt-insights');
        await boss.createQueue('cron-hypothesis-generation');

        // API key health monitoring
        await boss.createQueue('cron-api-key-health');

        // GitHub integration queues
        await boss.createQueue('github-sync');
        await boss.createQueue('knowledge-extract-github');

        console.log('✅ Queues Created/Verified');
    } catch (e) {
        console.warn('⚠️ Queue creation warning:', e);
    }

    // ========================================
    // SCHEDULED CRON JOBS (replaces Vercel crons)
    // ========================================

    // Calendar sync: every 2 hours (was 30 min — watch channels handle real-time)
    await boss.schedule('cron-sync-calendar', '0 */2 * * *', {}, { tz: 'UTC' });
    // Email sync: every 2 hours (was 30 min — watch channels handle real-time)
    await boss.schedule('cron-sync-email', '0 */2 * * *', {}, { tz: 'UTC' });
    // Drive sync: every 4 hours (least time-sensitive)
    await boss.schedule('cron-sync-drive', '0 */4 * * *', {}, { tz: 'UTC' });
    // Morning brief: daily at 2:30 AM UTC (~8 AM IST)
    await boss.schedule('cron-morning-brief', '30 2 * * *', {}, { tz: 'UTC' });
    // Pre-meeting prep: every 30 minutes (was 15 — 30 is enough lead time)
    await boss.schedule('cron-pre-meeting-prep', '*/30 * * * *', {}, { tz: 'UTC' });
    // [DISABLED] Execution nudge: hourly — focusing on pre-meeting prep as core feature
    // await boss.schedule('cron-execution-nudge', '0 * * * *', {}, { tz: 'UTC' });
    // Post-meeting review: every 30 minutes (was 15)
    await boss.schedule('cron-post-meeting-review', '*/30 * * * *', {}, { tz: 'UTC' });
    // Context deepening: daily at 11:00 UTC (~4:30 PM IST — afternoon, after user has had meetings)
    await boss.schedule('cron-context-deepening', '0 11 * * *', {}, { tz: 'UTC' });
    // Meeting notes sync: daily at 11:30 UTC (after calendar sync, before intel synthesis)
    await boss.schedule('cron-meeting-notes-sync', '30 11 * * *', {}, { tz: 'UTC' });
    // Intelligence synthesis: daily at 12:00 UTC (after syncs + context deepening complete)
    await boss.schedule('cron-intel-synthesis', '0 12 * * *', {}, { tz: 'UTC' });
    // Stakeholder intelligence synthesis: daily at 12:15 UTC (after intel synthesis)
    await boss.schedule('cron-stakeholder-synthesis', '15 12 * * *', {}, { tz: 'UTC' });
    // Community detection: daily at 12:30 UTC (after stakeholder synthesis)
    await boss.schedule('cron-community-detection', '30 12 * * *', {}, { tz: 'UTC' });
    // Domain context synthesis: daily at 12:45 UTC (after community detection)
    await boss.schedule('cron-domain-synthesis', '45 12 * * *', {}, { tz: 'UTC' });
    // Stakeholder enrichment: daily at 13:00 UTC (after stakeholder synthesis at 12:15 + community at 12:30 + domain at 12:45)
    await boss.schedule('cron-stakeholder-enrichment', '0 13 * * *', {}, { tz: 'UTC' });
    // Voice fact extraction: daily at 14:00 UTC (after stakeholder enrichment at 13:00)
    await boss.schedule('cron-extract-voice', '0 14 * * *', {}, { tz: 'UTC' });
    // Confidence decay: daily at 01:00 UTC
    await boss.schedule('cron-confidence-decay', '0 1 * * *', {}, { tz: 'UTC' });
    // WhatsApp message extraction: every 4 hours (was 30 min)
    await boss.schedule('cron-whatsapp-extract', '0 */4 * * *', {}, { tz: 'UTC' });
    // Watch channel renewal: daily at 3:00 UTC
    await boss.schedule('cron-renew-watch-channels', '0 3 * * *', {}, { tz: 'UTC' });
    // API key health check: daily at 6:00 UTC (~11:30 AM IST)
    await boss.schedule('cron-api-key-health', '0 6 * * *', {}, { tz: 'UTC' });
    // Weekly stakeholder importance re-scoring: Sundays at 10:00 AM UTC (~3:30 PM IST)
    await boss.schedule('cron-stakeholder-importance', '0 10 * * 0', {}, { tz: 'UTC' });
    // Weekly meeting pattern snapshot: Sunday at 10:30 AM UTC (~4 PM IST)
    await boss.schedule('cron-weekly-meeting-patterns', '30 10 * * 0', {}, { tz: 'UTC' });
    // Commitment reminders: daily at 4:00 AM UTC (~9:30 AM IST)
    await boss.schedule('cron-commitment-reminders', '0 4 * * *', {}, { tz: 'UTC' });
    // Friday ritual: Fridays at 13:00 UTC (~6:30 PM IST)
    await boss.schedule('cron-friday-ritual', '0 13 * * 5', {}, { tz: 'UTC' });
    // Weekly reflection: Sundays at 12:00 UTC (~5:30 PM IST)
    await boss.schedule('cron-weekly-reflection', '0 12 * * 0', {}, { tz: 'UTC' });
    // Pattern detection: daily at 15:00 UTC (~8:30 PM IST — end of workday review)
    await boss.schedule('cron-pattern-detection', '0 15 * * *', {}, { tz: 'UTC' });
    // Day planner: every 15 minutes (self-gates to 5-7 AM local — pre-schedules day's calls)
    await boss.schedule('cron-day-planner', '*/15 * * * *', {}, { tz: 'UTC' });
    // Daily call scheduler — runs for users with voiceAutoSchedule=true
    await boss.schedule('cron-daily-call-scheduler', '*/15 * * * *', {}, { tz: 'UTC' });
    // Execute scheduled calls: every 1 minute via cron
    await boss.schedule('execute-scheduled-calls', '* * * * *', {}, { tz: 'UTC' });
    // Coaching Intelligence: poll for unevaluated calls — every 10 minutes
    await boss.schedule('cron-call-evaluation-poll', '*/10 * * * *', {}, { tz: 'UTC' });
    // Post-call analysis: onboarding detection, threads, signals — every 10 minutes
    await boss.schedule('cron-post-call-analysis-poll', '*/10 * * * *', {}, { tz: 'UTC' });
    // Coaching Intelligence: weekly trajectory — Sundays 11:00 UTC (~4:30 PM IST)
    await boss.schedule('cron-coaching-trajectory', '0 11 * * 0', {}, { tz: 'UTC' });
    // Coaching Intelligence: deep relationship analysis — Wednesdays 13:00 UTC (~6:30 PM IST)
    await boss.schedule('cron-relationship-analysis', '0 13 * * 3', {}, { tz: 'UTC' });
    // Coaching Intelligence: admin daily brief — daily 16:00 UTC (~9:30 PM IST)
    await boss.schedule('cron-admin-daily-brief', '0 16 * * *', {}, { tz: 'UTC' });
    // Prompt Insights: auto-learn what coaching strategies work — Sundays 15:00 UTC (after trajectory + relationship analysis)
    await boss.schedule('cron-prompt-insights', '0 15 * * 0', {}, { tz: 'UTC' });
    await boss.schedule('cron-hypothesis-generation', '30 14 * * *', {}, { tz: 'UTC' });
    console.log('✅ Cron Schedules Registered');

    // Heartbeat: any time pg-boss processes a job, mark as alive for health check.
    // pg-boss emits 'wip' events on every fetch cycle, even if no jobs are returned.
    boss.on('wip', () => markJobProcessed());

    // Cron dispatchers: find users and queue individual jobs
    // Smart fallback: skip users with active watch channels + recent syncs (< 45 min)
    await boss.work('cron-sync-calendar', async () => {
        console.log('[CRON] Dispatching calendar sync...');
        const users = await getActiveUsers(['gcal']);
        let queued = 0;
        for (const userId of users) {
            if (await hasRecentWatchSync(userId, 'calendar')) continue;
            await boss.send('calendar-sync', { userId });
            queued++;
        }
        console.log(`[CRON] Queued calendar sync for ${queued}/${users.length} users (rest have active watch channels)`);
    });

    await boss.work('cron-sync-email', async () => {
        console.log('[CRON] Dispatching email sync...');
        const users = await getActiveUsers(['gmail']);
        let queued = 0;
        for (const userId of users) {
            if (await hasRecentWatchSync(userId, 'email')) continue;
            await boss.send('email-sync', { userId });
            queued++;
        }
        console.log(`[CRON] Queued email sync for ${queued}/${users.length} users (rest have active watch channels)`);
    });

    await boss.work('cron-sync-drive', async () => {
        console.log('[CRON] Dispatching drive sync...');
        const users = await getActiveUsers(['gdrive']);
        let queued = 0;
        for (const userId of users) {
            if (await hasRecentWatchSync(userId, 'drive')) continue;
            await boss.send('drive-sync', { userId });
            queued++;
        }
        console.log(`[CRON] Queued drive sync for ${queued}/${users.length} users (rest have active watch channels)`);
    });

    await boss.work('cron-morning-brief', async () => {
        console.log('[CRON] Dispatching morning briefs...');
        const users = await prisma.user.findMany({
            select: { id: true },
            where: {
                OR: [
                    { preferences: null },
                    { preferences: { enableProactivePrompts: true } }
                ]
            }
        });
        for (const user of users) {
            await boss.send('proactive-agent', { userId: user.id, trigger: 'MORNING_BRIEF' });
        }
        console.log(`[CRON] Queued morning brief for ${users.length} users`);

        // Auto-enrich stakeholders before high-stakes meetings
        // Check for NEEDLE_MOVER or user-flagged-critical meetings 2+ days out
        // that have attendees without enrichment
        const now = new Date();
        const twoDaysOut = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        for (const user of users) {
            try {
                // Check if we already ran enrichment for this user in the last 24 hours
                const recentEnrichment = await prisma.stakeholderProfile.findFirst({
                    where: {
                        userId: user.id,
                        enrichedAt: { gte: oneDayAgo },
                    },
                    select: { id: true },
                });
                if (recentEnrichment) continue;

                // Check for high-stakes meetings 2-7 days out
                const highStakesMeetings = await prisma.meetingSyncRecord.findMany({
                    where: {
                        userId: user.id,
                        startTime: { gte: twoDaysOut, lte: sevenDaysOut },
                        status: { not: 'cancelled' },
                        OR: [
                            { meetingCategory: 'NEEDLE_MOVER' },
                            { isPresentation: true },
                        ],
                    },
                    select: { participants: true },
                    take: 10,
                });

                if (highStakesMeetings.length === 0) continue;

                // Check if any attendees lack enrichment
                const allParticipants = new Set<string>();
                for (const m of highStakesMeetings) {
                    for (const p of (m.participants || [])) {
                        if (p && p.includes('@')) allParticipants.add(p.toLowerCase());
                    }
                }

                if (allParticipants.size === 0) continue;

                const unenrichedCount = await prisma.stakeholderProfile.count({
                    where: {
                        userId: user.id,
                        email: { in: Array.from(allParticipants) },
                        OR: [
                            { enrichedAt: null },
                            { enrichedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
                        ],
                    },
                });

                // Also count participants with no profile at all
                const existingProfileEmails = await prisma.stakeholderProfile.findMany({
                    where: { userId: user.id, email: { in: Array.from(allParticipants) } },
                    select: { email: true },
                });
                const profileEmailSet = new Set(existingProfileEmails.map(p => p.email?.toLowerCase()));
                const noProfileCount = Array.from(allParticipants).filter(e => !profileEmailSet.has(e)).length;

                if (unenrichedCount > 0 || noProfileCount > 0) {
                    console.log(`[CRON] High-stakes meeting detected for user ${user.id.substring(0, 8)} — queuing stakeholder enrichment (${unenrichedCount} stale + ${noProfileCount} missing)`);
                    await boss.send('stakeholder-enrichment', { userId: user.id });
                }
            } catch (err: any) {
                console.error(`[CRON] Auto-enrich check failed for user ${user.id.substring(0, 8)}: ${err.message}`);
            }
        }
    });

    await boss.work('cron-pre-meeting-prep', async () => {
        console.log('[CRON] Dispatching pre-meeting prep...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('proactive-agent', { userId, trigger: 'PRE_MEETING_PREP' });
        }
        console.log(`[CRON] Queued pre-meeting prep for ${users.length} users`);
    });

    // [DISABLED] Execution nudge — focusing on pre-meeting prep as core feature
    // await boss.work('cron-execution-nudge', async () => {
    //     console.log('[CRON] Dispatching execution nudges...');
    //     const usersWithOverdue = await prisma.relationshipAction.findMany({
    //         where: { status: 'IN_PROGRESS', dueDate: { lt: new Date() } },
    //         select: { goal: { select: { userId: true } } },
    //         distinct: ['goalId']
    //     });
    //     const uniqueUserIds = [...new Set(usersWithOverdue.map(a => a.goal.userId))];
    //     for (const userId of uniqueUserIds) {
    //         await boss.send('proactive-agent', { userId, trigger: 'EXECUTION_NUDGE' });
    //     }
    //     console.log(`[CRON] Queued execution nudge for ${uniqueUserIds.length} users`);
    // });

    await boss.work('cron-post-meeting-review', async () => {
        console.log('[CRON] Dispatching post-meeting reviews...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('proactive-agent', { userId, trigger: 'POST_MEETING_REVIEW' });
        }
        console.log(`[CRON] Queued post-meeting review for ${users.length} users`);
    });

    await boss.work('cron-context-deepening', async () => {
        console.log('[CRON] Dispatching context deepening...');
        // Find users who have synced meeting data (i.e., have connected calendar)
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('proactive-agent', { userId, trigger: 'CONTEXT_DEEPENING' });
        }
        console.log(`[CRON] Queued context deepening for ${users.length} users`);
    });

    await boss.work('cron-intel-synthesis', async () => {
        console.log('[CRON] Dispatching intelligence synthesis...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('intel-synthesis', { userId });
        }
        console.log(`[CRON] Queued intel synthesis for ${users.length} users`);
    });

    await boss.work('cron-community-detection', async () => {
        console.log('[CRON] Dispatching community detection...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('knowledge-community-detect', { userId });
        }
        console.log(`[CRON] Queued community detection for ${users.length} users`);
    });

    await boss.work('cron-stakeholder-synthesis', async () => {
        console.log('[CRON] Dispatching stakeholder synthesis...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('stakeholder-synthesis', { userId });
        }
        console.log(`[CRON] Queued stakeholder synthesis for ${users.length} users`);
    });

    await boss.work('cron-domain-synthesis', async () => {
        console.log('[CRON] Dispatching domain synthesis...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('domain-synthesis', { userId });
        }
        console.log(`[CRON] Queued domain synthesis for ${users.length} users`);
    });

    await boss.work('cron-stakeholder-enrichment', async () => {
        console.log('[CRON] Dispatching stakeholder enrichment...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('stakeholder-enrichment', { userId });
        }
        console.log(`[CRON] Queued stakeholder enrichment for ${users.length} users`);
    });

    await boss.work('cron-extract-voice', async () => {
        console.log('[CRON] Dispatching voice fact extraction...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('knowledge-extract-voice', { userId });
        }
        console.log(`[CRON] Queued voice fact extraction for ${users.length} users`);
    });

    await boss.work('cron-confidence-decay', async () => {
        console.log('[CRON] Running confidence decay...');
        try {
            await runConfidenceDecayAllUsers();
        } catch (e: any) {
            console.error(`[CRON] Confidence decay failed: ${e.message}`);
        }
        console.log('[CRON] Confidence decay complete');
    });

    await boss.work('cron-api-key-health', async () => {
        console.log('[CRON] Checking API key health...');
        try {
            const { checkAllApiKeys } = require('./lib/api-key-health');
            const results = await checkAllApiKeys();
            const issues = results.filter((r: any) => r.status !== 'healthy' && r.status !== 'not_configured');
            if (issues.length > 0) {
                console.warn(`[CRON] API key issues: ${issues.map((r: any) => `${r.service}=${r.status}`).join(', ')}`);
            }
        } catch (e: any) {
            console.error(`[CRON] API key health check failed: ${e.message}`);
        }
    });

    await boss.work('cron-renew-watch-channels', async () => {
        console.log('[CRON] Renewing expiring watch channels...');
        try {
            const result = await renewExpiringWatchChannels();
            console.log(`[CRON] Watch channels renewed: ${result.renewed}, failed: ${result.failed}`);
        } catch (e: any) {
            console.error(`[CRON] Watch channel renewal failed: ${e.message}`);
        }
    });

    // Meeting Champion crons
    await boss.work('cron-weekly-meeting-patterns', async () => {
        console.log('[CRON] Generating weekly meeting pattern snapshots...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            try {
                await generateWeeklyPatternSnapshot(userId);
            } catch (e: any) {
                console.error(`[CRON] Pattern snapshot failed for ${userId}: ${e.message}`);
            }
        }
        console.log(`[CRON] Weekly patterns complete for ${users.length} users`);
    });

    await boss.work('cron-stakeholder-importance', async () => {
        console.log('[CRON] Weekly stakeholder importance re-scoring...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            try {
                const { scoreStakeholderImportance } = require('./agents/stakeholder-importance-agent');
                await scoreStakeholderImportance(userId);
            } catch (e: any) {
                console.error(`[CRON] Importance scoring failed for ${userId}: ${e.message}`);
            }
        }
        console.log(`[CRON] Importance scoring complete for ${users.length} users`);
    });

    await boss.work('cron-commitment-reminders', async () => {
        console.log('[CRON] Checking commitment reminders...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            try {
                await checkCommitmentReminders(userId);
            } catch (e: unknown) {
                const errMsg = e instanceof Error ? e.message : String(e);
                console.error(`[CRON] Commitment reminders failed for ${userId}: ${errMsg}`);
            }
        }
        console.log(`[CRON] Commitment reminders complete for ${users.length} users`);
    });

    // Day Planner: pre-schedule the day's calls at ~6 AM local time
    await boss.work('cron-day-planner', async () => {
        console.log('[CRON] Running day planner...');
        try {
            await dispatchDayPlanner();
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[CRON] Day planner failed: ${errMsg}`);
        }
    });

    // Daily Call Scheduler: dynamic adjustments during the day
    await boss.work('cron-daily-call-scheduler', async () => {
        console.log('[CRON] Running daily call scheduler...');
        try {
            await dispatchDailyCallScheduler();
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[CRON] Daily call scheduler failed: ${errMsg}`);
        }
    });

    // Execute Scheduled Calls: every 2 min — pick up pending calls that are due
    await boss.work('execute-scheduled-calls', async () => {
        try {
            await dispatchPendingCalls();
        } catch (e: unknown) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(`[CRON] Execute scheduled calls failed: ${errMsg}`);
        }
    });

    // Polling for pending call pickup — fallback in case cron misses
    setInterval(async () => {
        try {
            await dispatchPendingCalls();
        } catch {}
    }, 30_000);

    // Pattern Detection: daily at 3 PM UTC — detect negative patterns, nudge if high severity
    await boss.work('cron-pattern-detection', async () => {
        console.log('[CRON] Running pattern detection...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            try {
                const patterns = await detectPatterns(userId);
                const highSeverity = patterns.filter(p => p.severity === 'high');
                if (highSeverity.length > 0) {
                    const topPattern = highSeverity[0];
                    const nudgeMessage = `**Pattern Alert: ${topPattern.name}**\n\n${topPattern.description}\n\n*${topPattern.suggestion}*`;

                    // Store as assistant message for chat history
                    const msg = await prisma.message.create({
                        data: {
                            userId,
                            role: 'assistant',
                            content: nudgeMessage,
                        },
                    });

                    // Deliver via Pusher
                    await publishMessage(userId, {
                        id: msg.id,
                        role: 'assistant',
                        content: nudgeMessage,
                        createdAt: msg.createdAt,
                    });

                    // Also send system event for dashboard badge
                    await publishSystemEvent(userId, {
                        type: 'proactive_nudge',
                        message: `Pattern detected: ${topPattern.name}`,
                        data: { patternId: topPattern.id, severity: topPattern.severity },
                    });

                    // Voice delivery — only if user has voiceProactiveNudge enabled
                    try {
                        const nudgePrefs = await prisma.userPreferences.findUnique({
                            where: { userId },
                            select: { voiceProactiveNudge: true },
                        });
                        if (nudgePrefs?.voiceProactiveNudge) {
                            const useVoice = await shouldDeliverViaVoice(userId);
                            if (useVoice) {
                                await triggerVoiceCall({ userId, callType: 'proactive_nudge' });
                            }
                        }
                    } catch { /* voice delivery is best-effort */ }

                    // Web push notification
                    await sendPushToUser(userId, {
                        title: 'Mira',
                        body: `${topPattern.name}: ${topPattern.description.substring(0, 100)}`,
                    });

                    console.log(`[PatternDetection] Nudged user ${userId.substring(0, 8)} for ${topPattern.name}`);
                }
            } catch (e: any) {
                console.error(`[PatternDetection] Failed for ${userId.substring(0, 8)}: ${e.message}`);
            }
        }
        console.log(`[CRON] Pattern detection complete for ${users.length} users`);
    });

    // Friday Ritual: Fridays at 6:30 PM IST — wind-down, ask for ONE win
    await boss.work('cron-friday-ritual', async () => {
        console.log('[CRON] Dispatching Friday rituals...');
        const users = await prisma.user.findMany({
            select: { id: true },
            where: {
                OR: [
                    { preferences: null },
                    { preferences: { enableProactivePrompts: true } }
                ]
            }
        });

        for (const user of users) {
            try {
                // Generate the Friday ritual message
                const message = await generateFridayRitual(user.id);
                if (!message) continue;

                // Voice delivery — only if user has voiceFridayRitual enabled
                const fridayPrefs = await prisma.userPreferences.findUnique({
                    where: { userId: user.id },
                    select: { voiceFridayRitual: true },
                });
                if (fridayPrefs?.voiceFridayRitual) {
                    const wantsVoice = await shouldDeliverViaVoice(user.id);
                    if (wantsVoice) {
                        console.log(`[CRON] Friday ritual via voice for ${user.id.substring(0, 8)}`);
                        await triggerVoiceCall({ userId: user.id, callType: 'friday_ritual' });
                    }
                }

                // Always deliver text version (via Pusher as chat message)
                const savedMessage = await prisma.message.create({
                    data: { userId: user.id, role: 'assistant', content: message, type: 'PROACTIVE_NUDGE' }
                });

                await publishMessage(user.id, {
                    id: savedMessage.id,
                    role: 'assistant',
                    content: message,
                    createdAt: savedMessage.createdAt
                });

                await publishSystemEvent(user.id, {
                    type: 'proactive_nudge',
                    message: 'Friday wind-down',
                    data: { trigger: 'FRIDAY_RITUAL', messageId: savedMessage.id }
                });

                await sendPushToUser(user.id, {
                    title: 'Mira — Friday Ritual',
                    body: message.replace(/\*\*/g, '').substring(0, 120),
                    url: '/v2'
                });

                // Track delivery for dedup
                await prisma.proactivePrompt.create({
                    data: {
                        userId: user.id,
                        type: 'REFLECTION',
                        content: message,
                        stakeholderId: 'friday-ritual',
                        deliveredVia: wantsVoice ? 'voice' : 'pusher'
                    }
                });
            } catch (e: unknown) {
                const errMsg = e instanceof Error ? e.message : String(e);
                console.error(`[CRON] Friday ritual failed for ${user.id.substring(0, 8)}: ${errMsg}`);
            }
        }
        console.log(`[CRON] Friday rituals complete for ${users.length} users`);
    });

    // Weekly Reflection: Sundays at 5:30 PM IST — patterns, wins, what's ahead
    await boss.work('cron-weekly-reflection', async () => {
        console.log('[CRON] Dispatching weekly reflections...');
        const users = await prisma.user.findMany({
            select: { id: true },
            where: {
                OR: [
                    { preferences: null },
                    { preferences: { enableProactivePrompts: true } }
                ]
            }
        });

        for (const user of users) {
            try {
                // Generate the weekly reflection message
                const message = await generateWeeklyReflectionMessage(user.id);
                if (!message) continue;

                // Voice delivery — only if user has voiceWeeklyReflection enabled
                const reflectionPrefs = await prisma.userPreferences.findUnique({
                    where: { userId: user.id },
                    select: { voiceWeeklyReflection: true },
                });
                if (reflectionPrefs?.voiceWeeklyReflection) {
                    const wantsVoice = await shouldDeliverViaVoice(user.id);
                    if (wantsVoice) {
                        console.log(`[CRON] Weekly reflection via voice for ${user.id.substring(0, 8)}`);
                        await triggerVoiceCall({ userId: user.id, callType: 'weekly_reflection' });
                    }
                }

                // Always deliver text version (via Pusher as chat message)
                const savedMessage = await prisma.message.create({
                    data: { userId: user.id, role: 'assistant', content: message, type: 'PROACTIVE_NUDGE' }
                });

                await publishMessage(user.id, {
                    id: savedMessage.id,
                    role: 'assistant',
                    content: message,
                    createdAt: savedMessage.createdAt
                });

                await publishSystemEvent(user.id, {
                    type: 'proactive_nudge',
                    message: 'Weekly reflection',
                    data: { trigger: 'WEEKLY_REFLECTION', messageId: savedMessage.id }
                });

                await sendPushToUser(user.id, {
                    title: 'Mira — Weekly Reflection',
                    body: message.replace(/\*\*/g, '').substring(0, 120),
                    url: '/v2'
                });

                // Track delivery for dedup
                await prisma.proactivePrompt.create({
                    data: {
                        userId: user.id,
                        type: 'REFLECTION',
                        content: message,
                        stakeholderId: 'weekly-reflection-sunday',
                        deliveredVia: wantsVoice ? 'voice' : 'pusher'
                    }
                });
            } catch (e: unknown) {
                const errMsg = e instanceof Error ? e.message : String(e);
                console.error(`[CRON] Weekly reflection failed for ${user.id.substring(0, 8)}: ${errMsg}`);
            }
        }
        console.log(`[CRON] Weekly reflections complete for ${users.length} users`);
    });

    // ========================================
    // JOB WORKERS
    // ========================================

    // 3. Register Workers
    await boss.work('sentinel-poll', async (jobArg: any) => {
        console.log('Sentinel waking up...');
    });

    await boss.work('agent-interviewer', async (jobArg: any) => {
        // Handle array or single object
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;

        console.log('🦁 [Interviewer] Job Received ID:', job ? job.id : 'NULL JOB');

        if (!job || !job.data) {
            console.error('❌ Job has no data!', JSON.stringify(jobArg));
            return;
        }

        const { userId, message, messageId } = job.data;
        console.log(`🔍 Processing for UserID: ${userId}`);
        console.log(`📝 Message Content: "${message ? message.substring(0, 50) : 'NO MESSAGE'}"`);

        try {
            console.log('➡️ Calling interviewerAgent...');
            const result: any = await interviewerAgent({ userId, message });

            if (result.success) {
                console.log('✅ [Interviewer] Success. Response generated.');
                console.log('Response Snippet:', result.response?.substring(0, 50));
                // Trigger knowledge graph extraction from user message
                if (messageId) {
                    await boss.send('knowledge-extract-chat', { userId, messageId });
                }
            } else {
                console.error('❌ [Interviewer] Agent returned failure:', result.error);
            }
        } catch (e: any) {
            console.error('🔥 [Interviewer] Handler Exception:', e);
            throw e;
        }
    });

    // 4. Register Graph Builder
    await boss.createQueue('agent-graph-builder');
    await boss.work('agent-graph-builder', { teamSize: 1 }, async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        // console.log('🕸️ [GraphBuilder] Job Received ID:', job ? job.id : 'NULL JOB');

        if (!job || !job.data) return;

        try {
            const { graphBuilderAgent } = require('./agents/graph-builder');
            const result = await graphBuilderAgent(job.data);
            // console.log('✅ [GraphBuilder] Result:', result);
        } catch (e) {
            console.error('🔥 [GraphBuilder] Failed:', e);
            throw e;
        }
    });

    // 5. Register Calendar Sync Worker
    await boss.work('calendar-sync', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('📅 [CalendarSync] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [CalendarSync] Job has no userId!');
            return;
        }

        try {
            const result = await calendarSyncAgent(job.data.userId);
            console.log(`✅ [CalendarSync] Complete: ${result.synced} events synced`);
            // Trigger knowledge graph extraction after sync
            if (result.synced > 0) {
                await boss.send('knowledge-extract-calendar', { userId: job.data.userId });
            }
            // Proactively fetch Gemini meeting notes for past meetings
            await boss.send('meeting-notes-sync', { userId: job.data.userId });
            // Resolve identities — detect duplicate stakeholder profiles
            await boss.send('identity-resolution', { userId: job.data.userId });
            // Auto-setup watch channel if none exists
            autoSetupWatchChannels(job.data.userId, 'calendar').catch(() => {});
        } catch (e) {
            console.error('🔥 [CalendarSync] Failed:', e);
            throw e;
        }
    });

    // 6. Register Email Sync Worker
    await boss.work('email-sync', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('📧 [EmailSync] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [EmailSync] Job has no userId!');
            return;
        }

        try {
            const result = await emailSyncAgent(job.data.userId);
            console.log(`✅ [EmailSync] Complete: ${result.synced} threads synced`);
            // Trigger knowledge graph extraction after sync
            if (result.synced > 0) {
                await boss.send('knowledge-extract-email', { userId: job.data.userId });
            }
            // Trigger stakeholder importance scoring after email sync
            if (result.synced > 0) {
                await boss.send('stakeholder-importance', {
                    userId: job.data.userId,
                    isFirstSync: job.data.isFirstSync || false,
                });
            }
            // Auto-setup watch channel if none exists
            autoSetupWatchChannels(job.data.userId, 'gmail').catch(() => {});
        } catch (e) {
            console.error('🔥 [EmailSync] Failed:', e);
            throw e;
        }
    });

    // 7. Register Drive Sync Worker
    await boss.work('drive-sync', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('📁 [DriveSync] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [DriveSync] Job has no userId!');
            return;
        }

        try {
            const result = await driveSyncAgent(job.data.userId);
            console.log(`✅ [DriveSync] Complete: ${result.synced} documents synced`);
            // Trigger knowledge graph extraction after sync
            if (result.synced > 0) {
                await boss.send('knowledge-extract-document', { userId: job.data.userId });
            }
            // Auto-setup watch channel if none exists
            autoSetupWatchChannels(job.data.userId, 'drive').catch(() => {});
        } catch (e) {
            console.error('🔥 [DriveSync] Failed:', e);
            throw e;
        }
    });

    // GitHub sync worker
    await boss.work('github-sync', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('🐙 [GitHubSync] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [GitHubSync] Job has no userId!');
            return;
        }

        try {
            await runGitHubSync({
                userId: job.data.userId,
                resourceId: job.data.resourceId,
                trigger: job.data.trigger,
            });
            console.log(`✅ [GitHubSync] Complete`);
            // Trigger knowledge graph extraction after sync
            await boss.send('knowledge-extract-github', { userId: job.data.userId, resourceId: job.data.resourceId });
        } catch (e) {
            console.error('🔥 [GitHubSync] Failed:', e);
            throw e;
        }
    });

    // GitHub fact extraction worker
    await boss.work('knowledge-extract-github', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;
        try {
            await extractGitHubFacts({ userId: job.data.userId, resourceId: job.data.resourceId });
        } catch (e) {
            console.error('🔥 [knowledge-extract-github] Failed:', e);
        }
    });

    // Register Identity Resolution Worker
    await boss.work('identity-resolution', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;
        try {
            const { resolveIdentities } = require('./agents/identity-resolution-agent');
            await resolveIdentities(job.data.userId);
        } catch (e: any) {
            console.error('🔥 [IdentityResolution] Failed:', e.message);
        }
    });

    // Register Meeting Notes Sync Worker
    await boss.work('meeting-notes-sync', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;
        try {
            const { syncMeetingNotes } = require('./agents/meeting-notes-sync');
            const result = await syncMeetingNotes(job.data.userId);
            // Trigger fact extraction if we got new notes
            if (result.fetched > 0) {
                await boss.send('knowledge-extract-meeting-notes', { userId: job.data.userId });
            }
        } catch (e: any) {
            console.error('🔥 [MeetingNotesSync] Failed:', e.message);
        }
    });

    await boss.work('cron-meeting-notes-sync', async () => {
        console.log('[CRON] Syncing meeting notes for all users...');
        const users = await getActiveUsers(['gcal']);
        for (const userId of users) {
            await boss.send('meeting-notes-sync', { userId });
        }
        console.log(`[CRON] Meeting notes sync queued for ${users.length} users`);
    });

    // Register Stakeholder Importance Scoring Worker
    await boss.work('stakeholder-importance', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;
        try {
            const { scoreStakeholderImportance } = require('./agents/stakeholder-importance-agent');
            await scoreStakeholderImportance(job.data.userId, { isFirstSync: job.data.isFirstSync });
        } catch (e) {
            console.error('🔥 [StakeholderImportance] Failed:', e);
        }
    });

    // 8. Register Intelligence Synthesis Worker
    await boss.work('intel-synthesis', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('🧠 [IntelSynthesis] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [IntelSynthesis] Job has no userId!');
            return;
        }

        try {
            await synthesizeUserIntelligence(job.data.userId);
            console.log(`✅ [IntelSynthesis] Complete for user`);
        } catch (e) {
            console.error('🔥 [IntelSynthesis] Failed:', e);
            throw e;
        }
    });

    // 9. Register Knowledge Graph Extraction Workers
    await boss.work('knowledge-extract-calendar', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await extractCalendarFacts(job.data.userId);
            console.log(`✅ [KG-Calendar] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
        } catch (e: any) {
            console.error('🔥 [KG-Calendar] Failed:', e.message);
        }
    });

    await boss.work('knowledge-extract-email', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await extractEmailFacts(job.data.userId);
            console.log(`✅ [KG-Email] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
        } catch (e: any) {
            console.error('🔥 [KG-Email] Failed:', e.message);
        }
    });

    await boss.work('knowledge-extract-document', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await extractDocumentFacts(job.data.userId);
            console.log(`✅ [KG-Document] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
        } catch (e: any) {
            console.error('🔥 [KG-Document] Failed:', e.message);
        }
    });

    await boss.work('knowledge-extract-meeting-notes', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await extractMeetingNotesFacts(job.data.userId);
            if (result.factsCreated > 0) {
                console.log(`✅ [KG-MeetingNotes] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
                // Trigger stakeholder synthesis to incorporate meeting decisions/positions
                await boss.send('stakeholder-synthesis', { userId: job.data.userId });
            }
        } catch (e: any) {
            console.error('🔥 [KG-MeetingNotes] Failed:', e.message);
        }
    });

    await boss.work('knowledge-extract-voice', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await extractVoiceFacts(job.data.userId);
            if (result.factsCreated > 0) {
                console.log(`✅ [KG-Voice] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
                // Trigger stakeholder synthesis to incorporate voice call insights
                await boss.send('stakeholder-synthesis', { userId: job.data.userId });
            }
        } catch (e: any) {
            console.error('🔥 [KG-Voice] Failed:', e.message);
        }
    });

    await boss.work('knowledge-extract-chat', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId || !job?.data?.messageId) return;

        try {
            const result = await extractChatFacts(job.data.userId, job.data.messageId);
            if (result.factsCreated > 0) {
                console.log(`✅ [KG-Chat] ${result.entitiesFound} entities, ${result.factsCreated} facts`);
                // Chat is overweighted — trigger immediate stakeholder synthesis
                // when user shares new facts (don't wait for daily cron)
                if (result.factsCreated >= 2) {
                    await boss.send('stakeholder-synthesis', { userId: job.data.userId });
                }
            }
        } catch (e: any) {
            console.error('🔥 [KG-Chat] Failed:', e.message);
        }
    });

    // 9b. Register Community Detection Worker
    await boss.work('knowledge-community-detect', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await detectCommunities(job.data.userId);
            console.log(`✅ [KG-Community] ${result.communitiesFound} communities for user`);
        } catch (e: any) {
            console.error(`🔥 [KG-Community] Failed: ${e.message}`);
        }
    });

    // 10. Register Stakeholder Synthesis Worker
    await boss.work('stakeholder-synthesis', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await synthesizeStakeholderIntelligence(job.data.userId);
            console.log(`✅ [StakeholderSynthesis] ${result.processed} processed, ${result.skipped} skipped`);
        } catch (e: any) {
            console.error('🔥 [StakeholderSynthesis] Failed:', e.message);
        }
    });

    // 11. Register Domain Synthesis Worker
    await boss.work('domain-synthesis', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await synthesizeDomainContext(job.data.userId);
            console.log(`✅ [DomainSynthesis] updated=${result.updated}, learnings=${result.learningsCreated}`);
        } catch (e: any) {
            console.error('🔥 [DomainSynthesis] Failed:', e.message);
        }
    });

    // 12. Register Stakeholder Enrichment Worker
    await boss.work('stakeholder-enrichment', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        try {
            const result = await enrichStakeholders(job.data.userId);
            console.log(`[StakeholderEnrichment] User ${job.data.userId.substring(0, 8)}: ${result.enriched} enriched, ${result.discovered} discovered, ${result.skipped} skipped`);
        } catch (e: any) {
            console.error(`[StakeholderEnrichment] Error: ${e.message}`);
        }
    });

    // 13. Register WhatsApp Connect Worker
    await boss.work('whatsapp-connect', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.userId) return;

        const { userId, action } = job.data;
        try {
            if (action === 'disconnect') {
                await stopWhatsAppListener(userId);
                console.log(`✅ [WhatsApp] Disconnected for user`);
            } else {
                const result = await startWhatsAppListener(userId);
                console.log(`✅ [WhatsApp] Connect result: ${result.status}`);
            }
        } catch (e: any) {
            console.error(`🔥 [WhatsApp] ${action} failed:`, e.message);
        }
    });

    // 14. WhatsApp extraction cron — process accumulated group messages
    await boss.work('cron-whatsapp-extract', async () => {
        console.log('[CRON] Processing WhatsApp messages...');
        try {
            // Find groups with unprocessed messages
            const groups = await prisma.whatsAppMessage.groupBy({
                by: ['userId', 'groupId'],
                where: { processed: false },
                _count: true,
            });

            for (const group of groups) {
                if (group._count >= 5) { // Only extract when enough messages accumulated
                    await queueWhatsAppExtraction(group.userId, group.groupId);
                }
            }
            console.log(`[CRON] WhatsApp: processed ${groups.length} groups`);
        } catch (e: any) {
            console.error(`[CRON] WhatsApp extraction failed: ${e.message}`);
        }
    });

    // Auto-reconnect WhatsApp sessions on worker startup
    try {
        const activeSessions = await prisma.whatsAppSession.findMany({
            where: { status: 'CONNECTED' },
            select: { userId: true },
        });
        for (const session of activeSessions) {
            startWhatsAppListener(session.userId).catch(err =>
                console.warn(`[WhatsApp] Auto-reconnect failed for ${session.userId.substring(0, 8)}: ${err.message}`)
            );
        }
        if (activeSessions.length > 0) {
            console.log(`✅ WhatsApp: auto-reconnecting ${activeSessions.length} sessions`);
        }
    } catch {}

    // 15b. Coaching Intelligence Workers

    // Call evaluation — triggered by direct job or poll
    await boss.work('call-evaluation', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.voiceCallId) return;

        try {
            await evaluateCall(job.data.voiceCallId);
            console.log(`✅ [CallEvaluation] Complete for voiceCall ${job.data.voiceCallId.substring(0, 8)}`);
        } catch (e: any) {
            console.error(`🔥 [CallEvaluation] Failed: ${e.message}`);
        }
    });

    // Direct post-call analysis job
    await boss.work('post-call-analysis', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        if (!job?.data?.voiceCallId) return;

        try {
            await runPostCallAnalysisTracked(job.data.voiceCallId);
            console.log(`✅ [PostCallAnalysis] Complete for voiceCall ${job.data.voiceCallId.substring(0, 8)}`);
        } catch (e: any) {
            console.error(`🔥 [PostCallAnalysis] Failed: ${e.message}`);
        }
    });

    // Poll for calls needing post-call analysis (onboarding detection, threads, signals)
    // Picks up calls that ended in last 24h and haven't been analyzed yet
    await boss.work('cron-post-call-analysis-poll', async () => {
        // Find calls that ended recently and might need analysis
        const recentCalls = await prisma.voiceCall.findMany({
            where: {
                status: 'ended',
                durationSeconds: { gt: 30 },
                transcript: { not: null },
                endedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            select: { id: true, userId: true },
            take: 10,
            orderBy: { endedAt: 'desc' },
        });

        // Filter to calls where onboarding is not yet complete
        for (const call of recentCalls) {
            const onboarding = await prisma.onboardingProgress.findUnique({
                where: { userId: call.userId },
            });
            if (!onboarding || !onboarding.onboardingComplete) {
                await boss.send('post-call-analysis', { voiceCallId: call.id });
            }
        }
    });

    // Poll for unevaluated calls — picks up calls that ended but have no CallEvaluation
    await boss.work('cron-call-evaluation-poll', async () => {
        const unevaluated = await prisma.voiceCall.findMany({
            where: {
                status: 'ended',
                durationSeconds: { gt: 30 },
                transcript: { not: null },
                evaluation: null,
                endedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours only
            },
            select: { id: true },
            take: 10,
        });

        if (unevaluated.length > 0) {
            console.log(`[CRON] Found ${unevaluated.length} unevaluated calls, queuing...`);
            for (const call of unevaluated) {
                await boss.send('call-evaluation', { voiceCallId: call.id });
            }
        }
    });

    // Weekly trajectory computation
    await boss.work('cron-coaching-trajectory', async () => {
        console.log('[CRON] Computing weekly coaching trajectories...');
        try {
            await computeWeeklyTrajectoryAllUsers();
            console.log('[CRON] Weekly trajectories complete');
        } catch (e: any) {
            console.error(`[CRON] Trajectory computation failed: ${e.message}`);
        }
    });

    // Weekly deep relationship analysis
    await boss.work('cron-relationship-analysis', async () => {
        console.log('[CRON] Running deep relationship analysis...');
        const users = await prisma.user.findMany({
            where: { voiceCalls: { some: { status: 'ended' } } },
            select: { id: true },
        });
        for (const user of users) {
            try {
                await deepAnalyzeRelationship(user.id);
            } catch (e: any) {
                console.error(`[CRON] Relationship analysis failed for ${user.id.substring(0, 8)}: ${e.message}`);
            }
        }
        console.log(`[CRON] Relationship analysis complete for ${users.length} users`);
    });

    // Admin daily brief — compute and deliver via Pusher
    await boss.work('cron-admin-daily-brief', async () => {
        console.log('[CRON] Generating admin daily brief...');
        try {
            const admins = await prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true },
            });
            for (const admin of admins) {
                await publishSystemEvent(admin.id, {
                    type: 'proactive_nudge' as any,
                    message: 'Daily coaching intelligence brief is ready',
                    data: { url: '/api/admin/coaching-intelligence/daily-brief' },
                });
            }
            console.log(`[CRON] Admin daily brief sent to ${admins.length} admins`);
        } catch (e: any) {
            console.error(`[CRON] Admin daily brief failed: ${e.message}`);
        }
    });

    // Prompt Insights — auto-learn + auto-apply coaching strategies
    await boss.work('cron-prompt-insights', async () => {
        console.log('[CRON] Running prompt insight analysis...');
        try {
            const { generateInsights, activateProposedInsights } = await import('./agents/prompt-insight-agent');
            await generateInsights();
            await activateProposedInsights();
            console.log('[CRON] Prompt insight analysis complete');
        } catch (e: any) {
            console.error(`[CRON] Prompt insight analysis failed: ${e.message}`);
        }

        // Conclude experiments with sufficient data
        try {
            const { concludeReadyExperiments } = await import('./agents/experiment-agent');
            await concludeReadyExperiments();
            console.log('[CRON] Experiment conclusion check complete');
        } catch (e: any) {
            console.error(`[CRON] Experiment conclusion failed: ${e.message}`);
        }
    });

    // Hypothesis Generation — observe → hypothesize → present → validate → learn
    await boss.work('cron-hypothesis-generation', async () => {
        console.log('[CRON] Running hypothesis generation...');
        try {
            await runHypothesisGenerationAllUsers();
            console.log('[CRON] Hypothesis generation complete');
        } catch (e: any) {
            console.error(`[CRON] Hypothesis generation failed: ${e.message}`);
        }
    });

    // 15. Register Proactive Agent Worker
    await boss.work('proactive-agent', async (jobArg: any) => {
        let job = Array.isArray(jobArg) ? jobArg[0] : jobArg;
        console.log('🔔 [ProactiveAgent] Job Received');

        if (!job || !job.data || !job.data.userId) {
            console.error('❌ [ProactiveAgent] Job has no userId!');
            return;
        }

        const { userId, trigger, context, force } = job.data;

        try {
            // Route to specific handler based on trigger type
            switch (trigger) {
                case 'PRE_MEETING_PREP':
                    await checkPreMeetingPrep(userId);
                    break;
                case 'MORNING_BRIEF':
                    await generateMorningBrief(userId, force);
                    break;
                // [DISABLED] POST_DOCUMENT_ACTIVITY — focusing on pre-meeting prep as core feature
                // case 'POST_DOCUMENT_ACTIVITY':
                //     if (context?.documentId && context?.documentName) {
                //         await handleDocumentActivity(userId, context.documentId, context.documentName);
                //     }
                //     break;
                case 'CONTEXT_DEEPENING':
                    await generateContextDeepening(userId, force);
                    break;
                case 'POST_MEETING_REVIEW':
                    await checkPostMeetingReview(userId);
                    // Trigger fact extraction from any newly stored meeting notes
                    await boss.send('knowledge-extract-meeting-notes', { userId });
                    break;
                default:
                    await proactiveAgent({ userId, trigger: trigger as ProactiveTrigger, context });
            }
            console.log(`✅ [ProactiveAgent] ${trigger} complete for user`);
        } catch (e) {
            console.error('🔥 [ProactiveAgent] Failed:', e);
            throw e;
        }
    });

    console.log('🚀 OpenClaw is Listening for Jobs...');
}

startDaemon().catch(err => {
    console.error('Fatal Daemon Error:', err);
    Sentry.captureException(err);
    Promise.all([Sentry.flush(2000), flushLangfuse()]).finally(() => process.exit(1));
});
