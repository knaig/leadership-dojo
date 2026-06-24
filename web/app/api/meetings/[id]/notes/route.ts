import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { getGoogleClient } from '@/lib/google-apis';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meetings/[id]/notes
 * Manually trigger meeting notes fetch from Gmail (primary) + Drive (fallback).
 * Useful for re-fetching notes that weren't picked up automatically.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: meetingId } = await params;

    const meeting = await prisma.meetingSyncRecord.findFirst({
        where: { id: meetingId, userId },
        select: {
            id: true,
            title: true,
            externalId: true,
            startTime: true,
            endTime: true,
            notes: true,
            notesDocId: true,
        },
    });

    if (!meeting) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const oauth2Client = await getGoogleClient(userId);
    if (!oauth2Client) {
        return NextResponse.json({ error: 'Google not connected' }, { status: 400 });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search Gmail for meeting notes
    const afterTimestamp = Math.floor(meeting.startTime.getTime() / 1000);
    const beforeTimestamp = Math.floor((meeting.endTime.getTime() + 48 * 60 * 60 * 1000) / 1000);

    const cleanTitle = meeting.title
        .replace(/['"()[\]{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const queries = [
        `subject:"Meeting notes" subject:"${cleanTitle}" after:${afterTimestamp} before:${beforeTimestamp}`,
        `subject:"${cleanTitle}" (subject:notes OR subject:summary OR subject:transcript) after:${afterTimestamp} before:${beforeTimestamp}`,
        `from:google.com subject:"${cleanTitle}" after:${afterTimestamp} before:${beforeTimestamp}`,
    ];

    let notesText: string | null = null;
    let source = '';
    let sourceId = '';

    for (const query of queries) {
        try {
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 5,
            });

            const messages = response.data.messages || [];
            if (messages.length === 0) continue;

            // Find best match by time proximity to meeting end
            let bestBody = '';
            let bestDelta = Infinity;
            let bestId = '';

            for (const msg of messages) {
                if (!msg.id) continue;

                const details = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });

                const headers = (details.data.payload?.headers || []) as Array<{ name: string; value: string }>;
                const dateStr = headers.find(h => h.name.toLowerCase() === 'date')?.value;
                const emailDate = dateStr ? new Date(dateStr) : null;

                const body = extractEmailBody(details.data.payload);
                if (!body || body.length < 50) continue;

                const delta = emailDate
                    ? Math.abs(emailDate.getTime() - meeting.endTime.getTime())
                    : Infinity;

                if (delta < bestDelta) {
                    bestDelta = delta;
                    bestBody = body;
                    bestId = msg.id;
                }
            }

            if (bestBody) {
                notesText = bestBody;
                source = 'gmail';
                sourceId = bestId;
                break;
            }
        } catch {
            continue;
        }
    }

    // Fallback: Try Google Drive
    if (!notesText) {
        try {
            const drive = google.drive({ version: 'v3', auth: oauth2Client });
            const searchTitle = `Meeting notes - ${meeting.title}`;
            const windowStart = new Date(meeting.startTime.getTime() - 30 * 60 * 1000);
            const windowEnd = new Date(meeting.endTime.getTime() + 24 * 60 * 60 * 1000);

            const searchResult = await drive.files.list({
                q: `name contains '${searchTitle.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.document' and modifiedTime >= '${windowStart.toISOString()}' and modifiedTime <= '${windowEnd.toISOString()}'`,
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 5,
            });

            const files = searchResult.data.files || [];
            if (files.length > 0) {
                const exportResult = await drive.files.export({
                    fileId: files[0].id!,
                    mimeType: 'text/plain',
                });
                const text = typeof exportResult.data === 'string' ? exportResult.data : String(exportResult.data);
                if (text?.trim()) {
                    notesText = text.trim();
                    source = 'drive';
                    sourceId = files[0].id!;
                }
            }
        } catch {
            // Drive fallback failed — continue
        }
    }

    if (!notesText) {
        return NextResponse.json({
            found: false,
            message: `No meeting notes found for "${meeting.title}". Searched Gmail and Drive.`,
            searchedQueries: queries.length,
        });
    }

    // Save notes to the meeting record
    await prisma.meetingSyncRecord.update({
        where: { id: meeting.id },
        data: {
            notes: notesText,
            notesDocId: source === 'gmail' ? `gmail:${sourceId}` : sourceId,
        },
    });

    return NextResponse.json({
        found: true,
        source,
        notesLength: notesText.length,
        preview: notesText.substring(0, 500),
        message: `Found and saved ${notesText.length} chars of meeting notes from ${source}.`,
    });
}

/**
 * GET /api/meetings/[id]/notes
 * Get stored meeting notes for a meeting.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: meetingId } = await params;

    const meeting = await prisma.meetingSyncRecord.findFirst({
        where: { id: meetingId, userId },
        select: {
            id: true,
            title: true,
            notes: true,
            notesDocId: true,
        },
    });

    if (!meeting) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    return NextResponse.json({
        hasNotes: !!meeting.notes,
        notes: meeting.notes || null,
        source: meeting.notesDocId?.startsWith('gmail:') ? 'gmail' : meeting.notesDocId ? 'drive' : null,
    });
}

// --- Helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEmailBody(payload: Record<string, any> | null): string | null {
    if (!payload) return null;

    let body = '';

    if (payload.body?.data) {
        body = Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } else if (payload.parts) {
        body = extractFromParts(payload.parts);
    }

    if (!body) return null;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFromParts(parts: Record<string, any>[]): string {
    let plainText = '';
    let htmlText = '';

    for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            plainText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
        } else if (part.parts) {
            const nested = extractFromParts(part.parts);
            if (nested) plainText += nested;
        }
    }

    return plainText || htmlText;
}
