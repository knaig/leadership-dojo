/**
 * Stage Gate Engine — KPI-Gated Coaching Progression
 *
 * Replaces the old LEARNING/OBSERVING/COACHING maturity model.
 * Stages advance when KPIs are met, not by counting calls or days.
 * Stages can regress if Mira starts getting things wrong.
 *
 * LISTENER → MIRROR → THOUGHT_PARTNER → COACH
 */

import { prisma } from './prisma';
import { computeStakeholderConfidence, ConfidenceTier } from './confidence-engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CoachingStage = 'listener' | 'mirror' | 'thought_partner' | 'coach';

export interface StageGateMetrics {
    // LISTENER → MIRROR gates
    onboardingTopicsCovered: number;
    onboardingLayersCovered: number; // distinct layers (1, 2, 3)
    userStatedStakeholders: number;
    completedCalls: number;

    // MIRROR → THOUGHT_PARTNER gates
    hypothesesPresented: number;
    hypothesesConfirmed: number;
    validationRate: number; // confirmed / presented
    recentCorrectionCount: number; // in last 5 calls
    callDurationTrendingUp: boolean;

    // THOUGHT_PARTNER → COACH gates
    stakeholdersAtSuggest: number; // stakeholders with 0.6+ confidence
    totalConfirmedHypotheses: number;
    overallValidationRate: number;
    userInitiatedDepthCount: number; // "what do you think?" detected
    activeCommitments: number;
    recentCorrectionCountLong: number; // in last 7 calls
}

interface StageResult {
    stage: CoachingStage;
    metrics: StageGateMetrics;
    gatesCleared: string[]; // which gates passed
    gatesFailed: string[]; // which gates not yet met
}

// ─── Stage Thresholds ────────────────────────────────────────────────────────

const LISTENER_TO_MIRROR = {
    onboardingTopicsCovered: 4,
    onboardingLayersCovered: 3, // at least 1 from each layer
    userStatedStakeholders: 3,
    completedCalls: 3,
};

const MIRROR_TO_THOUGHT_PARTNER = {
    hypothesesPresented: 3,
    validationRate: 0.5,
    onboardingTopicsCovered: 5,
    maxCorrectionsInLast5Calls: 2,
    callDurationTrendingUp: true,
};

const THOUGHT_PARTNER_TO_COACH = {
    stakeholdersAtSuggest: 5,
    totalConfirmedHypotheses: 5,
    overallValidationRate: 0.6,
    userInitiatedDepthCount: 2,
    activeCommitments: 1,
    maxCorrectionsInLast7Calls: 1,
};

// Regression thresholds
const REGRESSION = {
    correctionSpike: 3, // corrections in last 5 calls
    durationDropPercent: 30, // % drop over 3 calls
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate the current coaching stage for a user.
 * Returns the stage, metrics snapshot, and which gates are cleared/failed.
 */
export async function evaluateStage(userId: string): Promise<StageResult> {
    const metrics = await computeMetrics(userId);

    // Get current stored stage
    const personalCtx = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true },
    });

    // Get stored stage from UserPreferences (we'll add this field)
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { coachingStage: true },
    });

    const currentStage = (prefs?.coachingStage as CoachingStage) || 'listener';

    // Check for regression first
    const regressionStage = checkRegression(currentStage, metrics);
    if (regressionStage) {
        return buildResult(regressionStage, metrics);
    }

    // Check if we can advance
    const advancedStage = checkAdvancement(currentStage, metrics);
    return buildResult(advancedStage || currentStage, metrics);
}

/**
 * Evaluate stage and persist if changed.
 * Call this after each voice call completes.
 */
export async function evaluateAndPersistStage(userId: string): Promise<CoachingStage> {
    const result = await evaluateStage(userId);

    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { coachingStage: true },
    });

    const currentStage = (prefs?.coachingStage as CoachingStage) || 'listener';

    if (result.stage !== currentStage) {
        const direction = stageOrder(result.stage) > stageOrder(currentStage) ? 'advanced' : 'regressed';
        console.log(`[StageGate] User ${userId.substring(0, 8)} ${direction}: ${currentStage} → ${result.stage}`);

        await prisma.userPreferences.update({
            where: { userId },
            data: {
                coachingStage: result.stage,
                stageEnteredAt: new Date(),
                stageGateMetrics: result.metrics as any,
            },
        });
    }

    return result.stage;
}

/**
 * Map the new 4-stage model to the old 3-tier model for backward compatibility.
 * Used by existing code that references LEARNING/OBSERVING/COACHING.
 */
export function stageToMaturityLevel(stage: CoachingStage): 'LEARNING' | 'OBSERVING' | 'COACHING' {
    switch (stage) {
        case 'listener': return 'LEARNING';
        case 'mirror': return 'OBSERVING';
        case 'thought_partner': return 'OBSERVING';
        case 'coach': return 'COACHING';
    }
}

