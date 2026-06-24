/**
 * Email Sync Agent
 *
 * Syncs email threads from Gmail in real-time.
 * Publishes live progress updates via Pusher.
 */

import { prisma } from '../lib/prisma';
import { publishSystemEvent } from '../lib/pusher';
import { getGoogleAuth } from '../lib/google-auth';
import { google } from 'googleapis';
import { backgroundGenerateText } from '../lib/background-llm';

interface SyncResult {
    synced: number;
    created: number;
    updated: number;
    errors: string[];
}

interface GmailThread {
    id: string;
    historyId: string;
    messages?: GmailMessage[];
}

interface GmailMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet: string;
    payload: {
        headers: Array<{ name: string; value: string }>;
    };
    internalDate: string;
}

/**
 * Real-time email sync with live Pusher updates
 */
export async function emailSyncAgent(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, errors: [] };

    console.log(`[EmailSync] Starting for user ${userId}`);

    try {
        // Skip if synced recently (within 2 minutes — reduced from 20 for webhook-triggered syncs)
        const syncStatus = await prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'email' } }
        });
        if (syncStatus?.lastSyncAt && (Date.now() - syncStatus.lastSyncAt.getTime()) < 2 * 60 * 1000) {
            console.log(`[EmailSync] Skipping — last synced ${Math.round((Date.now() - syncStatus.lastSyncAt.getTime()) / 60000)}m ago`);
            return result;
        }

        // Detect provider — support both Google and Microsoft
        const account = await prisma.account.findFirst({
            where: { userId, provider: { in: ['google', 'microsoft'] } },
            select: { provider: true },
        });

        if (account?.provider === 'microsoft') {
            return await microsoftEmailSync(userId);
        }

        // Existing Google path continues below...

        // Notify user that sync is starting
        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: '📧 Syncing email...',
            data: { status: 'connecting', progress: 0, syncType: 'email' }
        });

        // Get authenticated Google client (handles token refresh + persistence)
        const auth = await getGoogleAuth(userId);

        if (!auth) {
            await publishSystemEvent(userId, {
                type: 'email_sync',
                message: '⚠️ Gmail not connected. Please connect it first.',
                data: { status: 'error', error: 'Not connected', syncType: 'email' }
            });
            result.errors.push('Gmail not connected');
            return result;
        }

        const { oauth2Client } = auth;

        // Update sync status
        await updateSyncStatus(userId, 'email', 'syncing');

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // For initial sync: go back 90 days (enough for coaching context)
        // For subsequent syncs: use last sync time or 7-day rolling window
        const isInitialSync = !syncStatus?.lastSyncAt;
        let afterMs: number;
        if (syncStatus?.lastSyncAt) {
            // Incremental: from last sync or 7 days ago (whichever is more recent)
            afterMs = Math.max(syncStatus.lastSyncAt.getTime(), Date.now() - 7 * 24 * 60 * 60 * 1000);
        } else {
            // Initial sync: go back 90 days for rich context
            afterMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
            console.log(`[EmailSync] Initial sync — going back to ${new Date(afterMs).toISOString()}`);
        }
        const after = Math.floor(afterMs / 1000);

        // Paginate through all threads (initial sync: up to 500, incremental: up to 200)
        const maxThreads = isInitialSync ? 500 : 200;
        let pageToken: string | undefined;
        const allThreadRefs: Array<{ id: string }> = [];

        do {
            const response = await gmail.users.threads.list({
                userId: 'me',
                maxResults: 100,
                q: `after:${after}`,
                pageToken,
            });

            const threads = response.data.threads || [];
            allThreadRefs.push(...threads.filter(t => t.id).map(t => ({ id: t.id! })));
            pageToken = response.data.nextPageToken ?? undefined;
        } while (pageToken && allThreadRefs.length < maxThreads);

        console.log(`[EmailSync] Found ${allThreadRefs.length} threads (initial: ${isInitialSync})`);

        // Process threads (no per-item Pusher updates to avoid spam)
        for (let i = 0; i < allThreadRefs.length; i++) {
            const threadRef = allThreadRefs[i];

            try {
                const threadResponse = await gmail.users.threads.get({
                    userId: 'me',
                    id: threadRef.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
                });

                const thread = threadResponse.data as unknown as GmailThread;
                const isNew = await syncSingleThread(userId, thread);
                result.synced++;
                if (isNew) result.created++;
            } catch (err) {
                result.errors.push(`Thread ${threadRef.id}: ${err}`);
            }
        }

        // Update sync status to idle
        await updateSyncStatus(userId, 'email', 'idle');

        // Final success message
        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: `✅ Email sync complete! ${result.synced} threads synced.`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                syncType: 'email'
            }
        });

        console.log(`[EmailSync] Complete: ${result.synced} threads`);
        return result;

    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[EmailSync] Error:`, error);

        // Detect permanent auth failures and disconnect
        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('invalid_grant') ||
            error?.message?.includes('Token refresh failed') ||
            error?.message?.includes('invalid_client')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'gmail', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            await prisma.watchChannel.deleteMany({ where: { userId, connector: 'gmail' } }).catch(() => {});
            await publishSystemEvent(userId, {
                type: 'google_disconnected',
                message: 'Your Gmail connection has expired. Please reconnect in Settings.',
                data: { provider: 'gmail', requiresAction: true },
            });
            console.error('[EmailSync] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'email', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'email', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: `❌ Email sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'email' }
        });

        return result;
    }
}

