/**
 * Coaching Relationship Agent
 *
 * Manages the CoachingRelationshipPlan — the long-term memory of how Mira
 * relates to a specific user. Two entry points:
 *
 * 1. updateRelationshipPlan() — called after every call evaluation.
 *    Merges commitments, updates phase, adjusts avoid topics and themes.
 *
 * 2. deepAnalyzeRelationship() — weekly LLM-based deep analysis.
 *    Identifies coaching themes, builds personality profile, detects archetype,
 *    and checks maturity transitions (LEARNING → OBSERVING → COACHING).
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';

// ============================================================================
// TYPES
// ============================================================================

interface EvaluationResult {
    id: string;
    voiceCallId: string;
    whatWorked: string[];
    whatToImprove: string[];
    commitmentsExtracted: string[];
    newInfoLearned: string[];
    recommendedTopics: string[];
    overallScore: number;
}

interface Commitment {
    commitment: string;
    madeAt: string;
    followedUpAt?: string;
    status: 'open' | 'followed_up' | 'completed' | 'dropped';
    callId: string;
}

interface CoachingTheme {
    theme: string;
    firstSeen: string;
    lastSeen: string;
    callCount: number;
    status: 'active' | 'resolved' | 'parked';
}

interface PersonalityProfile {
    bigFive?: Record<string, { score: number; evidence: string }>;
    communicationStyle?: Record<string, string>;
    emotionalTriggers?: Record<string, string[]>;
    decisionMakingStyle?: Record<string, string>;
    coachingAdaptations?: Record<string, string[]>;
    archetype?: { primary: string; secondary?: string };
    lastUpdated?: string;
    confidenceLevel?: string;
    callsAnalyzed?: number;
}

// ============================================================================
// 1. UPDATE RELATIONSHIP PLAN (post-evaluation)
// ============================================================================

/**
 * Called after each call evaluation to incrementally update the relationship plan.
 * Upserts the plan, detects phase from call count, merges commitments, and
 * updates avoid topics and recommended themes.
 */
export async function updateRelationshipPlan(
    userId: string,
    evaluation: EvaluationResult
): Promise<void> {
    console.log(`[CoachingRelationship] Updating plan for user ${userId.substring(0, 8)} after call ${evaluation.voiceCallId.substring(0, 8)}`);

    try {
        // 1. Get call count from PersonalContext for phase detection
        const personalContext = await prisma.personalContext.findUnique({
            where: { userId },
            select: { callCount: true },
        });

        const callCount = personalContext?.callCount ?? 0;
        const phase = detectPhase(callCount);

        // 2. Load or create existing plan
        const existingPlan = await prisma.coachingRelationshipPlan.findUnique({
            where: { userId },
        });

        const existingCommitments: Commitment[] = existingPlan?.commitments
            ? (existingPlan.commitments as unknown as Commitment[])
            : [];

        const existingThemes: CoachingTheme[] = existingPlan?.coachingThemes
            ? (existingPlan.coachingThemes as unknown as CoachingTheme[])
            : [];

        const existingAvoidTopics: string[] = existingPlan?.avoidTopics ?? [];

        // 3. Merge new commitments
        const now = new Date().toISOString();
        const newCommitments: Commitment[] = evaluation.commitmentsExtracted.map((c) => ({
            commitment: c,
            madeAt: now,
            status: 'open' as const,
            callId: evaluation.voiceCallId,
        }));

        const mergedCommitments = [...existingCommitments, ...newCommitments];

        // 4. Update avoid topics from whatToImprove patterns
        //    Look for patterns like "avoid discussing X" or negative feedback patterns
        const newAvoidTopics = extractAvoidTopics(evaluation.whatToImprove);
        const mergedAvoidTopics = Array.from(
            new Set([...existingAvoidTopics, ...newAvoidTopics])
        );

        // 5. Add recommended topics to coaching themes
        const updatedThemes = mergeRecommendedTopics(
            existingThemes,
            evaluation.recommendedTopics,
            now
        );

        // 6. Upsert the plan
        await prisma.coachingRelationshipPlan.upsert({
            where: { userId },
            create: {
                userId,
                phase,
                coachingThemes: updatedThemes as any,
                commitments: mergedCommitments as any,
                avoidTopics: mergedAvoidTopics,
            },
            update: {
                phase,
                coachingThemes: updatedThemes as any,
                commitments: mergedCommitments as any,
                avoidTopics: mergedAvoidTopics,
            },
        });

        console.log(`[CoachingRelationship] Plan updated — phase: ${phase}, commitments: ${mergedCommitments.length}, themes: ${updatedThemes.length}`);
    } catch (err: any) {
        console.error(`[CoachingRelationship] Failed to update plan: ${err.message}`);
    }
}

