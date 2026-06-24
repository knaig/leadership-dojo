import { prisma } from '@/lib/prisma';
import { WorkArtifact } from '@prisma/client';

/**
 * Match meeting notes (received emails) to calendar events
 *
 * Matching criteria:
 * 1. Email arrives within 2 hours AFTER meeting end time
 * 2. Subject contains note-taking keywords
 * 3. Title similarity > 65% (using weighted word overlap, ignoring noise words)
 * 4. Returns confidence score for UI display
 */

const NOTE_KEYWORDS = ['notes', 'summary', 'transcript', 'recording', 'recap', 'minutes', 'action items'];
const TIME_WINDOW_HOURS = 2;
const SIMILARITY_THRESHOLD = 0.65;

// Words that don't help distinguish meetings
const NOISE_WORDS = new Set([
    'meeting', 'notes', 'summary', 'transcript', 'recap', 'minutes',
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'to', 'in',
    'on', 'at', 'by', 'of', 'call', 'sync', 'session', 'discussion',
    're', 'fwd', 'fw',
]);

/**
 * Calculate string similarity using weighted word overlap.
 * Filters out noise words so we compare meaningful terms.
 */
function stringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    // Extract meaningful words (>2 chars, not noise)
    const extractWords = (s: string) =>
        new Set(s.split(/[\s\-_:,]+/).filter(w => w.length > 2 && !NOISE_WORDS.has(w)));

    const words1 = extractWords(s1);
    const words2 = extractWords(s2);

    if (words1.size === 0 || words2.size === 0) return 0.0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    // Base: Jaccard similarity on meaningful words
    const jaccard = intersection.size / union.size;

    // Bonus: if all meaningful words of one side are in the other
    const containsAll1 = intersection.size === words1.size;
    const containsAll2 = intersection.size === words2.size;
    const containmentBonus = (containsAll1 || containsAll2) ? 0.15 : 0;

    return Math.min(1.0, jaccard + containmentBonus);
}

/**
 * Check if email looks like meeting notes
 */
function isLikelyMeetingNotes(artifact: WorkArtifact): boolean {
    const title = (artifact.title || '').toLowerCase();
    return NOTE_KEYWORDS.some(keyword => title.includes(keyword));
}

export interface NoteMatchResult {
    linked: boolean;
    meetingTitle?: string;
    confidence?: number;
}

/**
 * Link a single note email to its matching meeting
 */
export async function linkNoteToMeeting(noteArtifact: WorkArtifact, userId: string): Promise<NoteMatchResult> {
    if (!isLikelyMeetingNotes(noteArtifact)) {
        return { linked: false };
    }

    // Find meetings that ended within the time window BEFORE this email
    const noteTime = noteArtifact.occurredAt;
    const windowStart = new Date(noteTime.getTime() - TIME_WINDOW_HOURS * 60 * 60 * 1000);

    const candidateMeetings = await prisma.workArtifact.findMany({
        where: {
            userId,
            type: 'MEETING_ATTENDED',
            occurredAt: {
                gte: windowStart,
                lte: noteTime,
            },
            linkedNoteId: null, // Not already linked
        },
    });

    if (candidateMeetings.length === 0) {
        return { linked: false };
    }

    // Find best match by title similarity
    let bestMatch: WorkArtifact | null = null;
    let bestScore = 0;

    for (const meeting of candidateMeetings) {
        const similarity = stringSimilarity(
            noteArtifact.title || '',
            meeting.title || ''
        );

        if (similarity > bestScore && similarity >= SIMILARITY_THRESHOLD) {
            bestScore = similarity;
            bestMatch = meeting;
        }
    }

    if (!bestMatch) {
        return { linked: false };
    }

    // Create the link
    await prisma.workArtifact.update({
        where: { id: bestMatch.id },
        data: { linkedNoteId: noteArtifact.id },
    });

    console.log(`✅ Linked note "${noteArtifact.title}" to meeting "${bestMatch.title}" (confidence: ${(bestScore * 100).toFixed(0)}%)`);

    return {
        linked: true,
        meetingTitle: bestMatch.title || undefined,
        confidence: bestScore,
    };
}

/**
 * Batch process all unlinked notes for a user
 */
export async function linkAllNotesForUser(userId: string): Promise<{ linked: number; total: number }> {
    // Find all received emails that look like notes
    const potentialNotes = await prisma.workArtifact.findMany({
        where: {
            userId,
            type: 'EMAIL_RECEIVED',
            meetingFor: { none: {} }, // Not already linked as a note
        },
        orderBy: { occurredAt: 'asc' },
    });

    let linkedCount = 0;

    for (const note of potentialNotes) {
        const result = await linkNoteToMeeting(note, userId);
        if (result.linked) linkedCount++;
    }

    return { linked: linkedCount, total: potentialNotes.length };
}
