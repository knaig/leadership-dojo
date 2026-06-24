import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { getGoogleClient } from '@/lib/google-apis';
import { DataConnector } from '@prisma/client';

interface SyncResult {
  success: boolean;
  artifactsCreated: number;
  error?: string;
}

interface EmailHeader {
  name: string;
  value: string;
}

/**
 * Sync Gmail connector - fetches recent sent AND received emails
 * - SENT emails reflect the user's communication behavior
 * - RECEIVED emails from note-taking services (Gemini, Fireflies, etc.) for meeting analysis
 * - Important received emails with multiple recipients for leadership context
 */
export async function syncGmailConnector(
  connector: DataConnector & { account: { id: string; access_token: string | null; refresh_token: string | null } | null },
  userId: string
): Promise<SyncResult> {
  try {
    console.log('[Gmail Sync] Starting sync for user:', userId);
    console.log('[Gmail Sync] Connector account:', {
      hasAccount: !!connector.account,
      hasAccessToken: !!connector.account?.access_token
    });

    // Note: We use getGoogleClient which looks up account by userId, not connector.account
    const auth = await getGoogleClient(userId);
    console.log('[Gmail Sync] Got Google client successfully');

    const gmail = google.gmail({ version: 'v1', auth });

    // Get last sync time or default to 30 days ago for better coverage
    const lastSyncAt = connector.lastSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const afterTimestamp = Math.floor(lastSyncAt.getTime() / 1000);

    console.log('[Gmail Sync] Fetching emails after:', new Date(afterTimestamp * 1000).toISOString());

    // Fetch multiple types of emails:
    // 1. Sent emails (primary leadership signal)
    // 2. Received emails from note-taking services (meeting notes)
    // 3. Inbox emails with multiple recipients (team discussions)
    // 4. Important personal emails (excluding promotions/social)
    const queries = [
      `in:sent after:${afterTimestamp}`,
      `(from:noreply OR from:no-reply) (subject:notes OR subject:summary OR subject:transcript OR subject:recording) after:${afterTimestamp}`,
      `in:inbox category:personal -category:promotions -category:social after:${afterTimestamp}`,
    ];

    const allMessages: Array<{ id: string; labelIds?: string[] }> = [];

    for (const query of queries) {
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 100,
        q: query,
      });

      if (response.data.messages) {
        allMessages.push(...response.data.messages.map(m => ({
          id: m.id!,
          labelIds: m.labelIds || undefined,
        })));
      }
    }

    // Deduplicate messages by ID
    const uniqueMessages = Array.from(
      new Map(allMessages.map(m => [m.id, m])).values()
    );

    console.log('[Gmail Sync] Gmail API response:', {
      messageCount: uniqueMessages.length,
      queries: queries.length
    });

    if (uniqueMessages.length === 0) {
      console.log('[Gmail Sync] No messages found matching criteria');
      return { success: true, artifactsCreated: 0 };
    }

    let artifactsCreated = 0;

    // Process each email
    for (const message of uniqueMessages) {
      if (!message.id) continue;

      // Check if already ingested
      const existing = await prisma.workArtifact.findFirst({
        where: {
          connectorId: connector.id,
          externalId: message.id,
        },
      });

      if (existing) continue;

      // Get full message details
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });

      const headers = details.data.payload?.headers as EmailHeader[] || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
      const to = headers.find(h => h.name.toLowerCase() === 'to')?.value || '';
      const cc = headers.find(h => h.name.toLowerCase() === 'cc')?.value || '';
      const dateStr = headers.find(h => h.name.toLowerCase() === 'date')?.value;
      const messageDate = dateStr ? new Date(dateStr) : new Date();

      // Extract body
      let body = '';
      const payload = details.data.payload;
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      } else if (payload?.parts) {
        // Multipart email - find text/plain or text/html
        const textPart = payload.parts.find(
          p => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
        );
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      }

      // Strip HTML tags if present
      body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      // Determine if this is sent or received
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const isSent = details.data.labelIds?.includes('SENT') || false;
      const emailType = isSent ? 'EMAIL_SENT' : 'EMAIL_RECEIVED';

      // Extract participants
      const recipients = [...to.split(','), ...cc.split(',')]
        .map(e => e.trim())
        .filter(e => e.length > 0)
        .map(e => {
          // Extract email from "Name <email>" format
          const match = e.match(/<([^>]+)>/);
          return match ? match[1] : e;
        });

      // Create artifact
      await prisma.workArtifact.create({
        data: {
          userId,
          connectorId: connector.id,
          type: emailType,
          externalId: message.id,
          title: subject,
          content: body.substring(0, 10000), // Limit content size
          rawContent: body,
          metadata: {
            threadId: details.data.threadId,
            labelIds: details.data.labelIds || [],
            snippet: details.data.snippet,
          },
          participants: recipients,
          occurredAt: messageDate,
        },
      });

      artifactsCreated++;
    }

    return { success: true, artifactsCreated };
  } catch (error) {
    console.error('Gmail sync error:', error);
    return {
      success: false,
      artifactsCreated: 0,
      error: error instanceof Error ? error.message : 'Gmail sync failed',
    };
  }
}