/**
 * Get stage-specific confidence tier overrides.
 * In early stages, ASSERT and SUGGEST are disabled or raised.
 */
export function getStageConfidenceOverrides(stage: CoachingStage): {
    assertEnabled: boolean;
    suggestEnabled: boolean;
    assertThreshold: number;
    suggestThreshold: number;
} {
    switch (stage) {
        case 'listener':
            return { assertEnabled: false, suggestEnabled: false, assertThreshold: 1.1, suggestThreshold: 1.1 }; // effectively disabled
        case 'mirror':
            return { assertEnabled: false, suggestEnabled: true, assertThreshold: 1.1, suggestThreshold: 0.85 }; // SUGGEST only with user-stated
        case 'thought_partner':
            return { assertEnabled: true, suggestEnabled: true, assertThreshold: 0.85, suggestThreshold: 0.6 }; // conservative ASSERT
        case 'coach':
            return { assertEnabled: true, suggestEnabled: true, assertThreshold: 0.8, suggestThreshold: 0.6 }; // normal
    }
}

/**
 * Get stage-specific guardrail text for Vapi prompt injection.
 */
export function getStageGuardrails(stage: CoachingStage): string {
    switch (stage) {
        case 'listener':
            return `COACHING STAGE: LISTENER (earning trust)
RULES:
- You are in LISTENING mode. Your job: notice, ask, mirror. NOT advise.
- NEVER say "you should", "I'd suggest", "one approach", or any advisory framing.
- NEVER diagnose patterns, label behaviors, or infer stakeholder dynamics.
- NEVER infer attendee roles or titles. Say "8 people including Rajagopalan" not "your VP."
- NEVER predict meeting outcomes. You have no basis.
- ONE Socratic question per call. Make it specific to their calendar.
- Mirror back what you hear: "You mentioned X — what's that about?"
- Keep calls SHORT (2-3 minutes). Leave them wanting more.
TRANSPARENCY: "I'm still mapping your world. The more we talk, the sharper I'll get."`;

        case 'mirror':
            return `COACHING STAGE: MIRROR (connecting dots)
RULES:
- You are in MIRROR mode. Your job: reflect, connect, test hypotheses.
- Open with a callback to a prior conversation: "Last time you mentioned..."
- Present observations as QUESTIONS, not statements: "I notice you and X — is he your go-to?"
- You may test ONE hypothesis per call: "I have a hunch about something. Want to hear it?"
- NEVER prescribe ("here's what I'd do"), label ("you're a conflict-avoider"), or assert.
- Show you're building a picture: "I'm starting to see a pattern..."
- Target 4-5 minute calls.
TRANSPARENCY: "I'm starting to see patterns — tell me if I'm off."`;

        case 'thought_partner':
            return `COACHING STAGE: THOUGHT PARTNER (earned collaboration)
RULES:
- You are in THOUGHT PARTNER mode. Ask permission before offering perspective.
- Always ask: "I have a read on this — want to hear it?" before giving a take.
- Frame suggestions with evidence: "Based on what you've told me about X's style..."
- You may offer soft challenges: "Can I push back on something?"
- Begin commitment tracking: "Want me to hold you to that?"
- NEVER assert without permission. Always offer, never impose.
- Target 5-7 minute calls.
TRANSPARENCY: "I feel more confident about your dynamics now. Tell me if I'm off."`;

        case 'coach':
            return `COACHING STAGE: COACH (full coaching mode)
RULES:
- You are in COACHING mode. Direct, anticipatory, challenging.
- State high-confidence insights directly. Challenge avoidance patterns.
- Hold accountability firmly: "You said you'd do X. Did you?"
- ONE challenge per call. Always offer an out: "Want to go there, or save it?"
- Earn the right with a warm opener before a challenge.
- Still say "I don't know that yet" for genuine gaps.
- Duration adapts to posture.
TRANSPARENCY: "I've been watching this pattern. Here's what I see."`;
    }
}

/**
 * Get stage-specific transparency phrase for call opening.
 */
