/**
 * Meeting Notes Fact Extractor
 *
 * Extracts structured intelligence from Gemini meeting notes:
 * - Decisions made
 * - Action items / commitments
 * - Key discussion topics
 * - Stakeholder positions / objections
 * - Outcomes achieved vs. desired
 *
 * Trigger: After post-meeting review stores notes on MeetingSyncRecord
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity, cleanPersonName } from './entity-resolver';
import { createFact } from './fact-manager';
import { isAlreadyExtracted, logExtraction } from './extraction-log';
import { getUserLLMConfig, generateText, withLLMRetry } from '../../lib/user-llm';

const SOURCE_TYPE = 'MeetingNotes';

interface ExtractedNotesIntelligence {
    decisions: Array<{ description: string; owner?: string }>;
    actionItems: Array<{ description: string; assignee?: string; deadline?: string }>;
    topics: string[];
    stakeholderPositions: Array<{ person: string; position: string; sentiment: 'supportive' | 'neutral' | 'opposed' }>;
    keyTakeaways: string[];
    outcomeAssessment?: string;
}

/**
 * Extract facts from meetings that have notes but haven't been processed yet.
 */
export async function extractMeetingNotesFacts(userId: string): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[MeetingNotesExtractor] Starting for user ${userId.substring(0, 8)}...`);

    // Find meetings with notes that haven't been extracted
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const meetingsWithNotes = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            notes: { not: null },
            startTime: { gte: thirtyDaysAgo },
        },
        orderBy: { startTime: 'desc' },
    });

    if (meetingsWithNotes.length === 0) {
        console.log(`[MeetingNotesExtractor] No meetings with notes found`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    // Filter to unextracted
    let totalEntities = 0;
    let totalFacts = 0;
    const llmConfig = await getUserLLMConfig(userId);

    for (const meeting of meetingsWithNotes) {
        const alreadyDone = await isAlreadyExtracted(userId, SOURCE_TYPE, meeting.id);
        if (alreadyDone) continue;

        try {
            const result = await processNotesForMeeting(userId, meeting, llmConfig);
            totalEntities += result.entities;
            totalFacts += result.facts;
            await logExtraction(userId, SOURCE_TYPE, meeting.id, result.entities, result.facts);
        } catch (err: any) {
            console.error(`[MeetingNotesExtractor] Error for meeting ${meeting.id}: ${err.message}`);
            await logExtraction(userId, SOURCE_TYPE, meeting.id, 0, 0);
        }
    }

    console.log(`[MeetingNotesExtractor] Done — ${totalEntities} entities, ${totalFacts} facts`);
    return { entitiesFound: totalEntities, factsCreated: totalFacts };
}

async function processNotesForMeeting(
    userId: string,
    meeting: any,
    llmConfig: any,
): Promise<{ entities: number; facts: number }> {
    const notes = meeting.notes as string;
    if (!notes || notes.trim().length < 50) {
        return { entities: 0, facts: 0 };
    }

    let entities = 0;
    let facts = 0;

    // Use LLM to extract structured intelligence from notes
    const intelligence = await extractIntelligenceFromNotes(
        notes,
        meeting.title,
        meeting.desiredOutcome || '',
        llmConfig
    );

    if (!intelligence) {
        return { entities: 0, facts: 0 };
    }

    // 1. Create facts for decisions
    for (const decision of intelligence.decisions) {
        let ownerEntityId: string | undefined;
        if (decision.owner) {
            ownerEntityId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: cleanPersonName(decision.owner),
            });
            entities++;
        }

        const result = await createFact({
            userId,
            subjectId: ownerEntityId || (await getMeetingEntity(userId, meeting)),
            predicate: 'decided',
            objectValue: decision.description,
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
            confidence: 0.8,
            validFrom: meeting.endTime || meeting.startTime,
            metadata: { meetingTitle: meeting.title },
        });
        if (result.action === 'CREATED') facts++;
    }

    // 2. Create facts for action items
    for (const item of intelligence.actionItems) {
        let assigneeEntityId: string | undefined;
        if (item.assignee) {
            assigneeEntityId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: cleanPersonName(item.assignee),
            });
            entities++;
        }

        const result = await createFact({
            userId,
            subjectId: assigneeEntityId || (await getMeetingEntity(userId, meeting)),
            predicate: 'committed_to',
            objectValue: item.description,
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
            confidence: 0.85,
            validFrom: meeting.endTime || meeting.startTime,
            metadata: {
                meetingTitle: meeting.title,
                deadline: item.deadline,
            },
        });
        if (result.action === 'CREATED') facts++;
    }

    // 3. Create facts for stakeholder positions
    for (const pos of intelligence.stakeholderPositions) {
        const personEntityId = await resolveEntity({
            userId,
            type: 'PERSON',
            name: cleanPersonName(pos.person),
        });
        entities++;

        const result = await createFact({
            userId,
            subjectId: personEntityId,
            predicate: pos.sentiment === 'opposed' ? 'objected_to' : pos.sentiment === 'supportive' ? 'supported' : 'commented_on',
            objectValue: pos.position,
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
            confidence: 0.75,
            validFrom: meeting.endTime || meeting.startTime,
            metadata: { sentiment: pos.sentiment, meetingTitle: meeting.title },
        });
        if (result.action === 'CREATED') facts++;
    }

    // 4. Create topic entities
    for (const topic of intelligence.topics) {
        const topicEntityId = await resolveEntity({
            userId,
            type: 'TOPIC',
            name: topic,
        });
        entities++;

        const meetingEntityId = await getMeetingEntity(userId, meeting);
        const result = await createFact({
            userId,
            subjectId: meetingEntityId,
            predicate: 'discussed',
            objectEntityId: topicEntityId,
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
            validFrom: meeting.startTime,
        });
        if (result.action === 'CREATED') facts++;
    }

    // 5. Store key takeaways as meeting-level facts
    if (intelligence.keyTakeaways.length > 0) {
        const meetingEntityId = await getMeetingEntity(userId, meeting);
        const result = await createFact({
            userId,
            subjectId: meetingEntityId,
            predicate: 'key_takeaways',
            objectValue: intelligence.keyTakeaways.join(' | '),
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
            confidence: 0.9,
            validFrom: meeting.endTime || meeting.startTime,
        });
        if (result.action === 'CREATED') facts++;
    }

    return { entities, facts };
}

async function getMeetingEntity(userId: string, meeting: any): Promise<string> {
    return resolveEntity({
        userId,
        type: 'MEETING_SERIES',
        name: meeting.title || 'Unknown Meeting',
        properties: {
            recurringId: meeting.recurringId,
            meetingType: meeting.meetingType,
        },
    });
}

async function extractIntelligenceFromNotes(
    notes: string,
    meetingTitle: string,
    desiredOutcome: string,
    llmConfig: any,
): Promise<ExtractedNotesIntelligence | null> {
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.warn('[MeetingNotesExtractor] No LLM configured — skipping');
        return null;
    }

    // Truncate very long notes
    const truncatedNotes = notes.length > 8000 ? notes.substring(0, 8000) + '\n[...truncated]' : notes;

    const prompt = `Analyze these meeting notes and extract structured intelligence.

