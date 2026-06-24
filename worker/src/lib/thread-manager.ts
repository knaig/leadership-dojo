/**
 * Thread Manager — Coaching Intelligence System
 *
 * Manages personal threads (family, hobbies, health, etc.) across voice calls.
 * Decides when to PLANT new topics, WATER recently planted ones, or MAINTAIN
 * older threads to deepen Mira's personal connection with the user.
 */

import { prisma } from './prisma';
import { getUserLLMConfig, generateText } from './user-llm';

// ============================================================================
// TYPES
// ============================================================================

export interface ThreadAction {
    type: 'PLANT' | 'WATER' | 'MAINTAIN' | 'NONE';
    threadId?: string;
    instruction: string;
}

type ThreadStage = 'PLANTED' | 'WATERED' | 'GROWING' | 'HARVESTED' | 'MAINTAINED';
type ThreadCategory = 'FAMILY' | 'HEALTH' | 'HOBBY' | 'ORIGIN' | 'ASPIRATION' | 'EMOTIONAL' | 'INTEGRATED';
type EngagementLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface ExtractedThread {
    category: ThreadCategory;
    topic: string;
    engagement: EngagementLevel;
    details: string;
}

// ============================================================================
// PLANT QUESTIONS BY CATEGORY
// ============================================================================

const PLANT_QUESTIONS: Record<string, string[]> = {
    FAMILY: [
        'What did you do this weekend?',
        'Any plans for the weekend?',
        "How's the family doing?",
    ],
    HEALTH: [
        "How'd you sleep?",
        'Getting any exercise in lately?',
        "How's your energy today?",
    ],
    HOBBY: [
        'What do you do to switch off from work?',
        'Reading anything interesting lately?',
    ],
    ORIGIN: [
        'How did you end up in your field?',
        'What got you into leadership?',
    ],
    ASPIRATION: [
        'If you had 6 months off, what would you do?',
    ],
};

// Call types that don't get personal threads
const NO_THREAD_CALL_TYPES = ['pre_meeting_prep', 'post_meeting_debrief', 'commitment_reminder'];

// ============================================================================
// SELECT THREAD ACTION
// ============================================================================

/**
 * Decide what thread action to take for this call.
 *
 * Priority:
 * 1. WATER — a planted thread from 1-3 days ago with non-LOW engagement
 * 2. MAINTAIN — a harvested/maintained/growing thread not touched in 5+ days
 * 3. PLANT — new thread in a category not recently used
 */
