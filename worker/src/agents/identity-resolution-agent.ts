/**
 * Identity Resolution Agent — Layered Approach
 *
 * Detects probable duplicate stakeholder profiles using cascading layers,
 * each adding confidence signals. Only ambiguous cases escalate to more
 * expensive layers.
 *
 * Layer 0: Profile classification (filter non-persons)
 * Layer 1: Structural signals (Jaro-Winkler, prefix, initials, email cross-ref)
 * Layer 2: Behavioral signals (meeting patterns, network overlap)
 * Layer 3: External enrichment (LinkedIn URL match)
 * Layer 4: LLM adjudication (targeted, with pre-computed evidence)
 * Layer 5: User confirmation (interactive choice cards)
 *
 * Feedback loop: past user decisions (confirmed/denied) boost/penalize
 * similar patterns in future runs.
 */

import { prisma } from '../lib/prisma';
import { publishMessage } from '../lib/pusher';
import { backgroundGenerateText } from '../lib/background-llm';
import { classifyProfile, filterToPersons } from '../lib/identity/profile-classifier';
import { computeStructuralSignals, totalScore as structuralTotal } from '../lib/identity/structural-signals';
import { buildMeetingIndex, computeBehavioralSignals } from '../lib/identity/behavioral-signals';
import { choosePrimary, computeMerge } from '../lib/identity/survivorship';
import type { StructuralSignal } from '../lib/identity/structural-signals';
import type { BehavioralSignal } from '../lib/identity/behavioral-signals';

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

interface DuplicateCandidate {
    profileA: { id: string; name: string; email: string | null };
    profileB: { id: string; name: string; email: string | null };
    score: number;       // 0-100 confidence they're the same person
    signals: string[];   // human-readable reasons
    layer: number;       // which layer produced this candidate
}

interface ProfileRecord {
    id: string;
    name: string;
    email: string | null;
    organization: string | null;
    interactionCount: number;
    linkedinUrl: string | null;
    [key: string]: any; // allow additional Prisma fields
}

// ════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ════════════════════════════════════════════════════════════════

/**
 * Main entry point: detect and prompt for duplicate resolution.
 */