MEETING: "${meetingTitle}"
${desiredOutcome ? `DESIRED OUTCOME: "${desiredOutcome}"` : ''}

NOTES:
${truncatedNotes}

Extract and return as JSON:
{
  "decisions": [{"description": "what was decided", "owner": "person name or null"}],
  "actionItems": [{"description": "what needs to be done", "assignee": "person name or null", "deadline": "date or null"}],
  "topics": ["key topics discussed"],
  "stakeholderPositions": [{"person": "name", "position": "their stance/argument", "sentiment": "supportive|neutral|opposed"}],
  "keyTakeaways": ["1-2 sentence takeaways"],
  "outcomeAssessment": "Brief assessment of whether the desired outcome was achieved, if one was set"
}

Rules:
- Only include items actually mentioned in the notes
- Use real names from the notes, not generic labels
- For action items, only include explicit commitments, not implied tasks
- Keep descriptions concise (1 sentence each)
- Return ONLY the JSON object, no other text`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.1, maxOutputTokens: 2000 }),
            { label: 'MeetingNotesExtractor' }
        );

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[MeetingNotesExtractor] LLM returned no JSON');
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]) as ExtractedNotesIntelligence;

        // Validate structure
        if (!Array.isArray(parsed.decisions)) parsed.decisions = [];
        if (!Array.isArray(parsed.actionItems)) parsed.actionItems = [];
        if (!Array.isArray(parsed.topics)) parsed.topics = [];
        if (!Array.isArray(parsed.stakeholderPositions)) parsed.stakeholderPositions = [];
        if (!Array.isArray(parsed.keyTakeaways)) parsed.keyTakeaways = [];

        return parsed;
    } catch (err: any) {
        console.error(`[MeetingNotesExtractor] LLM extraction failed: ${err.message}`);
        return null;
    }
}
