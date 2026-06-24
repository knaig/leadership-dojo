/**
 * Calendar Sync Agent
 *
 * Syncs calendar events from Google Calendar in real-time.
 * Publishes live progress updates via Pusher.
 */

import { prisma } from '../lib/prisma';
import { publishSystemEvent } from '../lib/pusher';
import { getGoogleAuth } from '../lib/google-auth';
import { google } from 'googleapis';
import { getPastCorrections, markCorrectionApplied } from '../lib/correction-learning';

interface SyncResult {
    synced: number;
    created: number;
    updated: number;
    newStakeholders: number;
    errors: string[];
}

interface CalendarEvent {
    id: string;
    summary?: string;
    description?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
    organizer?: { email?: string; displayName?: string; self?: boolean };
    location?: string;
    status?: string;
    recurringEventId?: string;
    hangoutLink?: string;
    conferenceData?: {
        conferenceId?: string;
        conferenceSolution?: { key?: { type?: string } };
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    };
}

/**
 * Real-time calendar sync with live Pusher updates
 */
export async function calendarSyncAgent(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, newStakeholders: 0, errors: [] };

    console.log(`[CalendarSync] Starting for user ${userId}`);

    try {
        // Skip if synced recently (within 2 minutes — reduced from 20 for webhook-triggered syncs)
        const syncStatus = await prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'calendar' } }
        });
        if (syncStatus?.lastSyncAt && (Date.now() - syncStatus.lastSyncAt.getTime()) < 2 * 60 * 1000) {
            console.log(`[CalendarSync] Skipping — last synced ${Math.round((Date.now() - syncStatus.lastSyncAt.getTime()) / 60000)}m ago`);
            return result;
        }

        // Detect provider — support both Google and Microsoft
        const account = await prisma.account.findFirst({
            where: { userId, provider: { in: ['google', 'microsoft'] } },
            select: { provider: true },
        });

        if (account?.provider === 'microsoft') {
            return await microsoftCalendarSync(userId);
        }

        // Existing Google path continues below...

        // Notify user that sync is starting
        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: '📅 Syncing calendar...',
            data: { status: 'connecting', progress: 0, syncType: 'calendar' }
        });

        // Get user's email to determine their org domain
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, company: true }
        });
        const userEmail = currentUser?.email || '';
        const userDomain = userEmail.split('@')[1]?.toLowerCase() || '';
        const userCompany = currentUser?.company || '';

        // Get authenticated Google client (handles token refresh + persistence)
        const auth = await getGoogleAuth(userId);

        if (!auth) {
            await publishSystemEvent(userId, {
                type: 'calendar_sync_complete',
                message: '⚠️ Google Calendar not connected. Please connect it first.',
                data: { status: 'error', error: 'Not connected', syncType: 'calendar' }
            });
            result.errors.push('Google Calendar not connected');
            return result;
        }

        const { oauth2Client } = auth;

        // Update sync status
        await updateSyncStatus(userId, 'calendar', 'syncing');

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // For initial sync: go back to user's onboarding date for full history
        // For subsequent syncs: use 7-day rolling window for past events
        let timeMinMs: number;
        if (syncStatus?.lastSyncAt) {
            timeMinMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        } else {
            // Initial sync — pull all meetings since user signed up
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
            timeMinMs = user?.createdAt?.getTime() || Date.now() - 90 * 24 * 60 * 60 * 1000;
            console.log(`[CalendarSync] Initial sync — going back to ${new Date(timeMinMs).toISOString()}`);
        }
        const timeMin = new Date(timeMinMs).toISOString();
        const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const isInitialSync = !syncStatus?.lastSyncAt;
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin,
            timeMax,
            maxResults: isInitialSync ? 500 : 100,
            singleEvents: true,
            orderBy: 'startTime',
            conferenceDataVersion: 1, // Include Google Meet / conference data
        });

        const events = response.data.items || [];
        console.log(`[CalendarSync] Found ${events.length} events`);

        // Process events (no per-item Pusher updates to avoid spam)
        for (let i = 0; i < events.length; i++) {
            const event = events[i] as CalendarEvent;

            try {
                const { created, stakeholders } = await syncSingleEvent(userId, event, { userDomain, userCompany, userEmail });
                result.synced++;
                if (created) result.created++;
                result.newStakeholders += stakeholders;
            } catch (err) {
                result.errors.push(`Event ${event.id}: ${err}`);
            }
        }

        // Run dedup pass — merge stakeholders that look like the same person
        try {
            const merged = await deduplicateStakeholders(userId);
            if (merged > 0) console.log(`[CalendarSync] Merged ${merged} duplicate stakeholder(s)`);
        } catch (err) {
            console.warn(`[CalendarSync] Dedup pass failed:`, err);
        }

        // Update sync status to idle
        await updateSyncStatus(userId, 'calendar', 'idle');

        // Final success message
        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: `✅ Calendar sync complete! ${result.synced} events synced, ${result.newStakeholders} new contacts found.`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                updated: result.updated,
                newStakeholders: result.newStakeholders,
                syncType: 'calendar'
            }
        });

        console.log(`[CalendarSync] Complete: ${result.synced} events, ${result.newStakeholders} stakeholders`);
        return result;

    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[CalendarSync] Error:`, error);

        // Detect permanent auth failures and disconnect
        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('invalid_grant') ||
            error?.message?.includes('Token refresh failed') ||
            error?.message?.includes('invalid_client')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'gcal', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            // Clean up watch channels (they'll fail anyway)
            await prisma.watchChannel.deleteMany({ where: { userId, connector: 'calendar' } }).catch(() => {});
            // Notify user to reconnect
            await publishSystemEvent(userId, {
                type: 'google_disconnected',
                message: 'Your Google Calendar connection has expired. Please reconnect in Settings.',
                data: { provider: 'gcal', requiresAction: true },
            });
            console.error('[CalendarSync] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'calendar', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'calendar', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: `❌ Calendar sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'calendar' }
        });

        return result;
    }
}

