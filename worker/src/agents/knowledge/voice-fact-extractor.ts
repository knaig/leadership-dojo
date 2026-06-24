/**
 * Voice Fact Extractor
 *
 * Extracts entities and facts from VoiceCall transcripts.
 * Uses LLM to parse conversational transcripts into structured knowledge graph facts.
 *
 * Voice calls are a rich signal — the user is speaking freely about their work,
 * concerns, people, and decisions. Confidence is 0.75 (between chat at 0.9 and
 * email at 0.5) because transcription may introduce noise.
 *
 * Special handling:
 * - voice_memo call types get higher priority (processed first)
 * - Extracts: mentions, concerned_about, stakeholder_position, decision_made,
 *   action_item, personal_observation
 * - Routes person-related facts to StakeholderProfiles
 *
 * Facts: mentions, concerned_about, stakeholder_position, decision_made,
 *        action_item, personal_observation, has_opinion_on, works_on
 *
 * Trigger: pg-boss job `knowledge-extract-voice` queued after voice call ends
 *          or daily cron at 14:00 UTC
 */

import { prisma } from '../../lib/prisma';
import { KnowledgeEntityType } from '@prisma/client';
import { resolveEntity } from './entity-resolver';
import { createFact } from './fact-manager';
import { logExtraction, getUnextractedIds } from './extraction-log';
import { getUserLLMConfig, generateText, withLLMRetry, WorkerLLMConfig } from '../../lib/user-llm';
import { withAgentRun } from '../../lib/agent-run';

const SOURCE_TYPE = 'VoiceCall';
const SOURCE_CONFIDENCE = 0.75;

const VALID_ENTITY_TYPES = new Set<string>(Object.values(KnowledgeEntityType));

interface ExtractedVoiceFact {
    subjectType: string;  // KnowledgeEntityType
    subjectName: string;
    predicate: string;
    objectType?: string;
    objectName?: string;
    objectValue?: string;
    confidence: number;
}

/**
 * Build a list of known names from calendar attendees, email contacts, stakeholders,
 * and user profile. Used to cross-reference against noisy voice transcription.
 */
async function getKnownNames(userId: string): Promise<string[]> {
    const names = new Set<string>();

    // User's own name and company
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, company: true },
    }).catch(() => null);
    if (user?.name) names.add(user.name);
    if (user?.company) names.add(user.company);

    // Stakeholder names
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        select: { name: true, role: true },
        take: 30,
    }).catch(() => []);
    for (const s of stakeholders) {
        if (s.name) names.add(s.name);
    }

    // Recent calendar attendees (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: thirtyDaysAgo } },
        select: { attendees: true },
        take: 50,
    }).catch(() => []);
    for (const m of meetings) {
        const attendees = Array.isArray(m.attendees) ? m.attendees as any[] : [];
        for (const a of attendees) {
            if (a.name) names.add(a.name);
        }
    }

    // Knowledge graph entities (PERSON, ORGANIZATION)
    const entities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: { in: ['PERSON', 'ORGANIZATION'] } },
        select: { name: true },
        take: 50,
    }).catch(() => []);
    for (const e of entities) {
        if (e.name) names.add(e.name);
    }

    return Array.from(names).filter(n => n.length > 1);
}

/**
 * Main entry point — extract facts from all unprocessed voice calls for a user.
 * Processes voice_memo calls first (highest priority), then other call types.
 */
export async function extractVoiceFacts(userId: string): Promise<{ entitiesFound: number; factsCreated: number }> {
    return withAgentRun('voice-fact-extractor', userId, 'cron', async (ctx) => {
        const result = await _extractVoiceFacts(userId, ctx);
        ctx.itemsProcessed = result.factsCreated;
        return result;
    });
}

