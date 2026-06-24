/**
 * Extraction Log
 *
 * Tracks which source records have been processed for fact extraction.
 * Prevents duplicate processing and supports extractor version upgrades.
 */

import { prisma } from '../../lib/prisma';

const CURRENT_EXTRACTOR_VERSION = 1;

/**
 * Check if a source record has already been processed by the current extractor version.
 */
export async function isAlreadyExtracted(
    userId: string,
    sourceType: string,
    sourceId: string,
    extractorVersion: number = CURRENT_EXTRACTOR_VERSION
): Promise<boolean> {
    const log = await prisma.extractionLog.findUnique({
        where: {
            userId_sourceType_sourceId_extractorVersion: {
                userId,
                sourceType,
                sourceId,
                extractorVersion,
            }
        }
    });
    return !!log;
}

/**
 * Record that a source was processed.
 */
export async function logExtraction(
    userId: string,
    sourceType: string,
    sourceId: string,
    entitiesFound: number,
    factsCreated: number,
    extractorVersion: number = CURRENT_EXTRACTOR_VERSION
): Promise<void> {
    await prisma.extractionLog.upsert({
        where: {
            userId_sourceType_sourceId_extractorVersion: {
                userId,
                sourceType,
                sourceId,
                extractorVersion,
            }
        },
        create: {
            userId,
            sourceType,
            sourceId,
            entitiesFound,
            factsCreated,
            extractorVersion,
            processedAt: new Date(),
        },
        update: {
            entitiesFound,
            factsCreated,
            processedAt: new Date(),
        },
    });
}

/**
 * Get source IDs that haven't been extracted yet for a given type.
 * Used to find unprocessed records efficiently.
 */
export async function getUnextractedIds(
    userId: string,
    sourceType: string,
    allSourceIds: string[],
    extractorVersion: number = CURRENT_EXTRACTOR_VERSION
): Promise<string[]> {
    if (allSourceIds.length === 0) return [];

    const extracted = await prisma.extractionLog.findMany({
        where: {
            userId,
            sourceType,
            sourceId: { in: allSourceIds },
            extractorVersion,
        },
        select: { sourceId: true },
    });

    const extractedSet = new Set(extracted.map(e => e.sourceId));
    return allSourceIds.filter(id => !extractedSet.has(id));
}
