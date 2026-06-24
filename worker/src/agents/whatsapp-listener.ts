/**
 * WhatsApp Listener Agent
 *
 * Uses baileys to connect to user's WhatsApp via multi-device protocol.
 * Passively listens to group messages and feeds them into the knowledge pipeline.
 *
 * Flow:
 * 1. User scans QR code (shown in web UI or terminal)
 * 2. Session credentials saved to DB (survives worker restarts)
 * 3. Group messages → fact extraction → stakeholder intelligence
 *
 * Signal weight: WhatsApp messages are treated as high-confidence signals
 * (between email and direct chat) because they reveal real-time dynamics,
 * tone, alliances, and tribal knowledge.
 */

import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    WASocket,
    proto,
    BufferJSON,
} from 'baileys';
import { Boom } from '@hapi/boom';
import { prisma } from '../lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR_BASE = path.join(process.cwd(), '.whatsapp-sessions');

interface WhatsAppListenerState {
    socket: WASocket | null;
    userId: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
}

// Active connections per user
const activeConnections = new Map<string, WhatsAppListenerState>();

/**
 * Start WhatsApp listener for a user.
 * Returns a QR code string if connection requires scanning.
 */
export async function startWhatsAppListener(
    userId: string,
    onQR?: (qr: string) => void,
    onConnected?: () => void,
): Promise<{ status: 'connected' | 'qr_pending' | 'error'; message: string }> {
    console.log(`[WhatsApp] Starting listener for user ${userId.substring(0, 8)}...`);

    // Check if already connected
    if (activeConnections.has(userId)) {
        const existing = activeConnections.get(userId)!;
        if (existing.socket?.user) {
            return { status: 'connected', message: 'Already connected' };
        }
    }

    const authDir = path.join(AUTH_DIR_BASE, userId);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    // Also try to restore session from DB
    await restoreSessionFromDB(userId, authDir);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        const { version } = await fetchLatestBaileysVersion();

        const socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: !onQR, // Print to terminal if no callback provided
            browser: ['Mira Coach', 'Chrome', '120.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false, // Stay invisible
        });

        const listenerState: WhatsAppListenerState = {
            socket,
            userId,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
        };
        activeConnections.set(userId, listenerState);

        let qrEmitted = false;

        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && onQR) {
                onQR(qr);
                qrEmitted = true;
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`[WhatsApp] Connection closed for ${userId.substring(0, 8)}, code: ${statusCode}, reconnect: ${shouldReconnect}`);

                if (shouldReconnect && listenerState.reconnectAttempts < listenerState.maxReconnectAttempts) {
                    listenerState.reconnectAttempts++;
                    const delay = Math.min(30000, 1000 * Math.pow(2, listenerState.reconnectAttempts));
                    console.log(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${listenerState.reconnectAttempts})...`);
                    setTimeout(() => startWhatsAppListener(userId, onQR, onConnected), delay);
                } else {
                    activeConnections.delete(userId);
                    await updateConnectionStatus(userId, 'DISCONNECTED');
                    if (statusCode === DisconnectReason.loggedOut) {
                        // Clean up auth state
                        fs.rmSync(authDir, { recursive: true, force: true });
                        await clearSessionFromDB(userId);
                    }
                }
            }

            if (connection === 'open') {
                console.log(`[WhatsApp] Connected for user ${userId.substring(0, 8)}!`);
                listenerState.reconnectAttempts = 0;
                await updateConnectionStatus(userId, 'CONNECTED');
                await saveSessionToDB(userId, authDir);
                onConnected?.();
            }
        });

        // Save credentials on update
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            await saveSessionToDB(userId, authDir);
        });

        // Listen to messages
        socket.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return; // Only process new messages

            for (const msg of messages) {
                await handleIncomingMessage(userId, msg, socket);
            }
        });

        return qrEmitted
            ? { status: 'qr_pending', message: 'Scan QR code to connect' }
            : { status: 'connected', message: 'Connecting with saved session...' };

    } catch (err: any) {
        console.error(`[WhatsApp] Failed to start listener: ${err.message}`);
        return { status: 'error', message: err.message };
    }
}

/**
 * Stop WhatsApp listener for a user.
 */
export async function stopWhatsAppListener(userId: string): Promise<void> {
    const conn = activeConnections.get(userId);
    if (conn?.socket) {
        conn.socket.end(undefined);
        activeConnections.delete(userId);
        await updateConnectionStatus(userId, 'DISCONNECTED');
        console.log(`[WhatsApp] Stopped listener for ${userId.substring(0, 8)}`);
    }
}

/**
 * Check if a user has an active WhatsApp connection.
 */
export function isWhatsAppConnected(userId: string): boolean {
    const conn = activeConnections.get(userId);
    return !!conn?.socket?.user;
}

/**
 * Get all monitored groups for a user.
 */
export async function getMonitoredGroups(userId: string): Promise<Array<{ groupId: string; groupName: string }>> {
    return prisma.whatsAppGroup.findMany({
        where: { userId, isActive: true },
        select: { groupId: true, groupName: true },
    });
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

async function handleIncomingMessage(
    userId: string,
    msg: proto.IWebMessageInfo,
    socket: WASocket,
): Promise<void> {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) return;

    // Process both group messages (@g.us) and DMs (@s.whatsapp.net)
    const isGroup = remoteJid.endsWith('@g.us');
    const isDM = remoteJid.endsWith('@s.whatsapp.net');
    if (!isGroup && !isDM) return;

    // For DMs: process both sent and received (communication pattern intelligence)
    // For groups: skip own messages (too noisy)
    if (isGroup && msg.key.fromMe) return;

    // Extract text content
    const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || msg.message?.videoMessage?.caption
        || '';

    if (!text || text.length < 5) return;

    // Get sender info
    const senderJid = msg.key.participant || msg.key.remoteJid || '';
    const senderPhone = senderJid.split('@')[0];

    // Check if this group is monitored
    const group = await prisma.whatsAppGroup.findFirst({
        where: { userId, groupId: remoteJid, isActive: true },
    });

    if (!group) {
        // Auto-register new groups on first message (user can deactivate later)
        try {
            const groupMetadata = await socket.groupMetadata(remoteJid);
            await prisma.whatsAppGroup.upsert({
                where: { userId_groupId: { userId, groupId: remoteJid } },
                create: {
                    userId,
                    groupId: remoteJid,
                    groupName: groupMetadata.subject || 'Unknown Group',
                    isActive: true,
                    participantCount: groupMetadata.participants?.length || 0,
                },
                update: {
                    groupName: groupMetadata.subject || 'Unknown Group',
                    participantCount: groupMetadata.participants?.length || 0,
                },
            });
        } catch {
            // Can't get metadata, register with basic info
            await prisma.whatsAppGroup.upsert({
                where: { userId_groupId: { userId, groupId: remoteJid } },
                create: { userId, groupId: remoteJid, groupName: 'Unknown Group', isActive: true },
                update: {},
            });
        }
    }

    // For DMs, handle differently — track as communication signal
    if (isDM) {
        const contactPhone = remoteJid.split('@')[0];
        const contactName = msg.pushName || contactPhone;
        const direction = msg.key.fromMe ? 'sent' : 'received';

        // Save DM as WhatsApp message (groupId = the DM jid)
        await prisma.whatsAppMessage.create({
            data: {
                userId,
                groupId: remoteJid,
                senderPhone: msg.key.fromMe ? 'self' : contactPhone,
                senderName: msg.key.fromMe ? 'self' : contactName,
                content: text,
                messageTimestamp: msg.messageTimestamp
                    ? new Date(Number(msg.messageTimestamp) * 1000)
                    : new Date(),
                externalId: msg.key.id || '',
            },
        });

        // Try to match this phone to a stakeholder and update interaction
        await matchPhoneToStakeholder(userId, contactPhone, contactName);

        // Queue extraction periodically (same batching as groups)
        await maybeQueueExtraction(userId, remoteJid, '');
        return;
    }

    // --- Group message handling (existing flow) ---

    // Save message to WhatsAppMessage table
    const savedMsg = await prisma.whatsAppMessage.create({
        data: {
            userId,
            groupId: remoteJid,
            senderPhone,
            senderName: msg.pushName || senderPhone,
            content: text,
            messageTimestamp: msg.messageTimestamp
                ? new Date(Number(msg.messageTimestamp) * 1000)
                : new Date(),
            externalId: msg.key.id || '',
        },
    });

    // Try to match sender phone to stakeholder
    await matchPhoneToStakeholder(userId, senderPhone, msg.pushName || senderPhone);

    // Queue for fact extraction (using the same pipeline as chat)
    // We batch messages — don't extract from every single one
    await maybeQueueExtraction(userId, remoteJid, savedMsg.id);
}

/**
 * Batch extraction: only queue fact extraction when we've accumulated
 * enough messages from a group (every 10 messages or every 30 min).
 */
async function maybeQueueExtraction(
    userId: string,
    groupId: string,
    messageId: string,
): Promise<void> {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const recentCount = await prisma.whatsAppMessage.count({
        where: {
            userId,
            groupId,
            processed: false,
            createdAt: { gte: thirtyMinAgo },
        },
    });

    // Extract every 10 messages or let the cron pick it up
    if (recentCount >= 10) {
        await queueWhatsAppExtraction(userId, groupId);
    }
}

/**
 * Queue fact extraction for a batch of WhatsApp messages.
 * Called by maybeQueueExtraction or by the periodic cron.
 */
export async function queueWhatsAppExtraction(
    userId: string,
    groupId: string,
): Promise<void> {
    const unprocessed = await prisma.whatsAppMessage.findMany({
        where: { userId, groupId, processed: false },
        orderBy: { messageTimestamp: 'asc' },
        take: 50,
    });

    if (unprocessed.length === 0) return;

    // Combine messages into a conversation block for LLM extraction
    const conversationBlock = unprocessed.map(m =>
        `[${m.senderName}]: ${m.content}`
    ).join('\n');

    // Mark as processed
    await prisma.whatsAppMessage.updateMany({
        where: { id: { in: unprocessed.map(m => m.id) } },
        data: { processed: true },
    });

    // Insert a synthetic "message" for the chat-fact-extractor
    const syntheticMessage = await prisma.message.create({
        data: {
            userId,
            role: 'user',
            content: `[WhatsApp Group Context]\n${conversationBlock}`,
            type: 'WHATSAPP_DIGEST',
        },
    });

    // Queue fact extraction
    try {
        const payload = JSON.stringify({ userId, messageId: syntheticMessage.id });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, expire_seconds, start_after, keep_until)
            VALUES ('knowledge-extract-chat', ${payload}::jsonb, 'created', 2, 900, now(), now() + INTERVAL '7 days')
        `;
        console.log(`[WhatsApp] Queued extraction for ${unprocessed.length} messages from group`);
    } catch (err: any) {
        console.error(`[WhatsApp] Failed to queue extraction: ${err.message}`);
    }
}

