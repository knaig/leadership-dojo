/**
 * Correction Learning Service
 *
 * Generic capability: any agent can record user corrections and query
 * past corrections to improve future predictions.
 *
 * Flow:
 * 1. Agent makes a prediction (classification, suggestion, etc.)
 * 2. User overrides it
 * 3. recordCorrection() stores the AI value, user value, and context
 * 4. Next time, agent calls getPastCorrections() before predicting
 * 5. If a matching pattern exists, the agent adjusts its prediction
 * 6. Agent tells the user: "Based on your past feedback, I'm classifying this as X"
 */

import { prisma } from './prisma';

export interface CorrectionInput {
    userId: string;
    entityType: string;     // "meeting_classification", "stakeholder_archetype", "outcome_suggestion", etc.
    entityId?: string;      // ID of the specific entity being corrected
    field: string;          // "meetingCategory", "importance", "personaArchetype", etc.
    aiValue: string | null; // What the AI predicted
    userValue: string;      // What the user chose instead
    context?: Record<string, any>; // Signals for future matching (title, keywords, attendeeCount, etc.)
}

export interface LearnedCorrection {
    id: string;
    field: string;
    aiValue: string | null;
    userValue: string;
    context: Record<string, any> | null;
    createdAt: Date;
    matchReason?: string;   // Why this correction was deemed relevant
}

/**
 * Record a user correction. Called whenever the user overrides an AI prediction.
 */
export async function recordCorrection(input: CorrectionInput): Promise<void> {
    // Don't record if AI and user values are the same
    if (input.aiValue === input.userValue) return;

    try {
        await prisma.userCorrection.create({
            data: {
                userId: input.userId,
                entityType: input.entityType,
                entityId: input.entityId,
                field: input.field,
                aiValue: input.aiValue,
                userValue: input.userValue,
                context: input.context || undefined,
            },
        });
        console.log(`[CorrectionLearning] Recorded: ${input.entityType}.${input.field} "${input.aiValue}" → "${input.userValue}"`);
    } catch (err: any) {
        console.warn(`[CorrectionLearning] Failed to record correction: ${err.message}`);
    }
}

/**
 * Query past corrections that match a given context.
 *
 * Used by agents before making predictions. Returns corrections that are
 * likely relevant based on entity type, field, and context similarity.
 *
 * @param userId - The user whose corrections to query
 * @param entityType - Type of entity being predicted (e.g., "meeting_classification")
 * @param field - Field being predicted (e.g., "meetingCategory")
 * @param context - Current context to match against (e.g., { title, attendeeCount, isRecurring })
 * @returns Matching corrections, most recent first
 */
export async function getPastCorrections(
    userId: string,
    entityType: string,
    field: string,
    context?: Record<string, any>
): Promise<LearnedCorrection[]> {
    try {
        const corrections = await prisma.userCorrection.findMany({
            where: {
                userId,
                entityType,
                field,
            },
            orderBy: { createdAt: 'desc' },
            take: 50, // Cap to avoid loading too many
        });

        if (!context || corrections.length === 0) {
            return corrections.map(c => ({
                id: c.id,
                field: c.field,
                aiValue: c.aiValue,
                userValue: c.userValue,
                context: c.context as Record<string, any> | null,
                createdAt: c.createdAt,
            }));
        }

        // Score each correction by context similarity
        const scored = corrections.map(c => {
            const cCtx = c.context as Record<string, any> | null;
            let score = 0;
            let reason = '';

            if (!cCtx) return { correction: c, score: 0, reason: 'no context' };

            // Exact title match (strongest signal)
            if (context.title && cCtx.title && normalize(context.title) === normalize(cCtx.title)) {
                score += 10;
                reason = 'same meeting title';
            }
            // Title keyword overlap
            else if (context.title && cCtx.title) {
                const overlap = keywordOverlap(context.title, cCtx.title);
                if (overlap >= 0.5) {
                    score += 5;
                    reason = 'similar title';
                }
            }

            // Same recurring series
            if (context.recurringId && cCtx.recurringId && context.recurringId === cCtx.recurringId) {
                score += 8;
                reason = reason ? `${reason}, same series` : 'same recurring series';
            }

            // Same attendee count range
            if (context.attendeeCount && cCtx.attendeeCount) {
                const diff = Math.abs(context.attendeeCount - cCtx.attendeeCount);
                if (diff <= 2) score += 2;
            }

            // Same name (for stakeholder corrections)
            if (context.name && cCtx.name && normalize(context.name) === normalize(cCtx.name)) {
                score += 10;
                reason = 'same person';
            }

            // Same organization
            if (context.organization && cCtx.organization && normalize(context.organization) === normalize(cCtx.organization)) {
                score += 3;
                reason = reason ? `${reason}, same org` : 'same organization';
            }

            return { correction: c, score, reason };
        });

        // Only return corrections with score > 0 (contextually relevant)
        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map(s => ({
                id: s.correction.id,
                field: s.correction.field,
                aiValue: s.correction.aiValue,
                userValue: s.correction.userValue,
                context: s.correction.context as Record<string, any> | null,
                createdAt: s.correction.createdAt,
                matchReason: s.reason,
            }));
    } catch (err: any) {
        console.warn(`[CorrectionLearning] Failed to query corrections: ${err.message}`);
        return [];
    }
}

/**
 * Mark that a past correction was applied to a new prediction.
 * Lets us track how often the system successfully learns.
 */
export async function markCorrectionApplied(correctionId: string): Promise<void> {
    try {
        await prisma.userCorrection.update({
            where: { id: correctionId },
            data: { appliedAt: new Date() },
        });
    } catch (err: any) {
        console.warn(`[CorrectionLearning] Failed to mark applied: ${err.message}`);
    }
}

/**
 * Get a summary of what the system has learned for a user.
 * Used to tell the user "I've learned X from your corrections."
 */
export async function getLearningStats(userId: string): Promise<{
    totalCorrections: number;
    correctionsApplied: number;
    topPatterns: { field: string; fromTo: string; count: number }[];
}> {
    try {
        const all = await prisma.userCorrection.findMany({
            where: { userId },
            select: { field: true, aiValue: true, userValue: true, appliedAt: true },
        });

        const applied = all.filter(c => c.appliedAt !== null);

        // Find repeated patterns (same field, same ai→user correction)
        const patterns = new Map<string, number>();
        for (const c of all) {
            const key = `${c.field}:${c.aiValue}→${c.userValue}`;
            patterns.set(key, (patterns.get(key) || 0) + 1);
        }

        const topPatterns = Array.from(patterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, count]) => {
                const [field, fromTo] = key.split(':');
                return { field, fromTo, count };
            });

        return {
            totalCorrections: all.length,
            correctionsApplied: applied.length,
            topPatterns,
        };
    } catch (err: any) {
        console.warn(`[CorrectionLearning] Failed to get stats: ${err.message}`);
        return { totalCorrections: 0, correctionsApplied: 0, topPatterns: [] };
    }
}

// --- Utilities ---

function normalize(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function keywordOverlap(a: string, b: string): number {
    const aWords = new Set(normalize(a).split(/\s+/).filter(w => w.length > 2));
    const bWords = new Set(normalize(b).split(/\s+/).filter(w => w.length > 2));
    if (aWords.size === 0 || bWords.size === 0) return 0;
    let overlap = 0;
    for (const w of aWords) {
        if (bWords.has(w)) overlap++;
    }
    return overlap / Math.min(aWords.size, bWords.size);
}
