/**
 * MVQS Scout Pass
 * 
 * Assembles all relevant context for a conversation prep from the intelligence database.
 * This is the first pass of the 3-pass generation system (Scout → Generate → Critique).
 */

import { prisma } from '@/lib/prisma';
import { subDays } from 'date-fns';

interface MeetingContext {
    title: string;
    stakeholderName: string;
    stakeholderEmail?: string;
    objective: string;
    scheduledAt: Date;
    type: string;
}

interface StakeholderContext {
    name: string;
    email?: string;
    role?: string;
    organization?: string;
    communicationStyle?: string;
    decisionPattern?: string;
    hotButtons: string[];
    successPatterns: string[];
    failurePatterns: string[];
    recentTopics: string[];
    profile?: string;
}

interface PastMeetingContext {
    date: Date;
    title: string;
    outcome?: string;
    notes?: string;
}

interface EmailContext {
    summary: string;
    sentiment: string;
    topics: string[];
    date: Date;
}

interface PatternContext {
    whatWorked: string[];
    whatFailed: string[];
}

interface SyncFreshness {
    calendarLastSync?: Date;
    emailLastSync?: Date;
    profileLastRefresh?: Date;
    isStale: boolean;
}

export interface IntelligenceReport {
    stakeholder: StakeholderContext;
    context: {
        pastMeetings: PastMeetingContext[];
        recentEmails: EmailContext[];
        upcomingContext: string[];
    };
    patterns: PatternContext;
    freshness: SyncFreshness;
    evidenceCount: number;
    generatedAt: Date;
}

/**
 * Execute Scout pass to gather all context for a conversation
 */
export async function scoutPass(
    userId: string,
    meetingContext: MeetingContext
): Promise<IntelligenceReport> {
    const now = new Date();

    // 1. Find or match stakeholder
    const stakeholder = await findStakeholder(userId, meetingContext);

    // 2. Get past meetings with this stakeholder
    const pastMeetings = await getPastMeetings(userId, stakeholder?.email || undefined);

    // 3. Get email context
    const recentEmails = await getRecentEmails(userId, stakeholder?.email || undefined);

    // 4. Get upcoming meetings for context
    const upcomingContext = await getUpcomingContext(userId);

    // 5. Get past conversation prep outcomes
    const patterns = await getOutcomePatterns(userId, stakeholder?.email || undefined);

    // 6. Get sync freshness
    const freshness = await getSyncFreshness(userId);

    // 7. Get stakeholder intelligence if available
    const intelligence = stakeholder?.id
        ? await prisma.stakeholderIntelligence.findUnique({
            where: { stakeholderId: stakeholder.id },
        })
        : null;

    const evidenceCount =
        pastMeetings.length +
        recentEmails.length +
        (intelligence ? intelligence.evidenceCount : 0);

    return {
        stakeholder: {
            name: stakeholder?.name || meetingContext.stakeholderName,
            email: stakeholder?.email || meetingContext.stakeholderEmail,
            role: stakeholder?.role || undefined,
            organization: stakeholder?.organization || undefined,
            communicationStyle: stakeholder?.communicationStyle || undefined,
            decisionPattern: stakeholder?.decisionStyle || undefined,
            hotButtons: stakeholder?.fears || [],
            successPatterns: intelligence?.successPatterns || [],
            failurePatterns: intelligence?.failurePatterns || [],
            recentTopics: stakeholder?.topics || intelligence?.recentTopics || [],
            profile: intelligence?.profileSummary || undefined,
        },
        context: {
            pastMeetings,
            recentEmails,
            upcomingContext,
        },
        patterns,
        freshness,
        evidenceCount,
        generatedAt: now,
    };
}

/**
 * Find stakeholder by email or name matching
 */
async function findStakeholder(
    userId: string,
    context: MeetingContext
) {
    // Try exact email match first
    if (context.stakeholderEmail) {
        const byEmail = await prisma.stakeholderProfile.findUnique({
            where: {
                userId_email: { userId, email: context.stakeholderEmail },
            },
        });
        if (byEmail) return byEmail;
    }

    // Try name-based search
    const byName = await prisma.stakeholderProfile.findFirst({
        where: {
            userId,
            name: { contains: context.stakeholderName, mode: 'insensitive' },
        },
    });

    return byName;
}

/**
 * Get past meetings with stakeholder
 */
async function getPastMeetings(
    userId: string,
    stakeholderEmail?: string
): Promise<PastMeetingContext[]> {
    if (!stakeholderEmail) return [];

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            participants: { has: stakeholderEmail },
            startTime: { lt: new Date() },
        },
        orderBy: { startTime: 'desc' },
        take: 5,
    });

    return meetings.map(m => ({
        date: m.startTime,
        title: m.title,
        outcome: m.outcome || undefined,
        notes: m.notes || undefined,
    }));
}

