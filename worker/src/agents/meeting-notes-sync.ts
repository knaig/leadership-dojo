/**
 * Meeting Notes Sync Agent
 *
 * Proactively fetches Gemini meeting notes for all past meetings that
 * don't have notes stored yet. Runs after calendar sync.
 *
 * Flow:
 * 1. Find recent meetings (last 30 days) without notes
 * 2. For each, call fetchGeminiMeetingNotes (Gmail → Drive → Calendar attachments)
 * 3. Store notes content in MeetingSyncRecord.notes
 * 4. Trigger knowledge-extract-meeting-notes for fact extraction
 *
 * This ensures meeting intelligence is always pre-computed and ready
 * when the user asks, instead of lazy-fetching on demand.
 */

import { prisma } from '../lib/prisma';
import { fetchGeminiMeetingNotes } from '../services/meeting-notes-service';

interface SyncResult {
    checked: number;
    fetched: number;
    errors: number;
}

export async function syncMeetingNotes(userId: string): Promise<SyncResult> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Find past meetings without notes (ended, no notes content, within last 30 days)
    const meetingsWithoutNotes = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            endTime: { gte: thirtyDaysAgo, lte: now },
            status: { not: 'cancelled' },
            OR: [
                { notes: null },
                { notes: '' },
            ],
        },
        select: {
            id: true,
            title: true,
            externalId: true,
            startTime: true,
            endTime: true,
            notesDocId: true,
            meetLink: true,
        },
        orderBy: { startTime: 'desc' },
        take: 30, // Cap to avoid hammering Gmail API
    });

    console.log(`[MeetingNotesSync] Found ${meetingsWithoutNotes.length} meetings without notes (last 30 days)`);

    let fetched = 0;
    let errors = 0;

    for (const meeting of meetingsWithoutNotes) {
        try {
            const notes = await fetchGeminiMeetingNotes(userId, meeting);
            if (notes) {
                await prisma.meetingSyncRecord.update({
                    where: { id: meeting.id },
                    data: { notes: notes.substring(0, 10000) },
                });
                fetched++;
                console.log(`[MeetingNotesSync] ✅ Fetched notes for "${meeting.title}" (${notes.length} chars)`);
            }
        } catch (err: any) {
            errors++;
            console.log(`[MeetingNotesSync] ⚠️ Failed for "${meeting.title}": ${err.message}`);
        }

        // Small delay to avoid rate-limiting Gmail API
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[MeetingNotesSync] Done: ${fetched}/${meetingsWithoutNotes.length} fetched, ${errors} errors`);

    return {
        checked: meetingsWithoutNotes.length,
        fetched,
        errors,
    };
}