export async function resolveIdentities(userId: string): Promise<{ candidates: number; prompted: number }> {
    console.log(`[IdentityResolution] Starting for user ${userId.substring(0, 8)}...`);

    // Get all active profiles
    const profiles = await prisma.stakeholderProfile.findMany({
        where: { userId, mergedIntoId: null },
        select: {
            id: true,
            name: true,
            email: true,
            additionalEmails: true,
            aliases: true,
            organization: true,
            interactionCount: true,
            linkedinUrl: true,
        },
    });

    // ── Layer 0: Profile classification ──────────────────────────
    const realProfiles = filterToPersons(profiles);
    const filtered = profiles.length - realProfiles.length;
    if (filtered > 0) {
        console.log(`[IdentityResolution] Layer 0: filtered ${filtered} non-person profiles`);
    }

    if (realProfiles.length < 2) {
        console.log('[IdentityResolution] Fewer than 2 real profiles, skipping');
        return { candidates: 0, prompted: 0 };
    }

    // Load meeting data for behavioral signals
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId },
        select: { participants: true, title: true },
        orderBy: { startTime: 'desc' },
        take: 200,
    });
    const meetingIndex = buildMeetingIndex(meetings);

    // Load past user decisions for feedback loop
    const pastDecisions = await prisma.userCorrection.findMany({
        where: { userId, entityType: 'identity_resolution' },
        select: { entityId: true, userValue: true, context: true },
    });
    const resolvedPairs = new Map(pastDecisions.map(c => [c.entityId, c.userValue]));

    // ── Layers 1-3: Score all pairs ──────────────────────────────
    const candidates: DuplicateCandidate[] = [];
    const resolvedByLayer12: Set<string> = new Set(); // profile IDs already matched with high confidence

    // Layer 3 first: LinkedIn URL matching (definitive, free)
    const linkedinMatches = findLinkedInDuplicates(realProfiles);
    for (const match of linkedinMatches) {
        candidates.push(match);
        resolvedByLayer12.add(match.profileA.id);
        resolvedByLayer12.add(match.profileB.id);
    }
    if (linkedinMatches.length > 0) {
        console.log(`[IdentityResolution] Layer 3: ${linkedinMatches.length} LinkedIn URL matches`);
    }

    // Layers 1+2: Structural + Behavioral for all remaining pairs
    const unresolved = realProfiles.filter(p => !resolvedByLayer12.has(p.id));
    const layer12Candidates: DuplicateCandidate[] = [];

    for (let i = 0; i < unresolved.length; i++) {
        for (let j = i + 1; j < unresolved.length; j++) {
            const a = unresolved[i];
            const b = unresolved[j];

            // Layer 1: Structural signals
            const structural = computeStructuralSignals(a, b);

            // Layer 2: Behavioral signals
            const behavioral = computeBehavioralSignals(a.email, b.email, meetingIndex);

            // Combine scores
            const allSignals = [...structural, ...behavioral];
            const combinedScore = Math.max(0, Math.min(100,
                allSignals.reduce((sum, s) => sum + s.score, 0)
            ));

            // Apply feedback loop boost/penalty
            const feedbackAdjust = getFeedbackAdjustment(a, b, pastDecisions);
            const finalScore = Math.max(0, Math.min(100, combinedScore + feedbackAdjust));

            if (finalScore >= 35) {
                layer12Candidates.push({
                    profileA: { id: a.id, name: a.name, email: a.email },
                    profileB: { id: b.id, name: b.name, email: b.email },
                    score: finalScore,
                    signals: allSignals.map(s => s.detail),
                    layer: finalScore >= 70 ? 1 : 2,
                });
            }
        }
    }

    // High-confidence Layer 1-2 pairs go directly to candidates
    const highConfidence = layer12Candidates.filter(c => c.score >= 70);
    const ambiguous = layer12Candidates.filter(c => c.score >= 35 && c.score < 70);

    candidates.push(...highConfidence);
    if (highConfidence.length > 0) {
        console.log(`[IdentityResolution] Layers 1-2: ${highConfidence.length} high-confidence, ${ambiguous.length} ambiguous`);
    }

    // ── Layer 4: LLM adjudication (only for ambiguous pairs) ─────
    if (ambiguous.length > 0) {
        const llmResolved = await llmAdjudicate(ambiguous, meetingIndex);
        candidates.push(...llmResolved);
        console.log(`[IdentityResolution] Layer 4: LLM confirmed ${llmResolved.length} of ${ambiguous.length} ambiguous pairs`);
    }

    // Sort by confidence
    candidates.sort((a, b) => b.score - a.score);
    console.log(`[IdentityResolution] Total: ${candidates.length} probable duplicates`);

    // ── Layer 5: User confirmation ───────────────────────────────
    const toAsk: Array<{ candidate: DuplicateCandidate; pairKey: string }> = [];
    for (const candidate of candidates.slice(0, 15)) {
        const pairKey = [candidate.profileA.id, candidate.profileB.id].sort().join('|');
        const previousDecision = resolvedPairs.get(pairKey);

        // Never re-prompt confirmed or denied pairs
        if (previousDecision === 'confirmed' || previousDecision === 'denied') continue;
        // Re-prompt skipped pairs only with strong new evidence (e.g. LinkedIn match)
        if (previousDecision === 'skipped' && candidate.score < 90) continue;
        // Skip pairs still pending user response
        if (previousDecision === 'pending') continue;

        toAsk.push({ candidate, pairKey });
        if (toAsk.length >= 10) break;
    }

    if (toAsk.length > 0) {
        await promptUserBatch(userId, toAsk);
        console.log(`[IdentityResolution] Layer 5: prompted user about ${toAsk.length} potential duplicates`);
    }

    return { candidates: candidates.length, prompted: toAsk.length };
}

// ════════════════════════════════════════════════════════════════
// LAYER 3: LINKEDIN URL MATCHING
// ════════════════════════════════════════════════════════════════

/**
 * Normalize a LinkedIn URL to a canonical form for comparison.
 */
function normalizeLinkedInUrl(url: string): string | null {
    if (!url) return null;
    try {
        let cleaned = url.trim().toLowerCase();
        if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
        const parsed = new URL(cleaned);
        if (!parsed.hostname.includes('linkedin.com')) return null;

        let path = parsed.pathname.replace(/\/+$/, '');
        path = path.replace(/^\/pub\//, '/in/');
        path = path.replace(/^\/in\/[a-z]{2}\//, '/in/');

        return 'linkedin.com' + path;
    } catch {
        return null;
    }
}

/**
 * Find profiles sharing the same LinkedIn URL — definitive duplicates.
 */
function findLinkedInDuplicates(profiles: ProfileRecord[]): DuplicateCandidate[] {
    const urlToProfiles = new Map<string, ProfileRecord[]>();

    for (const p of profiles) {
        const normalized = normalizeLinkedInUrl(p.linkedinUrl || '');
        if (!normalized) continue;

        const existing = urlToProfiles.get(normalized);
        if (existing) {
            existing.push(p);
        } else {
            urlToProfiles.set(normalized, [p]);
        }
    }

    const results: DuplicateCandidate[] = [];
    for (const [url, group] of Array.from(urlToProfiles.entries())) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                results.push({
                    profileA: { id: group[i].id, name: group[i].name, email: group[i].email },
                    profileB: { id: group[j].id, name: group[j].name, email: group[j].email },
                    score: 95,
                    signals: [`Same LinkedIn profile: ${url}`],
                    layer: 3,
                });
            }
        }
    }

    return results;
}

