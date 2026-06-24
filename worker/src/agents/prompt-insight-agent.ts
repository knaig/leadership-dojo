/**
 * Prompt Insight Agent — AutoResearch for Coaching Prompts
 *
 * Continuously learns what coaching strategies work by analyzing CallEvaluation data,
 * discovers patterns, and feeds proven insights back into future calls.
 *
 * Self-activating: does nothing until sufficient data exists.
 * - Per-user insights: 10+ evaluated calls for that user
 * - System-wide insights: 50+ total evaluations across 3+ users
 *
 * Lifecycle: discover patterns → propose insights → activate → measure impact → validate or retire
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';

// ============================================================================
// THRESHOLDS — the system decides when it has enough data
// ============================================================================

const THRESHOLDS = {
    // Minimum evaluations before we start analyzing per-user patterns
    PER_USER_MIN_EVALS: 10,
    // Minimum evaluations system-wide before we look for cross-user patterns
    SYSTEM_MIN_EVALS: 50,
    // Minimum unique users for system-wide insights
    SYSTEM_MIN_USERS: 3,
    // Calls after activation before we measure impact
    IMPACT_MEASUREMENT_MIN_CALLS: 5,
    // Minimum effect size (score delta) to validate an insight
    VALIDATION_THRESHOLD: 0.3,
    // Below this delta, retire the insight (it's not helping)
    RETIREMENT_THRESHOLD: -0.2,
    // Maximum active insights per scope (prevent overload)
    MAX_ACTIVE_INSIGHTS: 5,
    // Maximum active insights per user
    MAX_ACTIVE_PER_USER: 3,
};

// ============================================================================
// DATA SUFFICIENCY CHECK
// ============================================================================

interface SufficiencyReport {
    systemReady: boolean;
    totalEvaluations: number;
    uniqueUsers: number;
    readyUsers: Array<{ userId: string; evalCount: number }>;
    notReadyUsers: Array<{ userId: string; evalCount: number }>;
}

/**
 * Check if we have enough data to generate insights.
 * Called before any analysis — if not ready, we silently skip.
 */
export async function checkDataSufficiency(): Promise<SufficiencyReport> {
    const userCounts = await prisma.callEvaluation.groupBy({
        by: ['userId'],
        _count: { id: true },
    });

    const totalEvaluations = userCounts.reduce((sum, u) => sum + u._count.id, 0);
    const uniqueUsers = userCounts.length;

    const readyUsers = userCounts
        .filter(u => u._count.id >= THRESHOLDS.PER_USER_MIN_EVALS)
        .map(u => ({ userId: u.userId, evalCount: u._count.id }));

    const notReadyUsers = userCounts
        .filter(u => u._count.id < THRESHOLDS.PER_USER_MIN_EVALS)
        .map(u => ({ userId: u.userId, evalCount: u._count.id }));

    const systemReady =
        totalEvaluations >= THRESHOLDS.SYSTEM_MIN_EVALS &&
        uniqueUsers >= THRESHOLDS.SYSTEM_MIN_USERS;

    return { systemReady, totalEvaluations, uniqueUsers, readyUsers, notReadyUsers };
}

// ============================================================================
// MAIN ENTRY — called weekly by cron
// ============================================================================

/**
 * Analyze evaluation data and generate/update prompt insights.
 * Self-activating: skips if insufficient data.
 */
export async function generateInsights(): Promise<void> {
    return withAgentRun('prompt-insight', undefined, 'cron', async (ctx) => {
        console.log('[PromptInsight] Starting insight generation...');

        const sufficiency = await checkDataSufficiency();

        console.log(
            `[PromptInsight] Data: ${sufficiency.totalEvaluations} evals, ` +
            `${sufficiency.uniqueUsers} users, ` +
            `${sufficiency.readyUsers.length} users ready, ` +
            `system ${sufficiency.systemReady ? 'READY' : 'NOT READY'}`
        );

        if (sufficiency.totalEvaluations < 5) {
            console.log('[PromptInsight] Not enough data yet — skipping');
            ctx.logs.push('Insufficient data — skipped');
            return;
        }

        // Measure impact of existing active insights first
        await measureAllInsightImpact();

        // Per-user insights for users with enough data
        for (const user of sufficiency.readyUsers) {
            try {
                await analyzeUserPatterns(user.userId, user.evalCount);
                ctx.itemsProcessed++;
            } catch (err: any) {
                console.error(`[PromptInsight] User analysis failed for ${user.userId.substring(0, 8)}: ${err.message}`);
            }
        }

        // System-wide insights if enough users
        if (sufficiency.systemReady) {
            try {
                await analyzeSystemPatterns(sufficiency.totalEvaluations);
                ctx.itemsProcessed++;
            } catch (err: any) {
                console.error(`[PromptInsight] System analysis failed: ${err.message}`);
            }
        }

        ctx.logs.push(`${sufficiency.totalEvaluations} evals, ${sufficiency.readyUsers.length} users analyzed`);
        console.log('[PromptInsight] Insight generation complete');
    });
}

