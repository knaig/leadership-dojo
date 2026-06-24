/**
 * Behavioral Signals for Identity Resolution
 *
 * Analyzes meeting attendance patterns and communication data
 * to detect probable same-person signals.
 *
 * Key signals:
 * - Co-attendance: appear in same meeting → DIFFERENT people (anti-signal)
 * - Exclusive attendance: same-titled recurring meeting, never co-attend → likely same person
 * - Communication graph overlap: both email the same set of people → same person signal
 */

export interface BehavioralSignal {
    type: string;
    score: number;
    detail: string;
}

interface MeetingIndex {
    emailToMeetings: Map<string, Set<number>>;
    emailToTitles: Map<string, Set<string>>;
}

/**
 * Build meeting attendance index from raw meeting data.
 */
export function buildMeetingIndex(
    meetings: Array<{ participants: string[] | null; title: string }>
): MeetingIndex {
    const emailToMeetings = new Map<string, Set<number>>();
    const emailToTitles = new Map<string, Set<string>>();

    meetings.forEach((m, idx) => {
        for (const email of (m.participants || [])) {
            const lower = email.toLowerCase();
            if (!emailToMeetings.has(lower)) emailToMeetings.set(lower, new Set());
            emailToMeetings.get(lower)!.add(idx);
            if (!emailToTitles.has(lower)) emailToTitles.set(lower, new Set());
            emailToTitles.get(lower)!.add(m.title.toLowerCase());
        }
    });

    return { emailToMeetings, emailToTitles };
}

/**
 * Compute behavioral signals between two profiles.
 */
export function computeBehavioralSignals(
    aEmail: string | null,
    bEmail: string | null,
    index: MeetingIndex,
): BehavioralSignal[] {
    const signals: BehavioralSignal[] = [];
    if (!aEmail || !bEmail) return signals;

    const aLower = aEmail.toLowerCase();
    const bLower = bEmail.toLowerCase();

    const aMeetings = index.emailToMeetings.get(aLower);
    const bMeetings = index.emailToMeetings.get(bLower);
    const aTitles = index.emailToTitles.get(aLower);
    const bTitles = index.emailToTitles.get(bLower);

    // ── Co-attendance: same meeting → DIFFERENT people ──
    if (aMeetings && bMeetings) {
        let coAttendCount = 0;
        // Use Array.from to iterate (CommonJS-safe)
        const aMeetingArr = Array.from(aMeetings);
        for (const idx of aMeetingArr) {
            if (bMeetings.has(idx)) coAttendCount++;
        }

        if (coAttendCount > 0) {
            // Strong anti-signal: if they sit in the same meeting, they're different people
            signals.push({
                type: 'co_attendance',
                score: -30 - Math.min(coAttendCount * 5, 20), // -30 to -50
                detail: `Co-attend ${coAttendCount} meeting(s) — likely different people`,
            });
            return signals; // Co-attendance is definitive — skip other meeting signals
        }
    }

    // ── Exclusive attendance: same-titled meetings, never together ──
    if (aTitles && bTitles) {
        const aTitleArr = Array.from(aTitles);
        const sharedTitles: string[] = [];
        for (const t of aTitleArr) {
            if (bTitles.has(t)) sharedTitles.push(t);
        }

        if (sharedTitles.length > 0) {
            // Stronger signal if it's a recurring meeting (appears multiple times)
            const score = Math.min(25, sharedTitles.length * 10);
            signals.push({
                type: 'exclusive_attendance',
                score,
                detail: `Appear in same-titled meeting(s) but never together: ${sharedTitles.slice(0, 3).join(', ')}`,
            });
        }
    }

    // ── Communication graph overlap ──
    // If A and B both attend meetings with the same set of people,
    // they might be the same person using different emails.
    if (aMeetings && bMeetings && aMeetings.size > 0 && bMeetings.size > 0) {
        const aCoAttendees = getCoAttendees(aLower, aMeetings, index);
        const bCoAttendees = getCoAttendees(bLower, bMeetings, index);

        if (aCoAttendees.size >= 2 && bCoAttendees.size >= 2) {
            let overlap = 0;
            const aCoArr = Array.from(aCoAttendees);
            for (const email of aCoArr) {
                if (bCoAttendees.has(email)) overlap++;
            }

            const overlapRatio = overlap / Math.min(aCoAttendees.size, bCoAttendees.size);
            if (overlapRatio >= 0.5 && overlap >= 2) {
                signals.push({
                    type: 'network_overlap',
                    score: Math.min(15, Math.round(overlapRatio * 20)),
                    detail: `${overlap} shared co-attendees (${(overlapRatio * 100).toFixed(0)}% overlap)`,
                });
            }
        }
    }

    return signals;
}

/**
 * Get all unique email addresses that co-attend meetings with the given email.
 */
function getCoAttendees(
    email: string,
    meetingIndices: Set<number>,
    index: MeetingIndex
): Set<string> {
    const coAttendees = new Set<string>();
    // Invert: for each email in the index, check if they share any meeting
    const entries = Array.from(index.emailToMeetings.entries());
    for (const [otherEmail, otherMeetings] of entries) {
        if (otherEmail === email) continue;
        const meetingArr = Array.from(meetingIndices);
        for (const idx of meetingArr) {
            if (otherMeetings.has(idx)) {
                coAttendees.add(otherEmail);
                break;
            }
        }
    }
    return coAttendees;
}