async function _extractVoiceFacts(userId: string, ctx?: { logs: string[] }): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[VoiceFactExtractor] Starting for user ${userId.substring(0, 8)}...`);

    let totalEntities = 0;
    let totalFacts = 0;

    // Fetch voice calls with transcripts from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const voiceCalls = await prisma.voiceCall.findMany({
        where: {
            userId,
            transcript: { not: null },
            status: 'ended',
            startedAt: { gte: thirtyDaysAgo },
        },
        orderBy: [
            // Process voice memos first — they contain the richest user-stated context
            { callType: 'asc' }, // voice_memo sorts before other types alphabetically
            { startedAt: 'desc' },
        ],
    });

    if (voiceCalls.length === 0) {
        console.log(`[VoiceFactExtractor] No voice calls with transcripts found`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    // Sort to prioritize voice_memo calls
    const sorted = voiceCalls.sort((a, b) => {
        if (a.callType === 'voice_memo' && b.callType !== 'voice_memo') return -1;
        if (a.callType !== 'voice_memo' && b.callType === 'voice_memo') return 1;
        return b.startedAt.getTime() - a.startedAt.getTime();
    });

    const allIds = sorted.map(vc => vc.id);
    const unextractedIds = await getUnextractedIds(userId, SOURCE_TYPE, allIds);

    if (unextractedIds.length === 0) {
        console.log(`[VoiceFactExtractor] All ${voiceCalls.length} voice calls already extracted`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const unextracted = sorted.filter(vc => unextractedIds.includes(vc.id));
    console.log(`[VoiceFactExtractor] Processing ${unextracted.length} new voice calls`);

    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.log(`[VoiceFactExtractor] No LLM configured, skipping`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    for (const voiceCall of unextracted) {
        try {
            const result = await processVoiceCall(userId, voiceCall, llmConfig);
            totalEntities += result.entities;
            totalFacts += result.facts;
            await logExtraction(userId, SOURCE_TYPE, voiceCall.id, result.entities, result.facts);
        } catch (err: any) {
            console.error(`[VoiceFactExtractor] Error processing call ${voiceCall.id}: ${err.message}`);
            await logExtraction(userId, SOURCE_TYPE, voiceCall.id, 0, 0);
        }
    }

    console.log(`[VoiceFactExtractor] Done — ${totalEntities} entities, ${totalFacts} facts from ${unextracted.length} calls`);
    return { entitiesFound: totalEntities, factsCreated: totalFacts };
}

/**
 * Process a single voice call transcript through LLM extraction.
 */
async function processVoiceCall(
    userId: string,
    voiceCall: any,
    llmConfig: WorkerLLMConfig
): Promise<{ entities: number; facts: number }> {
    let entities = 0;
    let facts = 0;

    const transcript = voiceCall.transcript as string;
    if (!transcript || transcript.length < 20) {
        return { entities, facts };
    }

    // Extract facts from transcript using LLM
    const extractedFacts = await extractFactsFromTranscript(
        llmConfig,
        userId,
        transcript,
        voiceCall.callType,
        voiceCall.summary
    );

    for (const fact of extractedFacts) {
        try {
            // Resolve subject entity
            const subjectId = await resolveEntity({
                userId,
                type: fact.subjectType as any,
                name: fact.subjectName,
            });
            entities++;

            // Resolve object entity if it's an entity reference
            let objectEntityId: string | undefined;
            if (fact.objectType && fact.objectName) {
                objectEntityId = await resolveEntity({
                    userId,
                    type: fact.objectType as any,
                    name: fact.objectName,
                });
                entities++;
            }

            const result = await createFact({
                userId,
                subjectId,
                predicate: fact.predicate,
                objectEntityId,
                objectValue: fact.objectValue,
                source: 'USER_STATED',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: voiceCall.id,
                confidence: fact.confidence,
                validFrom: voiceCall.endedAt || voiceCall.createdAt,
                metadata: { callType: voiceCall.callType },
            });

            if (result.action === 'CREATED' || result.action === 'OVERRIDDEN') {
                facts++;
            }
        } catch (err: any) {
            console.error(`[VoiceFactExtractor] Error creating fact: ${err.message}`);
        }
    }

    // Route person-related facts to StakeholderProfiles
    if (facts > 0) {
        await routeFactsToStakeholders(userId, extractedFacts);
    }

    return { entities, facts };
}

/**
 * Use LLM to extract structured facts from a voice call transcript.
 */
async function extractFactsFromTranscript(
    llmConfig: WorkerLLMConfig,
    userId: string,
    transcript: string,
    callType: string,
    summary?: string | null
): Promise<ExtractedVoiceFact[]> {
    // Truncate very long transcripts to stay within token limits
    const truncatedTranscript = transcript.length > 4000
        ? transcript.substring(0, 4000) + '\n...[truncated]'
        : transcript;

    const summaryBlock = summary
        ? `\nCALL SUMMARY: "${summary}"\n`
        : '';

    // Build known names list from calendar/email for cross-referencing transcription errors
    const knownNames = await getKnownNames(userId);
    const knownNamesBlock = knownNames.length > 0
        ? `\nKNOWN NAMES (from calendar/email — use these correct spellings when a transcript name sounds similar):