// ════════════════════════════════════════════════════════════════
// LAYER 4: LLM ADJUDICATION
// ════════════════════════════════════════════════════════════════

/**
 * Send ambiguous pairs to LLM with pre-computed evidence.
 * Returns only pairs the LLM confirms as duplicates.
 */
async function llmAdjudicate(
    ambiguous: DuplicateCandidate[],
    meetingIndex: ReturnType<typeof buildMeetingIndex>,
): Promise<DuplicateCandidate[]> {
    // Build evidence summary for LLM — structured, not raw profiles
    const pairSummaries = ambiguous.slice(0, 8).map((c, i) => {
        const forSignals = c.signals.filter(s => !s.includes('different people'));
        const againstSignals = c.signals.filter(s => s.includes('different people'));
        return `Pair ${i + 1}: "${c.profileA.name}" (${c.profileA.email || 'no email'}) ↔ "${c.profileB.name}" (${c.profileB.email || 'no email'})
  Evidence FOR (score ${c.score}): ${forSignals.join('; ') || 'none'}
  Evidence AGAINST: ${againstSignals.join('; ') || 'none'}`;
    }).join('\n\n');

    try {
        const prompt = `You are resolving contact identities. These pairs have mixed signals — some evidence they're the same person, some against.

${pairSummaries}

For each pair, decide: are they the same person?
Return ONLY a JSON array of pair numbers you believe ARE the same person (>60% confidence):
[1, 3, 5]

Return empty array [] if none are duplicates. Return ONLY the JSON array, nothing else.`;

        const raw = await backgroundGenerateText(prompt, { temperature: 0.1, maxOutputTokens: 500 });
        const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const confirmed: number[] = JSON.parse(jsonStr);

        if (!Array.isArray(confirmed)) return [];

        return confirmed
            .filter(n => typeof n === 'number' && n >= 1 && n <= ambiguous.length)
            .map(n => ({
                ...ambiguous[n - 1],
                score: 75, // LLM-confirmed ambiguous pair
                layer: 4,
                signals: [...ambiguous[n - 1].signals, 'LLM confirmed as same person'],
            }));
    } catch (err: any) {
        console.error(`[IdentityResolution] Layer 4 LLM failed: ${err.message}`);
        // On LLM failure, promote pairs that were close to threshold
        return ambiguous
            .filter(c => c.score >= 55)
            .map(c => ({ ...c, layer: 4, signals: [...c.signals, 'LLM unavailable — promoted by score'] }));
    }
}

// ════════════════════════════════════════════════════════════════
// FEEDBACK LOOP
// ════════════════════════════════════════════════════════════════

/**
 * Adjust scoring based on past user decisions.
 *
 * If users have confirmed pairs from the same org/domain combo before,
 * boost similar pairs. If they've denied them, penalize.
 */
function getFeedbackAdjustment(
    a: ProfileRecord,
    b: ProfileRecord,
    pastDecisions: Array<{ entityId: string; userValue: string; context: any }>,
): number {
    if (pastDecisions.length === 0) return 0;

    let adjust = 0;
    const aDomain = a.email?.split('@')[1]?.toLowerCase();
    const bDomain = b.email?.split('@')[1]?.toLowerCase();

    // Check if there are past decisions for similar domain pairs
    for (const decision of pastDecisions) {
        const ctx = decision.context as any;
        if (!ctx?.profileAName || !ctx?.profileBName) continue;

        // Check if this decision involved the same domain combination
        // (e.g., "people at coss.org.in often have personal gmail too")
        const pastPairEmails = [ctx.profileAEmail, ctx.profileBEmail].filter(Boolean);
        const pastDomains = pastPairEmails.map((e: string) => e.split('@')[1]?.toLowerCase()).filter(Boolean);

        const domainOverlap = pastDomains.some((d: string) => d === aDomain || d === bDomain);
        if (!domainOverlap) continue;

        if (decision.userValue === 'confirmed') {
            adjust += 5; // Small boost — similar patterns were confirmed before
        } else if (decision.userValue === 'denied') {
            adjust -= 5; // Small penalty — similar patterns were denied before
        }
    }

    // Cap adjustment to prevent feedback from overwhelming actual signals
    return Math.max(-15, Math.min(15, adjust));
}