export async function selectThreadAction(
    userId: string,
    callType: string,
    callCount: number,
    conversationMode?: string | null,
): Promise<ThreadAction> {
    // No threads for task-specific call types
    if (NO_THREAD_CALL_TYPES.includes(callType)) {
        return { type: 'NONE', instruction: '' };
    }

    // Work-first users: no threads before call 5
    if (conversationMode === 'work_first' && callCount < 5) {
        return { type: 'NONE', instruction: '' };
    }

    const now = new Date();

    // Fetch all active threads for the user (not off-limits)
    const threads = await prisma.personalThread.findMany({
        where: { userId, offLimits: false },
        orderBy: { lastTouched: 'desc' },
    });

    // ---- Priority 1: WATER ----
    // Find a planted thread from 1-3 days ago with non-LOW engagement
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const waterCandidate = threads.find(
        (t) =>
            t.stage === 'PLANTED' &&
            t.userEngagement !== 'LOW' &&
            t.lastTouched <= oneDayAgo &&
            t.lastTouched >= threeDaysAgo,
    );

    if (waterCandidate) {
        return {
            type: 'WATER',
            threadId: waterCandidate.id,
            instruction: buildWaterInstruction(waterCandidate),
        };
    }

    // ---- Priority 2: MAINTAIN ----
    // Find a harvested/maintained/growing thread not touched in 5+ days
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const maintainCandidate = threads.find(
        (t) =>
            ['HARVESTED', 'MAINTAINED', 'GROWING'].includes(t.stage) &&
            t.lastTouched <= fiveDaysAgo,
    );

    if (maintainCandidate) {
        return {
            type: 'MAINTAIN',
            threadId: maintainCandidate.id,
            instruction: buildMaintainInstruction(maintainCandidate),
        };
    }

    // ---- Priority 3: PLANT ----
    // Don't plant ASPIRATION or EMOTIONAL before call 10
    const recentCategories = new Set(
        threads
            .filter((t) => {
                const daysSinceTouched = (now.getTime() - t.lastTouched.getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceTouched < 7;
            })
            .map((t) => t.category),
    );

    const allCategories = Object.keys(PLANT_QUESTIONS) as ThreadCategory[];
    const eligibleCategories = allCategories.filter((cat) => {
        // Skip recently used categories
        if (recentCategories.has(cat)) return false;
        // Don't plant ASPIRATION or EMOTIONAL before call 10
        if ((cat === 'ASPIRATION' || cat === 'EMOTIONAL') && callCount < 10) return false;
        return true;
    });

    if (eligibleCategories.length > 0) {
        const category = eligibleCategories[Math.floor(Math.random() * eligibleCategories.length)];
        const questions = PLANT_QUESTIONS[category];
        const question = questions[Math.floor(Math.random() * questions.length)];

        return {
            type: 'PLANT',
            instruction: `Naturally weave in this personal question: "${question}"`,
        };
    }

    return { type: 'NONE', instruction: '' };
}

// ============================================================================
// INSTRUCTION BUILDERS
// ============================================================================

function buildWaterInstruction(thread: { category: string; topic: string; details: unknown }): string {
    const detailStr = thread.details
        ? ` You previously learned: ${JSON.stringify(thread.details)}.`
        : '';
    return `Follow up on their ${thread.category.toLowerCase()} topic "${thread.topic}".${detailStr} Ask a natural follow-up question — don't just repeat what they said.`;
}

function buildMaintainInstruction(thread: { category: string; topic: string; details: unknown }): string {
    const detailStr = thread.details
        ? ` Context: ${JSON.stringify(thread.details)}.`
        : '';
    return `Check in on "${thread.topic}" (${thread.category.toLowerCase()}).${detailStr} A brief, warm mention is enough — don't force the conversation.`;
}

// ============================================================================
// STAGE ADVANCEMENT
// ============================================================================

export function advanceStage(current: string): ThreadStage {
    const progression: Record<string, ThreadStage> = {
        PLANTED: 'WATERED',
        WATERED: 'GROWING',
        GROWING: 'HARVESTED',
        HARVESTED: 'MAINTAINED',
        MAINTAINED: 'MAINTAINED',
    };
    return progression[current] || 'MAINTAINED';
}

// ============================================================================
// POST-CALL EXTRACTION
// ============================================================================

const EXTRACTION_PROMPT = `You are analyzing a voice call transcript between an AI coach (Mira) and a user.

Extract any PERSONAL topics discussed (not work topics). For each personal topic, provide:
- category: one of FAMILY, HEALTH, HOBBY, ORIGIN, ASPIRATION, EMOTIONAL
- topic: a short label (e.g. "tennis", "kids ages 7 and 4", "sleep trouble")
- engagement: LOW (user deflected/changed subject), MEDIUM (answered briefly), HIGH (expanded enthusiastically)
- details: key facts mentioned (e.g. "plays tennis on weekends with college friend Raj")

Return a JSON array. If no personal topics were discussed, return an empty array [].

Example output:
[
  {"category": "HOBBY", "topic": "tennis", "engagement": "HIGH", "details": "Plays doubles on Saturday mornings with college friend Raj at the Gymkhana club"},
  {"category": "FAMILY", "topic": "daughter's school play", "engagement": "MEDIUM", "details": "Daughter is in a school play next week, rehearsals have been hectic"}
]

TRANSCRIPT:
`;

/**
 * Extract personal topics from a call transcript and update/create PersonalThread records.
 */
export async function extractAndUpdateThreads(
    userId: string,
    transcript: string,
    voiceCallId: string,
): Promise<void> {
    if (!transcript || transcript.trim().length < 50) {
        return; // Too short to extract anything meaningful
    }

    // Get LLM config for this user
    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') {
        console.warn(`[ThreadManager] No LLM configured for user ${userId}, skipping extraction`);
        return;
    }

    let extracted: ExtractedThread[];
    try {
        const raw = await generateText(config, EXTRACTION_PROMPT + transcript, {
            userId,
            traceName: 'thread-extraction',
            temperature: 0.2,
            maxOutputTokens: 1000,
        });

        // Parse JSON from response — handle markdown code blocks
        const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        extracted = JSON.parse(jsonStr) as ExtractedThread[];

        if (!Array.isArray(extracted)) {
            console.warn(`[ThreadManager] LLM returned non-array for thread extraction`);
            return;
        }
    } catch (err: any) {
        console.error(`[ThreadManager] Failed to extract threads: ${err.message}`);
        return;
    }

    // Fetch existing threads for matching
    const existingThreads = await prisma.personalThread.findMany({
        where: { userId },
    });

    for (const item of extracted) {
        if (!item.category || !item.topic) continue;

        // Try to match against existing threads (same category + similar topic)
        const match = existingThreads.find(
            (t) =>
                t.category === item.category &&
                (t.topic.toLowerCase().includes(item.topic.toLowerCase()) ||
                    item.topic.toLowerCase().includes(t.topic.toLowerCase())),
        );

        if (match) {
            // Advance existing thread
            const newStage = advanceStage(match.stage);
            const existingDetails = (match.details as Record<string, unknown>) || {};
            const updatedDetails = {
                ...existingDetails,
                [`call_${voiceCallId}`]: item.details,
            };

            await prisma.personalThread.update({
                where: { id: match.id },
                data: {
                    stage: newStage,
                    lastTouched: new Date(),
                    touchCount: { increment: 1 },
                    userEngagement: item.engagement,
                    details: updatedDetails as any,
                    topic: item.topic.length > match.topic.length ? item.topic : match.topic, // Keep the more detailed topic name
                },
            });
        } else if (item.engagement !== 'LOW') {
            // Create new thread only if engagement is not LOW
            await prisma.personalThread.create({
                data: {
                    userId,
                    category: item.category,
                    topic: item.topic,
                    stage: 'PLANTED',
                    lastTouched: new Date(),
                    touchCount: 1,
                    userEngagement: item.engagement,
                    details: { [`call_${voiceCallId}`]: item.details },
                },
            });
        }
    }
}
