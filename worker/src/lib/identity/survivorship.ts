/**
 * Survivorship Rules for Identity Resolution
 *
 * When merging two stakeholder profiles, determines which value
 * to keep for each field using configurable strategies:
 *
 * - longest: pick the longer/more complete value (names)
 * - recency: pick the most recently updated value (roles, titles)
 * - source_priority: prefer enriched data over inferred (org, role)
 * - highest: pick the higher value (powerLevel, interactionCount)
 * - array: keep all unique values (emails, aliases)
 */

export interface MergeableProfile {
    id: string;
    name: string;
    email: string | null;
    additionalEmails: string[];
    aliases: string[];
    organization: string | null;
    role: string | null;
    companyDescription: string | null;
    relationshipType: string | null;
    communicationTone: string | null;
    linkedinUrl: string | null;
    linkedinHeadline: string | null;
    linkedinSummary: string | null;
    powerLevel: string;        // LOW, MEDIUM, HIGH
    influenceRole: string;     // DECISION_MAKER, INFLUENCER, etc.
    interactionCount: number;
    enrichedAt: Date | null;
    enrichmentSource: string | null;
    updatedAt: Date;
}

interface MergeResult {
    /** The profile ID to keep as primary */
    primaryId: string;
    /** Fields to update on the primary profile */
    updates: Record<string, any>;
    /** All emails (primary email stays, rest go to additionalEmails) */
    additionalEmails: string[];
    /** All known name variations */
    aliases: string[];
    /** Combined interaction count */
    interactionCount: number;
}

const POWER_RANK: Record<string, number> = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2 };
const INFLUENCE_RANK: Record<string, number> = { 'UNKNOWN': 0, 'END_USER': 1, 'GATEKEEPER': 2, 'INFLUENCER': 3, 'DECISION_MAKER': 4 };
const SOURCE_RANK: Record<string, number> = { 'calendar_inferred': 0, 'llm_inference': 1, 'web_search': 2, 'manual': 3 };

/**
 * Determine which profile should be primary (the one we keep).
 *
 * Priority:
 * 1. Has enrichment data (enrichedAt not null)
 * 2. Has more interaction count
 * 3. Has a corporate email (not gmail/yahoo)
 * 4. Was updated more recently
 */
export function choosePrimary(a: MergeableProfile, b: MergeableProfile): { primary: MergeableProfile; secondary: MergeableProfile } {
    let score = 0;

    // Enrichment data
    if (a.enrichedAt && !b.enrichedAt) score += 10;
    if (b.enrichedAt && !a.enrichedAt) score -= 10;

    // LinkedIn data
    if (a.linkedinUrl && !b.linkedinUrl) score += 5;
    if (b.linkedinUrl && !a.linkedinUrl) score -= 5;

    // Interaction count
    if (a.interactionCount > b.interactionCount) score += 3;
    if (b.interactionCount > a.interactionCount) score -= 3;

    // Corporate email preferred
    const aPersonal = isPersonalEmail(a.email);
    const bPersonal = isPersonalEmail(b.email);
    if (!aPersonal && bPersonal) score += 4;
    if (aPersonal && !bPersonal) score -= 4;

    // More recent update
    if (a.updatedAt > b.updatedAt) score += 1;
    if (b.updatedAt > a.updatedAt) score -= 1;

    return score >= 0
        ? { primary: a, secondary: b }
        : { primary: b, secondary: a };
}

/**
 * Compute the merged field values using survivorship rules.
 */