// ============================================================================
// PHONE → STAKEHOLDER MATCHING
// ============================================================================

/**
 * Try to match a WhatsApp phone number to an existing StakeholderProfile.
 * Uses pushName (WhatsApp display name) for fuzzy matching if phone isn't stored.
 * Updates interaction count on match.
 */
async function matchPhoneToStakeholder(
    userId: string,
    phone: string,
    displayName: string,
): Promise<void> {
    if (!phone || phone === 'self') return;

    // Normalize phone: strip leading country codes for matching
    const normalizedPhone = phone.replace(/^91/, '').replace(/^1/, '');

    // Check if we already have a phone mapping cached
    const existingMapping = await prisma.stakeholderProfile.findFirst({
        where: {
            userId,
            mergedIntoId: null,
            OR: [
                { phoneNumber: { contains: normalizedPhone } },
                { phoneNumber: { contains: phone } },
            ],
        },
        select: { id: true },
    });

    if (existingMapping) {
        // Already matched — just bump interaction
        await prisma.stakeholderProfile.update({
            where: { id: existingMapping.id },
            data: { interactionCount: { increment: 1 }, lastInteraction: new Date() },
        });
        return;
    }

    // No phone match — try matching by display name (fuzzy)
    if (displayName && displayName !== phone && displayName.length > 2) {
        const nameLower = displayName.toLowerCase().trim();
        const candidates = await prisma.stakeholderProfile.findMany({
            where: { userId, mergedIntoId: null },
            select: { id: true, name: true, phoneNumber: true },
        });

        // Simple match: first name matches
        const match = candidates.find(c => {
            const profileFirstName = c.name.toLowerCase().split(/[\s.]+/)[0];
            const waFirstName = nameLower.split(/[\s.]+/)[0];
            return profileFirstName.length > 2 && waFirstName.length > 2 && profileFirstName === waFirstName;
        });

        if (match) {
            // Store phone number for future fast matching
            await prisma.stakeholderProfile.update({
                where: { id: match.id },
                data: {
                    phoneNumber: phone,
                    interactionCount: { increment: 1 },
                    lastInteraction: new Date(),
                },
            });
            console.log(`[WhatsApp] Matched phone ${phone} (${displayName}) → ${match.name}`);
        }
    }
}

