/**
 * Post-Call Analysis Agent
 *
 * Runs reliably in the worker (not fire-and-forget in Vercel webhook).
 * Handles:
 * 1. Onboarding topic detection — LLM analyzes transcript for 9 topic areas
 * 2. Thread extraction — creates/advances PersonalThread records
 * 3. Adaptation signal extraction — behavioral signals for early calls
 *
 * Triggered by the cron-post-call-analysis poll every 10 minutes.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';
import { extractAndUpdateThreads } from '../lib/thread-manager';
import { detectHypothesisValidation } from './hypothesis-engine';
import { updatePostureReceptivity } from '../lib/posture-engine';

// ============================================================================
// ONBOARDING TOPIC DETECTION
// ============================================================================

export async function detectOnboardingTopics(userId: string, voiceCallId: string): Promise<void> {
    // Skip if already complete
    const existing = await prisma.onboardingProgress.findUnique({ where: { userId } });
    if (existing?.onboardingComplete) return;

    const voiceCall = await prisma.voiceCall.findFirst({
        where: {
            OR: [{ id: voiceCallId }, { vapiCallId: voiceCallId }],
        },
        select: { transcript: true, durationSeconds: true },
    });

    if (!voiceCall?.transcript || (voiceCall.durationSeconds || 0) < 30) return;

    // Extract only user messages
    const userMessages = voiceCall.transcript
        .split('\n')
        .filter(line => line.startsWith('User:'))
        .map(line => line.replace(/^User:\s*/, ''))
        .join('\n');

    if (!userMessages || userMessages.length < 20) return;

    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') return;

    const prompt = `Analyze this voice call transcript and determine which onboarding topics the USER meaningfully discussed (not just mentioned in passing — they shared real, personal information).

LAYER 1 — THE PERSON:
- story: Did they share how they got to where they are, their career journey, what shaped them as a leader?
- drives_and_values: Did they reveal what motivates them, what they care about deeply, personal values or beliefs?
- life: Did they share anything about family, personal interests, hobbies, what they do outside work, what gives them energy?

LAYER 2 — THE LEADER:
- role: Did they discuss their responsibilities, scope, what they own, their job title?
- stakeholders: Did they mention key people they work with, reporting lines, team members, allies, or blockers?
- leadership_style: Did they reveal how they make decisions, communicate, handle conflict, or their work preferences?

LAYER 3 — THE AMBITION:
- goals: Did they discuss what success looks like, KPIs, objectives, aspirations?
- challenges: Did they discuss current difficulties, blockers, frustrations, what keeps them up at night?
- growth: Did they share what they want to get better at, skills they're developing, learning edges?

USER'S WORDS:
${userMessages}

Respond ONLY with a JSON object mapping topic keys to boolean values.
Example: {"story": false, "drives_and_values": true, "life": false, "role": true, "stakeholders": true, "leadership_style": false, "goals": false, "challenges": false, "growth": false}`;

    const result = await withLLMRetry(
        () => generateText(config, prompt, { userId }),
        { label: 'OnboardingTopicDetection' },
    );

    const jsonMatch = result.match(/\{[^}]+\}/);
    if (!jsonMatch) {
        console.error('[PostCallAnalysis] Onboarding LLM returned no JSON:', result.substring(0, 200));
        return;
    }

    const covered = JSON.parse(jsonMatch[0]) as Record<string, boolean>;

    // Only update fields that are newly detected (never set false on already-true fields)
    const updates: Record<string, boolean> = {};
    if (covered.story) updates.coveredStory = true;
    if (covered.drives_and_values) updates.coveredDrivesAndValues = true;
    if (covered.life) updates.coveredLife = true;
    if (covered.role) updates.coveredRole = true;
    if (covered.stakeholders) updates.coveredStakeholders = true;
    if (covered.leadership_style) updates.coveredLeadershipStyle = true;
    if (covered.goals) updates.coveredGoals = true;
    if (covered.challenges) updates.coveredChallenges = true;
    if (covered.growth) updates.coveredGrowth = true;

    if (Object.keys(updates).length === 0) return;

    const progress = await prisma.onboardingProgress.upsert({
        where: { userId },
        create: {
            userId,
            ...updates,
            totalOnboardingCalls: 1,
            lastOnboardingCallAt: new Date(),
        },
        update: {
            ...updates,
            totalOnboardingCalls: { increment: 1 },
            lastOnboardingCallAt: new Date(),
        },
    });

    // Check if all 9 topics are now covered
    const allCovered =
        progress.coveredStory && progress.coveredDrivesAndValues && progress.coveredLife &&
        progress.coveredRole && progress.coveredStakeholders && progress.coveredLeadershipStyle &&
        progress.coveredGoals && progress.coveredChallenges && progress.coveredGrowth;

    if (allCovered && !progress.onboardingComplete) {
        await prisma.onboardingProgress.update({
            where: { userId },
            data: { onboardingComplete: true },
        });
        console.log(`[PostCallAnalysis] Onboarding complete for ${userId} — all 9 topics covered`);
    }

    console.log(`[PostCallAnalysis] Onboarding topics detected for ${userId}: ${Object.keys(updates).join(', ')}`);
}

