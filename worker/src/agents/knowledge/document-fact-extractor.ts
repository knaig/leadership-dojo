/**
 * Document Fact Extractor
 *
 * Extracts entities and facts from WorkArtifact.
 * Reads rawContent (first 2000 chars) via Gemini Flash for deep content analysis.
 *
 * Entities: PERSON (from owners/editors), PROJECT/TOPIC (from content), DOCUMENT
 * Facts: authored, edited, about_topic, related_to_project, contains_decision
 *
 * Trigger: pg-boss job `knowledge-extract-document` queued after drive sync
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity, cleanPersonName } from './entity-resolver';
import { createFact } from './fact-manager';
import { logExtraction, getUnextractedIds } from './extraction-log';
import { getUserLLMConfig, generateText, withLLMRetry, WorkerLLMConfig } from '../../lib/user-llm';
import { backgroundGenerateText } from '../../lib/background-llm';

const SOURCE_TYPE = 'WorkArtifact';

/**
 * Main entry point — extract facts from all unprocessed documents for a user.
 */
export async function extractDocumentFacts(userId: string): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[DocumentFactExtractor] Starting for user ${userId.substring(0, 8)}...`);

    let totalEntities = 0;
    let totalFacts = 0;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const documents = await prisma.workArtifact.findMany({
        where: { userId, ingestedAt: { gte: ninetyDaysAgo } },
        orderBy: { ingestedAt: 'desc' },
        take: 100,
    });

    if (documents.length === 0) {
        console.log(`[DocumentFactExtractor] No documents found`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const allIds = documents.map(d => d.id);
    const unextractedIds = await getUnextractedIds(userId, SOURCE_TYPE, allIds);

    if (unextractedIds.length === 0) {
        console.log(`[DocumentFactExtractor] All ${documents.length} documents already extracted`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const unextracted = documents.filter(d => unextractedIds.includes(d.id));
    console.log(`[DocumentFactExtractor] Processing ${unextracted.length} new documents`);

    const llmConfig = await getUserLLMConfig(userId);

    for (const doc of unextracted) {
        try {
            const result = await processDocument(userId, doc, llmConfig);
            totalEntities += result.entities;
            totalFacts += result.facts;
            await logExtraction(userId, SOURCE_TYPE, doc.id, result.entities, result.facts);
        } catch (err: any) {
            console.error(`[DocumentFactExtractor] Error processing doc ${doc.id}: ${err.message}`);
            await logExtraction(userId, SOURCE_TYPE, doc.id, 0, 0);
        }
    }

    console.log(`[DocumentFactExtractor] Done — ${totalEntities} entities, ${totalFacts} facts`);
    return { entitiesFound: totalEntities, factsCreated: totalFacts };
}

interface DocumentAnalysis {
    projects: string[];
    topics: string[];
    people: string[];
    decisions: string[];
    actionItems: string[];
}

async function processDocument(
    userId: string,
    doc: any,
    llmConfig: WorkerLLMConfig
): Promise<{ entities: number; facts: number }> {
    let entities = 0;
    let facts = 0;

    // Resolve project scoping: if this doc's connector is linked to a ProjectResource, tag facts
    let projectId: string | undefined;
    if (doc.connectorId) {
        try {
            const projectResource = await prisma.projectResource.findFirst({
                where: { connectorId: doc.connectorId },
                select: { projectId: true },
            });
            projectId = projectResource?.projectId || undefined;
        } catch { /* non-critical */ }
    }

    // Create DOCUMENT entity
    const docEntityId = await resolveEntity({
        userId,
        type: 'DOCUMENT',
        name: doc.title || `Untitled ${doc.type}`,
        properties: {
            type: doc.type,
            externalId: doc.externalId,
        },
        sourceModelType: 'WorkArtifact',
        sourceModelId: doc.id,
    });
    entities++;

    // Create PERSON entities from document participants/metadata
    const participants = (doc.participants as any[]) || [];
    const personEntityIds: string[] = [];
    for (const p of participants) {
        const name = typeof p === 'string' ? cleanPersonName(p) : cleanPersonName(p.email || p.name || '');
        if (!name || name.length < 2) continue;

        const entityId = await resolveEntity({
            userId,
            type: 'PERSON',
            name,
            properties: {
                email: typeof p === 'string' ? (p.includes('@') ? p : undefined) : p.email,
            },
        });
        personEntityIds.push(entityId);
        entities++;
    }

    // Create authored/edited facts
    const authorPredicate = doc.type === 'DOCUMENT_AUTHORED' ? 'authored' : 'edited';
    for (const personId of personEntityIds) {
        const result = await createFact({
            userId,
            subjectId: personId,
            predicate: authorPredicate,
            objectEntityId: docEntityId,
            source: 'INFERRED_DOCUMENT',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: doc.id,
            validFrom: doc.occurredAt || doc.createdAt,
            projectId,
        });
        if (result.action === 'CREATED') facts++;
    }

    // Deep content analysis via LLM (if rawContent available)
    const content = doc.rawContent || doc.content;
    if (content && content.length > 50) {
        const analysis = await analyzeDocumentContent(llmConfig, doc.title || '', content);

        // Create PROJECT entities
        for (const project of analysis.projects) {
            const projectEntityId = await resolveEntity({ userId, type: 'PROJECT', name: project });
            entities++;

            const result = await createFact({
                userId,
                subjectId: docEntityId,
                predicate: 'related_to_project',
                objectEntityId: projectEntityId,
                source: 'INFERRED_DOCUMENT',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: doc.id,
                confidence: 0.6,
                validFrom: doc.occurredAt || doc.createdAt,
                projectId,
            });
            if (result.action === 'CREATED') facts++;
        }

        // Create TOPIC entities
        for (const topic of analysis.topics) {
            const topicId = await resolveEntity({ userId, type: 'TOPIC', name: topic });
            entities++;

            const result = await createFact({
                userId,
                subjectId: docEntityId,
                predicate: 'about_topic',
                objectEntityId: topicId,
                source: 'INFERRED_DOCUMENT',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: doc.id,
                confidence: 0.6,
                validFrom: doc.occurredAt || doc.createdAt,
                projectId,
            });
            if (result.action === 'CREATED') facts++;
        }

        // Create PERSON entities mentioned in content
        for (const person of analysis.people) {
            const personId = await resolveEntity({ userId, type: 'PERSON', name: person });
            entities++;

            const result = await createFact({
                userId,
                subjectId: personId,
                predicate: 'mentioned_in',
                objectEntityId: docEntityId,
                source: 'INFERRED_DOCUMENT',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: doc.id,
                confidence: 0.5,
                validFrom: doc.occurredAt || doc.createdAt,
                projectId,
            });
            if (result.action === 'CREATED') facts++;
        }

        // Create decision facts
        for (const decision of analysis.decisions) {
            const result = await createFact({
                userId,
                subjectId: docEntityId,
                predicate: 'contains_decision',
                objectValue: decision,
                source: 'INFERRED_DOCUMENT',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: doc.id,
                confidence: 0.55,
                validFrom: doc.occurredAt || doc.createdAt,
                projectId,
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    return { entities, facts };
}

/**
 * Analyze document content via LLM.
 */
async function analyzeDocumentContent(llmConfig: WorkerLLMConfig, title: string, content: string): Promise<DocumentAnalysis> {
    const empty: DocumentAnalysis = { projects: [], topics: [], people: [], decisions: [], actionItems: [] };
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) return empty;

    const truncatedContent = content.substring(0, 5000);

    const prompt = `Analyze this document and extract structured information.

TITLE: "${title}"
CONTENT:
${truncatedContent}

Extract:
- projects: specific project or product names mentioned
- topics: business topics (e.g., "hiring plan", "Q1 targets", "product roadmap")
- people: person names mentioned in the content (not email addresses)
- decisions: key decisions stated or implied (max 3, short phrases)
- actionItems: action items or next steps (max 3, short phrases)

Return ONLY JSON:
{ "projects": [], "topics": [], "people": [], "decisions": [], "actionItems": [] }`;

    try {
        const text = await backgroundGenerateText(prompt, { temperature: 0.1, maxOutputTokens: 800 });
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return empty;

        return JSON.parse(jsonMatch[0]) as DocumentAnalysis;
    } catch (err: any) {
        console.error(`[DocumentFactExtractor] LLM analysis failed after retries: ${err.message}`);
        return empty;
    }
}
