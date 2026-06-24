/**
 * Call Evaluation Agent — Coaching Intelligence System
 *
 * After each voice call ends, this agent scores the call on 6 KPIs,
 * extracts qualitative insights, and feeds them into the
 * CoachingRelationshipPlan for long-term relationship evolution.
 *
 * Called from the Vapi webhook handler after transcript + summary are ready.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText } from '../lib/user-llm';
import { updateRelationshipPlan } from './coaching-relationship-agent';
import { withAgentRun } from '../lib/agent-run';
import { reconcileExperimentAssignments, linkScoresToExperiment, seedExperimentsForUser } from './experiment-agent';
import { createSessionTrace, scoreTraceMulti, logEvent } from '../lib/langfuse';

// ============================================================================
// TYPES
// ============================================================================

interface EvaluationScores {
    newGroundScore: number;
    depthOfSharingScore: number;
    valueAddScore: number;
    contextUtilScore: number;
    repetitionScore: number;
    engagementScore: number;
}

interface EvaluationQualitative {
    whatWorked: string[];
    whatToImprove: string[];
    commitmentsExtracted: string[];
    newInfoLearned: string[];
    recommendedTopics: string[];
}

interface LLMEvaluationResponse extends EvaluationScores, EvaluationQualitative {
    postureMatch?: number;   // 1-10: did the posture match the user's need?
    timingMatch?: number;    // 1-10: was this a good time to call?
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Evaluate a completed voice call on 6 KPIs and extract qualitative insights.
 * Saves a CallEvaluation record and updates the CoachingRelationshipPlan.
 */
export async function evaluateCall(voiceCallId: string): Promise<void> {
    console.log(`[CallEvaluation] Starting evaluation for voiceCall=${voiceCallId}`);

    // Look up userId for tracking
    const vc = await prisma.voiceCall.findUnique({ where: { id: voiceCallId }, select: { userId: true } });

    return withAgentRun('call-evaluation', vc?.userId || undefined, 'queue', async (ctx) => {
        ctx.logs.push(`voiceCallId=${voiceCallId}`);
        await _evaluateCall(voiceCallId, ctx);
        ctx.itemsProcessed = 1;
    }, { triggerRef: 'call-evaluation', inputSummary: `voiceCallId=${voiceCallId}` });
}