/**
 * Sync a single calendar event
 */
async function syncSingleEvent(userId: string, event: CalendarEvent, orgCtx: { userDomain: string; userCompany: string; userEmail: string }): Promise<{ created: boolean; stakeholders: number }> {
    let stakeholdersAdded = 0;

    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;

    if (!startTime || !endTime) {
        return { created: false, stakeholders: 0 };
    }

    const attendees = event.attendees?.map(a => ({
        email: a.email || '',
        name: a.displayName || '',
        response: a.responseStatus || 'needsAction',
    })) || [];

    const participants = attendees.map(a => a.email).filter(Boolean);
    const meetingType = inferMeetingType(attendees.length, event.summary || '');

    const title = event.summary || 'Untitled Event';
    const isRecurring = !!event.recurringEventId;
    let meetingCategory = classifyMeeting(title, attendees.length, isRecurring, event.description);

    // Check if user has corrected similar meetings before — override AI classification if so
    try {
        const corrections = await getPastCorrections(userId, 'meeting_classification', 'meetingCategory', {
            title,
            attendeeCount: attendees.length,
            isRecurring,
            recurringId: event.recurringEventId,
        });
        if (corrections.length > 0) {
            const top = corrections[0];
            const validCategories = ['NEEDLE_MOVER', 'TACTICAL', 'OPERATIONAL', 'GROWTH', 'UNCLASSIFIED'];
            if (validCategories.includes(top.userValue)) {
                console.log(`[CalendarSync] Learned correction for "${title}": ${meetingCategory} → ${top.userValue} (${top.matchReason})`);
                meetingCategory = top.userValue as typeof meetingCategory;
                await markCorrectionApplied(top.id);
            }
        }
    } catch (err: any) {
        // Non-critical — fall back to keyword classification
    }

    const isPresentation = detectPresentation(title, attendees.length, event.description, event.organizer?.email, participants);

    // Extract Google Meet link and conference ID
    const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;
    const conferenceId = event.conferenceData?.conferenceId || null;

    const data = {
        title,
        description: event.description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attendees: attendees,
        location: event.location,
        status: event.status || 'confirmed',
        isRecurring,
        recurringId: event.recurringEventId,
        meetingType,
        meetingCategory,
        isPresentation,
        participants,
        meetLink,
        conferenceId,
    };

    // Check if event exists
    const existing = await prisma.meetingSyncRecord.findUnique({
        where: { userId_externalId: { userId, externalId: event.id } }
    });

    // Upsert the meeting record
    await prisma.meetingSyncRecord.upsert({
        where: { userId_externalId: { userId, externalId: event.id } },
        create: { userId, externalId: event.id, ...data },
        update: data,
    });

    // Extract stakeholders from attendees (skip self)
    for (const attendee of attendees) {
        if (attendee.email && attendee.email.toLowerCase() !== orgCtx.userEmail.toLowerCase()) {
            const isNew = await touchStakeholder(userId, attendee.email, attendee.name, orgCtx);
            if (isNew) stakeholdersAdded++;
        }
    }

    return { created: !existing, stakeholders: stakeholdersAdded };
}