export function getStageTransparencyPhrase(stage: CoachingStage): string {
    switch (stage) {
        case 'listener':
            return "I'm still getting to know your world — the more we talk, the sharper I'll get.";
        case 'mirror':
            return "I'm starting to see patterns in your world — tell me if I'm reading things right.";
        case 'thought_partner':
            return "I feel more confident about your dynamics now, but I still want to check my reads with you.";
        case 'coach':
            return ""; // No transparency needed — competence speaks
    }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function stageOrder(stage: CoachingStage): number {
    const order: Record<CoachingStage, number> = { listener: 0, mirror: 1, thought_partner: 2, coach: 3 };
    return order[stage];
}

async function computeMetrics(userId: string): Promise<StageGateMetrics> {
    // Parallel fetch all required data
    const [personalCtx, onboarding, confidences, hypotheses, corrections, recentCalls, commitments, prefs] = await Promise.all([
        prisma.personalContext.findUnique({
            where: { userId },
            select: { callCount: true },
        }),
        prisma.onboardingProgress.findUnique({
            where: { userId },
            select: {
                coveredStory: true, coveredDrivesAndValues: true, coveredLife: true,
                coveredRole: true, coveredStakeholders: true, coveredLeadershipStyle: true,
                coveredGoals: true, coveredChallenges: true, coveredGrowth: true,
            },
        }),
        computeStakeholderConfidence(userId),
        // Hypothesis data from knowledge graph (confirmed/rejected facts from calls)
        prisma.knowledgeFact.groupBy({
            by: ['confidence'],
            where: {
                userId,
                source: { in: ['INFERRED_CHAT', 'USER_STATED'] },
                predicate: { startsWith: 'hypothesis_' },
            },
            _count: { id: true },
        }).catch(() => []),
        // Recent corrections
        prisma.userCorrection.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { createdAt: true },
        }),
        // Recent call durations
        prisma.voiceCall.findMany({
            where: { userId, status: 'ended' },
            orderBy: { startedAt: 'desc' },
            take: 6,
            select: { durationSeconds: true, startedAt: true },
        }),
        // Active commitments
        prisma.relationshipAction.count({
            where: { goal: { userId }, status: 'IN_PROGRESS' },
        }).catch(() => 0),
        // User preferences for userInitiatedDepth + userStatedStakeholders
        prisma.userPreferences.findUnique({
            where: { userId },
            select: { userInitiatedDepthCount: true, userStatedStakeholderCount: true },
        }),
    ]);

    // Count onboarding topics
    const topics = onboarding || {} as any;
    const topicList = [
        topics.coveredStory, topics.coveredDrivesAndValues, topics.coveredLife,
        topics.coveredRole, topics.coveredStakeholders, topics.coveredLeadershipStyle,
        topics.coveredGoals, topics.coveredChallenges, topics.coveredGrowth,
    ];
    const topicsCovered = topicList.filter(Boolean).length;

    // Count layers covered (need at least 1 from each)
    const layer1 = [topics.coveredStory, topics.coveredDrivesAndValues, topics.coveredLife].some(Boolean);
    const layer2 = [topics.coveredRole, topics.coveredStakeholders, topics.coveredLeadershipStyle].some(Boolean);
    const layer3 = [topics.coveredGoals, topics.coveredChallenges, topics.coveredGrowth].some(Boolean);
    const layersCovered = [layer1, layer2, layer3].filter(Boolean).length;

    // Stakeholder confidence
    const stakeholdersAtSuggest = confidences.filter(
        c => c.tier === 'SUGGEST' || c.tier === 'ASSERT'
    ).length;

    // Hypothesis metrics (using confidence as proxy: high = confirmed, low = rejected)
    const hypothesisData = hypotheses as Array<{ confidence: number; _count: { id: number } }>;
    const hypothesesPresented = hypothesisData.reduce((sum, h) => sum + h._count.id, 0);
    const hypothesesConfirmed = hypothesisData
        .filter(h => h.confidence >= 0.7)
        .reduce((sum, h) => sum + h._count.id, 0);
    const validationRate = hypothesesPresented > 0 ? hypothesesConfirmed / hypothesesPresented : 0;

    // Corrections in recent calls
    const fiveCallsAgo = recentCalls.length >= 5 ? recentCalls[4].startedAt : new Date(0);
    const sevenCallsAgo = recentCalls.length >= 7 ? recentCalls[6].startedAt : new Date(0);
    const correctionsInLast5 = corrections.filter(c => c.createdAt >= fiveCallsAgo).length;
    const correctionsInLast7 = corrections.filter(c => c.createdAt >= sevenCallsAgo).length;

    // Call duration trend
    const recentDurations = recentCalls.map(c => c.durationSeconds || 0);
    let durationTrendingUp = false;
    if (recentDurations.length >= 6) {
        const recent3Avg = recentDurations.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        const prior3Avg = recentDurations.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
        durationTrendingUp = recent3Avg > prior3Avg;
    }

    return {
        onboardingTopicsCovered: topicsCovered,
        onboardingLayersCovered: layersCovered,
        userStatedStakeholders: (prefs as any)?.userStatedStakeholderCount ?? 0,
        completedCalls: personalCtx?.callCount ?? 0,
        hypothesesPresented,
        hypothesesConfirmed,
        validationRate: Math.round(validationRate * 100) / 100,
        recentCorrectionCount: correctionsInLast5,
        callDurationTrendingUp: durationTrendingUp,
        stakeholdersAtSuggest,
        totalConfirmedHypotheses: hypothesesConfirmed,
        overallValidationRate: Math.round(validationRate * 100) / 100,
        userInitiatedDepthCount: (prefs as any)?.userInitiatedDepthCount ?? 0,
        activeCommitments: commitments,
        recentCorrectionCountLong: correctionsInLast7,
    };
}

