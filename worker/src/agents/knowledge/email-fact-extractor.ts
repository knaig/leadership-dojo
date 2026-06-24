/**
 * Email Fact Extractor
 *
 * Extracts entities and facts from EmailSummary.
 * Mostly heuristic — leverages existing EmailSummary fields (participants, keyTopics, sentiment).
 * Minimal LLM usage.
 *
 * Entities: PERSON (from participants), TOPIC (from keyTopics + subject)
 * Facts: emails_with, discusses, has_action_item_from, has_sentiment
 *
 * Trigger: pg-boss job `knowledge-extract-email` queued after email sync
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity, cleanPersonName } from './entity-resolver';
import { createFact } from './fact-manager';
import { logExtraction, getUnextractedIds } from './extraction-log';
import { backgroundGenerateText } from '../../lib/background-llm';

const SOURCE_TYPE = 'EmailSummary';

/**
 * Main entry point — extract facts from all unprocessed email summaries for a user.
 */
export async function extractEmailFacts(userId: string): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[EmailFactExtractor] Starting for user ${userId.substring(0, 8)}...`);

    let totalEntities = 0;
    let totalFacts = 0;

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const emails = await prisma.emailSummary.findMany({
        where: { userId, lastMessageAt: { gte: ninetyDaysAgo } },
        orderBy: { lastMessageAt: 'desc' },
    });

    if (emails.length === 0) {
        console.log(`[EmailFactExtractor] No emails found`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const allIds = emails.map(e => e.id);
    const unextractedIds = await getUnextractedIds(userId, SOURCE_TYPE, allIds);

    if (unextractedIds.length === 0) {
        console.log(`[EmailFactExtractor] All ${emails.length} emails already extracted`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const unextracted = emails.filter(e => unextractedIds.includes(e.id));
    console.log(`[EmailFactExtractor] Processing ${unextracted.length} new email threads`);

    for (let i = 0; i < unextracted.length; i++) {
        const email = unextracted[i];
        try {
            const result = await processEmail(userId, email);
            totalEntities += result.entities;
            totalFacts += result.facts;
            await logExtraction(userId, SOURCE_TYPE, email.id, result.entities, result.facts);
        } catch (err: any) {
            console.error(`[EmailFactExtractor] Error processing email ${email.id}: ${err.message}`);
            await logExtraction(userId, SOURCE_TYPE, email.id, 0, 0);
        }
        // Throttle: small delay between emails to avoid rate-limiting during backfills
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[EmailFactExtractor] Done — ${totalEntities} entities, ${totalFacts} facts`);
    return { entitiesFound: totalEntities, factsCreated: totalFacts };
}