// ============================================================================
// 2. DEEP ANALYZE RELATIONSHIP (weekly)
// ============================================================================

/**
 * Weekly LLM-based deep analysis of the coaching relationship.
 * Identifies themes, builds personality/communication profiles, detects archetype,
 * marks stale commitments, and checks maturity transitions.
 */
export async function deepAnalyzeRelationship(userId: string): Promise<void> {
    console.log(`[CoachingRelationship] Starting deep analysis for user ${userId.substring(0, 8)}`);

    return withAgentRun('coaching-relationship-deep', userId, 'cron', async (ctx) => {
        await _deepAnalyzeRelationship(userId, ctx);
    });
}

async function _deepAnalyzeRelationship(userId: string, ctx: { logs: string[]; itemsProcessed: number }): Promise<void> {
    try {
        // 1. Load last 2 weeks of CallEvaluations with transcript excerpts
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const evaluations = await prisma.callEvaluation.findMany({
            where: {
                userId,
                createdAt: { gte: twoWeeksAgo },
            },
            include: {
                voiceCall: {
                    select: {
                        id: true,
                        transcript: true,
                        callType: true,
                        durationSeconds: true,
                        startedAt: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (evaluations.length === 0) {
            console.log(`[CoachingRelationship] No evaluations in last 2 weeks — skipping deep analysis`);
            return;
        }

        // 2. Load current plan
        const plan = await prisma.coachingRelationshipPlan.findUnique({
            where: { userId },
        });

        if (!plan) {
            console.log(`[CoachingRelationship] No existing plan — skipping deep analysis (run updateRelationshipPlan first)`);
            return;
        }

        // 3. Load PersonalContext for call count and related data
        const personalContext = await prisma.personalContext.findUnique({
            where: { userId },
        });

        const callCount = personalContext?.callCount ?? 0;

        // 4. Count stakeholders for maturity check
        const stakeholderCount = await prisma.stakeholderProfile.count({
            where: { userId },
        });

        // 5. Build LLM prompt with evaluation data
        const transcriptExcerpts = evaluations.map((e) => {
            const transcript = e.voiceCall?.transcript;
            // Take first 1500 chars of each transcript to keep prompt manageable
            const excerpt = transcript ? transcript.substring(0, 1500) : '(no transcript)';
            return {
                date: e.createdAt.toISOString().split('T')[0],
                callType: e.voiceCall?.callType ?? 'unknown',
                overallScore: e.overallScore,
                whatWorked: e.whatWorked,
                whatToImprove: e.whatToImprove,
                commitmentsExtracted: e.commitmentsExtracted,
                newInfoLearned: e.newInfoLearned,
                recommendedTopics: e.recommendedTopics,
                transcriptExcerpt: excerpt,
            };
        });

        const currentThemes = plan.coachingThemes as unknown as CoachingTheme[];
        const currentProfile = plan.communicationProfile as unknown as Record<string, any>;
        const currentPersonality = plan.personalityProfile as unknown as PersonalityProfile;
        const currentCommitments = plan.commitments as unknown as Commitment[];

        const config = await getUserLLMConfig(userId);
        if (config.provider === 'none') {
            console.log(`[CoachingRelationship] No LLM configured — skipping deep analysis`);
            return;
        }

        const prompt = buildDeepAnalysisPrompt(
            transcriptExcerpts,
            currentThemes,
            currentProfile,
            currentPersonality,
            callCount
        );

        const rawResponse = await withLLMRetry(
            () => generateText(config, prompt, {
                userId,
                traceName: 'coaching-relationship-deep-analysis',
                maxOutputTokens: 4000,
                temperature: 0.4,
            }),
            { retries: 2, label: 'CoachingRelationship' }
        );

        // 6. Parse LLM response
        const analysis = parseDeepAnalysisResponse(rawResponse);

        if (!analysis) {
            console.error(`[CoachingRelationship] Failed to parse LLM response`);
            return;
        }

        // 7. Mark stale commitments (>7 days, never followed up)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const updatedCommitments = currentCommitments.map((c) => {
            if (
                c.status === 'open' &&
                !c.followedUpAt &&
                new Date(c.madeAt) < sevenDaysAgo
            ) {
                return { ...c, status: 'dropped' as const };
            }
            return c;
        });

        // 8. Check maturity transitions
        const currentMode = await getCurrentConfidenceMode(userId);
        const newMode = checkMaturityTransition(
            currentMode,
            callCount,
            personalContext,
            stakeholderCount,
            evaluations
        );

        // 9. Save updated plan
        await prisma.coachingRelationshipPlan.update({
            where: { userId },
            data: {
                coachingThemes: (analysis.coachingThemes ?? currentThemes) as any,
                communicationProfile: (analysis.communicationProfile ?? currentProfile) as any,
                personalityProfile: (analysis.personalityProfile ?? currentPersonality) as any,
                commitments: updatedCommitments as any,
                phase: detectPhase(callCount),
            },
        });

        // 10. Update UserPreferences with archetype if detected
        if (analysis.personalityProfile?.archetype?.primary) {
            await prisma.userPreferences.upsert({
                where: { userId },
                create: {
                    userId,
                    primaryArchetype: analysis.personalityProfile.archetype.primary,
                    secondaryArchetype: analysis.personalityProfile.archetype.secondary ?? null,
                },
                update: {
                    primaryArchetype: analysis.personalityProfile.archetype.primary,
                    secondaryArchetype: analysis.personalityProfile.archetype.secondary ?? null,
                },
            });

            console.log(`[CoachingRelationship] Archetype updated: ${analysis.personalityProfile.archetype.primary}`);
        }

        // 11. If maturity transition detected, update latest voice call confidence mode
        if (newMode && newMode !== currentMode) {
            console.log(`[CoachingRelationship] Maturity transition: ${currentMode ?? 'LEARNING'} → ${newMode}`);
        }

        ctx.itemsProcessed = evaluations.length;
        console.log(`[CoachingRelationship] Deep analysis complete — ${evaluations.length} evaluations analyzed, ${updatedCommitments.filter((c) => c.status === 'dropped').length} stale commitments marked`);
    } catch (err: any) {
        console.error(`[CoachingRelationship] Deep analysis failed: ${err.message}`);
        throw err;
    }
}

// ============================================================================
// HELPERS
// ============================================================================

function detectPhase(callCount: number): string {
    if (callCount <= 5) return 'discovery';
    if (callCount <= 15) return 'building_trust';
    if (callCount <= 30) return 'deep_coaching';
    return 'sustained_partnership';
}

/**
 * Extract avoid-topic signals from whatToImprove feedback.
 * Looks for phrases indicating the user doesn't want certain topics raised.
 */
function extractAvoidTopics(whatToImprove: string[]): string[] {
    const avoidPatterns = [
        /avoid\s+(?:discussing|mentioning|bringing up)\s+(.+)/i,
        /don'?t\s+(?:ask|bring up|mention|discuss)\s+(.+)/i,
        /sensitive\s+(?:topic|area|subject)[:\s]+(.+)/i,
        /user\s+(?:doesn'?t|does not)\s+want\s+to\s+(?:talk|discuss)\s+(?:about\s+)?(.+)/i,
    ];

    const topics: string[] = [];
    for (const item of whatToImprove) {
        for (const pattern of avoidPatterns) {
            const match = item.match(pattern);
            if (match?.[1]) {
                topics.push(match[1].trim().toLowerCase());
            }
        }
    }

    return topics;
}

/**
 * Merge recommended topics into existing coaching themes.
 * Creates new themes or updates lastSeen/callCount for existing ones.
 */
function mergeRecommendedTopics(
    existingThemes: CoachingTheme[],
    recommendedTopics: string[],
    now: string
): CoachingTheme[] {
    const themes = [...existingThemes];

    for (const topic of recommendedTopics) {
        const normalizedTopic = topic.toLowerCase().trim();
        const existingIdx = themes.findIndex(
            (t) => t.theme.toLowerCase().trim() === normalizedTopic
        );

        if (existingIdx >= 0) {
            // Update existing theme
            themes[existingIdx] = {
                ...themes[existingIdx],
                lastSeen: now,
                callCount: themes[existingIdx].callCount + 1,
            };
        } else {
            // Add new theme
            themes.push({
                theme: topic,
                firstSeen: now,
                lastSeen: now,
                callCount: 1,
                status: 'active',
            });
        }
    }

    return themes;
}

async function getCurrentConfidenceMode(userId: string): Promise<string | null> {
    const latestCall = await prisma.voiceCall.findFirst({
        where: { userId, confidenceMode: { not: null } },
        orderBy: { startedAt: 'desc' },
        select: { confidenceMode: true },
    });

    return latestCall?.confidenceMode ?? null;
}

/**
 * Check maturity transitions:
 * - LEARNING → OBSERVING: 5+ calls, PersonalContext populated, 3+ stakeholders
 * - OBSERVING → COACHING: 15+ calls, user confirmed 3+ assertions, avg valueAddScore > 6
 */
function checkMaturityTransition(
    currentMode: string | null,
    callCount: number,
    personalContext: any,
    stakeholderCount: number,
    evaluations: any[]
): string | null {
    const mode = currentMode ?? 'LEARNING';

    if (mode === 'LEARNING') {
        const contextPopulated =
            personalContext &&
            (personalContext.interests?.length > 0 ||
                personalContext.values?.length > 0 ||
                personalContext.energyPatterns);

        if (callCount >= 5 && contextPopulated && stakeholderCount >= 3) {
            return 'OBSERVING';
        }
    }

    if (mode === 'OBSERVING') {
        const avgValueAdd =
            evaluations.length > 0
                ? evaluations.reduce((sum: number, e: any) => sum + (e.valueAddScore ?? 0), 0) /
                  evaluations.length
                : 0;

        // Check for user confirmations via corrections table
        // For now, use the evaluation data as a proxy — high valueAdd scores
        // suggest the user finds Mira's assertions valuable
        const highValueCalls = evaluations.filter(
            (e: any) => (e.valueAddScore ?? 0) > 6
        ).length;

        if (callCount >= 15 && highValueCalls >= 3 && avgValueAdd > 6) {
            return 'COACHING';
        }
    }

    return null;
}

// ============================================================================
// LLM PROMPT & PARSING
// ============================================================================

function buildDeepAnalysisPrompt(
    evaluations: any[],
    currentThemes: CoachingTheme[],
    currentProfile: Record<string, any>,
    currentPersonality: PersonalityProfile,
    callCount: number
): string {
    return `You are analyzing the coaching relationship between Mira (AI executive coach) and a user.
Below are the last 2 weeks of call evaluations with transcript excerpts.

CALL DATA:
${JSON.stringify(evaluations, null, 2)}

CURRENT COACHING THEMES:
${JSON.stringify(currentThemes, null, 2)}

CURRENT COMMUNICATION PROFILE:
${JSON.stringify(currentProfile, null, 2)}

CURRENT PERSONALITY PROFILE:
${JSON.stringify(currentPersonality, null, 2)}

TOTAL CALLS SO FAR: ${callCount}

Analyze these calls and provide a JSON response with the following structure. Be evidence-based — cite specific transcript excerpts or patterns.

{
  "coachingThemes": [
    { "theme": "string — through-line like delegation anxiety or board prep stress", "firstSeen": "YYYY-MM-DD", "lastSeen": "YYYY-MM-DD", "callCount": number, "status": "active|resolved|parked" }
  ],
  "communicationProfile": {
    "pace": "fast|moderate|slow",
    "depth": "surface|moderate|deep",
    "humor": "high|moderate|low|none",
    "directness": "very_direct|direct|diplomatic|indirect",
    "preferredTopicEntry": "direct_question|story_based|data_first|relationship_first",
    "avoidPatterns": ["patterns to avoid in conversation"]
  },
  "personalityProfile": {
    "bigFive": {
      "openness": { "score": 0.0-1.0, "evidence": "specific observation" },
      "conscientiousness": { "score": 0.0-1.0, "evidence": "specific observation" },
      "extraversion": { "score": 0.0-1.0, "evidence": "specific observation" },
      "agreeableness": { "score": 0.0-1.0, "evidence": "specific observation" },
      "neuroticism": { "score": 0.0-1.0, "evidence": "specific observation" }
    },
    "communicationStyle": {
      "preferredPace": "fast|moderate|slow",
      "depthPreference": "surface|moderate|deep",
      "responseStyle": "concise|detailed|narrative"
    },
    "emotionalTriggers": {
      "energizers": ["things that light them up"],
      "drainers": ["things that drain them"]
    },
    "decisionMakingStyle": {
      "primary": "analytical|intuitive|consultative|analytical_then_intuitive",
      "description": "how they tend to make decisions"
    },
    "coachingAdaptations": {
      "whatWorksWithThisPerson": ["specific coaching approaches"],
      "whatDoesntWork": ["approaches to avoid"],
      "miraTonesForThisUser": ["warm_direct", "challenging", etc.]
    },
    "archetype": {
      "primary": "operator|navigator|climber|founder|skeptic|reluctant|juggler|only_one|connector|returner|portfolio|community",
      "secondary": "optional second archetype or null"
    },
    "lastUpdated": "${new Date().toISOString().split('T')[0]}",
    "confidenceLevel": "low|moderate|high",
    "callsAnalyzed": ${callCount}
  }
}

IMPORTANT:
- Preserve existing themes that are still relevant — update lastSeen and callCount
- Only mark themes as "resolved" if there's clear evidence the user has moved past them
- For personality profile, build on existing data — don't overwrite without evidence
- Archetype detection requires at least 5 calls of evidence. If insufficient, omit the archetype field
- Be conservative with Big Five scores — only score traits you have clear evidence for
- Return ONLY valid JSON, no markdown fences or commentary`;
}

function parseDeepAnalysisResponse(raw: string): {
    coachingThemes?: CoachingTheme[];
    communicationProfile?: Record<string, any>;
    personalityProfile?: PersonalityProfile;
} | null {
    try {
        // Strip markdown code fences if present
        let cleaned = raw.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const parsed = JSON.parse(cleaned);

        return {
            coachingThemes: parsed.coachingThemes,
            communicationProfile: parsed.communicationProfile,
            personalityProfile: parsed.personalityProfile,
        };
    } catch (err: any) {
        console.error(`[CoachingRelationship] JSON parse error: ${err.message}`);
        console.error(`[CoachingRelationship] Raw response (first 500 chars): ${raw.substring(0, 500)}`);
        return null;
    }
}