/**
 * Infer meeting type
 */
function inferMeetingType(attendeeCount: number, title: string): string {
    const titleLower = title.toLowerCase();
    if (attendeeCount === 2) return '1:1';
    if (titleLower.includes('standup') || titleLower.includes('stand-up')) return 'standup';
    if (titleLower.includes('all-hands')) return 'all-hands';
    if (titleLower.includes('interview')) return 'interview';
    if (attendeeCount > 6) return 'large-meeting';
    if (attendeeCount > 2) return 'team';
    return 'other';
}

/**
 * Classify meeting into categories for coaching context.
 * Conservative: defaults to UNCLASSIFIED unless signal is strong.
 */
function classifyMeeting(title: string, attendeeCount: number, isRecurring: boolean, description?: string | null): 'NEEDLE_MOVER' | 'OPERATIONAL' | 'GROWTH' | 'UNCLASSIFIED' {
    const t = title.toLowerCase();
    const d = (description || '').toLowerCase();

    // NEEDLE_MOVER: strategy, decisions, senior meetings
    const needleMoverKeywords = ['board', 'investor', 'strategy', 'roadmap', 'alignment', 'decision', 'proposal', 'pitch', 'negotiation', 'exec review', 'leadership', 'budget', 'planning', 'offsite', 'kickoff'];
    if (needleMoverKeywords.some(k => t.includes(k) || d.includes(k))) return 'NEEDLE_MOVER';

    // GROWTH: 1:1s (2 attendees, not recurring ops)
    if (attendeeCount === 2 && (t.includes('1:1') || t.includes('1-1') || t.includes('one on one') || t.includes('check-in') || t.includes('check in') || t.includes('catch up') || t.includes('catchup'))) return 'GROWTH';
    const growthKeywords = ['performance review', 'career', 'mentoring', 'mentor', 'skip-level', 'skip level', 'coaching', 'feedback session', 'development'];
    if (growthKeywords.some(k => t.includes(k))) return 'GROWTH';

    // OPERATIONAL: recurring syncs, standups, status
    const operationalKeywords = ['standup', 'stand-up', 'sync', 'status', 'scrum', 'sprint', 'retro', 'retrospective', 'daily', 'weekly', 'biweekly', 'review meeting'];
    if (isRecurring && operationalKeywords.some(k => t.includes(k))) return 'OPERATIONAL';
    if (isRecurring && attendeeCount > 3) return 'OPERATIONAL'; // recurring team meeting

    // Simple 1:1s default to GROWTH
    if (attendeeCount === 2) return 'GROWTH';

    return 'UNCLASSIFIED';
}

/**
 * Detect if the user is likely presenting in this meeting.
 * Used to trigger narrative coaching in pre-meeting brief.
 */
function detectPresentation(title: string, attendeeCount: number, description?: string | null, organizerEmail?: string, participants?: string[]): boolean {
    const t = title.toLowerCase();
    const d = (description || '').toLowerCase();

    // Keyword signals in title/description
    const presentationKeywords = ['review', 'proposal', 'pitch', 'update to', 'readout', 'demo', 'showcase', 'present', 'presentation', 'walkthrough', 'deep dive'];
    const hasKeyword = presentationKeywords.some(k => t.includes(k) || d.includes(k));

    // Deck signals in description
    const deckSignals = ['deck', 'slides', 'powerpoint', 'ppt', 'agenda:', 'google slides'];
    const hasDeckSignal = deckSignals.some(k => d.includes(k));

    // Large audience + keyword = likely presenting
    if (attendeeCount > 4 && (hasKeyword || hasDeckSignal)) return true;

    // Explicit presentation keywords even with smaller audience
    if (t.includes('present') || t.includes('pitch') || t.includes('demo') || t.includes('showcase')) return true;

    return false;
}