/**
 * Sync a single email thread
 */
async function syncSingleThread(userId: string, thread: GmailThread): Promise<boolean> {
    if (!thread.messages || thread.messages.length === 0) {
        return false;
    }

    const firstMessage = thread.messages[0];
    const lastMessage = thread.messages[thread.messages.length - 1];

    const subject = getHeader(firstMessage, 'Subject') || '(No Subject)';
    const from = getHeader(firstMessage, 'From') || '';
    const participants = extractParticipants(thread.messages);
    const to = extractTo(thread.messages);

    const firstMessageAt = new Date(parseInt(firstMessage.internalDate));
    const lastMessageAt = new Date(parseInt(lastMessage.internalDate));
    const messageCount = thread.messages.length;

    // Get snippets for summary
    const snippets = thread.messages.map(m => m.snippet).join('\n---\n');

    // Check for important flags
    const isImportant = thread.messages.some(m =>
        m.labelIds?.includes('IMPORTANT') ||
        m.labelIds?.includes('STARRED')
    );
    const requiresAction =
        snippets.toLowerCase().includes('please reply') ||
        snippets.toLowerCase().includes('action required');

    // Generate LLM summary for substantial threads
    let summary = snippets.substring(0, 500);
    let sentiment: string = 'neutral';
    let keyTopics: string[] = [];
    let llmRequiresAction = requiresAction;

    const isSubstantial = messageCount >= 2 || snippets.length > 200;
    if (isSubstantial) {
        try {
            const truncatedSnippets = snippets.substring(0, 1500);
            const llmPrompt = `Summarize this email thread concisely. Return ONLY valid JSON, no markdown.

Subject: ${subject}
From: ${from}
Messages (${messageCount}):
${truncatedSnippets}

Return JSON: {"summary":"2-3 sentence summary","keyTopics":["topic1","topic2"],"sentiment":"positive|neutral|negative","requiresAction":true|false}`;

            const raw = await backgroundGenerateText(llmPrompt, {
                temperature: 0.2,
                maxOutputTokens: 300,
            });

            // Parse JSON — handle markdown-wrapped responses
            const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed.summary) summary = parsed.summary;
            if (Array.isArray(parsed.keyTopics)) keyTopics = parsed.keyTopics;
            if (parsed.sentiment) sentiment = parsed.sentiment;
            if (typeof parsed.requiresAction === 'boolean') llmRequiresAction = parsed.requiresAction;
        } catch (err: any) {
            // backgroundGenerateText retries up to 10x — if it still fails, fall back to snippet
            console.log(`[EmailSync] LLM summary failed for thread ${thread.id}: ${err.message}`);
        }
    }

    // Check if exists
    const existing = await prisma.emailSummary.findUnique({
        where: { userId_threadId: { userId, threadId: thread.id } }
    });

    // Upsert email summary
    await prisma.emailSummary.upsert({
        where: { userId_threadId: { userId, threadId: thread.id } },
        create: {
            userId,
            threadId: thread.id,
            subject,
            from,
            to,
            participants,
            summary,
            sentiment,
            keyTopics,
            messageCount,
            firstMessageAt,
            lastMessageAt,
            hasAttachment: false,
            isImportant,
            requiresAction: llmRequiresAction,
        },
        update: {
            subject,
            summary,
            sentiment,
            keyTopics,
            messageCount,
            lastMessageAt,
            isImportant,
            requiresAction: llmRequiresAction,
        },
    });

    // Update stakeholder profiles from participants
    for (const email of participants) {
        await touchStakeholder(userId, email);
    }

    return !existing;
}