async function processEmail(
    userId: string,
    email: any
): Promise<{ entities: number; facts: number }> {
    let entities = 0;
    let facts = 0;

    // 1. Create PERSON entities from participants
    const participants = (email.participants as string[]) || [];
    const personEntityIds: string[] = [];

    for (const participant of participants) {
        const name = cleanPersonName(participant);
        if (!name || name.length < 2) continue;

        const entityId = await resolveEntity({
            userId,
            type: 'PERSON',
            name,
            properties: {
                email: participant.includes('@') ? participant : undefined,
            },
        });
        personEntityIds.push(entityId);
        entities++;
    }

    // 2. Create TOPIC entities from keyTopics
    const keyTopics = (email.keyTopics as string[]) || [];
    const topicEntityIds: string[] = [];

    for (const topic of keyTopics) {
        if (!topic || topic.length < 3) continue;
        const entityId = await resolveEntity({
            userId,
            type: 'TOPIC',
            name: topic,
        });
        topicEntityIds.push(entityId);
        entities++;
    }

    // 3. Create emails_with facts (pairwise for small threads, skip for large)
    if (personEntityIds.length >= 2 && personEntityIds.length <= 8) {
        for (let i = 0; i < personEntityIds.length; i++) {
            for (let j = i + 1; j < personEntityIds.length; j++) {
                const result = await createFact({
                    userId,
                    subjectId: personEntityIds[i],
                    predicate: 'emails_with',
                    objectEntityId: personEntityIds[j],
                    source: 'INFERRED_EMAIL',
                    sourceRefType: SOURCE_TYPE,
                    sourceRefId: email.id,
                    validFrom: email.firstMessageAt,
                    metadata: { subject: email.subject, messageCount: email.messageCount },
                });
                if (result.action === 'CREATED') facts++;
            }
        }
    }

    // 4. Create discusses facts: person discusses topic
    for (const personId of personEntityIds) {
        for (const topicId of topicEntityIds) {
            const result = await createFact({
                userId,
                subjectId: personId,
                predicate: 'discusses',
                objectEntityId: topicId,
                source: 'INFERRED_EMAIL',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: email.id,
                confidence: 0.5,
                validFrom: email.lastMessageAt,
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    // 5. Create sentiment fact if notable
    if (email.sentiment && email.sentiment !== 'neutral' && personEntityIds.length > 0) {
        // Attribute sentiment to the sender (from field)
        const senderName = email.from ? cleanPersonName(email.from) : null;
        if (senderName) {
            const senderId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: senderName,
                properties: { email: email.from },
            });

            const result = await createFact({
                userId,
                subjectId: senderId,
                predicate: 'has_email_sentiment',
                objectValue: email.sentiment,
                source: 'INFERRED_EMAIL',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: email.id,
                confidence: 0.4,
                validFrom: email.lastMessageAt,
                metadata: { subject: email.subject },
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    // 6. Create action item facts if email requires action
    if (email.requiresAction && personEntityIds.length > 0) {
        const result = await createFact({
            userId,
            subjectId: personEntityIds[0], // sender
            predicate: 'has_action_item_from',
            objectValue: email.subject || 'email thread',
            source: 'INFERRED_EMAIL',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: email.id,
            confidence: 0.6,
            validFrom: email.lastMessageAt,
        });
        if (result.action === 'CREATED') facts++;
    }

    // 7. LLM-powered extraction for substantial emails with summaries
    // Extract commitments, decisions, and stakeholder positions from the summary content
    if (email.summary && email.summary.length > 50 && email.messageCount >= 2) {
        try {
            const llmFacts = await extractLLMFacts(userId, email, personEntityIds);
            facts += llmFacts;
        } catch (err: any) {
            // backgroundGenerateText retries up to 10x with backoff — if it still fails, log and continue
            console.error(`[EmailFactExtractor] LLM extraction failed for ${email.id} after retries: ${err.message}`);
        }
    }

    return { entities, facts };
}

/**
 * LLM-powered extraction: reads email summary to find commitments, decisions,
 * action items, and stakeholder positions that heuristic extraction misses.
 */
async function extractLLMFacts(
    userId: string,
    email: any,
    personEntityIds: string[]
): Promise<number> {
    const prompt = `Extract structured facts from this email thread. Return ONLY valid JSON.

Subject: ${email.subject}
From: ${email.from}
Participants: ${(email.participants || []).join(', ')}
Summary: ${email.summary}

Extract any of these fact types:
- committed_to: Someone committed to doing something (who, what, by when if mentioned)
- decided: A decision was made (what was decided)
- action_item: An action item was assigned (who, what)
- requested: Someone requested something from someone else

Return JSON array (empty array if nothing found):
[{"type":"committed_to","person":"Name","value":"what they committed to"},{"type":"action_item","person":"Name","value":"the action item"}]

Only extract facts that are clearly stated. Do not infer or guess.`;

    const raw = await backgroundGenerateText(prompt, {
        temperature: 0.1,
        maxOutputTokens: 500,
    });

    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;

    let created = 0;

    for (const item of parsed.slice(0, 5)) { // Cap at 5 facts per email
        if (!item.type || !item.value) continue;

        // Resolve the person entity if named
        let subjectId = personEntityIds[0]; // Default to first participant
        if (item.person) {
            const personName = cleanPersonName(item.person);
            if (personName) {
                subjectId = await resolveEntity({
                    userId,
                    type: 'PERSON',
                    name: personName,
                });
            }
        }

        const result = await createFact({
            userId,
            subjectId,
            predicate: item.type,
            objectValue: item.value,
            source: 'INFERRED_EMAIL',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: email.id,
            confidence: 0.65,
            validFrom: email.lastMessageAt,
            metadata: { subject: email.subject },
        });
        if (result.action === 'CREATED') created++;
    }

    return created;
}
