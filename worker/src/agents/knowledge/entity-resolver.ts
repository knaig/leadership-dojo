/**
 * Entity Resolver
 *
 * Handles deduplication, normalization, and find-or-create for KnowledgeEntity.
 * Ensures that "John Smith", "john smith", and "John  Smith" all resolve to the same entity.
 */

import { prisma } from '../../lib/prisma';
import { KnowledgeEntityType } from '@prisma/client';

interface ResolveEntityInput {
    userId: string;
    type: KnowledgeEntityType;
    name: string;
    properties?: Record<string, any>;
    sourceModelType?: string;
    sourceModelId?: string;
}

/**
 * Normalize entity name for dedup:
 * - lowercase
 * - collapse whitespace
 * - trim
 */
export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find or create a KnowledgeEntity.
 * Uses atomic upsert on (userId, type, nameNormalized) unique constraint.
 * Safe for concurrent calls — no P2002 race condition.
 */
export async function resolveEntity(input: ResolveEntityInput): Promise<string> {
    const { userId, type, name, properties = {}, sourceModelType, sourceModelId } = input;
    const nameNormalized = normalizeName(name);

    if (!nameNormalized) {
        throw new Error('Entity name cannot be empty');
    }

    // Atomic upsert — handles concurrent entity creation safely
    const entity = await prisma.knowledgeEntity.upsert({
        where: {
            userId_type_nameNormalized: { userId, type, nameNormalized }
        },
        create: {
            userId,
            type,
            name,
            nameNormalized,
            properties,
            sourceModelType,
            sourceModelId,
        },
        update: {
            // Merge properties on update (can't deep-merge in Prisma, so we read+merge below)
            updatedAt: new Date(),
        },
    });

    // Post-upsert: merge properties and update name/sourceModel if needed
    // Only needed on update path (entity already existed)
    const existingProps = (entity.properties as Record<string, any>) || {};
    const hasNewProps = Object.keys(properties).length > 0;
    const needsNameUpdate = name.length > entity.name.length ||
        (name !== entity.name && name[0] === name[0]?.toUpperCase());
    const needsSourceUpdate = sourceModelType && sourceModelId && !entity.sourceModelType;

    if (hasNewProps || needsNameUpdate || needsSourceUpdate) {
        const updateData: any = {};

        if (hasNewProps) {
            updateData.properties = { ...existingProps, ...properties };
        }
        if (needsNameUpdate) {
            updateData.name = name;
        }
        if (needsSourceUpdate) {
            updateData.sourceModelType = sourceModelType;
            updateData.sourceModelId = sourceModelId;
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.knowledgeEntity.update({
                where: { id: entity.id },
                data: updateData,
            });
        }
    }

    // Check for similar entities (fuzzy match) — non-blocking
    checkForSimilarEntities(userId, entity.id, type, nameNormalized).catch(() => {});

    return entity.id;
}

/**
 * Resolve multiple entities in batch. Returns map of "type:normalizedName" -> entityId.
 */
export async function resolveEntities(
    userId: string,
    entities: Array<{ type: KnowledgeEntityType; name: string; properties?: Record<string, any> }>
): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (const entity of entities) {
        const key = `${entity.type}:${normalizeName(entity.name)}`;
        if (result.has(key)) continue; // skip duplicates within batch

        const id = await resolveEntity({ userId, ...entity });
        result.set(key, id);
    }

    return result;
}

/**
 * Compute string similarity using bigram overlap (Dice coefficient).
 * Returns 0-1 where 1 is identical.
 */
function bigramSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = new Set<string>();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

    const bigramsB = new Set<string>();
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

    let intersection = 0;
    for (const bg of bigramsA) {
        if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Find entities with similar names (fuzzy matching).
 * Used to detect potential duplicates like "I4Inclusion" vs "AI4Inclusion".
 * Creates EntityMergeCandidate records for user review.
 */
export async function checkForSimilarEntities(
    userId: string,
    entityId: string,
    type: KnowledgeEntityType,
    nameNormalized: string,
): Promise<void> {
    // Skip short names (too many false positives)
    if (nameNormalized.length < 4) return;

    // Get all entities of the same type for this user
    const candidates = await prisma.knowledgeEntity.findMany({
        where: { userId, type, id: { not: entityId } },
        select: { id: true, nameNormalized: true },
    });

    for (const candidate of candidates) {
        const similarity = bigramSimilarity(nameNormalized, candidate.nameNormalized);

        // Threshold: 0.7 for short names, 0.75 for longer names
        const threshold = nameNormalized.length < 8 ? 0.7 : 0.75;

        if (similarity >= threshold && similarity < 1.0) {
            // Create merge candidate (ignore if already exists)
            await prisma.entityMergeCandidate.upsert({
                where: {
                    sourceEntityId_targetEntityId: {
                        sourceEntityId: entityId,
                        targetEntityId: candidate.id,
                    },
                },
                create: {
                    userId,
                    sourceEntityId: entityId,
                    targetEntityId: candidate.id,
                    similarity,
                },
                update: { similarity },
            }).catch(() => {
                // Also check reverse direction
                return prisma.entityMergeCandidate.upsert({
                    where: {
                        sourceEntityId_targetEntityId: {
                            sourceEntityId: candidate.id,
                            targetEntityId: entityId,
                        },
                    },
                    create: {
                        userId,
                        sourceEntityId: candidate.id,
                        targetEntityId: entityId,
                        similarity,
                    },
                    update: { similarity },
                }).catch(() => {});
            });
            console.log(`[EntityResolver] Fuzzy match: "${nameNormalized}" ↔ "${candidate.nameNormalized}" (${(similarity * 100).toFixed(0)}%)`);
        }
    }
}

/**
 * Find an entity by exact normalized name match.
 */
export async function findEntity(
    userId: string,
    type: KnowledgeEntityType,
    name: string
): Promise<string | null> {
    const entity = await prisma.knowledgeEntity.findUnique({
        where: {
            userId_type_nameNormalized: {
                userId,
                type,
                nameNormalized: normalizeName(name)
            }
        },
        select: { id: true }
    });
    return entity?.id ?? null;
}

/**
 * Extract a clean person name from an email address or name field.
 * "john.smith@company.com" -> "John Smith"
 * "John Smith <john@co.com>" -> "John Smith"
 */
export function cleanPersonName(input: string): string {
    // Strip email angle bracket format: "Name <email>"
    const angleMatch = input.match(/^(.+?)\s*<[^>]+>$/);
    if (angleMatch) return angleMatch[1].trim();

    // If it looks like an email, extract name from local part
    if (input.includes('@')) {
        const localPart = input.split('@')[0];
        return localPart
            .replace(/[._-]/g, ' ')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    return input.trim();
}
