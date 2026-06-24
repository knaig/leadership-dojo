/**
 * Confidence Decay
 *
 * Daily cron at 01:00 UTC:
 * - Facts > 14 days old with no reinforcement: confidence x 0.9
 * - Facts > 30 days old: confidence x 0.7
 * - Commitments/decisions decay slower (x 0.95 / x 0.85) — they stay relevant longer
 * - Never decay USER_STATED facts
 * - Facts below 0.1 confidence get validTo = now() (retired)
 */

import { prisma } from '../../lib/prisma';

// Predicates that represent actionable commitments/decisions — decay slower
const SLOW_DECAY_PREDICATES = new Set([
    'committed_to', 'decided', 'has_action_item_from', 'objected_to',
    'approved', 'blocked', 'promised', 'action_item', 'decision_made',
]);

/**
 * Run confidence decay for a user's inferred facts.
 */
export async function runConfidenceDecay(userId: string): Promise<{ decayed: number; retired: number }> {
    console.log(`[ConfidenceDecay] Starting for user ${userId.substring(0, 8)}...`);

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let decayed = 0;
    let retired = 0;

    // Phase 1: Heavy decay for facts > 30 days old
    const veryOldFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            validTo: null,
            source: { not: 'USER_STATED' },
            recordedAt: { lt: thirtyDaysAgo },
            confidence: { gt: 0.1 },
        },
        select: { id: true, confidence: true, predicate: true },
        take: 1000,
    });

    const retireIds: string[] = [];
    const decayUpdates: { id: string; confidence: number }[] = [];

    for (const fact of veryOldFacts) {
        // Commitments/decisions decay slower — they're still actionable
        const rate = SLOW_DECAY_PREDICATES.has(fact.predicate) ? 0.85 : 0.7;
        const newConfidence = fact.confidence * rate;
        if (newConfidence < 0.1) {
            retireIds.push(fact.id);
        } else {
            decayUpdates.push({ id: fact.id, confidence: newConfidence });
        }
    }

    // Phase 2: Light decay for facts 14-30 days old
    const oldFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            validTo: null,
            source: { not: 'USER_STATED' },
            recordedAt: {
                lt: fourteenDaysAgo,
                gte: thirtyDaysAgo,
            },
            confidence: { gt: 0.1 },
        },
        select: { id: true, confidence: true, predicate: true },
        take: 1000,
    });

    for (const fact of oldFacts) {
        const rate = SLOW_DECAY_PREDICATES.has(fact.predicate) ? 0.95 : 0.9;
        const newConfidence = fact.confidence * rate;
        if (newConfidence < 0.1) {
            retireIds.push(fact.id);
        } else {
            decayUpdates.push({ id: fact.id, confidence: newConfidence });
        }
    }

    // Batch retire
    if (retireIds.length > 0) {
        await prisma.knowledgeFact.updateMany({
            where: { id: { in: retireIds } },
            data: { validTo: now, confidence: 0 },
        });
        retired = retireIds.length;
    }

    // Batch decay — group by similar confidence to reduce round trips
    // Individual updates needed since each has a different confidence value
    const BATCH_SIZE = 50;
    for (let i = 0; i < decayUpdates.length; i += BATCH_SIZE) {
        const batch = decayUpdates.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
            batch.map(u => prisma.knowledgeFact.update({
                where: { id: u.id },
                data: { confidence: u.confidence },
            }))
        );
    }
    decayed = decayUpdates.length;

    console.log(`[ConfidenceDecay] Done — ${decayed} facts decayed, ${retired} facts retired`);
    return { decayed, retired };
}

/**
 * Run confidence decay for all users.
 */
export async function runConfidenceDecayAllUsers(): Promise<void> {
    const users = await prisma.knowledgeFact.findMany({
        where: { validTo: null },
        select: { userId: true },
        distinct: ['userId'],
    });

    console.log(`[ConfidenceDecay] Running for ${users.length} users`);

    for (const { userId } of users) {
        try {
            await runConfidenceDecay(userId);
        } catch (err: any) {
            console.error(`[ConfidenceDecay] Error for user ${userId}: ${err.message}`);
        }
    }
}
