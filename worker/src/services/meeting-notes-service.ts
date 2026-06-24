/**
 * Meeting Notes Service
 *
 * Fetches Gemini "Take notes for me" meeting notes from Gmail (primary)
 * with Google Drive as fallback.
 *
 * Strategy:
 * 1. Search Gmail for Gemini meeting notes emails matching the meeting title
 * 2. For recurring meetings: pick email closest to meeting end time
 * 3. Fallback: Search Google Drive by naming convention
 * 4. Fallback: Check calendar event attachments
 * 5. Return with confidence score for downstream verification
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '../lib/google-auth';
import { prisma } from '../lib/prisma';

export interface MeetingNotesResult {
    text: string;
    confidence: number;  // 0-1
    source: 'gmail' | 'drive_search' | 'calendar_attachment';
    sourceId: string;    // Gmail message ID or Drive doc ID
    sourceName: string;  // Email subject or doc name
}

/**
 * Fetch Gemini meeting notes for a given meeting.
 * Returns plain text or null if not found.
 */
export async function fetchGeminiMeetingNotes(
    userId: string,
    meeting: {
        title: string;
        externalId: string;
        startTime: Date;
        endTime: Date;
        notesDocId?: string | null;
        meetLink?: string | null;
    }
): Promise<string | null> {
    const result = await fetchGeminiMeetingNotesWithConfidence(userId, meeting);
    return result?.text ?? null;
}

/**
 * Fetch Gemini meeting notes with confidence metadata.
 * Primary: Gmail search for Gemini notes emails.
 * Fallback: Drive search by naming convention + calendar attachments.
 */
export async function fetchGeminiMeetingNotesWithConfidence(
    userId: string,
    meeting: {
        title: string;
        externalId: string;
        startTime: Date;
        endTime: Date;
        notesDocId?: string | null;
        meetLink?: string | null;
    }
): Promise<MeetingNotesResult | null> {
    const auth = await getGoogleAuth(userId);
    if (!auth) {
        console.log(`[MeetingNotes] No Google auth for user ${userId.substring(0, 8)}`);
        return null;
    }

    try {
        // Strategy 1: Search Gmail for Gemini meeting notes emails
        const gmailResult = await searchGmailForNotes(auth.oauth2Client, meeting);
        if (gmailResult) {
            console.log(`[MeetingNotes] Found via Gmail: "${gmailResult.sourceName}" (${gmailResult.text.length} chars, confidence: ${(gmailResult.confidence * 100).toFixed(0)}%)`);
            // Cache the source ID for future lookups
            cacheNotesSource(userId, meeting.externalId, `gmail:${gmailResult.sourceId}`);
            return gmailResult;
        }

        // Strategy 2: Search Google Drive by naming convention
        const driveResult = await searchDriveForNotes(auth.oauth2Client, meeting);
        if (driveResult) {
            console.log(`[MeetingNotes] Found via Drive: "${driveResult.sourceName}" (${driveResult.text.length} chars, confidence: ${(driveResult.confidence * 100).toFixed(0)}%)`);
            cacheNotesSource(userId, meeting.externalId, driveResult.sourceId);
            return driveResult;
        }

        // Strategy 3: Check calendar event attachments
        const calResult = await checkCalendarAttachments(auth.oauth2Client, meeting);
        if (calResult) {
            console.log(`[MeetingNotes] Found via calendar attachment: "${calResult.sourceName}" (${calResult.text.length} chars)`);
            cacheNotesSource(userId, meeting.externalId, calResult.sourceId);
            return calResult;
        }

        console.log(`[MeetingNotes] No notes found for meeting: ${meeting.title}`);
        return null;

    } catch (error: any) {
        console.error(`[MeetingNotes] Error fetching notes for "${meeting.title}":`, error.message);
        return null;
    }
}

/**
 * Strategy 1: Search Gmail for Gemini meeting notes.
 * Gemini sends notes as emails with subject like "Meeting notes - [title]"
 * from workspace-noreply@google.com or similar Google addresses.
 */
