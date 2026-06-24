/**
 * Chat Fact Extractor
 *
 * Extracts USER_STATED facts from user chat messages.
 * These have the highest confidence in the system (0.9-1.0).
 *
 * CHAT IS OVERWEIGHTED: Chat-sourced facts get 0.9-1.0 confidence because
 * the user is directly telling us things. This is the richest signal we have.
 *
 * Special handling for context-deepening Q&A:
 * finds the ProactivePrompt that preceded this message and extracts
 * structured facts from the question-answer pair.
 *
 * Stakeholder routing: When facts mention specific people, we also route
 * them to StakeholderProfile linkage for the stakeholder synthesis agent.
 *
 * Feedback loop: When a user message follows a ProactivePrompt, we mark
 * that prompt as responded (and optionally resultedInAction).
 *
 * Facts: has_role, works_on, reports_to, has_priority, concerned_about, has_opinion_on
 *
 * Trigger: pg-boss job `knowledge-extract-chat` queued after each user message
 */

import { prisma } from '../../lib/prisma';
import { KnowledgeEntityType } from '@prisma/client';
import { resolveEntity } from './entity-resolver';
import { createFact } from './fact-manager';
import { isAlreadyExtracted, logExtraction } from './extraction-log';
import { getUserLLMConfig, generateText, withLLMRetry, WorkerLLMConfig } from '../../lib/user-llm';

const SOURCE_TYPE = 'Message';

const VALID_ENTITY_TYPES = new Set<string>(Object.values(KnowledgeEntityType));

interface ExtractedChatFact {
    subjectType: string;  // KnowledgeEntityType
    subjectName: string;
    predicate: string;
    objectType?: string;
    objectName?: string;
    objectValue?: string;
    confidence: number;
}

/**
 * Extract facts from a single user message.
 */
export async function extractChatFacts(
    userId: string,
    messageId: string
): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[ChatFactExtractor] Processing message ${messageId.substring(0, 8)}...`);

    // Check if already processed
    if (await isAlreadyExtracted(userId, SOURCE_TYPE, messageId)) {
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const message = await prisma.message.findUnique({
        where: { id: messageId },
    });

    if (!message || message.role !== 'user') {
        await logExtraction(userId, SOURCE_TYPE, messageId, 0, 0);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const content = message.content;
    if (!content || content.length < 10) {
        await logExtraction(userId, SOURCE_TYPE, messageId, 0, 0);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    // Check if this is a response to a proactive prompt (any type, not just context-deepening)
    const precedingPrompt = await findPrecedingPrompt(userId, message.createdAt);

    // FEEDBACK LOOP: Mark the prompt as responded
    if (precedingPrompt) {
        await markPromptResponded(precedingPrompt.id, content);
    }

    const llmConfig = await getUserLLMConfig(userId);
    const extractedFacts = await extractFactsFromMessage(llmConfig, content, precedingPrompt?.content);

    let entitiesFound = 0;
    let factsCreated = 0;

    for (const fact of extractedFacts) {
        try {
            // Resolve subject entity
            const subjectId = await resolveEntity({
                userId,
                type: fact.subjectType as any,
                name: fact.subjectName,
            });
            entitiesFound++;

            // Resolve object entity if it's an entity reference
            let objectEntityId: string | undefined;
            if (fact.objectType && fact.objectName) {
                objectEntityId = await resolveEntity({
                    userId,
                    type: fact.objectType as any,
                    name: fact.objectName,
                });
                entitiesFound++;
            }

            const result = await createFact({
                userId,
                subjectId,
                predicate: fact.predicate,
                objectEntityId,
                objectValue: fact.objectValue,
                source: 'USER_STATED',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: messageId,
                confidence: fact.confidence,
                metadata: precedingPrompt ? { promptType: precedingPrompt.type } : undefined,
            });

            if (result.action === 'CREATED' || result.action === 'OVERRIDDEN') {
                factsCreated++;
            }
        } catch (err: any) {
            console.error(`[ChatFactExtractor] Error creating fact: ${err.message}`);
        }
    }

    // STAKEHOLDER ROUTING: Link person-related facts to StakeholderProfiles
    if (factsCreated > 0) {
        await routeFactsToStakeholders(userId, extractedFacts);
    }

    await logExtraction(userId, SOURCE_TYPE, messageId, entitiesFound, factsCreated);
    console.log(`[ChatFactExtractor] Extracted ${factsCreated} facts from message`);
    return { entitiesFound, factsCreated };
}

/**
 * Find the most recent ProactivePrompt before this message (within 30 min window).
 * Searches ALL prompt types to close the feedback loop.
 */
async function findPrecedingPrompt(userId: string, messageTime: Date): Promise<any | null> {
    const thirtyMinBefore = new Date(messageTime.getTime() - 30 * 60 * 1000);

    return prisma.proactivePrompt.findFirst({
        where: {
            userId,
            deliveredAt: { gte: thirtyMinBefore, lte: messageTime },
            responded: false, // only unresponded prompts
        },
        orderBy: { deliveredAt: 'desc' },
    });
}

/**
 * FEEDBACK LOOP: Mark a ProactivePrompt as responded.
 * Also detect if the response indicates the user took action.
 */
async function markPromptResponded(promptId: string, userResponse: string): Promise<void> {
    // Simple heuristic: if the user's response is substantive (>20 chars), it resulted in action
    const resultedInAction = userResponse.length > 20;

    try {
        await prisma.proactivePrompt.update({
            where: { id: promptId },
            data: {
                responded: true,
                resultedInAction,
            },
        });
        console.log(`[ChatFactExtractor] Marked prompt ${promptId.substring(0, 8)} as responded (action: ${resultedInAction})`);
    } catch (err: any) {
        console.error(`[ChatFactExtractor] Failed to mark prompt responded: ${err.message}`);
    }
}

/**
 * STAKEHOLDER ROUTING: When chat facts mention specific people,
 * ensure they're linked to StakeholderProfiles so the stakeholder
 * synthesis agent can pick them up.
 *
 * This closes the gap: user says "Priya is political" → fact created
 * about PERSON:Priya → but StakeholderProfile for Priya might not
 * have this fact linked. We ensure the profile exists.
 */
async function routeFactsToStakeholders(
    userId: string,
    facts: ExtractedChatFact[]
): Promise<void> {
    const personFacts = facts.filter(
        f => f.subjectType === 'PERSON' && f.subjectName !== 'Self' && f.subjectName !== 'self'
    );

    if (personFacts.length === 0) return;

    const uniqueNames = [...new Set(personFacts.map(f => f.subjectName))];

    for (const name of uniqueNames) {
        try {
            // Check if StakeholderProfile exists
            const existing = await prisma.stakeholderProfile.findFirst({
                where: {
                    userId,
                    OR: [
                        { name: { contains: name, mode: 'insensitive' as const } },
                    ],
                },
            });

            if (!existing) {
                // Create a minimal StakeholderProfile so synthesis agent can pick it up
                await prisma.stakeholderProfile.create({
                    data: {
                        userId,
                        name,
                        interactionCount: 0,
                    },
                });
                console.log(`[ChatFactExtractor] Created StakeholderProfile for "${name}" from chat`);
            }
        } catch (err: any) {
            // Ignore duplicate errors — profile may have been created concurrently
            if (!err.message?.includes('Unique constraint')) {
                console.error(`[ChatFactExtractor] Error routing stakeholder "${name}": ${err.message}`);
            }
        }
    }
}

/**
 * Use LLM to extract structured facts from a user message.
 * If a preceding prompt is provided, extracts from the Q&A pair.
 */
async function extractFactsFromMessage(
    llmConfig: WorkerLLMConfig,
    userMessage: string,
    precedingQuestion?: string
): Promise<ExtractedChatFact[]> {
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) return [];

    const contextBlock = precedingQuestion
        ? `CONTEXT: The user was asked this question by their AI coach:
