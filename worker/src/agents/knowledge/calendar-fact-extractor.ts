/**
 * Calendar Fact Extractor
 *
 * Extracts entities and facts from MeetingSyncRecord:
 * - PERSON entities from attendees
 * - PROJECT/TOPIC entities from title keywords (via LLM)
 * - MEETING_SERIES entities from recurring meetings
 * - Facts: meets_with, attends, works_on, involves_topic, meeting_frequency
 *
 * Trigger: pg-boss job `knowledge-extract-calendar` queued after calendar sync
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity, cleanPersonName } from './entity-resolver';
import { createFact } from './fact-manager';
import { isAlreadyExtracted, logExtraction, getUnextractedIds } from './extraction-log';
import { getUserLLMConfig, generateText, withLLMRetry, WorkerLLMConfig } from '../../lib/user-llm';

const SOURCE_TYPE = 'MeetingSyncRecord';
const BATCH_SIZE = 15;

interface ExtractedMeetingInfo {
    meetingId: string;
    projects: string[];
    topics: string[];
    meetingSeriesName?: string;
}

/**
 * Main entry point — extract facts from all unprocessed calendar events for a user.
 */
export async function extractCalendarFacts(userId: string): Promise<{ entitiesFound: number; factsCreated: number }> {
    console.log(`[CalendarFactExtractor] Starting for user ${userId.substring(0, 8)}...`);

    let totalEntities = 0;
    let totalFacts = 0;

    // Get recent meetings (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: ninetyDaysAgo } },
        orderBy: { startTime: 'desc' },
    });

    if (meetings.length === 0) {
        console.log(`[CalendarFactExtractor] No meetings found`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    // Filter to unextracted only
    const allIds = meetings.map(m => m.id);
    const unextractedIds = await getUnextractedIds(userId, SOURCE_TYPE, allIds);

    if (unextractedIds.length === 0) {
        console.log(`[CalendarFactExtractor] All ${meetings.length} meetings already extracted`);
        return { entitiesFound: 0, factsCreated: 0 };
    }

    const unextractedMeetings = meetings.filter(m => unextractedIds.includes(m.id));
    console.log(`[CalendarFactExtractor] Processing ${unextractedMeetings.length} new meetings`);

    // Fetch user's LLM config once for all batches
    const llmConfig = await getUserLLMConfig(userId);

    // Process in batches for LLM extraction
    for (let i = 0; i < unextractedMeetings.length; i += BATCH_SIZE) {
        const batch = unextractedMeetings.slice(i, i + BATCH_SIZE);
        const llmExtracted = await extractProjectsAndTopics(batch, llmConfig);

        for (const meeting of batch) {
            try {
                const result = await processMeeting(userId, meeting, llmExtracted);
                totalEntities += result.entities;
                totalFacts += result.facts;

                await logExtraction(userId, SOURCE_TYPE, meeting.id, result.entities, result.facts);
            } catch (err: any) {
                console.error(`[CalendarFactExtractor] Error processing meeting ${meeting.id}: ${err.message}`);
                // Log with 0 to avoid reprocessing broken records repeatedly
                await logExtraction(userId, SOURCE_TYPE, meeting.id, 0, 0);
            }
        }
    }

    console.log(`[CalendarFactExtractor] Done — ${totalEntities} entities, ${totalFacts} facts created`);
    return { entitiesFound: totalEntities, factsCreated: totalFacts };
}

/**
 * Process a single meeting: create entities and facts.
 */
async function processMeeting(
    userId: string,
    meeting: any,
    llmExtracted: Map<string, ExtractedMeetingInfo>
): Promise<{ entities: number; facts: number }> {
    let entities = 0;
    let facts = 0;

    const attendees = (meeting.attendees as any[]) || [];
    const llmInfo = llmExtracted.get(meeting.id);

    // 1. Create PERSON entities from attendees
    const personEntityIds: string[] = [];
    for (const attendee of attendees) {
        const email = attendee.email || '';
        const name = attendee.displayName || attendee.name || cleanPersonName(email);
        if (!name || name.length < 2) continue;

        const entityId = await resolveEntity({
            userId,
            type: 'PERSON',
            name,
            properties: {
                email: email || undefined,
                responseStatus: attendee.responseStatus,
            },
        });
        personEntityIds.push(entityId);
        entities++;
    }

    // 2. Create PROJECT entities from LLM extraction
    const projectEntityIds: string[] = [];
    if (llmInfo?.projects) {
        for (const project of llmInfo.projects) {
            const entityId = await resolveEntity({
                userId,
                type: 'PROJECT',
                name: project,
            });
            projectEntityIds.push(entityId);
            entities++;
        }
    }

    // 3. Create TOPIC entities from LLM extraction
    const topicEntityIds: string[] = [];
    if (llmInfo?.topics) {
        for (const topic of llmInfo.topics) {
            const entityId = await resolveEntity({
                userId,
                type: 'TOPIC',
                name: topic,
            });
            topicEntityIds.push(entityId);
            entities++;
        }
    }

    // 4. Create MEETING_SERIES entity for recurring meetings
    let meetingSeriesId: string | undefined;
    if (meeting.isRecurring && (llmInfo?.meetingSeriesName || meeting.title)) {
        meetingSeriesId = await resolveEntity({
            userId,
            type: 'MEETING_SERIES',
            name: llmInfo?.meetingSeriesName || meeting.title,
            properties: {
                recurringId: meeting.recurringId,
                meetingType: meeting.meetingType,
            },
        });
        entities++;
    }

    // 5. Create facts: person meets_with person (pairwise for small meetings, hub-spoke for large)
    if (personEntityIds.length <= 6) {
        // Small meeting: pairwise meets_with
        for (let i = 0; i < personEntityIds.length; i++) {
            for (let j = i + 1; j < personEntityIds.length; j++) {
                const result = await createFact({
                    userId,
                    subjectId: personEntityIds[i],
                    predicate: 'meets_with',
                    objectEntityId: personEntityIds[j],
                    source: 'INFERRED_MEETING',
                    sourceRefType: SOURCE_TYPE,
                    sourceRefId: meeting.id,
                    validFrom: meeting.startTime,
                    metadata: { meetingTitle: meeting.title },
                });
                if (result.action === 'CREATED') facts++;
            }
        }
    } else {
        // Large meeting: each person "attends" the meeting
        // Create a meeting entity even for non-recurring large meetings
        const meetingEntityId = meetingSeriesId || await resolveEntity({
            userId,
            type: 'MEETING_SERIES',
            name: meeting.title || `Meeting (${personEntityIds.length} people)`,
            properties: {
                meetingType: meeting.meetingType,
                isRecurring: !!meeting.isRecurring,
            },
        });
        if (!meetingSeriesId) entities++;

        for (const personId of personEntityIds) {
            const result = await createFact({
                userId,
                subjectId: personId,
                predicate: 'attends',
                objectEntityId: meetingEntityId,
                source: 'INFERRED_MEETING',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: meeting.id,
                validFrom: meeting.startTime,
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    // 6. Create facts: person works_on project
    for (const personId of personEntityIds) {
        for (const projectId of projectEntityIds) {
            const result = await createFact({
                userId,
                subjectId: personId,
                predicate: 'works_on',
                objectEntityId: projectId,
                source: 'INFERRED_MEETING',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: meeting.id,
                confidence: 0.4, // Lower confidence — just meeting attendance
                validFrom: meeting.startTime,
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    // 7. Create facts: project involves_topic
    for (const projectId of projectEntityIds) {
        for (const topicId of topicEntityIds) {
            const result = await createFact({
                userId,
                subjectId: projectId,
                predicate: 'involves_topic',
                objectEntityId: topicId,
                source: 'INFERRED_MEETING',
                sourceRefType: SOURCE_TYPE,
                sourceRefId: meeting.id,
                validFrom: meeting.startTime,
            });
            if (result.action === 'CREATED') facts++;
        }
    }

    // 8. Create meeting_type fact for meeting series
    if (meetingSeriesId && meeting.meetingType) {
        const result = await createFact({
            userId,
            subjectId: meetingSeriesId,
            predicate: 'has_meeting_type',
            objectValue: meeting.meetingType,
            source: 'INFERRED_MEETING',
            sourceRefType: SOURCE_TYPE,
            sourceRefId: meeting.id,
        });
        if (result.action === 'CREATED') facts++;
    }

    return { entities, facts };
}

/**
 * Use LLM to extract project names and topics from a batch of meeting titles.
 * Batches 10-20 meetings per call for efficiency.
 */
async function extractProjectsAndTopics(
    meetings: any[],
    llmConfig: WorkerLLMConfig
): Promise<Map<string, ExtractedMeetingInfo>> {
    const result = new Map<string, ExtractedMeetingInfo>();

    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.warn('[CalendarFactExtractor] No LLM configured — using heuristic extraction');
        for (const m of meetings) {
            result.set(m.id, heuristicExtract(m));
        }
        return result;
    }

    const meetingList = meetings.map((m, i) => {
        const attendeeCount = ((m.attendees as any[]) || []).length;
        return `${i + 1}. "${m.title}" (${m.meetingType || 'unknown'}, ${attendeeCount} attendees, ${m.isRecurring ? 'recurring' : 'one-off'})`;
    }).join('\n');

    const prompt = `Extract project names and topics from these calendar meeting titles. Return JSON array.

MEETINGS:
${meetingList}

For each meeting, identify:
- projects: specific project/product names mentioned (NOT generic words like "review" or "sync")
- topics: business topics discussed (e.g., "hiring", "Q1 planning", "performance review")
- meetingSeriesName: for recurring meetings, a clean series name (e.g., "Weekly Product Sync")

Return ONLY a JSON array with one object per meeting, in order:
[
  { "projects": ["ProjectX"], "topics": ["hiring"], "meetingSeriesName": "Weekly Product Sync" },
  ...
]

If no projects or topics can be extracted, use empty arrays. Respond with ONLY the JSON array.`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.1, maxOutputTokens: 1500 }),
            { label: 'CalendarFactExtractor' }
        );
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.warn('[CalendarFactExtractor] LLM returned no JSON — falling back to heuristic');
            for (const m of meetings) result.set(m.id, heuristicExtract(m));
            return result;
        }

        const parsed = JSON.parse(jsonMatch[0]) as Array<{
            projects?: string[];
            topics?: string[];
            meetingSeriesName?: string;
        }>;

        for (let i = 0; i < meetings.length && i < parsed.length; i++) {
            result.set(meetings[i].id, {
                meetingId: meetings[i].id,
                projects: parsed[i].projects || [],
                topics: parsed[i].topics || [],
                meetingSeriesName: parsed[i].meetingSeriesName,
            });
        }
    } catch (err: any) {
        console.error(`[CalendarFactExtractor] LLM extraction failed: ${err.message}`);
        for (const m of meetings) result.set(m.id, heuristicExtract(m));
    }

    return result;
}

/**
 * Fallback heuristic extraction when LLM is unavailable.
 */
function heuristicExtract(meeting: any): ExtractedMeetingInfo {
    const title = meeting.title || '';
    const genericWords = new Set([
        // Meeting types
        'meeting', 'call', 'sync', 'weekly', 'daily', 'standup', 'stand',
        'review', 'with', 'team', 'catch', 'check', 'follow', 'update',
        'discussion', 'chat', 'talk', 'session', 'huddle', 'touchbase',
        'debrief', 'retro', 'retrospective', 'planning', 'grooming',
        'refinement', 'kickoff', 'wrap', 'checkpoint',
        // Days / time
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
        'saturday', 'sunday', 'morning', 'afternoon', 'evening',
        // Common filler
        'the', 'and', 'for', 'about', 'from', 'this', 'that', 'with',
        'into', 'over', 'next', 'last', 'prep', 'agenda', 'notes',
        // Platforms / tools (not entities)
        'zoom', 'teams', 'meet', 'google', 'slack', 'webex', 'hangout',
        // Org-generic terms
        'sprint', 'board', 'committee', 'working', 'group', 'forum',
        'townhall', 'town', 'hall', 'all-hands', 'hands', 'offsite',
        'onsite', 'virtual', 'hybrid', 'monthly', 'quarterly', 'annual',
        'biweekly', 'recurring', 'optional', 'tentative', 'cancelled',
    ]);

    const words = title.split(/[\s\-:\/]+/)
        .filter((w: string) => w.length > 3 && !genericWords.has(w.toLowerCase()));

    // Words that look like project names (capitalized, not common words)
    const projects = words.filter((w: string) => w[0] === w[0].toUpperCase() && w.length > 4);
    const topics = words.filter((w: string) => !projects.includes(w) && w.length > 4);

    return {
        meetingId: meeting.id,
        projects: projects.slice(0, 2),
        topics: topics.slice(0, 2),
        meetingSeriesName: meeting.isRecurring ? title : undefined,
    };
}