async function searchGmailForNotes(
    oauth2Client: any,
    meeting: {
        title: string;
        startTime: Date;
        endTime: Date;
        notesDocId?: string | null;
    }
): Promise<MeetingNotesResult | null> {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // If we have a cached Gmail message ID, fetch directly
    if (meeting.notesDocId?.startsWith('gmail:')) {
        const messageId = meeting.notesDocId.replace('gmail:', '');
        try {
            const body = await getEmailBody(gmail, messageId);
            if (body) {
                return {
                    text: body,
                    confidence: 0.99,
                    source: 'gmail',
                    sourceId: messageId,
                    sourceName: 'Cached meeting notes email',
                };
            }
        } catch {
            // Cached message may have been deleted — fall through to search
        }
    }

    // Search Gmail for meeting notes emails
    // Time window: from 1 hour before meeting start to 48 hours after meeting end
    // (wider window catches notes sent before or well after the meeting)
    const afterTimestamp = Math.floor((meeting.startTime.getTime() - 60 * 60 * 1000) / 1000);
    const beforeTimestamp = Math.floor((meeting.endTime.getTime() + 48 * 60 * 60 * 1000) / 1000);

    // Clean the title for search — remove special characters that break Gmail search
    const cleanTitle = meeting.title
        .replace(/['"()[\]{}/\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Extract significant keywords for broader matching
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'of', 'with', 'meeting', 'call', 'sync']);
    const titleKeywords = cleanTitle
        .split(/[\s\-:]+/)
        .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    const keywordQuery = titleKeywords.join(' ');

    // Multiple search strategies — broadest to narrowest
    const queries = [
        // Strategy 1: Gemini's exact format — "Notes: 'Title'"
        `subject:(notes OR "meeting notes") subject:(${keywordQuery}) after:${afterTimestamp} before:${beforeTimestamp}`,
        // Strategy 2: Title keywords + notes/summary anywhere in subject
        `subject:(${keywordQuery}) (notes OR summary OR transcript OR takeaways) after:${afterTimestamp} before:${beforeTimestamp}`,
        // Strategy 3: From Google specifically with just keywords
        `from:google.com (${keywordQuery}) (notes OR summary) after:${afterTimestamp} before:${beforeTimestamp}`,
        // Strategy 4: Broadest — just keywords in subject within time window
        `subject:(${keywordQuery}) after:${afterTimestamp} before:${beforeTimestamp}`,
    ];

    for (const query of queries) {
        try {
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 5,
            });

            const messages = response.data.messages || [];
            if (messages.length === 0) continue;

            // Find best match — prefer email closest to meeting end time
            let bestResult: MeetingNotesResult | null = null;
            let bestDelta = Infinity;

            for (const msg of messages) {
                if (!msg.id) continue;

                const details = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });

                const headers = (details.data.payload?.headers || []) as Array<{ name: string; value: string }>;
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
                const dateStr = headers.find(h => h.name.toLowerCase() === 'date')?.value;
                const emailDate = dateStr ? new Date(dateStr) : null;

                // Verify the subject actually relates to our meeting
                if (!isSubjectMatch(subject, meeting.title)) continue;

                const body = extractEmailBody(details.data.payload);
                if (!body || body.length < 50) continue; // Skip near-empty notes

                const delta = emailDate
                    ? Math.abs(emailDate.getTime() - meeting.endTime.getTime())
                    : Infinity;

                if (delta < bestDelta) {
                    bestDelta = delta;
                    const hoursAway = delta / (1000 * 60 * 60);
                    bestResult = {
                        text: body,
                        confidence: hoursAway < 2 ? 0.95 : hoursAway < 6 ? 0.85 : 0.7,
                        source: 'gmail',
                        sourceId: msg.id,
                        sourceName: subject,
                    };
                }
            }

            if (bestResult) return bestResult;

        } catch (err: any) {
            console.log(`[MeetingNotes] Gmail search failed for query: ${err.message}`);
            continue;
        }
    }

    return null;
}

/**
 * Check if an email subject matches the meeting title.
 * Uses word overlap to handle slight variations.
 */
function isSubjectMatch(subject: string, meetingTitle: string): boolean {
    const subjectLower = subject.toLowerCase();
    const titleLower = meetingTitle.toLowerCase();

    // Direct containment
    if (subjectLower.includes(titleLower) || titleLower.includes(subjectLower)) return true;

    // Word overlap — at least 60% of meaningful title words should appear in subject
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'of', 'with', '-', '–', '—']);
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    if (titleWords.length === 0) return true; // Generic title, accept any notes email

    const matchCount = titleWords.filter(w => subjectLower.includes(w)).length;
    return matchCount / titleWords.length >= 0.6;
}

/**
 * Extract body text from a Gmail message payload.
 * Handles multipart emails, base64 encoding, and nested parts.
 */
function extractEmailBody(payload: any): string | null {
    if (!payload) return null;

    let body = '';

    // Simple body
    if (payload.body?.data) {
        body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } else if (payload.parts) {
        // Multipart — prefer text/plain, fall back to text/html
        body = extractFromParts(payload.parts);
    }

    if (!body) return null;

    // Strip HTML tags if present, normalize whitespace
    body = body
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

    return body || null;
}