function checkAdvancement(current: CoachingStage, metrics: StageGateMetrics): CoachingStage | null {
    switch (current) {
        case 'listener': {
            if (
                metrics.onboardingTopicsCovered >= LISTENER_TO_MIRROR.onboardingTopicsCovered &&
                metrics.onboardingLayersCovered >= LISTENER_TO_MIRROR.onboardingLayersCovered &&
                metrics.userStatedStakeholders >= LISTENER_TO_MIRROR.userStatedStakeholders &&
                metrics.completedCalls >= LISTENER_TO_MIRROR.completedCalls
            ) return 'mirror';
            return null;
        }
        case 'mirror': {
            if (
                metrics.hypothesesPresented >= MIRROR_TO_THOUGHT_PARTNER.hypothesesPresented &&
                metrics.validationRate >= MIRROR_TO_THOUGHT_PARTNER.validationRate &&
                metrics.onboardingTopicsCovered >= MIRROR_TO_THOUGHT_PARTNER.onboardingTopicsCovered &&
                metrics.recentCorrectionCount <= MIRROR_TO_THOUGHT_PARTNER.maxCorrectionsInLast5Calls &&
                metrics.callDurationTrendingUp
            ) return 'thought_partner';
            return null;
        }
        case 'thought_partner': {
            if (
                metrics.stakeholdersAtSuggest >= THOUGHT_PARTNER_TO_COACH.stakeholdersAtSuggest &&
                metrics.totalConfirmedHypotheses >= THOUGHT_PARTNER_TO_COACH.totalConfirmedHypotheses &&
                metrics.overallValidationRate >= THOUGHT_PARTNER_TO_COACH.overallValidationRate &&
                metrics.userInitiatedDepthCount >= THOUGHT_PARTNER_TO_COACH.userInitiatedDepthCount &&
                metrics.activeCommitments >= THOUGHT_PARTNER_TO_COACH.activeCommitments &&
                metrics.recentCorrectionCountLong <= THOUGHT_PARTNER_TO_COACH.maxCorrectionsInLast7Calls
            ) return 'coach';
            return null;
        }
        case 'coach':
            return null; // Already at max
    }
}

function checkRegression(current: CoachingStage, metrics: StageGateMetrics): CoachingStage | null {
    if (current === 'listener') return null; // Can't regress below listener

    // Correction spike → drop one stage
    if (metrics.recentCorrectionCount >= REGRESSION.correctionSpike) {
        const order: CoachingStage[] = ['listener', 'mirror', 'thought_partner', 'coach'];
        const currentIdx = order.indexOf(current);
        if (currentIdx > 0) {
            return order[currentIdx - 1];
        }
    }

    return null;
}

function buildResult(stage: CoachingStage, metrics: StageGateMetrics): StageResult {
    const gatesCleared: string[] = [];
    const gatesFailed: string[] = [];

    // Evaluate all gates for the current stage's next transition
    switch (stage) {
        case 'listener':
            if (metrics.onboardingTopicsCovered >= LISTENER_TO_MIRROR.onboardingTopicsCovered) gatesCleared.push('topics≥4');
            else gatesFailed.push(`topics: ${metrics.onboardingTopicsCovered}/4`);
            if (metrics.onboardingLayersCovered >= LISTENER_TO_MIRROR.onboardingLayersCovered) gatesCleared.push('layers≥3');
            else gatesFailed.push(`layers: ${metrics.onboardingLayersCovered}/3`);
            if (metrics.userStatedStakeholders >= LISTENER_TO_MIRROR.userStatedStakeholders) gatesCleared.push('stakeholders≥3');
            else gatesFailed.push(`user-stated stakeholders: ${metrics.userStatedStakeholders}/3`);
            if (metrics.completedCalls >= LISTENER_TO_MIRROR.completedCalls) gatesCleared.push('calls≥3');
            else gatesFailed.push(`calls: ${metrics.completedCalls}/3`);
            break;
        case 'mirror':
            if (metrics.hypothesesPresented >= MIRROR_TO_THOUGHT_PARTNER.hypothesesPresented) gatesCleared.push('hypotheses≥3');
            else gatesFailed.push(`hypotheses presented: ${metrics.hypothesesPresented}/3`);
            if (metrics.validationRate >= MIRROR_TO_THOUGHT_PARTNER.validationRate) gatesCleared.push('validation≥50%');
            else gatesFailed.push(`validation rate: ${Math.round(metrics.validationRate * 100)}%/50%`);
            break;
        // ... etc
    }

    return { stage, metrics, gatesCleared, gatesFailed };
}
