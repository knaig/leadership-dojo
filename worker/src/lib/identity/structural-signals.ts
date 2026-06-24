/**
 * Structural Signals for Identity Resolution
 *
 * Computes name and email similarity between two profiles
 * using Jaro-Winkler distance, prefix matching, initial expansion,
 * and email local-part analysis.
 *
 * Returns individual signal scores that can be accumulated.
 */

export interface StructuralSignal {
    type: string;
    score: number;      // contribution to overall confidence (positive = same person, negative = different)
    detail: string;     // human-readable explanation
}

interface ProfileForStructural {
    name: string;
    email: string | null;
    organization: string | null;
}

/**
 * Compute all structural signals between two profiles.
 */
export function computeStructuralSignals(a: ProfileForStructural, b: ProfileForStructural): StructuralSignal[] {
    const signals: StructuralSignal[] = [];

    // ── Name similarity (Jaro-Winkler) ──
    const aName = a.name.toLowerCase().trim();
    const bName = b.name.toLowerCase().trim();
    const jw = jaroWinkler(aName, bName);

    if (jw >= 0.92) {
        signals.push({ type: 'name_jaro_winkler', score: 35, detail: `Names very similar: "${a.name}" ↔ "${b.name}" (${(jw * 100).toFixed(0)}%)` });
    } else if (jw >= 0.85) {
        signals.push({ type: 'name_jaro_winkler', score: 20, detail: `Names similar: "${a.name}" ↔ "${b.name}" (${(jw * 100).toFixed(0)}%)` });
    }

    // ── Prefix matching: "raj" is prefix of "rajagopalan" ──
    const aWords = extractNameWords(aName);
    const bWords = extractNameWords(bName);

    for (const aw of aWords) {
        for (const bw of bWords) {
            if (aw.length >= 3 && bw.length >= 3) {
                if (bw.startsWith(aw) && bw.length > aw.length + 2) {
                    signals.push({ type: 'name_prefix', score: 20, detail: `"${aw}" is prefix of "${bw}"` });
                } else if (aw.startsWith(bw) && aw.length > bw.length + 2) {
                    signals.push({ type: 'name_prefix', score: 20, detail: `"${bw}" is prefix of "${aw}"` });
                }
            }
        }
    }

    // ── Initial expansion: "S. Rajagopalan" ↔ "Suresh Rajagopalan" ──
    const aInitials = extractInitials(a.name);
    const bInitials = extractInitials(b.name);

    if (aInitials.length > 0 && bWords.length > 0) {
        const match = aInitials.some(initial =>
            bWords.some(w => w.startsWith(initial) && w.length > 2)
        );
        // Also check that there's a shared non-initial word (e.g. "Rajagopalan")
        const sharedWord = aWords.some(aw => aw.length > 3 && bWords.some(bw => bw === aw));
        if (match && sharedWord) {
            signals.push({ type: 'initial_expansion', score: 15, detail: `Initial "${aInitials.join(', ')}" expands to match "${b.name}"` });
        }
    }
    if (bInitials.length > 0 && aWords.length > 0) {
        const match = bInitials.some(initial =>
            aWords.some(w => w.startsWith(initial) && w.length > 2)
        );
        const sharedWord = bWords.some(bw => bw.length > 3 && aWords.some(aw => aw === bw));
        if (match && sharedWord) {
            signals.push({ type: 'initial_expansion', score: 15, detail: `Initial "${bInitials.join(', ')}" expands to match "${a.name}"` });
        }
    }

    // ── Shared name words (exact match, length > 3) ──
    const sharedWords = aWords.filter(w => w.length > 3 && bWords.includes(w));
    if (sharedWords.length > 0 && signals.every(s => s.type !== 'name_jaro_winkler' || s.score < 35)) {
        signals.push({ type: 'name_word_overlap', score: Math.min(15, sharedWords.length * 8), detail: `Shared name words: ${sharedWords.join(', ')}` });
    }

    // ── Email local-part ↔ name cross-reference ──
    if (a.email && b.email) {
        const aLocal = a.email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
        const bLocal = b.email.split('@')[0].toLowerCase().replace(/[._-]/g, '');

        // Check if email local part of one contains a significant name word from the other
        for (const bw of bWords) {
            if (bw.length > 3 && aLocal.includes(bw)) {
                signals.push({ type: 'email_name_cross', score: 10, detail: `${a.email} local part contains "${bw}" from "${b.name}"` });
                break;
            }
        }
        for (const aw of aWords) {
            if (aw.length > 3 && bLocal.includes(aw)) {
                signals.push({ type: 'email_name_cross', score: 10, detail: `${b.email} local part contains "${aw}" from "${a.name}"` });
                break;
            }
        }

        // Email local-part similarity (Jaro-Winkler)
        const emailJw = jaroWinkler(aLocal, bLocal);
        if (emailJw >= 0.9 && aLocal.length > 4) {
            signals.push({ type: 'email_local_similar', score: 15, detail: `Email local parts similar: "${aLocal}" ↔ "${bLocal}" (${(emailJw * 100).toFixed(0)}%)` });
        }
    }

    // ── Same email domain (corporate, not personal) ──
    if (a.email && b.email) {
        const aDomain = a.email.split('@')[1]?.toLowerCase();
        const bDomain = b.email.split('@')[1]?.toLowerCase();
        const PERSONAL = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'aol.com', 'live.com', 'rediffmail.com', 'ymail.com']);

        if (aDomain && bDomain && aDomain === bDomain && !PERSONAL.has(aDomain)) {
            signals.push({ type: 'same_corp_domain', score: 5, detail: `Same corporate domain: ${aDomain}` });
        }
    }

    // ── Same organization ──
    if (a.organization && b.organization) {
        const aOrg = a.organization.toLowerCase().trim();
        const bOrg = b.organization.toLowerCase().trim();
        if (aOrg === bOrg) {
            signals.push({ type: 'same_org', score: 5, detail: `Same organization: ${a.organization}` });
        }
    }

    return signals;
}