"${precedingQuestion}"

USER'S ANSWER:
"${userMessage}"`
        : `USER MESSAGE:
"${userMessage}"`;

    const prompt = `Extract factual statements from this user's message. These are things the user is telling us about themselves, their work, their team, or their priorities.

${contextBlock}

For each fact, identify:
- subjectType: PERSON, PROJECT, TOPIC, SKILL, TEAM, ORGANIZATION, or GOAL
- subjectName: the entity name (use "self" for facts about the user themselves)
- predicate: one of: has_role, works_on, reports_to, manages, has_priority, concerned_about, has_opinion_on, has_strength, has_growth_area, part_of_team, works_at, has_goal, prefers, dislikes, responds_well_to, objects_to, influenced_by, communicates_via, decision_style, political_stance, blocks, supports, allies_with
- objectType: (optional) if the object is an entity, its type
- objectName: (optional) if the object is an entity, its name
- objectValue: (optional) if the object is a literal value
- confidence: 0.95 for explicitly stated facts, 0.85 for clearly implied (chat is our highest-fidelity signal)

Return ONLY a JSON array of facts. If no extractable facts, return [].
Example: [{ "subjectType": "PERSON", "subjectName": "self", "predicate": "has_role", "objectValue": "VP of Engineering", "confidence": 0.95 }]`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.1, maxOutputTokens: 800 }),
            { label: 'ChatFactExtractor' }
        );
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]) as ExtractedChatFact[];

        // Validate and normalize — reject invalid entity types from LLM
        return parsed.filter(f =>
            f.subjectType && f.subjectName && f.predicate &&
            (f.objectValue || f.objectName) &&
            f.confidence >= 0.7 &&
            VALID_ENTITY_TYPES.has(f.subjectType) &&
            (!f.objectType || VALID_ENTITY_TYPES.has(f.objectType))
        ).map(f => ({
            ...f,
            // "self" is a special subject — resolved to PERSON type with the user's name later
            subjectType: f.subjectType === 'PERSON' && f.subjectName === 'self' ? 'PERSON' : f.subjectType,
            subjectName: f.subjectName === 'self' ? 'Self' : f.subjectName,
        }));
    } catch (err: any) {
        console.error(`[ChatFactExtractor] LLM extraction failed: ${err.message}`);
        return [];
    }
}
