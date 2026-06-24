/**
 * GitHub Fact Extractor
 *
 * Extracts knowledge graph facts from GitHubSyncRecord:
 * - PERSON entities from PR authors and reviewers
 * - Facts: contributes_to, reviews_for, collaborates_with
 *
 * Mostly structured extraction (no LLM needed for basic facts).
 *
 * Trigger: pg-boss job `knowledge-extract-github` queued after github-sync
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity } from './entity-resolver';
import { createFact, CreateFactInput } from './fact-manager';
import { isAlreadyExtracted, logExtraction, getUnextractedIds } from './extraction-log';

const SOURCE_TYPE = 'GitHubSyncRecord';
const EXTRACTOR_VERSION = 1;
const BATCH_SIZE = 200;

interface ExtractOptions {
    userId: string;
    resourceId?: string;
}

/**
 * Main entry point — extract facts from all unprocessed GitHub sync records for a user.
 */
export async function extractGitHubFacts(options: ExtractOptions): Promise<void> {
    const { userId, resourceId } = options;
    const label = `[github-fact-extractor][${userId.substring(0, 8)}]`;

    // Find unextracted sync records
    const whereClause: any = {
        userId,
    };
    if (resourceId) {
        whereClause.resourceId = resourceId;
    }

    const allRecords = await prisma.gitHubSyncRecord.findMany({
        where: whereClause,
        select: { id: true },
        orderBy: { occurredAt: 'desc' },
        take: BATCH_SIZE,
    });

    const allIds = allRecords.map(r => r.id);
    const unextractedIds = await getUnextractedIds(userId, SOURCE_TYPE, allIds, EXTRACTOR_VERSION);

    if (unextractedIds.length === 0) {
        console.log(`${label} No unextracted GitHub records found`);
        return;
    }

    // Fetch full records for unextracted IDs
    const records = await prisma.gitHubSyncRecord.findMany({
        where: { id: { in: unextractedIds } },
        include: {
            resource: {
                include: { project: true },
            },
        },
        orderBy: { occurredAt: 'desc' },
    });

    console.log(`${label} Processing ${records.length} GitHub records`);

    for (const record of records) {
        try {
            const { entitiesFound, factsCreated } = await extractFactsFromRecord(userId, record, label);

            await logExtraction(userId, SOURCE_TYPE, record.id, entitiesFound, factsCreated, EXTRACTOR_VERSION);
        } catch (error: any) {
            console.error(`${label} Error extracting facts from record ${record.id}:`, error.message);
        }
    }

    console.log(`${label} Extraction complete`);
}

async function extractFactsFromRecord(
    userId: string,
    record: any,
    label: string
): Promise<{ entitiesFound: number; factsCreated: number }> {
    let entitiesFound = 0;
    let factsCreated = 0;

    const project = record.resource?.project;
    const projectEntityId = project?.knowledgeEntityId || undefined;
    const projectId = project?.id || undefined;
    const metadata = record.metadata as any;

    // Create PERSON entity for author
    if (record.author) {
        const authorEntityId = await resolveEntity({
            userId,
            type: 'PERSON',
            name: record.author,
            properties: { githubUsername: record.author, source: 'github' },
        });
        entitiesFound++;

        // Fact: person contributes_to project
        if (projectEntityId) {
            const result = await createFact({
                userId,
                subjectId: authorEntityId,
                predicate: 'contributes_to',
                objectEntityId: projectEntityId,
                source: 'INFERRED_GITHUB',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: record.id,
                projectId,
                metadata: { entityType: record.entityType, externalId: record.externalId },
            });
            if (result.action === 'CREATED') factsCreated++;
        }
    }

    // Extract reviewers from PR metadata
    if (record.entityType === 'pull_request' && metadata?.reviewers) {
        for (const reviewer of metadata.reviewers) {
            const reviewerEntityId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: reviewer,
                properties: { githubUsername: reviewer, source: 'github' },
            });
            entitiesFound++;

            // Fact: reviewer reviews_for project
            if (projectEntityId) {
                const result = await createFact({
                    userId,
                    subjectId: reviewerEntityId,
                    predicate: 'reviews_for',
                    objectEntityId: projectEntityId,
                    source: 'INFERRED_GITHUB',
                    sourceRefType: SOURCE_TYPE,
                    sourceRefId: record.id,
                    projectId,
                });
                if (result.action === 'CREATED') factsCreated++;
            }

            // Fact: collaborates_with between author and reviewer
            if (record.author && record.author !== reviewer) {
                const authorEntityId = await resolveEntity({
                    userId,
                    type: 'PERSON',
                    name: record.author,
                });

                const result = await createFact({
                    userId,
                    subjectId: authorEntityId,
                    predicate: 'collaborates_with',
                    objectEntityId: reviewerEntityId,
                    source: 'INFERRED_GITHUB',
                    sourceRefType: SOURCE_TYPE,
                    sourceRefId: record.id,
                    projectId,
                });
                if (result.action === 'CREATED') factsCreated++;
            }
        }
    }

    // Extract assignees from issue metadata
    if (record.entityType === 'issue' && metadata?.assignees) {
        for (const assignee of metadata.assignees) {
            const assigneeEntityId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: assignee,
                properties: { githubUsername: assignee, source: 'github' },
            });
            entitiesFound++;

            // Fact: assignee works_on project
            if (projectEntityId) {
                const result = await createFact({
                    userId,
                    subjectId: assigneeEntityId,
                    predicate: 'works_on',
                    objectEntityId: projectEntityId,
                    source: 'INFERRED_GITHUB',
                    sourceRefType: SOURCE_TYPE,
                    sourceRefId: record.id,
                    projectId,
                });
                if (result.action === 'CREATED') factsCreated++;
            }
        }
    }

    return { entitiesFound, factsCreated };
}
