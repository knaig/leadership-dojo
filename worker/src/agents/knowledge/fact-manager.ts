/**
 * Fact Manager
 *
 * Creates, reinforces, supersedes, and manages KnowledgeFacts.
 * Implements Mem0-style conflict resolution:
 *   1. No existing fact -> CREATE
 *   2. Same predicate, same value -> REINFORCE (bump confidence, update recordedAt)
 *   3. Same predicate, different value, newer source -> SUPERSEDE
 *   4. Same predicate, different value, lower confidence -> IGNORE
 *   5. User explicitly contradicts -> OVERRIDE (USER_STATED always wins)
 */

import { prisma } from '../../lib/prisma';
import { FactSource } from '@prisma/client';

export interface CreateFactInput {
    userId: string;
    subjectId: string;
    predicate: string;
    objectEntityId?: string;
    objectValue?: string;
    source: FactSource;
    sourceRefType?: string;
    sourceRefId?: string;
    confidence?: number;
    validFrom?: Date;
    metadata?: Record<string, any>;
    projectId?: string;
}

type FactAction = 'CREATED' | 'REINFORCED' | 'SUPERSEDED' | 'IGNORED' | 'OVERRIDDEN';

interface FactResult {
    factId: string;
    action: FactAction;
}

/**
 * Source confidence defaults — USER_STATED always highest.
 */
const SOURCE_CONFIDENCE: Record<FactSource, number> = {
    USER_STATED: 0.95,
    INFERRED_MEETING: 0.6,
    INFERRED_EMAIL: 0.55,
    INFERRED_DOCUMENT: 0.5,
    INFERRED_CHAT: 0.7,
    INFERRED_GITHUB: 0.65,
    SYSTEM_DERIVED: 0.4,
    MIGRATED: 0.5,
};

/**
 * Create or resolve a fact with Mem0-style conflict resolution.
 * Uses a Prisma transaction to prevent TOCTOU race conditions.
 */
export async function createFact(input: CreateFactInput): Promise<FactResult> {
    const {
        userId,
        subjectId,
        predicate,
        objectEntityId,
        objectValue,
        source,
        sourceRefType,
        sourceRefId,
        confidence = SOURCE_CONFIDENCE[source] ?? 0.5,
        validFrom = new Date(),
        metadata,
        projectId,
    } = input;

    return prisma.$transaction(async (tx) => {
        // Find existing current facts with same subject+predicate
        const existingFacts = await tx.knowledgeFact.findMany({
            where: {
                userId,
                subjectId,
                predicate,
                validTo: null, // only current facts
            },
            orderBy: { confidence: 'desc' },
        });

        // Determine the effective value for comparison
        const newValue = objectEntityId || objectValue || '';

        for (const existing of existingFacts) {
            const existingValue = existing.objectEntityId || existing.objectValue || '';

            if (existingValue === newValue) {
                // Case 2: REINFORCE — same value, bump confidence
                const reinforcedConfidence = Math.min(1.0, existing.confidence + 0.05);
                await tx.knowledgeFact.update({
                    where: { id: existing.id },
                    data: {
                        confidence: reinforcedConfidence,
                        recordedAt: new Date(),
                    },
                });
                return { factId: existing.id, action: 'REINFORCED' as FactAction };
            }

            // Different value — resolve conflict
            if (source === 'USER_STATED') {
                // Case 5: OVERRIDE — user always wins
                await tx.knowledgeFact.update({
                    where: { id: existing.id },
                    data: {
                        validTo: new Date(),
                        userVerified: false,
                    },
                });

                const newFact = await tx.knowledgeFact.create({
                    data: {
                        userId,
                        subjectId,
                        predicate,
                        objectEntityId: objectEntityId || undefined,
                        objectValue: objectValue || undefined,
                        source,
                        sourceRefType,
                        sourceRefId,
                        confidence: 1.0,
                        validFrom,
                        recordedAt: new Date(),
                        supersedesId: existing.id,
                        userVerified: true,
                        metadata: metadata || undefined,
                        projectId: projectId || undefined,
                    },
                });
                return { factId: newFact.id, action: 'OVERRIDDEN' as FactAction };
            }

            if (confidence > existing.confidence) {
                // Case 3: SUPERSEDE — new fact has higher confidence
                await tx.knowledgeFact.update({
                    where: { id: existing.id },
                    data: { validTo: new Date() },
                });

                const newFact = await tx.knowledgeFact.create({
                    data: {
                        userId,
                        subjectId,
                        predicate,
                        objectEntityId: objectEntityId || undefined,
                        objectValue: objectValue || undefined,
                        source,
                        sourceRefType,
                        sourceRefId,
                        confidence,
                        validFrom,
                        recordedAt: new Date(),
                        supersedesId: existing.id,
                        metadata: metadata || undefined,
                        projectId: projectId || undefined,
                    },
                });
                return { factId: newFact.id, action: 'SUPERSEDED' as FactAction };
            }

            // Case 4: IGNORE — existing has equal or higher confidence
            return { factId: existing.id, action: 'IGNORED' as FactAction };
        }

        // Case 1: CREATE — no existing fact with this subject+predicate
        const newFact = await tx.knowledgeFact.create({
            data: {
                userId,
                subjectId,
                predicate,
                objectEntityId: objectEntityId || undefined,
                objectValue: objectValue || undefined,
                source,
                sourceRefType,
                sourceRefId,
                confidence,
                validFrom,
                recordedAt: new Date(),
                metadata: metadata || undefined,
                projectId: projectId || undefined,
            },
        });

        return { factId: newFact.id, action: 'CREATED' as FactAction };
    });
}

/**
 * Create multiple facts in batch, returning results.
 */
export async function createFacts(inputs: CreateFactInput[]): Promise<FactResult[]> {
    const results: FactResult[] = [];
    for (const input of inputs) {
        const result = await createFact(input);
        results.push(result);
    }
    return results;
}

/**
 * Get all current (non-expired) facts for an entity.
 */
export async function getCurrentFacts(entityId: string, userId: string): Promise<any[]> {
    return prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: entityId,
            validTo: null,
        },
        include: {
            objectEntity: { select: { id: true, name: true, type: true } },
        },
        orderBy: { confidence: 'desc' },
    });
}

/**
 * Get fact history for an entity+predicate (including superseded facts).
 */
export async function getFactHistory(entityId: string, predicate: string, userId: string): Promise<any[]> {
    return prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: entityId,
            predicate,
        },
        include: {
            objectEntity: { select: { id: true, name: true, type: true } },
        },
        orderBy: { validFrom: 'desc' },
    });
}