/**
 * Personal email domains — not useful for org identification
 */
const PERSONAL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
    'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com',
    'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
    'zoho.com', 'yandex.com', 'mail.com', 'fastmail.com', 'tutanota.com',
    'rediffmail.com', 'in.com',
]);

/**
 * Derive a human-readable org name from a corporate email domain.
 * E.g., "acme-corp.com" → "Acme Corp", "info.example.co.in" → "Example"
 */
function orgNameFromDomain(domain: string): string {
    // Strip common TLDs and country codes
    const parts = domain.split('.');
    // Take the main domain part (second-level for .co.in, .com.au, etc.)
    let main = parts[0];
    if (parts.length >= 3 && ['co', 'com', 'org', 'net', 'ac', 'edu'].includes(parts[parts.length - 2])) {
        main = parts[parts.length - 3];
    } else if (parts.length >= 2) {
        main = parts[parts.length - 2];
    }
    // Capitalize: "acme-corp" → "Acme Corp"
    return main
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/**
 * Touch stakeholder profile — infer organization from email domain
 */
async function touchStakeholder(
    userId: string, email: string, name: string,
    orgCtx: { userDomain: string; userCompany: string }
): Promise<boolean> {
    const emailLower = email.toLowerCase();
    const domain = emailLower.split('@')[1] || '';

    // Infer organization from email domain
    let inferredOrg: string | null = null;
    if (domain) {
        const isInternal = domain === orgCtx.userDomain;
        const isPersonal = PERSONAL_DOMAINS.has(domain);

        if (isInternal && orgCtx.userCompany) {
            inferredOrg = orgCtx.userCompany;
        } else if (!isPersonal && !isInternal) {
            inferredOrg = orgNameFromDomain(domain);
        }
        // Personal domains: leave org null (enrichment agent will try web search later)
    }

    // Check if this email belongs to an already-merged profile → redirect to primary
    const existing = await prisma.stakeholderProfile.findUnique({
        where: { userId_email: { userId, email: emailLower } },
        select: { id: true, organization: true, mergedIntoId: true }
    });

    if (existing?.mergedIntoId) {
        // This email was merged into another profile — update the primary instead
        await prisma.stakeholderProfile.update({
            where: { id: existing.mergedIntoId },
            data: {
                lastInteraction: new Date(),
                interactionCount: { increment: 1 },
            },
        });
        return false;
    }

    // Also check if this email is in another profile's additionalEmails
    const primaryByAdditional = await prisma.stakeholderProfile.findFirst({
        where: { userId, mergedIntoId: null, additionalEmails: { has: emailLower } },
        select: { id: true },
    });

    if (primaryByAdditional) {
        // This email is a known alias — update the primary profile
        await prisma.stakeholderProfile.update({
            where: { id: primaryByAdditional.id },
            data: {
                lastInteraction: new Date(),
                interactionCount: { increment: 1 },
            },
        });
        return false;
    }

    await prisma.stakeholderProfile.upsert({
        where: { userId_email: { userId, email: emailLower } },
        create: {
            userId,
            email: emailLower,
            name: name || emailLower.split('@')[0],
            organization: inferredOrg,
            lastInteraction: new Date(),
            interactionCount: 1,
        },
        update: {
            lastInteraction: new Date(),
            interactionCount: { increment: 1 },
            ...(name && { name }),
            // Only set org if currently null (don't overwrite user edits or enrichment)
            ...(!existing?.organization && inferredOrg ? { organization: inferredOrg } : {}),
        },
    });

    return !existing;
}

/**
 * Deduplicate stakeholders — find probable same-person across email addresses.
 *
 * Strategy:
 * 1. Group stakeholders by normalized name (lowercase, trimmed)
 * 2. Within each name group, if one has a corporate email and another has personal,
 *    merge the personal-email record into the corporate one (corporate is canonical)
 * 3. Mark merged records with `mergedIntoId` to prevent re-creation
 *
 * Returns count of merged records.
 */
async function deduplicateStakeholders(userId: string): Promise<number> {
    const allStakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, mergedIntoId: null },
        select: {
            id: true,
            name: true,
            email: true,
            organization: true,
            role: true,
            interactionCount: true,
            enrichedAt: true,
            powerLevel: true,
            influenceRole: true,
            relationshipStrength: true,
        },
    });

    // Group by normalized name
    const nameGroups = new Map<string, typeof allStakeholders>();
    for (const s of allStakeholders) {
        if (!s.name) continue;
        const key = s.name.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!nameGroups.has(key)) nameGroups.set(key, []);
        nameGroups.get(key)!.push(s);
    }

    let merged = 0;

    for (const [, group] of nameGroups) {
        if (group.length < 2) continue;

        // Split into corporate vs personal email
        const corporate = group.filter(s => s.email && !PERSONAL_DOMAINS.has(s.email.split('@')[1] || ''));
        const personal = group.filter(s => s.email && PERSONAL_DOMAINS.has(s.email.split('@')[1] || ''));

        if (corporate.length === 0 || personal.length === 0) continue;

        // Use the corporate-email record as canonical (prefer most interactions)
        const canonical = corporate.sort((a, b) => b.interactionCount - a.interactionCount)[0];

        for (const dup of personal) {
            // Merge: copy any enriched data from dup into canonical if canonical is missing it
            const updates: Record<string, any> = {};
            if (!canonical.organization && dup.organization) updates.organization = dup.organization;
            if (!canonical.role && dup.role) updates.role = dup.role;
            if (canonical.interactionCount < dup.interactionCount) updates.interactionCount = dup.interactionCount;
            if (!canonical.enrichedAt && dup.enrichedAt) updates.enrichedAt = dup.enrichedAt;
            if (canonical.powerLevel === 'LOW' && dup.powerLevel !== 'LOW') updates.powerLevel = dup.powerLevel;
            if (canonical.influenceRole === 'UNKNOWN' && dup.influenceRole !== 'UNKNOWN') updates.influenceRole = dup.influenceRole;

            if (Object.keys(updates).length > 0) {
                await prisma.stakeholderProfile.update({
                    where: { id: canonical.id },
                    data: updates,
                });
            }

            // Mark duplicate as merged
            await prisma.stakeholderProfile.update({
                where: { id: dup.id },
                data: { mergedIntoId: canonical.id },
            });

            console.log(`[CalendarSync] Merged "${dup.name}" (${dup.email}) → "${canonical.name}" (${canonical.email})`);
            merged++;
        }
    }

    return merged;
}