// ============================================================================
// ADAPTATION SIGNAL EXTRACTION
// ============================================================================

export async function extractAdaptationSignals(
    userId: string,
    voiceCallId: string,
): Promise<void> {
    const voiceCall = await prisma.voiceCall.findFirst({
        where: {
            OR: [{ id: voiceCallId }, { vapiCallId: voiceCallId }],
        },
        select: { transcript: true, durationSeconds: true },
    });

    if (!voiceCall?.transcript) return;

    const personalCtx = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true },
    });
    const callCount = personalCtx?.callCount || 0;
    if (callCount > 5) return; // Only for early calls

    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') return;

    const prompt = `Analyze this coaching call transcript to detect behavioral signals about how this user prefers to interact.

TRANSCRIPT:
${voiceCall.transcript}
CALL DURATION: ${voiceCall.durationSeconds || 0} seconds

Detect these signals:
- modeLean: "work_first" (mostly professional), "relationship_first" (opens up personally), or "balanced"
- precision: Does the user test accuracy or correct the coach? true/false
- peopleHungry: Does the user ask about stakeholders or want intel about people? true/false
- personalOpen: Does the user voluntarily share personal context? true/false
- frameworkSeeker: Does the user want scripts, templates, or actionable phrases? true/false
- followMode: Does the user lead the conversation rather than follow? true/false

Respond ONLY with a JSON object.
Example: {"modeLean": "work_first", "precision": false, "peopleHungry": true, "personalOpen": false, "frameworkSeeker": true, "followMode": false}`;

    const result = await withLLMRetry(
        () => generateText(config, prompt, { userId }),
        { label: 'AdaptationSignals' },
    );

    const jsonMatch = result.match(/\{[^}]+\}/);
    if (!jsonMatch) return;

    const signals = JSON.parse(jsonMatch[0]);

    // Merge with existing signals (don't overwrite — accumulate)
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { adaptationSignals: true },
    });

    const existing = (prefs?.adaptationSignals as Record<string, unknown>) || {};
    const merged = { ...existing, ...signals, lastUpdated: new Date().toISOString(), callsAnalyzed: callCount };

    await prisma.userPreferences.update({
        where: { userId },
        data: { adaptationSignals: merged },
    });

    console.log(`[PostCallAnalysis] Adaptation signals updated for ${userId}: ${Object.keys(signals).join(', ')}`);
}

// ============================================================================
// STAGE SIGNAL DETECTION (coaching stage gate inputs)
// ============================================================================