/**
 * Recursively extract text from multipart email parts.
 * Prefers text/plain, falls back to text/html.
 */
function extractFromParts(parts: any[]): string {
    let plainText = '';
    let htmlText = '';

    for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            plainText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
        } else if (part.parts) {
            // Nested multipart (e.g., multipart/alternative inside multipart/mixed)
            const nested = extractFromParts(part.parts);
            if (nested) plainText += nested;
        }
    }

    return plainText || htmlText;
}

/**
 * Get email body by message ID (for cached lookups).
 */
async function getEmailBody(gmail: any, messageId: string): Promise<string | null> {
    const details = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });
    return extractEmailBody(details.data.payload);
}

/**
 * Strategy 2: Search Google Drive for meeting notes docs.
 * Gemini also saves notes as Google Docs named "Meeting notes - [title]".
 */
async function searchDriveForNotes(
    oauth2Client: any,
    meeting: { title: string; startTime: Date; endTime: Date }
): Promise<MeetingNotesResult | null> {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const searchTitle = `Meeting notes - ${meeting.title}`;

    const windowStart = new Date(meeting.startTime.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(meeting.endTime.getTime() + 6 * 60 * 60 * 1000);

    try {
        const searchResult = await drive.files.list({
            q: `name contains '${searchTitle.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.document' and modifiedTime >= '${windowStart.toISOString()}' and modifiedTime <= '${windowEnd.toISOString()}'`,
            fields: 'files(id, name, modifiedTime, createdTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 10,
        });

        const files = searchResult.data.files || [];
        if (files.length === 0) return null;

        // Pick best match — closest to meeting end time
        const meetingEnd = meeting.endTime.getTime();
        let bestFile = files[0];
        let bestDelta = Infinity;

        for (const file of files) {
            const modTime = new Date(file.modifiedTime || file.createdTime || '').getTime();
            const delta = Math.abs(modTime - meetingEnd);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestFile = file;
            }
        }

        const text = await exportDocAsText(drive, bestFile.id!);
        if (!text) return null;

        const hoursAway = bestDelta / (1000 * 60 * 60);
        const confidence = files.length === 1 ? 0.90
            : hoursAway < 1 ? 0.80
            : hoursAway < 3 ? 0.65
            : 0.45;

        return {
            text,
            confidence,
            source: 'drive_search',
            sourceId: bestFile.id!,
            sourceName: bestFile.name || searchTitle,
        };
    } catch (err: any) {
        console.log(`[MeetingNotes] Drive search failed: ${err.message}`);
        return null;
    }
}

/**
 * Strategy 3: Check calendar event for attached documents.
 */
async function checkCalendarAttachments(
    oauth2Client: any,
    meeting: { externalId: string; title: string }
): Promise<MeetingNotesResult | null> {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        const event = await calendar.events.get({
            calendarId: 'primary',
            eventId: meeting.externalId,
        });

        const attachments = event.data.attachments || [];
        const notesAttachment = attachments.find(a =>
            a.title?.toLowerCase().includes('meeting notes') ||
            a.title?.toLowerCase().includes('notes') ||
            a.mimeType === 'application/vnd.google-apps.document'
        );

        if (!notesAttachment?.fileId) return null;

        const text = await exportDocAsText(drive, notesAttachment.fileId);
        if (!text) return null;

        return {
            text,
            confidence: 0.98,
            source: 'calendar_attachment',
            sourceId: notesAttachment.fileId,
            sourceName: notesAttachment.title || 'Calendar attachment',
        };
    } catch (err: any) {
        console.log(`[MeetingNotes] Calendar attachment check failed: ${err.message}`);
        return null;
    }
}

/**
 * Export a Google Doc as plain text.
 */
async function exportDocAsText(drive: any, docId: string): Promise<string | null> {
    try {
        const exportResult = await drive.files.export({
            fileId: docId,
            mimeType: 'text/plain',
        });

        const text = typeof exportResult.data === 'string'
            ? exportResult.data
            : String(exportResult.data);

        if (!text || text.trim().length === 0) return null;
        return text.trim();
    } catch (err: any) {
        console.error(`[MeetingNotes] Failed to export doc ${docId}: ${err.message}`);
        return null;
    }
}

/**
 * Cache the notes source ID on the meeting record for instant future lookups.
 */
function cacheNotesSource(userId: string, externalId: string, sourceId: string): void {
    prisma.meetingSyncRecord.updateMany({
        where: { userId, externalId },
        data: { notesDocId: sourceId },
    }).catch(() => {}); // Fire and forget
}