// ============================================================================
// PATTERN ANALYSIS — per-user
// ============================================================================

async function analyzeUserPatterns(userId: string, evalCount: number): Promise<void> {
    console.log(`[PromptInsight] Analyzing patterns for user ${userId.substring(0, 8)} (${evalCount} evals)...`);

    // Check how many active insights this user already has
    const activeCount = await prisma.promptInsight.count({
        where: { userId, status: { in: ['active', 'proposed'] } },
    });

    if (activeCount >= THRESHOLDS.MAX_ACTIVE_PER_USER) {
        console.log(`[PromptInsight] User ${userId.substring(0, 8)} already has ${activeCount} active insights — skipping new generation`);
        return;
    }

    // Load evaluations with call context
    const evaluations = await prisma.callEvaluation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30, // Last 30 evaluations
        select: {
            id: true,
            overallScore: true,
            newGroundScore: true,
            depthOfSharingScore: true,
            valueAddScore: true,
            contextUtilScore: true,
            repetitionScore: true,
            engagementScore: true,
            whatWorked: true,
            whatToImprove: true,
            recommendedTopics: true,
            createdAt: true,
            voiceCall: {
                select: {
                    callType: true,
                    summary: true,
                    sentVariables: true,
                    durationSeconds: true,
                },
            },
        },
    });

    // Load existing insights to avoid duplicates
    const existingInsights = await prisma.promptInsight.findMany({
        where: { OR: [{ userId }, { scope: 'system' }] },
        select: { pattern: true, category: true, status: true },
    });

    // Get a user's LLM config (use first available user for system, or the specific user)
    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none') return;

    const prompt = buildAnalysisPrompt(evaluations, existingInsights, 'user', evalCount);
    const rawResponse = await generateText(llmConfig, prompt, {
        userId,
        traceName: 'prompt-insight-user',
        temperature: 0.3,
        maxOutputTokens: 2000,
    });

    const insights = parseInsightResponse(rawResponse);

    // Save new insights
    for (const insight of insights) {
        await prisma.promptInsight.create({
            data: {
                pattern: insight.pattern,
                recommendation: insight.recommendation,
                category: insight.category,
                evidenceBasis: insight.evidence,
                scope: userId,
                userId,
                status: 'proposed',
                confidence: insight.confidence,
            },
        });
        console.log(`[PromptInsight] New user insight: [${insight.category}] ${insight.pattern.substring(0, 80)}`);
    }
}

// ============================================================================
// PATTERN ANALYSIS — system-wide
// ============================================================================