async function _evaluateCall(voiceCallId: string, ctx?: { logs: string[] }): Promise<void> {
    try {
        // 1. Load the voice call
        const voiceCall = await prisma.voiceCall.findUnique({
            where: { id: voiceCallId },
            select: {
                id: true,
                userId: true,
                transcript: true,
                summary: true,
                callType: true,
                sentVariables: true,
            },
        });

        if (!voiceCall) {
            console.error(`[CallEvaluation] VoiceCall not found: ${voiceCallId}`);
            return;
        }

        if (!voiceCall.transcript) {
            console.warn(`[CallEvaluation] No transcript for voiceCall=${voiceCallId}, skipping evaluation`);
            return;
        }

        const { userId } = voiceCall;

        // 2. Load last 5 CallEvaluations for repetition detection
        const recentEvaluations = await prisma.callEvaluation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                overallScore: true,
                whatWorked: true,
                whatToImprove: true,
                recommendedTopics: true,
                voiceCall: {
                    select: {
                        summary: true,
                        callType: true,
                    },
                },
            },
        });

        // 3. Load CoachingRelationshipPlan for phase context
        const relationshipPlan = await prisma.coachingRelationshipPlan.findUnique({
            where: { userId },
            select: {
                phase: true,
                coachingThemes: true,
                communicationProfile: true,
                avoidTopics: true,
            },
        });

        // 4. Load PersonalContext for known/gap topics
        const personalContext = await prisma.personalContext.findUnique({
            where: { userId },
            select: {
                knownTopics: true,
                gapTopics: true,
                callCount: true,
            },
        });

        // 5. Build prompt and call LLM
        const llmConfig = await getUserLLMConfig(userId);

        if (llmConfig.provider === 'none') {
            console.warn(`[CallEvaluation] No LLM configured for user=${userId}, skipping evaluation`);
            return;
        }

        const prompt = buildEvaluationPrompt(voiceCall, recentEvaluations, relationshipPlan, personalContext);

        const rawResponse = await generateText(llmConfig, prompt, {
            userId,
            traceName: 'call-evaluation',
            temperature: 0.2,
            maxOutputTokens: 1500,
        });

        const evaluation = parseEvaluationResponse(rawResponse);

        // Extract posture from sentVariables for storage
        const sentVarsPosture = voiceCall.sentVariables &&
            typeof voiceCall.sentVariables === 'object' &&
            (voiceCall.sentVariables as Record<string, unknown>).primaryPosture
                ? String((voiceCall.sentVariables as Record<string, unknown>).primaryPosture)
                : null;

        // 6. Compute weighted overall score
        const overallScore =
            evaluation.valueAddScore * 0.25 +
            evaluation.newGroundScore * 0.2 +
            evaluation.depthOfSharingScore * 0.2 +
            evaluation.contextUtilScore * 0.15 +
            evaluation.repetitionScore * 0.1 +
            evaluation.engagementScore * 0.1;

        // 7. Save CallEvaluation
        const savedEvaluation = await prisma.callEvaluation.create({
            data: {
                voiceCallId,
                userId,
                newGroundScore: evaluation.newGroundScore,
                depthOfSharingScore: evaluation.depthOfSharingScore,
                valueAddScore: evaluation.valueAddScore,
                contextUtilScore: evaluation.contextUtilScore,
                repetitionScore: evaluation.repetitionScore,
                engagementScore: evaluation.engagementScore,
                overallScore: Math.round(overallScore * 100) / 100,
                whatWorked: evaluation.whatWorked,
                whatToImprove: evaluation.whatToImprove,
                commitmentsExtracted: evaluation.commitmentsExtracted,
                newInfoLearned: evaluation.newInfoLearned,
                recommendedTopics: evaluation.recommendedTopics,
                // Posture evaluation (Phase 4)
                postureMatch: evaluation.postureMatch ?? null,
                timingMatch: evaluation.timingMatch ?? null,
                selectedPosture: sentVarsPosture ?? null,
            },
        });

        console.log(
            `[CallEvaluation] Saved evaluation for voiceCall=${voiceCallId} — ` +
            `overall=${savedEvaluation.overallScore}, valueAdd=${evaluation.valueAddScore}, ` +
            `newGround=${evaluation.newGroundScore}, depth=${evaluation.depthOfSharingScore}`
        );

        // 7b. Send evaluation scores to Langfuse for observability dashboards
        try {
            // Create a session-scoped trace so all calls for this user group together
            const sessionId = `coaching-${userId}`;
            const lfTrace = createSessionTrace({
                name: 'call-evaluation',
                userId,
                sessionId,
                metadata: {
                    voiceCallId,
                    callType: voiceCall.callType,
                    phase: relationshipPlan?.phase ?? 'discovery',
                    callCount: personalContext?.callCount ?? 0,
                },
                input: { summary: voiceCall.summary?.substring(0, 300) },
            });

            if (lfTrace) {
                // Score every KPI — shows up in Langfuse dashboards as score trends
                scoreTraceMulti({
                    traceId: lfTrace.id,
                    scores: [
                        { name: 'overall', value: savedEvaluation.overallScore, comment: `Call ${personalContext?.callCount ?? '?'}` },
                        { name: 'value_add', value: evaluation.valueAddScore },
                        { name: 'new_ground', value: evaluation.newGroundScore },
                        { name: 'depth_of_sharing', value: evaluation.depthOfSharingScore },
                        { name: 'context_utilization', value: evaluation.contextUtilScore },
                        { name: 'repetition', value: evaluation.repetitionScore },
                        { name: 'engagement', value: evaluation.engagementScore },
                    ],
                });

                // Log qualitative insights as events on the trace
                logEvent({
                    traceId: lfTrace.id,
                    name: 'evaluation-insights',
                    metadata: {
                        whatWorked: evaluation.whatWorked,
                        whatToImprove: evaluation.whatToImprove,
                        recommendedTopics: evaluation.recommendedTopics,
                    },
                    output: {
                        commitments: evaluation.commitmentsExtracted,
                        newInfo: evaluation.newInfoLearned,
                    },
                });

                console.log(`[CallEvaluation] Langfuse scores sent for trace=${lfTrace.id}`);
            }
        } catch (err: any) {
            // Non-fatal — evaluation is saved even if Langfuse fails
            console.warn(`[CallEvaluation] Langfuse scoring failed: ${err.message}`);
        }

        // 8. Update the coaching relationship plan
        try {
            await updateRelationshipPlan(userId, savedEvaluation);
        } catch (err: any) {
            // Non-fatal — evaluation is saved even if relationship plan update fails
            console.error(`[CallEvaluation] Failed to update relationship plan: ${err.message}`);
        }

        // 9. Reconcile experiment assignments and link scores
        try {
            await reconcileExperimentAssignments(voiceCallId, userId);
            await linkScoresToExperiment(voiceCallId, {
                newGroundScore: evaluation.newGroundScore,
                depthOfSharingScore: evaluation.depthOfSharingScore,
                valueAddScore: evaluation.valueAddScore,
                contextUtilScore: evaluation.contextUtilScore,
                repetitionScore: evaluation.repetitionScore,
                engagementScore: evaluation.engagementScore,
                overallScore: Math.round(overallScore * 100) / 100,
            });
        } catch (err: any) {
            console.error(`[CallEvaluation] Experiment linking failed: ${err.message}`);
        }

        // 10. Seed experiments for user if they have 3+ evaluations and no experiments yet
        try {
            const evalCount = await prisma.callEvaluation.count({ where: { userId } });
            if (evalCount >= 3) {
                await seedExperimentsForUser(userId);
            }
        } catch (err: any) {
            console.error(`[CallEvaluation] Experiment seeding failed: ${err.message}`);
        }
    } catch (err: any) {
        console.error(`[CallEvaluation] Error evaluating voiceCall=${voiceCallId}: ${err.message}`);
        throw err;
    }
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildEvaluationPrompt(
    voiceCall: {
        transcript: string | null;
        summary: string | null;
        callType: string;
        sentVariables: any;
    },
    recentEvaluations: Array<{
        overallScore: number;
        whatWorked: string[];
        whatToImprove: string[];
        recommendedTopics: string[];
        voiceCall: { summary: string | null; callType: string | null };
    }>,
    relationshipPlan: {
        phase: string;
        coachingThemes: any;
        communicationProfile: any;
        avoidTopics: string[];
    } | null,
    personalContext: {
        knownTopics: string[];
        gapTopics: string[];
        callCount: number;
    } | null
): string {
    const phase = relationshipPlan?.phase ?? 'discovery';
    const callCount = personalContext?.callCount ?? 0;

    // Build previous call summaries for repetition context
    let previousCallContext = 'No previous calls evaluated.';
    if (recentEvaluations.length > 0) {
        const summaries = recentEvaluations.map((e, i) => {
            const summary = e.voiceCall?.summary ?? '(no summary)';
            return `Call ${i + 1}: [${e.voiceCall?.callType ?? 'unknown'}] Score: ${e.overallScore}/10\n  Summary: ${summary}\n  Recommended topics: ${e.recommendedTopics.join(', ') || 'none'}`;
        });
        previousCallContext = summaries.join('\n\n');
    }

    // Known and gap topics
    const knownTopics = personalContext?.knownTopics?.join(', ') || 'none yet';
    const gapTopics = personalContext?.gapTopics?.join(', ') || 'none identified';

    // Context that was sent to the assistant
    let sentContextSummary = 'No variable context was sent.';
    if (voiceCall.sentVariables && typeof voiceCall.sentVariables === 'object') {
        const vars = voiceCall.sentVariables as Record<string, any>;
        const keys = Object.keys(vars);
        if (keys.length > 0) {
            sentContextSummary = keys.map(k => `${k}: ${typeof vars[k] === 'string' ? vars[k].substring(0, 200) : JSON.stringify(vars[k]).substring(0, 200)}`).join('\n');
        }
    }

    // Phase-specific scoring guidance
    const phaseGuidance: Record<string, string> = {
        discovery: 'This is an early relationship (discovery phase, calls 1-5). Prioritize newGroundScore and engagementScore. Depth of sharing will naturally be lower — that is OK. Focus on whether Mira is building rapport and learning the user\'s world.',
        building_trust: 'This is the building trust phase (calls 6-15). Expect moderate depth of sharing. Value-add should increase as Mira has more context. Watch for repetition of the same topics without going deeper.',
        deep_coaching: 'This is the deep coaching phase (calls 16-30). Expect real vulnerability, challenging questions, and meaningful advice. Repetition is a bigger concern here. Context utilization should be high.',
        sustained_partnership: 'This is a mature coaching relationship (31+ calls). All scores should be high. Flag if calls become routine or stale. Look for continued growth and new ground.',
    };

    const guidance = phaseGuidance[phase] || phaseGuidance['discovery'];

    return `You are evaluating a voice coaching call between Mira (an AI executive coach) and her client.

## Relationship Phase
Phase: ${phase} (call #${callCount + 1})
${guidance}

## Context Sent to Mira for This Call
${sentContextSummary}

## Topics Mira Knows Well
${knownTopics}

## Topics Mira Needs to Learn About
${gapTopics}

## Coaching Themes
${relationshipPlan?.coachingThemes ? JSON.stringify(relationshipPlan.coachingThemes) : 'None established yet'}

## Avoid Topics
${relationshipPlan?.avoidTopics?.join(', ') || 'None'}

## Previous Call Summaries (for repetition detection)
${previousCallContext}

## Coaching Posture Used
${(() => {
    const vars = voiceCall.sentVariables as Record<string, unknown> | null;
    if (!vars?.primaryPosture) return 'No posture data available.';
    return `Primary: ${vars.primaryPosture}${vars.secondaryPosture ? `, Secondary: ${vars.secondaryPosture}` : ''}
Reason: ${vars.postureReason || 'unknown'}
Rules: ${vars.postureRules || 'none'}
Tone: ${vars.postureTone || 'none'}`;
})()}

## This Call
Type: ${voiceCall.callType}
Summary: ${voiceCall.summary ?? '(no summary available)'}

Transcript:
${voiceCall.transcript}

---

Score this call on 6 dimensions (1-10 each) and provide qualitative analysis.

Respond with ONLY a JSON object (no markdown, no backticks):
{
  "newGroundScore": <1-10, did Mira learn something new about the user's world?>,
  "depthOfSharingScore": <1-10, how deeply did the user share? Vulnerability, specifics, emotions?>,
  "valueAddScore": <1-10, did Mira provide useful advice, reframing, or insight?>,
  "contextUtilScore": <1-10, did Mira use the available context (sent variables, known topics) effectively?>,
  "repetitionScore": <1-10, inverse — 10 means fresh content, 1 means heavy repetition of previous calls>,
  "engagementScore": <1-10, user engagement — long responses, asking follow-ups, active participation?>,
  "whatWorked": ["specific things Mira did well in this call"],
  "whatToImprove": ["specific suggestions for Mira's next call"],
  "commitmentsExtracted": ["action items or commitments the user mentioned"],
  "newInfoLearned": ["new facts or context about the user learned in this call"],
  "recommendedTopics": ["topics Mira should explore in future calls based on this conversation"],
  "postureMatch": <1-10, did the coaching posture (e.g. celebrate, prepare, nudge) match what the user actually needed? 10 = perfect fit, 1 = completely wrong posture. If no posture data, use 5>,
  "timingMatch": <1-10, was this a good time to call? Consider: did user seem rushed, engaged, available? 10 = perfect timing, 1 = terrible timing. If unclear, use 5>
}`;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseEvaluationResponse(raw: string): LLMEvaluationResponse {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        console.error(`[CallEvaluation] Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
        throw new Error('Failed to parse evaluation response from LLM');
    }

    // Validate and clamp scores to 1-10
    const clamp = (val: any, fallback: number = 5): number => {
        const num = Number(val);
        if (isNaN(num)) return fallback;
        return Math.max(1, Math.min(10, Math.round(num * 10) / 10));
    };

    const toStringArray = (val: any): string[] => {
        if (!Array.isArray(val)) return [];
        return val.filter((v: any) => typeof v === 'string' && v.trim().length > 0);
    };

    return {
        newGroundScore: clamp(parsed.newGroundScore),
        depthOfSharingScore: clamp(parsed.depthOfSharingScore),
        valueAddScore: clamp(parsed.valueAddScore),
        contextUtilScore: clamp(parsed.contextUtilScore),
        repetitionScore: clamp(parsed.repetitionScore),
        engagementScore: clamp(parsed.engagementScore),
        whatWorked: toStringArray(parsed.whatWorked),
        whatToImprove: toStringArray(parsed.whatToImprove),
        commitmentsExtracted: toStringArray(parsed.commitmentsExtracted),
        newInfoLearned: toStringArray(parsed.newInfoLearned),
        recommendedTopics: toStringArray(parsed.recommendedTopics),
        postureMatch: parsed.postureMatch != null ? clamp(parsed.postureMatch) : undefined,
        timingMatch: parsed.timingMatch != null ? clamp(parsed.timingMatch) : undefined,
    };
}
