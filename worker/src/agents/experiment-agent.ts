/**
 * Experiment Agent — Controlled A/B testing for coaching strategies
 *
 * Runs within-subject experiments: each user alternates between variant A and B
 * for a given dimension. Measures impact on specific KPIs, concludes with
 * statistical significance, and feeds winners into the prompt insights pipeline.
 *
 * Lifecycle: proposed → active → concluded → archived
 *
 * Integration points:
 * - buildCallDirective() calls getExperimentDirective() to get variant instructions
 * - evaluateCall() calls reconcileExperimentAssignments() + linkScoresToExperiment()
 * - Weekly cron calls concludeReadyExperiments()
 */

import { prisma } from '../lib/prisma';
import { withAgentRun } from '../lib/agent-run';

// ============================================================================
// TYPES
// ============================================================================

export interface PendingAssignment {
    experimentId: string;
    dimension: string;
    variant: 'A' | 'B';
    instruction: string;
}

interface ExperimentDirectiveResult {
    directive: string;
    assignments: PendingAssignment[];
}

// ============================================================================
// 1. GET EXPERIMENT DIRECTIVE (called before each call)
// ============================================================================

/**
 * Returns experiment instructions to append to callDirective,
 * plus assignment metadata to store in sentVariables.
 */
export async function getExperimentDirective(userId: string): Promise<ExperimentDirectiveResult> {
    const activeExperiments = await prisma.coachingExperiment.findMany({
        where: { userId, status: 'active' },
        include: {
            assignments: {
                select: { variant: true },
            },
        },
    });

    if (activeExperiments.length === 0) {
        return { directive: '', assignments: [] };
    }

    const assignments: PendingAssignment[] = [];
    const instructions: string[] = [];

    for (const exp of activeExperiments) {
        // Count existing assignments per variant
        const countA = exp.assignments.filter(a => a.variant === 'A').length;
        const countB = exp.assignments.filter(a => a.variant === 'B').length;

        // Assign variant: balance, tie-break to A
        const variant: 'A' | 'B' = countA <= countB ? 'A' : 'B';
        const instruction = variant === 'A' ? exp.variantAInstruction : exp.variantBInstruction;

        assignments.push({
            experimentId: exp.id,
            dimension: exp.dimension,
            variant,
            instruction,
        });

        instructions.push(instruction);
    }

    const directive = instructions.length > 0
        ? `\nSTYLE GUIDANCE:\n${instructions.join('\n')}`
        : '';

    return { directive, assignments };
}

// ============================================================================
// 2. RECONCILE ASSIGNMENTS (called after call ends, during evaluation)
// ============================================================================

/**
 * Creates ExperimentAssignment records from sentVariables metadata.
 * Idempotent — skips if assignments already exist for this voiceCallId.
 */
export async function reconcileExperimentAssignments(
    voiceCallId: string,
    userId: string,
): Promise<void> {
    // Load sentVariables from the VoiceCall
    const voiceCall = await prisma.voiceCall.findUnique({
        where: { id: voiceCallId },
        select: { sentVariables: true },
    });

    if (!voiceCall?.sentVariables) return;

    const vars = voiceCall.sentVariables as Record<string, unknown>;
    const rawAssignments = vars.experimentAssignments;
    if (!rawAssignments) return;

    let pendingAssignments: PendingAssignment[];
    try {
        pendingAssignments = typeof rawAssignments === 'string'
            ? JSON.parse(rawAssignments)
            : rawAssignments as PendingAssignment[];
    } catch {
        return;
    }

    if (!Array.isArray(pendingAssignments) || pendingAssignments.length === 0) return;

    for (const pa of pendingAssignments) {
        // Check if already reconciled
        const existing = await prisma.experimentAssignment.findFirst({
            where: { experimentId: pa.experimentId, voiceCallId },
        });
        if (existing) continue;

        // Verify experiment still exists and is active
        const experiment = await prisma.coachingExperiment.findFirst({
            where: { id: pa.experimentId, status: 'active' },
        });
        if (!experiment) continue;

        await prisma.experimentAssignment.create({
            data: {
                experimentId: pa.experimentId,
                voiceCallId,
                userId,
                variant: pa.variant,
                instructionUsed: pa.instruction,
            },
        });

        // Increment variant count
        const countField = pa.variant === 'A' ? 'variantACallCount' : 'variantBCallCount';
        await prisma.coachingExperiment.update({
            where: { id: pa.experimentId },
            data: { [countField]: { increment: 1 } },
        });

        console.log(`[Experiment] Assigned ${pa.dimension}:${pa.variant} to call ${voiceCallId.substring(0, 8)}`);
    }
}