/**
 * Update sync status
 */
async function updateSyncStatus(userId: string, connector: string, status: string, error?: string): Promise<void> {
    await prisma.syncStatus.upsert({
        where: { userId_connector: { userId, connector } },
        create: {
            userId,
            connector,
            status,
            lastError: error,
            lastSyncAt: status === 'idle' ? new Date() : undefined,
        },
        update: {
            status,
            lastError: error,
            lastSyncAt: status === 'idle' ? new Date() : undefined,
            syncCount: status === 'idle' ? { increment: 1 } : undefined,
        },
    });
}

/**
 * Microsoft Calendar sync via Graph API adapter.
 * Mirrors the Google sync logic but uses the adapter interface.
 */
async function microsoftCalendarSync(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, newStakeholders: 0, errors: [] };

    try {
        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: '📅 Syncing Outlook calendar...',
            data: { status: 'connecting', progress: 0, syncType: 'calendar' }
        });

        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, company: true }
        });
        const userEmail = currentUser?.email?.toLowerCase() || '';
        const userDomain = userEmail.split('@')[1] || '';
        const userCompany = currentUser?.company || '';
        const orgCtx = { userDomain, userCompany, userEmail };

        await updateSyncStatus(userId, 'calendar', 'syncing');

        const { MicrosoftCalendarAdapter } = require('../lib/adapters/microsoft/microsoft-calendar');
        const adapter = new MicrosoftCalendarAdapter(userId);

        // Sync window: 7 days back, 30 days forward (matches Google path)
        const syncStatus = await prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'calendar' } }
        });
        const isInitialSync = !syncStatus?.lastSyncAt;

        let startMs: number;
        if (syncStatus?.lastSyncAt) {
            startMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        } else {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
            startMs = user?.createdAt?.getTime() || Date.now() - 90 * 24 * 60 * 60 * 1000;
            console.log(`[CalendarSync:Microsoft] Initial sync — going back to ${new Date(startMs).toISOString()}`);
        }

        const start = new Date(startMs);
        const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const { events } = await adapter.listEvents(start, end, {
            maxResults: isInitialSync ? 500 : 100,
        });

        console.log(`[CalendarSync:Microsoft] Found ${events.length} events`);

        for (const event of events) {
            try {
                const attendees = event.attendees.map((a: { email: string; name?: string; responseStatus?: string }) => ({
                    email: a.email || '',
                    name: a.name || '',
                    response: a.responseStatus || 'needsAction',
                }));
                const participants = attendees.map((a: { email: string }) => a.email).filter(Boolean);
                const title = event.title || 'Untitled Event';
                const meetingType = inferMeetingType(attendees.length, title);
                const meetingCategory = classifyMeeting(title, attendees.length, event.isRecurring, event.description);
                const isPresentation = detectPresentation(
                    title,
                    attendees.length,
                    event.description,
                    event.organizer?.email,
                    participants,
                );

                const existing = await prisma.meetingSyncRecord.findUnique({
                    where: { userId_externalId: { userId, externalId: event.externalId } }
                });

                const data = {
                    title,
                    description: event.description,
                    startTime: event.startTime,
                    endTime: event.endTime,
                    attendees,
                    location: event.location,
                    status: event.status || 'confirmed',
                    isRecurring: event.isRecurring,
                    meetingType,
                    meetingCategory,
                    isPresentation,
                    participants,
                    meetLink: event.meetingLink,
                };

                await prisma.meetingSyncRecord.upsert({
                    where: { userId_externalId: { userId, externalId: event.externalId } },
                    create: { userId, externalId: event.externalId, ...data },
                    update: data,
                });

                result.synced++;
                if (!existing) result.created++;

                // Touch stakeholders from attendees
                for (const attendee of attendees) {
                    if (attendee.email && attendee.email.toLowerCase() !== userEmail) {
                        const isNew = await touchStakeholder(userId, attendee.email, attendee.name, orgCtx);
                        if (isNew) result.newStakeholders++;
                    }
                }
            } catch (err: any) {
                result.errors.push(`Event ${event.externalId}: ${err.message}`);
            }
        }

        // Run dedup pass
        try {
            const merged = await deduplicateStakeholders(userId);
            if (merged > 0) console.log(`[CalendarSync:Microsoft] Merged ${merged} duplicate stakeholder(s)`);
        } catch (err: any) {
            console.warn(`[CalendarSync:Microsoft] Dedup pass failed:`, err);
        }

        await updateSyncStatus(userId, 'calendar', 'idle');

        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: `✅ Outlook calendar sync complete! ${result.synced} events synced, ${result.newStakeholders} new contacts found.`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                updated: result.updated,
                newStakeholders: result.newStakeholders,
                syncType: 'calendar'
            }
        });

        console.log(`[CalendarSync:Microsoft] Complete: ${result.synced} events, ${result.newStakeholders} stakeholders`);
    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[CalendarSync:Microsoft] Error:`, error);

        // Detect permanent auth failures and disconnect
        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('InvalidAuthenticationToken') ||
            error?.message?.includes('CompactToken')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'microsoft_calendar', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            await publishSystemEvent(userId, {
                type: 'microsoft_disconnected',
                message: 'Your Outlook Calendar connection has expired. Please reconnect in Settings.',
                data: { provider: 'microsoft_calendar', requiresAction: true },
            });
            console.error('[CalendarSync:Microsoft] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'calendar', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'calendar', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'calendar_sync_complete',
            message: `❌ Outlook calendar sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'calendar' }
        });
    }

    return result;
}