${knownNames.join('\n')}\n`
        : '';

    const prompt = `Extract factual statements from this voice call transcript. The user was speaking to their AI executive coach. Focus on what the user reveals about themselves, their work, their team, their concerns, and decisions.

CALL TYPE: ${callType}
${summaryBlock}${knownNamesBlock}
TRANSCRIPT:
"${truncatedTranscript}"

For each fact, identify:
- subjectType: PERSON, PROJECT, TOPIC, SKILL, TEAM, ORGANIZATION, or GOAL
- subjectName: the entity name (use "self" for facts about the user themselves)
- predicate: one of: mentions, concerned_about, stakeholder_position, decision_made, action_item, personal_observation, has_opinion_on, works_on, has_priority, has_role, reports_to, manages, has_strength, has_growth_area, prefers, dislikes, responds_well_to, objects_to, blocks, supports, allies_with, political_stance, decision_style
- objectType: (optional) if the object is an entity, its type
- objectName: (optional) if the object is an entity, its name
- objectValue: (optional) if the object is a literal value (a short phrase, not the full sentence)
- confidence: 0.75 for clearly stated facts, 0.65 for implied facts (voice transcripts may have noise)

IMPORTANT:
- Extract people mentioned by name — these are stakeholders
- VOICE TRANSCRIPTION IS NOISY. Names will be misspelled. Cross-reference against KNOWN NAMES above. If a transcript says "Cox" but known names include "COSS", use "COSS". If transcript says "Kartik" but known names include "Karthik", use "Karthik".
- Capture concerns, positions, and decisions — these drive coaching
- If the user mentions action items or commitments, extract those
- Personal observations about team dynamics are valuable

Return ONLY a JSON array of facts. If no extractable facts, return [].
Example: [{ "subjectType": "PERSON", "subjectName": "self", "predicate": "concerned_about", "objectType": "TOPIC", "objectName": "Q2 launch timeline", "confidence": 0.75 }]`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.1, maxOutputTokens: 1200 }),
            { label: 'VoiceFactExtractor' }
        );
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]) as ExtractedVoiceFact[];

        // Validate and normalize — reject invalid entity types from LLM
        return parsed.filter(f =>
            f.subjectType && f.subjectName && f.predicate &&
            (f.objectValue || f.objectName) &&
            f.confidence >= 0.5 &&
            VALID_ENTITY_TYPES.has(f.subjectType) &&
            (!f.objectType || VALID_ENTITY_TYPES.has(f.objectType))
        ).map(f => ({
            ...f,
            subjectType: f.subjectType === 'PERSON' && f.subjectName === 'self' ? 'PERSON' : f.subjectType,
            subjectName: f.subjectName === 'self' ? 'Self' : f.subjectName,
        }));
    } catch (err: any) {
        console.error(`[VoiceFactExtractor] LLM extraction failed: ${err.message}`);
        return [];
    }
}

/**
 * Route person-related facts to StakeholderProfiles so the
 * stakeholder synthesis agent can incorporate voice call insights.
 */
async function routeFactsToStakeholders(
    userId: string,
    facts: ExtractedVoiceFact[]
): Promise<void> {
    const personFacts = facts.filter(
        f => f.subjectType === 'PERSON' && f.subjectName !== 'Self' && f.subjectName !== 'self'
    );

    if (personFacts.length === 0) return;

    const uniqueNames = Array.from(new Set(personFacts.map(f => f.subjectName)));

    for (const name of uniqueNames) {
        try {
            const existing = await prisma.stakeholderProfile.findFirst({
                where: {
                    userId,
                    OR: [
                        { name: { contains: name, mode: 'insensitive' as const } },
                    ],
                },
            });

            if (!existing) {
                await prisma.stakeholderProfile.create({
                    data: {
                        userId,
                        name,
                        interactionCount: 0,
                    },
                });
                console.log(`[VoiceFactExtractor] Created StakeholderProfile for "${name}" from voice call`);
            }
        } catch (err: any) {
            if (!err.message?.includes('Unique constraint')) {
                console.error(`[VoiceFactExtractor] Error routing stakeholder "${name}": ${err.message}`);
            }
        }
    }
}