// ============================================================================
// 3. LINK SCORES TO EXPERIMENT (called after evaluation saved)
// ============================================================================

export async function linkScoresToExperiment(
    voiceCallId: string,
    scores: Record<string, number>,
): Promise<void> {
    const assignments = await prisma.experimentAssignment.findMany({
        where: { voiceCallId },
        include: { experiment: { select: { primaryKpi: true } } },
    });

    for (const assignment of assignments) {
        const primaryKpi = assignment.experiment.primaryKpi;
        const primaryKpiScore = scores[primaryKpi] ?? null;

        await prisma.experimentAssignment.update({
            where: { id: assignment.id },
            data: {
                primaryKpiScore,
                overallScore: scores.overallScore ?? null,
            },
        });

        // Append score to experiment's variant scores array
        if (primaryKpiScore !== null) {
            const scoresField = assignment.variant === 'A' ? 'variantAScores' : 'variantBScores';
            const experiment = await prisma.coachingExperiment.findUnique({
                where: { id: assignment.experimentId },
                select: { [scoresField]: true },
            });
            const existing = (experiment as any)?.[scoresField] as number[] || [];
            await prisma.coachingExperiment.update({
                where: { id: assignment.experimentId },
                data: { [scoresField]: [...existing, primaryKpiScore] },
            });
        }
    }
}

// ============================================================================
// 4. CONCLUDE READY EXPERIMENTS (weekly cron)
// ============================================================================