async function analyzeSystemPatterns(totalEvaluations: number): Promise<void> {
    console.log(`[PromptInsight] Analyzing system-wide patterns (${totalEvaluations} evals)...`);

    const activeCount = await prisma.promptInsight.count({
        where: { scope: 'system', status: { in: ['active', 'proposed'] } },
    });

    if (activeCount >= THRESHOLDS.MAX_ACTIVE_INSIGHTS) {
        console.log(`[PromptInsight] Already ${activeCount} active system insights — skipping`);
        return;
    }

    // Load evaluations across all users (sample recent ones)
    const evaluations = await prisma.callEvaluation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            userId: true,
            overallScore: true,
            newGroundScore: true,
            depthOfSharingScore: true,
            valueAddScore: true,
            contextUtilScore: true,
            repetitionScore: true,
            engagementScore: true,
            whatWorked: true,
            whatToImprove: true,
            createdAt: true,
            voiceCall: {
                select: {
                    callType: true,
                    summary: true,
                    sentVariables: true,
                    durationSeconds: true,
                },
            },
        },
    });

    const existingInsights = await prisma.promptInsight.findMany({
        where: { scope: 'system' },
        select: { pattern: true, category: true, status: true },
    });

    // Use the first admin's LLM config, or fallback to first user with evals
    const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true },
    });
    const llmUserId = adminUser?.id || evaluations[0]?.userId;
    if (!llmUserId) return;

    const llmConfig = await getUserLLMConfig(llmUserId);
    if (llmConfig.provider === 'none') return;

    const prompt = buildAnalysisPrompt(evaluations, existingInsights, 'system', totalEvaluations);
    const rawResponse = await generateText(llmConfig, prompt, {
        userId: llmUserId,
        traceName: 'prompt-insight-system',
        temperature: 0.3,
        maxOutputTokens: 2000,
    });

    const insights = parseInsightResponse(rawResponse);

    for (const insight of insights) {
        await prisma.promptInsight.create({
            data: {
                pattern: insight.pattern,
                recommendation: insight.recommendation,
                category: insight.category,
                evidenceBasis: insight.evidence,
                scope: 'system',
                userId: null,
                status: 'proposed',
                confidence: insight.confidence,
            },
        });
        console.log(`[PromptInsight] New system insight: [${insight.category}] ${insight.pattern.substring(0, 80)}`);
    }
}

// ============================================================================
// IMPACT MEASUREMENT — auto-promote or retire insights
// ============================================================================

/**
 * After each call evaluation, update impact metrics for all active insights.
 * Called inline from evaluateCall or by the weekly cron.
 */
export async function measureAllInsightImpact(): Promise<void> {
    const activeInsights = await prisma.promptInsight.findMany({
        where: { status: 'active' },
    });

    for (const insight of activeInsights) {
        try {
            await measureSingleInsightImpact(insight);
        } catch (err: any) {
            console.error(`[PromptInsight] Impact measurement failed for ${insight.id}: ${err.message}`);
        }
    }
}

async function measureSingleInsightImpact(insight: {
    id: string;
    scope: string;
    userId: string | null;
    activatedAt: Date | null;
    preActivateAvgScore: number | null;
    callsSinceActivation: number;
}): Promise<void> {
    if (!insight.activatedAt) return;

    // Count calls since activation
    const where = insight.userId
        ? { userId: insight.userId, createdAt: { gte: insight.activatedAt } }
        : { createdAt: { gte: insight.activatedAt } };

    const postActivationEvals = await prisma.callEvaluation.findMany({
        where,
        select: { overallScore: true },
    });

    if (postActivationEvals.length === 0) return;

    const postAvg = postActivationEvals.reduce((s, e) => s + e.overallScore, 0) / postActivationEvals.length;
    const delta = insight.preActivateAvgScore ? postAvg - insight.preActivateAvgScore : 0;

    await prisma.promptInsight.update({
        where: { id: insight.id },
        data: {
            postActivateAvgScore: Math.round(postAvg * 100) / 100,
            callsSinceActivation: postActivationEvals.length,
            impactDelta: Math.round(delta * 100) / 100,
        },
    });

    // Auto-promote or retire based on evidence
    if (postActivationEvals.length >= THRESHOLDS.IMPACT_MEASUREMENT_MIN_CALLS) {
        if (delta >= THRESHOLDS.VALIDATION_THRESHOLD) {
            await prisma.promptInsight.update({
                where: { id: insight.id },
                data: { status: 'validated', confidence: Math.min(1, 0.7 + delta * 0.3) },
            });
            console.log(`[PromptInsight] ✅ VALIDATED insight ${insight.id} — delta=${delta.toFixed(2)}`);
        } else if (delta <= THRESHOLDS.RETIREMENT_THRESHOLD) {
            await prisma.promptInsight.update({
                where: { id: insight.id },
                data: { status: 'retired', confidence: 0 },
            });
            console.log(`[PromptInsight] ❌ RETIRED insight ${insight.id} — delta=${delta.toFixed(2)}`);
        }
        // Otherwise stays active — needs more data or effect is neutral
    }
}

// ============================================================================
// AUTO-ACTIVATION — promote proposed → active with baseline measurement
// ============================================================================

/**
 * Promote high-confidence proposed insights to active.
 * Called during the weekly analysis cycle.
 */