async function detectStageSignals(userId: string, voiceCallId: string): Promise<void> {
    // 1. Get the transcript
    const voiceCall = await prisma.voiceCall.findUnique({
        where: { id: voiceCallId },
        select: { transcript: true },
    });
    if (!voiceCall?.transcript) return;

    const transcript = voiceCall.transcript.toLowerCase();

    // 2. Detect user-initiated depth (user asking for Mira's opinion)
    const depthPatterns = [
        'what do you think',
        'what would you do',
        'any thoughts on',
        'how should i handle',
        'what\'s your read',
        'your take on',
        'what do you suggest',
        'what would you recommend',
        'give me your honest',
        'i want your opinion',
    ];
    const depthCount = depthPatterns.filter(p => transcript.includes(p)).length;

    // 3. Detect user-stated stakeholders (user mentions people by name in conversation)
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, mergedIntoId: null },
        select: { id: true, name: true },
    });

    // Extract user's speech segments (lines with "user:" prefix in Vapi transcripts)
    const userLines = transcript.split('\n')
        .filter(line => line.trim().startsWith('user:'))
        .join(' ');

    const mentionedStakeholders = new Set<string>();
    for (const s of stakeholders) {
        const nameLower = s.name.toLowerCase();
        // Check first name (most common way people refer to others)
        const firstName = nameLower.split(/[\s.]+/)[0];
        if (firstName.length > 2 && userLines.includes(firstName)) {
            mentionedStakeholders.add(s.id);
        }
    }

    // 4. Update UserPreferences
    if (depthCount > 0 || mentionedStakeholders.size > 0) {
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId },
            select: { userInitiatedDepthCount: true, userStatedStakeholderCount: true },
        });

        const updates: any = {};
        if (depthCount > 0) {
            updates.userInitiatedDepthCount = (prefs?.userInitiatedDepthCount ?? 0) + depthCount;
        }
        if (mentionedStakeholders.size > 0) {
            // Track max of current count and new mentions
            const newCount = Math.max(prefs?.userStatedStakeholderCount ?? 0, mentionedStakeholders.size);
            updates.userStatedStakeholderCount = newCount;
        }

        await prisma.userPreferences.update({
            where: { userId },
            data: updates,
        });
    }

    // 5. Re-evaluate coaching stage
    try {
        const { evaluateAndPersistStage } = require('../lib/stage-gate-engine');
        await evaluateAndPersistStage(userId);
    } catch (err: any) {
        console.error(`[PostCallAnalysis] Stage evaluation failed: ${err.message}`);
    }

    console.log(`[PostCallAnalysis] Stage signals: ${depthCount} depth prompts, ${mentionedStakeholders.size} stakeholders mentioned`);
}

// ============================================================================
// FULL POST-CALL ANALYSIS — runs all applicable analyses for a call
// ============================================================================

export async function runPostCallAnalysis(voiceCallId: string): Promise<number> {
    const voiceCall = await prisma.voiceCall.findFirst({
        where: {
            OR: [{ id: voiceCallId }, { vapiCallId: voiceCallId }],
        },
        select: { id: true, userId: true, transcript: true, durationSeconds: true },
    });

    if (!voiceCall?.userId || !voiceCall.transcript) return 0;

    const userId = voiceCall.userId;
    let tasksCompleted = 0;

    // 1. Onboarding topic detection
    try {
        await detectOnboardingTopics(userId, voiceCall.id);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Onboarding detection failed for ${userId}:`, err);
    }

    // 1b. Stage signal detection (coaching stage gate inputs)
    try {
        await detectStageSignals(userId, voiceCall.id);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Stage signal detection failed for ${userId}:`, err);
    }

    // 2. Thread extraction
    try {
        await extractAndUpdateThreads(userId, voiceCall.transcript, voiceCall.id);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Thread extraction failed for ${userId}:`, err);
    }

    // 3. Adaptation signals (early calls only)
    try {
        await extractAdaptationSignals(userId, voiceCall.id);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Adaptation signals failed for ${userId}:`, err);
    }

    // 4. Hypothesis validation (check if any presented hypotheses were confirmed/rejected)
    try {
        await detectHypothesisValidation(userId, voiceCall.id, voiceCall.transcript);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Hypothesis validation failed for ${userId}:`, err);
    }

    // 5. Posture receptivity update (learn which postures work for this user)
    try {
        await updatePostureReceptivity(userId);
        tasksCompleted++;
    } catch (err) {
        console.error(`[PostCallAnalysis] Posture receptivity update failed for ${userId}:`, err);
    }

    return tasksCompleted;
}

/**
 * Wrapped version with AgentRun tracking.
 */
export async function runPostCallAnalysisTracked(voiceCallId: string): Promise<void> {
    const voiceCall = await prisma.voiceCall.findFirst({
        where: {
            OR: [{ id: voiceCallId }, { vapiCallId: voiceCallId }],
        },
        select: { userId: true },
    });

    await withAgentRun(
        'post-call-analysis',
        voiceCall?.userId,
        'event',
        async (ctx) => {
            const items = await runPostCallAnalysis(voiceCallId);
            ctx.itemsProcessed = items;
        },
    );
}