export async function concludeReadyExperiments(): Promise<void> {
    return withAgentRun('experiment-conclude', undefined, 'cron', async (ctx) => {
        const ready = await prisma.coachingExperiment.findMany({
            where: {
                status: 'active',
            },
            include: {
                assignments: {
                    where: { primaryKpiScore: { not: null } },
                    select: { variant: true, primaryKpiScore: true },
                },
            },
        });

        for (const exp of ready) {
            const scoresA = exp.assignments.filter(a => a.variant === 'A').map(a => a.primaryKpiScore!);
            const scoresB = exp.assignments.filter(a => a.variant === 'B').map(a => a.primaryKpiScore!);

            if (scoresA.length < exp.minCallsPerVariant || scoresB.length < exp.minCallsPerVariant) {
                continue;
            }

            const result = welchTTest(scoresA, scoresB);
            const meanA = mean(scoresA);
            const meanB = mean(scoresB);
            const effectSize = meanB - meanA;

            let winner: string | null = null;
            let conclusion: string;

            if (result.p < 0.15) {
                winner = effectSize > 0 ? 'B' : 'A';
                const winnerLabel = winner === 'A' ? exp.variantALabel : exp.variantBLabel;
                const loserLabel = winner === 'A' ? exp.variantBLabel : exp.variantALabel;
                conclusion = `${winnerLabel} outperformed ${loserLabel} on ${exp.primaryKpi} ` +
                    `(${winner === 'A' ? meanA.toFixed(1) : meanB.toFixed(1)} vs ${winner === 'A' ? meanB.toFixed(1) : meanA.toFixed(1)}, ` +
                    `p=${result.p.toFixed(3)}, n=${scoresA.length}+${scoresB.length}). ` +
                    `Effect size: ${Math.abs(effectSize).toFixed(2)} points.`;
            } else {
                winner = 'inconclusive';
                conclusion = `No significant difference between ${exp.variantALabel} and ${exp.variantBLabel} ` +
                    `on ${exp.primaryKpi} (A: ${meanA.toFixed(1)}, B: ${meanB.toFixed(1)}, ` +
                    `p=${result.p.toFixed(3)}, n=${scoresA.length}+${scoresB.length}).`;
            }

            await prisma.coachingExperiment.update({
                where: { id: exp.id },
                data: {
                    status: 'concluded',
                    variantAAvgKpi: meanA,
                    variantBAvgKpi: meanB,
                    effectSize,
                    pValue: result.p,
                    winner,
                    conclusion,
                    concludedAt: new Date(),
                },
            });

            // If there's a clear winner, create a PromptInsight
            if (winner === 'A' || winner === 'B') {
                const winnerInstruction = winner === 'A' ? exp.variantAInstruction : exp.variantBInstruction;
                const winnerLabel = winner === 'A' ? exp.variantALabel : exp.variantBLabel;

                await prisma.promptInsight.create({
                    data: {
                        userId: exp.userId,
                        pattern: `Experiment "${exp.dimension}": ${winnerLabel} won (p=${result.p.toFixed(3)})`,
                        recommendation: winnerInstruction,
                        category: exp.dimension,
                        scope: 'user',
                        status: 'active',
                        confidence: Math.max(0.5, 1 - result.p),
                        preScore: winner === 'A' ? meanB : meanA,
                        postScore: winner === 'A' ? meanA : meanB,
                        impactDelta: Math.abs(effectSize),
                        callsSinceActivation: scoresA.length + scoresB.length,
                        activatedAt: new Date(),
                    },
                });

                console.log(`[Experiment] Winner: ${winnerLabel} for ${exp.dimension} (user ${exp.userId.substring(0, 8)})`);
            }

            ctx.itemsProcessed++;
            ctx.logs.push(`${exp.dimension}: ${winner} (p=${result.p.toFixed(3)})`);
        }
    });
}

// ============================================================================
// 5. SEED INITIAL EXPERIMENTS
// ============================================================================

const SEED_EXPERIMENTS = [
    {
        dimension: 'opening_style',
        hypothesis: 'Direct challenge openers increase depth of sharing vs warm check-ins',
        primaryKpi: 'depthOfSharingScore',
        secondaryKpis: ['engagementScore', 'valueAddScore'],
        variantALabel: 'warm_rapport',
        variantAInstruction: 'Open with a warm, personal check-in. Ask how the user is doing before diving into topics. Build rapport before substance.',
        variantBLabel: 'direct_substance',
        variantBInstruction: 'Open with a thought-provoking observation or question about something the user mentioned previously. Skip pleasantries and go straight to substance.',
    },
    {
        dimension: 'question_density',
        hypothesis: 'Fewer, deeper questions increase engagement vs broader coverage',
        primaryKpi: 'engagementScore',
        secondaryKpis: ['depthOfSharingScore', 'newGroundScore'],
        variantALabel: 'broad_coverage',
        variantAInstruction: 'Cover 3-4 different topics during the call. Keep questions varied to maintain breadth and discover new areas.',
        variantBLabel: 'deep_focus',
        variantBInstruction: 'Focus on 1-2 topics maximum. Go much deeper on each one. Let silence work. Follow up 2-3 times on each answer before moving on.',
    },
    {
        dimension: 'challenge_level',
        hypothesis: 'Higher challenge increases value-add perception',
        primaryKpi: 'valueAddScore',
        secondaryKpis: ['depthOfSharingScore', 'engagementScore'],
        variantALabel: 'supportive',
        variantAInstruction: 'Be supportive and affirming. Validate the user\'s decisions. Offer gentle suggestions only when asked.',
        variantBLabel: 'challenging',
        variantBInstruction: 'Respectfully challenge the user\'s assumptions. Push back on vague answers. Ask "what\'s the real issue here?" when the user stays surface-level.',
    },
    {
        dimension: 'context_reference',
        hypothesis: 'Naming specific people/projects increases context utilization score',
        primaryKpi: 'contextUtilScore',
        secondaryKpis: ['valueAddScore', 'newGroundScore'],
        variantALabel: 'general_themes',
        variantAInstruction: 'Reference general themes from past conversations without naming specific people or projects.',
        variantBLabel: 'specific_names',
        variantBInstruction: 'Reference specific people, projects, and deadlines by name when relevant. Say things like "Last time you mentioned [name] was blocking [project] — how did that go?"',
    },
    {
        dimension: 'commitment_timing',
        hypothesis: 'Early commitment follow-up increases new ground discovery',
        primaryKpi: 'newGroundScore',
        secondaryKpis: ['valueAddScore', 'contextUtilScore'],
        variantALabel: 'commitments_later',
        variantAInstruction: 'Save commitment follow-ups for later in the call, after exploring new topics first.',
        variantBLabel: 'commitments_first',
        variantBInstruction: 'Open with a commitment follow-up in the first 2 minutes. Check on the most recent open commitment before exploring anything new.',
    },
];