export async function activateProposedInsights(): Promise<void> {
    const proposed = await prisma.promptInsight.findMany({
        where: { status: 'proposed', confidence: { gte: 0.5 } },
        orderBy: { confidence: 'desc' },
    });

    for (const insight of proposed) {
        // Check active count limits
        const activeCount = await prisma.promptInsight.count({
            where: {
                status: { in: ['active', 'validated'] },
                ...(insight.userId ? { userId: insight.userId } : { scope: 'system' }),
            },
        });

        const limit = insight.userId ? THRESHOLDS.MAX_ACTIVE_PER_USER : THRESHOLDS.MAX_ACTIVE_INSIGHTS;
        if (activeCount >= limit) continue;

        // Compute baseline average score before activation
        const baselineWhere = insight.userId
            ? { userId: insight.userId }
            : {};

        const baselineEvals = await prisma.callEvaluation.findMany({
            where: baselineWhere,
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { overallScore: true },
        });

        const baselineAvg = baselineEvals.length > 0
            ? baselineEvals.reduce((s, e) => s + e.overallScore, 0) / baselineEvals.length
            : null;

        await prisma.promptInsight.update({
            where: { id: insight.id },
            data: {
                status: 'active',
                activatedAt: new Date(),
                preActivateAvgScore: baselineAvg ? Math.round(baselineAvg * 100) / 100 : null,
            },
        });

        console.log(
            `[PromptInsight] 🚀 ACTIVATED insight ${insight.id} — ` +
            `baseline=${baselineAvg?.toFixed(2) ?? 'unknown'}, ` +
            `category=${insight.category}`
        );
    }
}

// ============================================================================
// GET ACTIVE INSIGHTS — called by buildVariableValues()
// ============================================================================

/**
 * Returns formatted insights for injection into the Vapi prompt.
 * Combines system-wide validated/active insights + user-specific ones.
 * Returns empty string if no insights are active (system hasn't learned enough yet).
 */