/**
 * Sum the total score from an array of signals.
 */
export function totalScore(signals: StructuralSignal[]): number {
    return Math.max(0, Math.min(100, signals.reduce((sum, s) => sum + s.score, 0)));
}

// ════════════════════════════════════════════════════════
// STRING SIMILARITY
// ════════════════════════════════════════════════════════

/**
 * Jaro similarity between two strings.
 */
function jaro(s1: string, s2: string): number {
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matchDistance = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, s2.length);

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }

    return (
        (matches / s1.length +
            matches / s2.length +
            (matches - transpositions / 2) / matches) / 3
    );
}

/**
 * Jaro-Winkler similarity (boosts score for common prefixes).
 */
export function jaroWinkler(s1: string, s2: string, prefixScale: number = 0.1): number {
    const jaroScore = jaro(s1, s2);

    // Find common prefix (up to 4 chars)
    let prefix = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }

    return jaroScore + prefix * prefixScale * (1 - jaroScore);
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

/**
 * Extract meaningful name words (lowercase, >1 char).
 */
function extractNameWords(name: string): string[] {
    return name
        .replace(/[^a-z\s.'-]/g, '')
        .split(/[\s.]+/)
        .map(w => w.replace(/^['-]+|['-]+$/g, ''))
        .filter(w => w.length > 1);
}

/**
 * Extract single-letter initials from a name.
 * "S. Rajagopalan" → ["s"]
 * "J.R. Smith" → ["j", "r"]
 */
function extractInitials(name: string): string[] {
    const parts = name.split(/[\s.]+/);
    return parts
        .filter(p => p.length === 1 || (p.length === 2 && p[1] === '.'))
        .map(p => p[0].toLowerCase());
}