/**
 * Seed initial experiments for a user. Called when they reach 3 evaluated calls.
 * Idempotent — skips dimensions that already have an active/proposed experiment.
 */
export async function seedExperimentsForUser(userId: string): Promise<number> {
    let created = 0;

    for (const seed of SEED_EXPERIMENTS) {
        const existing = await prisma.coachingExperiment.findFirst({
            where: {
                userId,
                dimension: seed.dimension,
                status: { in: ['proposed', 'active'] },
            },
        });

        if (existing) continue;

        await prisma.coachingExperiment.create({
            data: {
                userId,
                ...seed,
                status: 'active',
                activatedAt: new Date(),
            },
        });
        created++;
    }

    if (created > 0) {
        console.log(`[Experiment] Seeded ${created} experiments for user ${userId.substring(0, 8)}`);
    }

    return created;
}

// ============================================================================
// STATISTICS
// ============================================================================

function mean(arr: number[]): number {
    return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function variance(arr: number[]): number {
    const m = mean(arr);
    return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number } {
    const nA = a.length;
    const nB = b.length;
    const meanA = mean(a);
    const meanB = mean(b);
    const varA = variance(a);
    const varB = variance(b);

    const se = Math.sqrt(varA / nA + varB / nB);
    if (se === 0) return { t: 0, df: nA + nB - 2, p: 1 };

    const t = (meanB - meanA) / se;

    // Welch-Satterthwaite degrees of freedom
    const num = (varA / nA + varB / nB) ** 2;
    const den = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
    const df = num / den;

    // Two-tailed p-value approximation using Hill's formula for t-distribution
    const p = tDistPValue(Math.abs(t), df);
    return { t, df, p };
}

/**
 * Approximate two-tailed p-value from t-distribution.
 * Uses the regularized incomplete beta function via continued fraction.
 */
function tDistPValue(t: number, df: number): number {
    const x = df / (df + t * t);
    return betaIncomplete(df / 2, 0.5, x);
}

function betaIncomplete(a: number, b: number, x: number): number {
    // Use the continued fraction representation (Lentz's algorithm)
    if (x === 0 || x === 1) return x === 0 ? 1 : 0;

    const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

    // Continued fraction
    let f = 1;
    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    f = d;

    for (let m = 1; m <= 200; m++) {
        // Even step
        let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + numerator / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        f *= d * c;

        // Odd step
        numerator = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + numerator / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;

        const delta = d * c;
        f *= delta;

        if (Math.abs(delta - 1) < 1e-10) break;
    }

    return front * f;
}

function lgamma(x: number): number {
    // Lanczos approximation
    const g = 7;
    const coef = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];

    if (x < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    }

    x -= 1;
    let a = coef[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) {
        a += coef[i] / (x + i);
    }

    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