export async function getActiveInsights(userId: string): Promise<string> {
    const insights = await prisma.promptInsight.findMany({
        where: {
            status: { in: ['active', 'validated'] },
            OR: [
                { scope: 'system' },
                { userId },
            ],
        },
        orderBy: [
            { status: 'asc' },     // validated first
            { confidence: 'desc' },
        ],
        take: 6, // Max 6 insights in the prompt
        select: {
            recommendation: true,
            category: true,
            confidence: true,
            status: true,
            impactDelta: true,
        },
    });

    if (insights.length === 0) return '';

    // Format as coaching directives
    const lines = insights.map(i => {
        const tag = i.status === 'validated' ? '✓ PROVEN' : '→ TESTING';
        return `[${tag}] ${i.recommendation}`;
    });

    return `DATA-DRIVEN COACHING INSIGHTS (learned from analyzing past calls):
${lines.join('\n')}
Apply these naturally — don't mention that they come from analysis.`;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildAnalysisPrompt(
    evaluations: Array<{
        overallScore: number;
        newGroundScore: number;
        depthOfSharingScore: number;
        valueAddScore: number;
        contextUtilScore: number;
        repetitionScore: number;
        engagementScore: number;
        whatWorked: string[];
        whatToImprove: string[];
        createdAt: Date;
        voiceCall: {
            callType: string;
            summary: string | null;
            sentVariables: any;
            durationSeconds: number | null;
        };
    }>,
    existingInsights: Array<{ pattern: string; category: string; status: string }>,
    scope: 'user' | 'system',
    evalCount: number,
): string {
    // Build evaluation summary table
    const evalSummary = evaluations.map((e, i) => {
        const vars = e.voiceCall.sentVariables as Record<string, any> | null;
        const hasDirective = vars?.callDirective ? 'yes' : 'no';
        const hasCommitments = vars?.overdueCommitments ? 'yes' : 'no';
        const hasPeopleIntel = vars?.peopleIntel ? 'yes' : 'no';

        return [
            `Call ${i + 1}: type=${e.voiceCall.callType}, duration=${e.voiceCall.durationSeconds ?? '?'}s`,
            `  Scores: overall=${e.overallScore}, valueAdd=${e.valueAddScore}, newGround=${e.newGroundScore}, depth=${e.depthOfSharingScore}, context=${e.contextUtilScore}, repetition=${e.repetitionScore}, engagement=${e.engagementScore}`,
            `  Context sent: directive=${hasDirective}, commitments=${hasCommitments}, peopleIntel=${hasPeopleIntel}`,
            `  Worked: ${e.whatWorked.slice(0, 3).join('; ') || 'none noted'}`,
            `  Improve: ${e.whatToImprove.slice(0, 3).join('; ') || 'none noted'}`,
        ].join('\n');
    }).join('\n\n');

    // Compute aggregate stats
    const avgOverall = evaluations.reduce((s, e) => s + e.overallScore, 0) / evaluations.length;
    const avgValueAdd = evaluations.reduce((s, e) => s + e.valueAddScore, 0) / evaluations.length;
    const avgEngagement = evaluations.reduce((s, e) => s + e.engagementScore, 0) / evaluations.length;

    // Find top and bottom calls
    const sorted = [...evaluations].sort((a, b) => b.overallScore - a.overallScore);
    const topCalls = sorted.slice(0, 3);
    const bottomCalls = sorted.slice(-3).reverse();

    const topPatterns = topCalls.map(e => e.whatWorked.join('; ')).filter(Boolean).join(' | ');
    const bottomIssues = bottomCalls.map(e => e.whatToImprove.join('; ')).filter(Boolean).join(' | ');

    // Existing insights to avoid duplicates
    const existingSummary = existingInsights.length > 0
        ? existingInsights.map(i => `[${i.status}] ${i.category}: ${i.pattern}`).join('\n')
        : 'None yet';

    return `You are a coaching effectiveness analyst. Analyze ${evalCount} voice coaching call evaluations to find actionable patterns that improve call quality.

## Scope
${scope === 'user' ? 'Analyzing calls for a SINGLE USER — find what works specifically for this person.' : 'Analyzing calls across MULTIPLE USERS — find universal patterns that work for everyone.'}

## Aggregate Stats
- Average overall score: ${avgOverall.toFixed(2)}/10
- Average value-add: ${avgValueAdd.toFixed(2)}/10
- Average engagement: ${avgEngagement.toFixed(2)}/10

## Top-performing calls had in common:
${topPatterns || 'No clear pattern yet'}

## Lowest-performing calls struggled with:
${bottomIssues || 'No clear pattern yet'}

## Call Evaluations (most recent first)
${evalSummary}

## Already-Discovered Insights (do NOT duplicate these)
${existingSummary}

---

Find 1-3 NEW patterns that could improve call quality. Focus on actionable, specific insights — not generic advice.

Good insight: "When Mira references a specific person by name in the opening, engagement scores are 40% higher"
Bad insight: "Mira should be more empathetic" (too vague)

Categories: opening, topic_selection, tone, pacing, follow_up, commitment_tracking, personal_depth, context_use

Respond with ONLY a JSON array (no markdown, no backticks):
[
  {
    "pattern": "Specific observation about what correlates with higher scores",
    "recommendation": "Specific directive for Mira to follow in future calls. Written as an instruction.",
    "category": "one of the categories listed above",
    "confidence": 0.0-1.0,
    "evidence": {
      "kpiAffected": "which KPI this primarily impacts",
      "avgScoreWith": "estimated avg score when this pattern is present",
      "avgScoreWithout": "estimated avg score when absent",
      "sampleSize": "number of calls this observation is based on",
      "effectSize": "estimated improvement (e.g. '+1.5 on valueAdd')"
    }
  }
]

If you don't see any clear, non-obvious patterns with sufficient evidence, return an empty array []. Better to return nothing than a weak insight.`;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

interface ParsedInsight {
    pattern: string;
    recommendation: string;
    category: string;
    confidence: number;
    evidence: Record<string, any>;
}

function parseInsightResponse(raw: string): ParsedInsight[] {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed: any[];
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        console.error(`[PromptInsight] Failed to parse LLM response: ${cleaned.substring(0, 200)}`);
        return [];
    }

    if (!Array.isArray(parsed)) return [];

    const validCategories = [
        'opening', 'topic_selection', 'tone', 'pacing', 'follow_up',
        'commitment_tracking', 'personal_depth', 'context_use',
    ];

    return parsed
        .filter((item: any) =>
            item.pattern && item.recommendation && item.category &&
            validCategories.includes(item.category)
        )
        .map((item: any) => ({
            pattern: String(item.pattern),
            recommendation: String(item.recommendation),
            category: String(item.category),
            confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
            evidence: item.evidence || {},
        }))
        .slice(0, 3); // Max 3 new insights per analysis run
}