// ════════════════════════════════════════════════════════════════
// LAYER 5: USER CONFIRMATION
// ════════════════════════════════════════════════════════════════

/**
 * Send interactive choice cards for duplicate candidates.
 */
async function promptUserBatch(
    userId: string,
    pairs: Array<{ candidate: DuplicateCandidate; pairKey: string }>
): Promise<void> {
    const items = pairs.map(({ candidate, pairKey }) => ({
        id: pairKey,
        title: `${candidate.profileA.name}${candidate.profileA.email ? ` (${candidate.profileA.email})` : ''}  ↔  ${candidate.profileB.name}${candidate.profileB.email ? ` (${candidate.profileB.email})` : ''}`,
        subtitle: candidate.signals[0] || undefined,
        options: [
            { label: 'Same person', value: 'same' },
            { label: 'Different people', value: 'different' },
            { label: 'Skip', value: 'skip' },
        ],
        defaultValue: 'same',
    }));

    const interactivePayload = {
        blocks: [{
            type: 'choice_cards' as const,
            actionId: 'identity_resolve',
            items,
        }],
    };

    const textContent = `I found some people who might be using multiple email addresses. Can you help me sort these out?`;
    const fullContent = `${textContent}\n\n<!--interactive:${JSON.stringify(interactivePayload)}-->`;

    const saved = await prisma.message.create({
        data: {
            userId,
            role: 'assistant',
            content: fullContent,
            type: 'PROACTIVE_NUDGE',
        },
    });

    await publishMessage(userId, {
        id: saved.id,
        role: 'assistant',
        content: fullContent,
        createdAt: saved.createdAt,
    });

    // Record each pair as asked (with signal context for feedback loop)
    for (const { candidate, pairKey } of pairs) {
        await prisma.userCorrection.create({
            data: {
                userId,
                entityType: 'identity_resolution',
                entityId: pairKey,
                field: 'duplicate_check',
                aiValue: `layer_${candidate.layer}_score_${candidate.score}`,
                userValue: 'pending',
                context: {
                    profileAId: candidate.profileA.id,
                    profileBId: candidate.profileB.id,
                    profileAName: candidate.profileA.name,
                    profileBName: candidate.profileB.name,
                    profileAEmail: candidate.profileA.email,
                    profileBEmail: candidate.profileB.email,
                    score: candidate.score,
                    layer: candidate.layer,
                    signals: candidate.signals,
                },
            },
        });
    }
}

// ════════════════════════════════════════════════════════════════
// MERGE WITH SURVIVORSHIP
// ════════════════════════════════════════════════════════════════

/**
 * Merge two profiles using golden-record survivorship rules.
 * Picks the best value per field instead of just concatenating.
 */
export async function mergeProfiles(userId: string, primaryId: string, duplicateId: string): Promise<void> {
    const MERGE_FIELDS = {
        id: true,
        name: true,
        email: true,
        additionalEmails: true,
        aliases: true,
        organization: true,
        role: true,
        companyDescription: true,
        relationshipType: true,
        communicationTone: true,
        linkedinUrl: true,
        linkedinHeadline: true,
        linkedinSummary: true,
        powerLevel: true,
        influenceRole: true,
        interactionCount: true,
        enrichedAt: true,
        enrichmentSource: true,
        updatedAt: true,
    };

    const [a, b] = await Promise.all([
        prisma.stakeholderProfile.findUnique({ where: { id: primaryId }, select: MERGE_FIELDS }),
        prisma.stakeholderProfile.findUnique({ where: { id: duplicateId }, select: MERGE_FIELDS }),
    ]);

    if (!a || !b) {
        console.log(`[IdentityResolution] Cannot merge — profile not found`);
        return;
    }

    // Survivorship: choose primary and compute merged values
    const { primary, secondary } = choosePrimary(a as any, b as any);
    const merge = computeMerge(primary as any, secondary as any);

    // Apply merged values to the primary profile
    await prisma.stakeholderProfile.update({
        where: { id: merge.primaryId },
        data: {
            ...merge.updates,
            additionalEmails: merge.additionalEmails,
            aliases: merge.aliases,
            interactionCount: merge.interactionCount,
        },
    });

    // Mark the other profile as merged
    const secondaryId = merge.primaryId === primaryId ? duplicateId : primaryId;
    await prisma.stakeholderProfile.update({
        where: { id: secondaryId },
        data: { mergedIntoId: merge.primaryId },
    });

    console.log(`[IdentityResolution] Merged "${secondary.name}" into "${primary.name}" (survivorship: ${Object.keys(merge.updates).join(', ')})`);
}