/**
 * Extract header value
 */
function getHeader(message: GmailMessage, name: string): string | undefined {
    const header = message.payload.headers.find(
        h => h.name.toLowerCase() === name.toLowerCase()
    );
    return header?.value;
}

/**
 * Extract all participants from thread
 */
function extractParticipants(messages: GmailMessage[]): string[] {
    const emails = new Set<string>();

    for (const message of messages) {
        const from = getHeader(message, 'From');
        const to = getHeader(message, 'To');
        const cc = getHeader(message, 'Cc');

        [from, to, cc].forEach(field => {
            if (field) {
                const matches = field.match(/[\w.-]+@[\w.-]+\.\w+/g);
                matches?.forEach(email => emails.add(email.toLowerCase()));
            }
        });
    }

    return Array.from(emails);
}

/**
 * Extract To addresses
 */
function extractTo(messages: GmailMessage[]): string[] {
    const to = new Set<string>();

    for (const message of messages) {
        const toHeader = getHeader(message, 'To');
        if (toHeader) {
            const matches = toHeader.match(/[\w.-]+@[\w.-]+\.\w+/g);
            matches?.forEach(email => to.add(email.toLowerCase()));
        }
    }

    return Array.from(to);
}

/**
 * Touch stakeholder profile
 */
async function touchStakeholder(userId: string, email: string): Promise<void> {
    if (!email) return;

    const existing = await prisma.stakeholderProfile.findUnique({
        where: { userId_email: { userId, email } }
    });

    if (existing) {
        await prisma.stakeholderProfile.update({
            where: { userId_email: { userId, email } },
            data: {
                lastInteraction: new Date(),
                interactionCount: { increment: 1 },
            },
        });
    } else {
        await prisma.stakeholderProfile.create({
            data: {
                userId,
                email,
                name: email.split('@')[0],
                lastInteraction: new Date(),
                interactionCount: 1,
            },
        });
    }
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
 * Microsoft Email sync via Graph API adapter (Outlook).
 * Mirrors the Gmail sync logic but uses the adapter interface.
 */
async function microsoftEmailSync(userId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, created: 0, updated: 0, errors: [] };

    try {
        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: '📧 Syncing Outlook email...',
            data: { status: 'connecting', progress: 0, syncType: 'email' }
        });

        await updateSyncStatus(userId, 'email', 'syncing');

        const { MicrosoftEmailAdapter } = require('../lib/adapters/microsoft/microsoft-email');
        const adapter = new MicrosoftEmailAdapter(userId);

        // Determine sync window (matches Gmail logic)
        const syncStatus = await prisma.syncStatus.findUnique({
            where: { userId_connector: { userId, connector: 'email' } }
        });
        const isInitialSync = !syncStatus?.lastSyncAt;
        let afterDate: Date;
        if (syncStatus?.lastSyncAt) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            afterDate = syncStatus.lastSyncAt > sevenDaysAgo ? sevenDaysAgo : syncStatus.lastSyncAt;
        } else {
            afterDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            console.log(`[EmailSync:Microsoft] Initial sync — going back to ${afterDate.toISOString()}`);
        }

        const maxThreads = isInitialSync ? 500 : 200;
        let allThreads: any[] = [];
        let pageToken: string | undefined;

        // Paginate through threads
        do {
            const { threads, nextPageToken } = await adapter.listThreads({
                maxResults: Math.min(100, maxThreads - allThreads.length),
                after: afterDate,
                pageToken,
            });
            allThreads.push(...threads);
            pageToken = nextPageToken;
        } while (pageToken && allThreads.length < maxThreads);

        console.log(`[EmailSync:Microsoft] Found ${allThreads.length} threads (initial: ${isInitialSync})`);

        // Get user email to filter self from stakeholders
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true }
        });
        const userEmail = currentUser?.email?.toLowerCase() || '';

        for (const thread of allThreads) {
            try {
                // Build summary from snippet
                const snippet = thread.snippet || '';
                const fromEmail = thread.from?.email || '';
                const fromFormatted = thread.from?.name
                    ? `${thread.from.name} <${fromEmail}>`
                    : fromEmail;
                const toEmails = (thread.to || []).map((r: { email: string }) => r.email.toLowerCase());
                const participants = thread.participants || [];

                // Generate LLM summary for substantial threads
                let summary = snippet.substring(0, 500);
                let sentiment: string = 'neutral';
                let keyTopics: string[] = [];
                let requiresAction = false;

                const isSubstantial = thread.messageCount >= 2 || snippet.length > 200;
                if (isSubstantial) {
                    try {
                        const truncatedSnippet = snippet.substring(0, 1500);
                        const llmPrompt = `Summarize this email thread concisely. Return ONLY valid JSON, no markdown.

Subject: ${thread.subject}
From: ${fromFormatted}
Messages (${thread.messageCount}):
${truncatedSnippet}

Return JSON: {"summary":"2-3 sentence summary","keyTopics":["topic1","topic2"],"sentiment":"positive|neutral|negative","requiresAction":true|false}`;

                        const raw = await backgroundGenerateText(llmPrompt, {
                            temperature: 0.2,
                            maxOutputTokens: 300,
                        });

                        const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.summary) summary = parsed.summary;
                        if (Array.isArray(parsed.keyTopics)) keyTopics = parsed.keyTopics;
                        if (parsed.sentiment) sentiment = parsed.sentiment;
                        if (typeof parsed.requiresAction === 'boolean') requiresAction = parsed.requiresAction;
                    } catch (err: any) {
                        console.log(`[EmailSync:Microsoft] LLM summary failed for thread ${thread.externalId}: ${err.message}`);
                    }
                }

                const existing = await prisma.emailSummary.findUnique({
                    where: { userId_threadId: { userId, threadId: thread.externalId } }
                });

                await prisma.emailSummary.upsert({
                    where: { userId_threadId: { userId, threadId: thread.externalId } },
                    create: {
                        userId,
                        threadId: thread.externalId,
                        subject: thread.subject,
                        from: fromFormatted,
                        to: toEmails,
                        participants,
                        summary,
                        sentiment,
                        keyTopics,
                        messageCount: thread.messageCount,
                        firstMessageAt: thread.date,
                        lastMessageAt: thread.date,
                        hasAttachment: thread.hasAttachments || false,
                        isImportant: thread.isStarred || false,
                        requiresAction,
                    },
                    update: {
                        subject: thread.subject,
                        summary,
                        sentiment,
                        keyTopics,
                        messageCount: thread.messageCount,
                        lastMessageAt: thread.date,
                        isImportant: thread.isStarred || false,
                        requiresAction,
                    },
                });

                result.synced++;
                if (!existing) result.created++;

                // Touch stakeholder profiles from participants
                for (const email of participants) {
                    if (email && email.toLowerCase() !== userEmail) {
                        await touchStakeholder(userId, email);
                    }
                }
            } catch (err: any) {
                result.errors.push(`Thread ${thread.externalId}: ${err.message}`);
            }
        }

        await updateSyncStatus(userId, 'email', 'idle');

        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: `✅ Outlook email sync complete! ${result.synced} threads synced.`,
            data: {
                status: 'complete',
                progress: 100,
                synced: result.synced,
                created: result.created,
                syncType: 'email'
            }
        });

        console.log(`[EmailSync:Microsoft] Complete: ${result.synced} threads`);
    } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`[EmailSync:Microsoft] Error:`, error);

        if (error?.code === 401 || error?.code === 403 ||
            error?.message?.includes('InvalidAuthenticationToken') ||
            error?.message?.includes('CompactToken')) {
            await prisma.dataConnector.updateMany({
                where: { userId, provider: 'microsoft_email', status: 'CONNECTED' },
                data: { status: 'DISCONNECTED' },
            });
            await publishSystemEvent(userId, {
                type: 'microsoft_disconnected',
                message: 'Your Outlook email connection has expired. Please reconnect in Settings.',
                data: { provider: 'microsoft_email', requiresAction: true },
            });
            console.error('[EmailSync:Microsoft] Auth failure - connector disconnected for user:', userId.substring(0, 8));
            await updateSyncStatus(userId, 'email', 'disconnected', errorMsg);
        } else {
            await updateSyncStatus(userId, 'email', 'error', errorMsg);
        }

        result.errors.push(errorMsg);

        await publishSystemEvent(userId, {
            type: 'email_sync',
            message: `❌ Outlook email sync failed: ${errorMsg}`,
            data: { status: 'error', error: errorMsg, syncType: 'email' }
        });
    }

    return result;
}