/**
 * Get recent email context with stakeholder
 */
async function getRecentEmails(
    userId: string,
    stakeholderEmail?: string
): Promise<EmailContext[]> {
    if (!stakeholderEmail) return [];

    const emails = await prisma.emailSummary.findMany({
        where: {
            userId,
            participants: { has: stakeholderEmail },
            lastMessageAt: { gte: subDays(new Date(), 14) },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
    });

    return emails.map(e => ({
        summary: e.summary,
        sentiment: e.sentiment,
        topics: e.keyTopics,
        date: e.lastMessageAt,
    }));
}

/**
 * Get upcoming meetings for broader context
 */
async function getUpcomingContext(userId: string): Promise<string[]> {
    const upcoming = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: new Date() },
        },
        orderBy: { startTime: 'asc' },
        take: 5,
    });

    return upcoming.map(m =>
        `${m.startTime.toLocaleDateString()}: ${m.title}`
    );
}

/**
 * Get patterns from past conversation outcomes
 */
async function getOutcomePatterns(
    userId: string,
    stakeholderEmail?: string
): Promise<PatternContext> {
    // Get past preps with outcomes
    const preps = await prisma.conversationPrep.findMany({
        where: {
            userId,
            status: 'COMPLETED',
            ...(stakeholderEmail && { stakeholderEmail }),
        },
        include: {
            outcome: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
    });

    const whatWorked: string[] = [];
    const whatFailed: string[] = [];

    for (const prep of preps) {
        if (prep.outcome) {
            whatWorked.push(...(prep.outcome.whatWorked || []));
            whatFailed.push(...(prep.outcome.whatFailed || []));
        }
    }

    return {
        whatWorked: [...new Set(whatWorked)].slice(0, 5),
        whatFailed: [...new Set(whatFailed)].slice(0, 5),
    };
}

/**
 * Get sync freshness status
 */
async function getSyncFreshness(userId: string): Promise<SyncFreshness> {
    const [calendarSync, emailSync] = await Promise.all([
        prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'calendar' } },
        }),
        prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'email' } },
        }),
    ]);

    const staleThreshold = subDays(new Date(), 1);

    const calendarStale = !calendarSync?.lastSyncAt ||
        calendarSync.lastSyncAt < staleThreshold;
    const emailStale = !emailSync?.lastSyncAt ||
        emailSync.lastSyncAt < staleThreshold;

    return {
        calendarLastSync: calendarSync?.lastSyncAt || undefined,
        emailLastSync: emailSync?.lastSyncAt || undefined,
        isStale: calendarStale || emailStale,
    };
}

/**
 * Format intelligence report for LLM prompt
 */
export function formatIntelligenceForPrompt(report: IntelligenceReport): string {
    const sections: string[] = [];

    // Stakeholder section
    sections.push(`## Stakeholder: ${report.stakeholder.name}`);
    if (report.stakeholder.role) {
        sections.push(`**Role:** ${report.stakeholder.role}`);
    }
    if (report.stakeholder.profile) {
        sections.push(`**Profile:** ${report.stakeholder.profile}`);
    }
    if (report.stakeholder.communicationStyle) {
        sections.push(`**Communication Style:** ${report.stakeholder.communicationStyle}`);
    }
    if (report.stakeholder.hotButtons.length > 0) {
        sections.push(`**Hot Buttons:** ${report.stakeholder.hotButtons.join(', ')}`);
    }

    // Past meetings
    if (report.context.pastMeetings.length > 0) {
        sections.push('\n## Past Meetings');
        for (const meeting of report.context.pastMeetings) {
            sections.push(`- **${meeting.date.toLocaleDateString()}:** ${meeting.title}`);
            if (meeting.outcome) {
                sections.push(`  Outcome: ${meeting.outcome}`);
            }
        }
    }

    // Email context
    if (report.context.recentEmails.length > 0) {
        sections.push('\n## Recent Email Context');
        for (const email of report.context.recentEmails) {
            sections.push(`- ${email.summary} (${email.sentiment})`);
            if (email.topics.length > 0) {
                sections.push(`  Topics: ${email.topics.join(', ')}`);
            }
        }
    }

    // Patterns
    if (report.patterns.whatWorked.length > 0) {
        sections.push('\n## What Has Worked');
        for (const pattern of report.patterns.whatWorked) {
            sections.push(`- ${pattern}`);
        }
    }
    if (report.patterns.whatFailed.length > 0) {
        sections.push('\n## What Has Failed');
        for (const pattern of report.patterns.whatFailed) {
            sections.push(`- ${pattern}`);
        }
    }

    // Freshness warning
    if (report.freshness.isStale) {
        sections.push('\n⚠️ **Note:** Context data may be stale. Last sync > 24 hours ago.');
    }

    sections.push(`\n_Evidence count: ${report.evidenceCount} data points_`);

    return sections.join('\n');
}