// ============================================================================
// SESSION PERSISTENCE (DB-backed, survives worker restarts)
// ============================================================================

async function saveSessionToDB(userId: string, authDir: string): Promise<void> {
    try {
        const credsPath = path.join(authDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        const creds = fs.readFileSync(credsPath, 'utf-8');

        // Encrypt credentials before storing
        const { encryptOAuthToken } = await import('../lib/encryption');
        const encCreds = encryptOAuthToken(creds) || '{}';

        await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, credentials: encCreds, status: 'CONNECTED' },
            update: { credentials: encCreds, status: 'CONNECTED', updatedAt: new Date() },
        });
    } catch (err: any) {
        console.error(`[WhatsApp] Failed to save session: ${err.message}`);
    }
}

async function restoreSessionFromDB(userId: string, authDir: string): Promise<void> {
    try {
        const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
        if (!session?.credentials) return;

        // Decrypt credentials (migration-safe)
        const { decryptOAuthToken } = await import('../lib/encryption');
        const creds = decryptOAuthToken(session.credentials) || session.credentials;

        const credsPath = path.join(authDir, 'creds.json');
        if (!fs.existsSync(credsPath)) {
            fs.writeFileSync(credsPath, creds);
            console.log(`[WhatsApp] Restored session from DB for ${userId.substring(0, 8)}`);
        }
    } catch (err: any) {
        console.error(`[WhatsApp] Failed to restore session: ${err.message}`);
    }
}

async function clearSessionFromDB(userId: string): Promise<void> {
    try {
        await prisma.whatsAppSession.delete({ where: { userId } }).catch(() => {});
    } catch {}
}

async function updateConnectionStatus(userId: string, status: string): Promise<void> {
    try {
        await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, credentials: '{}', status },
            update: { status, updatedAt: new Date() },
        });

        // Also update DataConnector if exists
        await prisma.dataConnector.updateMany({
            where: { userId, provider: 'whatsapp' },
            data: { status: status === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED' },
        });
    } catch {}
}