export function computeMerge(primary: MergeableProfile, secondary: MergeableProfile): MergeResult {
    const updates: Record<string, any> = {};

    // ── Name: longest (most complete) ──
    const bestName = pickLongest(primary.name, secondary.name);
    if (bestName !== primary.name) {
        updates.name = bestName;
    }

    // ── Organization: source priority, then longest ──
    updates.organization = pickBySourceThenLongest(
        primary.organization, primary.enrichmentSource,
        secondary.organization, secondary.enrichmentSource
    );

    // ── Role: source priority, then recency ──
    updates.role = pickBySourceThenRecent(
        primary.role, primary.enrichmentSource, primary.updatedAt,
        secondary.role, secondary.enrichmentSource, secondary.updatedAt
    );

    // ── Company description: prefer non-null, then source priority ──
    updates.companyDescription = pickBySourceThenLongest(
        primary.companyDescription, primary.enrichmentSource,
        secondary.companyDescription, secondary.enrichmentSource
    );

    // ── LinkedIn: prefer non-null ──
    updates.linkedinUrl = primary.linkedinUrl || secondary.linkedinUrl;
    updates.linkedinHeadline = primary.linkedinHeadline || secondary.linkedinHeadline;
    updates.linkedinSummary = pickLongest(primary.linkedinSummary, secondary.linkedinSummary);

    // ── Relationship type: prefer non-null, non-unknown ──
    updates.relationshipType = pickNonDefault(primary.relationshipType, secondary.relationshipType, 'unknown');

    // ── Communication tone: prefer non-null ──
    updates.communicationTone = primary.communicationTone || secondary.communicationTone;

    // ── Power level: highest ──
    updates.powerLevel = pickHighest(primary.powerLevel, secondary.powerLevel, POWER_RANK);

    // ── Influence role: highest ──
    updates.influenceRole = pickHighest(primary.influenceRole, secondary.influenceRole, INFLUENCE_RANK);

    // ── Enrichment: most recent ──
    if (secondary.enrichedAt && (!primary.enrichedAt || secondary.enrichedAt > primary.enrichedAt)) {
        updates.enrichedAt = secondary.enrichedAt;
        updates.enrichmentSource = secondary.enrichmentSource;
    }

    // ── Emails: array (keep all unique) ──
    const allEmails = new Set<string>();
    if (primary.email) allEmails.add(primary.email.toLowerCase());
    if (secondary.email) allEmails.add(secondary.email.toLowerCase());
    for (const e of primary.additionalEmails) allEmails.add(e.toLowerCase());
    for (const e of secondary.additionalEmails) allEmails.add(e.toLowerCase());
    const primaryEmail = primary.email?.toLowerCase();
    const additionalEmails = Array.from(allEmails).filter(e => e !== primaryEmail);

    // ── Aliases: array (keep all unique) ──
    const allAliases = new Set<string>();
    allAliases.add(primary.name);
    allAliases.add(secondary.name);
    for (const a of primary.aliases) allAliases.add(a);
    for (const a of secondary.aliases) allAliases.add(a);
    // Don't include the primary name in aliases
    const finalName = updates.name || primary.name;
    allAliases.delete(finalName);

    // Remove null/undefined from updates
    for (const key of Object.keys(updates)) {
        if (updates[key] === undefined) delete updates[key];
    }

    return {
        primaryId: primary.id,
        updates,
        additionalEmails,
        aliases: Array.from(allAliases),
        interactionCount: primary.interactionCount + secondary.interactionCount,
    };
}

// ════════════════════════════════════════════════════════
// SURVIVORSHIP STRATEGIES
// ════════════════════════════════════════════════════════

function pickLongest(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a.length >= b.length ? a : b;
}

function pickHighest(a: string, b: string, rank: Record<string, number>): string {
    const aRank = rank[a] ?? -1;
    const bRank = rank[b] ?? -1;
    return aRank >= bRank ? a : b;
}

function pickNonDefault(a: string | null, b: string | null, defaultVal: string): string | null {
    if (a && a.toLowerCase() !== defaultVal) return a;
    if (b && b.toLowerCase() !== defaultVal) return b;
    return a || b;
}

function pickBySourceThenLongest(
    aVal: string | null, aSource: string | null,
    bVal: string | null, bSource: string | null,
): string | null {
    if (!aVal) return bVal;
    if (!bVal) return aVal;
    const aRank = SOURCE_RANK[aSource || ''] ?? -1;
    const bRank = SOURCE_RANK[bSource || ''] ?? -1;
    if (aRank !== bRank) return aRank > bRank ? aVal : bVal;
    return aVal.length >= bVal.length ? aVal : bVal;
}

function pickBySourceThenRecent(
    aVal: string | null, aSource: string | null, aDate: Date,
    bVal: string | null, bSource: string | null, bDate: Date,
): string | null {
    if (!aVal) return bVal;
    if (!bVal) return aVal;
    const aRank = SOURCE_RANK[aSource || ''] ?? -1;
    const bRank = SOURCE_RANK[bSource || ''] ?? -1;
    if (aRank !== bRank) return aRank > bRank ? aVal : bVal;
    return aDate >= bDate ? aVal : bVal;
}

function isPersonalEmail(email: string | null): boolean {
    if (!email) return true; // no email = treat as personal
    const domain = email.split('@')[1]?.toLowerCase() || '';
    const PERSONAL = new Set([
        'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
        'icloud.com', 'protonmail.com', 'aol.com', 'live.com',
        'rediffmail.com', 'ymail.com', 'yahoo.in', 'yahoo.co.in',
    ]);
    return PERSONAL.has(domain);
}
