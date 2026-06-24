/**
 * Call Planning Agent — Assembles a deterministic directive for Mira's next call.
 *
 * No LLM calls. Reads CoachingRelationshipPlan, CallEvaluation, and PersonalContext
 * from the database, then templates a structured directive string that gets injected
 * into the Vapi assistant's variableValues.
 *
 * Must be fast — called right before every outbound call.
 */

import { prisma } from '../lib/prisma';
import { getExperimentDirective, PendingAssignment } from './experiment-agent';
import { getHypothesesForCall, promoteHypotheses } from './hypothesis-engine';
import { selectPosture, PostureContext } from '../lib/posture-engine';
import { computeMaturityLevel } from '../lib/confidence-engine';

export interface CallDirectiveResult {
    directive: string;
    experimentAssignments: PendingAssignment[];
}

// ============================================================================
// TYPES
// ============================================================================

interface CoachingTheme {
    theme: string;
    firstSeen: string;
    lastSeen: string;
    callCount: number;
    status: 'active' | 'resolved' | 'parked';
}

interface Commitment {
    commitment: string;
    madeAt: string;
    followedUpAt?: string;
    status: 'open' | 'followed_up' | 'completed' | 'dropped';
    callId?: string;
}

interface CommunicationProfile {
    pace?: string;
    depth?: string;
    humor?: string;
    directness?: string;
    preferredTopicEntry?: string;
    avoidPatterns?: string[];
}

interface PersonalityProfile {
    coachingAdaptations?: string[];
    communicationStyle?: string;
    emotionalTriggers?: string[];
    decisionStyle?: string;
    bigFive?: Record<string, number>;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function buildCallDirective(userId: string, callType: string): Promise<CallDirectiveResult> {
    try {
        console.log(`[CallPlanning] Building directive for user=${userId} callType=${callType}`);

        const [plan, lastEvaluation, recentEvaluations, personalContext] = await Promise.all([
            prisma.coachingRelationshipPlan.findUnique({ where: { userId } }),
            prisma.callEvaluation.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.callEvaluation.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { recommendedTopics: true, whatToImprove: true },
            }),
            prisma.personalContext.findUnique({ where: { userId } }),
        ]);

        // First few calls — no plan yet
        if (!plan) {
            const callCount = personalContext?.callCount ?? 0;
            console.log(`[CallPlanning] No plan yet for user=${userId}, call #${callCount + 1}`);
            const minDirective = buildMinimalDirective(callCount, callType, personalContext);
            // Add hypotheses even for early calls (if any exist)
            await promoteHypotheses(userId).catch(() => {});
            const hypothesesDirective = await getHypothesesForCall(userId, 1).catch(() => '');
            // Still add experiment instructions even for early calls
            const expResult = await getExperimentDirective(userId).catch(() => ({ directive: '', assignments: [] }));
            return {
                directive: minDirective + (hypothesesDirective ? '\n' + hypothesesDirective : '') + expResult.directive,
                experimentAssignments: expResult.assignments,
            };
        }

        const sections: string[] = [];

        // PHASE
        const callCount = personalContext?.callCount ?? 0;
        sections.push(`PHASE: ${plan.phase} (call ${callCount + 1})`);

        // COACHING POSTURE — deterministic posture recommendation for this call
        try {
            const maturityLevel = await computeMaturityLevel(userId).catch(() =>
                callCount < 5 ? 'LEARNING' as const : callCount < 15 ? 'OBSERVING' as const : 'COACHING' as const
            );

            const prefs = await prisma.userPreferences.findUnique({
                where: { userId },
                select: { primaryArchetype: true },
            }).catch(() => null);

            const overdueCount = await prisma.relationshipAction.count({
                where: { goal: { userId }, status: 'IN_PROGRESS', dueDate: { lt: new Date() } },
            }).catch(() => 0);

            const postureCtx: PostureContext = {
                callType,
                callCount,
                maturityLevel,
                archetype: prefs?.primaryArchetype || null,
                overdueCommitmentCount: overdueCount,
            };

            const posture = selectPosture(postureCtx);
            sections.push(`COACHING POSTURE: ${posture.primary.toUpperCase()}${posture.secondary ? ` (secondary: ${posture.secondary})` : ''} — ${posture.reason}`);
            sections.push(`POSTURE RULES: ${posture.rules.join(' | ')}`);
            sections.push(`POSTURE TONE: ${posture.tone}`);
        } catch (err) {
            console.warn(`[CallPlanning] Posture selection failed for user=${userId}:`, err);
        }

        // EXPLORE TODAY
        const exploreTopics = buildExploreTopics(
            lastEvaluation?.recommendedTopics ?? [],
            plan.coachingThemes as unknown as CoachingTheme[],
        );
        if (exploreTopics.length > 0) {
            const numbered = exploreTopics.map((t, i) => `${i + 1}) ${t}`).join(', ');
            sections.push(`EXPLORE TODAY: ${numbered}`);
        }

        // AVOID
        const avoidTopics = buildAvoidTopics(
            plan.avoidTopics,
            recentEvaluations,
            plan.coachingThemes as unknown as CoachingTheme[],
        );
        if (avoidTopics.length > 0) {
            sections.push(`AVOID: ${avoidTopics.join(', ')}`);
        }

        // COMMITMENTS TO CHECK
        const commitments = (plan.commitments as unknown as Commitment[])
            .filter(c => c.status === 'open')
            .sort((a, b) => new Date(a.madeAt).getTime() - new Date(b.madeAt).getTime());
        if (commitments.length > 0) {
            const formatted = commitments
                .slice(0, 3) // Cap at 3 to keep directive focused
                .map(c => `"${c.commitment}" (${daysAgoLabel(c.madeAt)})`)
                .join(', ');
            sections.push(`COMMITMENTS TO CHECK: ${formatted}`);
        }

        // PERSONALITY-ADAPTED STYLE
        const personalityProfile = plan.personalityProfile as PersonalityProfile;
        const communicationProfile = plan.communicationProfile as CommunicationProfile;
        const styleNotes = buildStyleNotes(personalityProfile, communicationProfile);
        if (styleNotes) {
            sections.push(`PERSONALITY-ADAPTED STYLE: ${styleNotes}`);
        }

        // EMOTIONAL CONTEXT
        const emotionalContext = buildEmotionalContext(personalityProfile, personalContext);
        if (emotionalContext) {
            sections.push(`EMOTIONAL CONTEXT: ${emotionalContext}`);
        }

        // HYPOTHESES TO TEST — observe → hypothesize → present → validate
        await promoteHypotheses(userId).catch(() => {});
        const hypothesesDirective = await getHypothesesForCall(userId, 2).catch(() => '');
        if (hypothesesDirective) {
            sections.push(hypothesesDirective);
        }

        // EXPERIMENT — append A/B variant instructions
        const expResult = await getExperimentDirective(userId).catch(() => ({ directive: '', assignments: [] }));
        if (expResult.directive) {
            sections.push(expResult.directive);
        }

        const directive = sections.join('\n');
        console.log(`[CallPlanning] Directive built (${directive.length} chars) for user=${userId}`);
        return { directive, experimentAssignments: expResult.assignments };

    } catch (error) {
        console.error(`[CallPlanning] Error building directive for user=${userId}:`, error);
        return { directive: '', experimentAssignments: [] };
    }
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

function buildMinimalDirective(
    callCount: number,
    callType: string,
    personalContext: { knownTopics?: string[]; gapTopics?: string[] } | null,
): string {
    const sections: string[] = [];
    sections.push(`PHASE: discovery (call ${callCount + 1})`);

    if (callType === 'onboarding') {
        sections.push('EXPLORE TODAY: Learn about the user — their role, team, current priorities, and what kind of support they want from Mira.');
    } else {
        sections.push('EXPLORE TODAY: Check in on how things are going. Ask about their day and any priorities on their mind.');
    }

    if (personalContext?.gapTopics && personalContext.gapTopics.length > 0) {
        const gaps = personalContext.gapTopics.slice(0, 3).join(', ');
        sections.push(`KNOWLEDGE GAPS (explore if natural): ${gaps}`);
    }

    return sections.join('\n');
}

function buildExploreTopics(
    recommendedTopics: string[],
    coachingThemes: CoachingTheme[],
): string[] {
    const topics: string[] = [];

    // Recommended topics from last evaluation take priority
    for (const topic of recommendedTopics) {
        if (topics.length < 3) {
            topics.push(topic);
        }
    }

    // Fill remaining slots with active coaching themes
    const activeThemes = coachingThemes
        .filter(t => t.status === 'active')
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    for (const theme of activeThemes) {
        if (topics.length >= 4) break;
        // Don't duplicate topics already in the list
        const isDuplicate = topics.some(t =>
            t.toLowerCase().includes(theme.theme.toLowerCase()) ||
            theme.theme.toLowerCase().includes(t.toLowerCase())
        );
        if (!isDuplicate) {
            topics.push(theme.theme);
        }
    }

    return topics;
}

function buildAvoidTopics(
    explicitAvoids: string[],
    recentEvaluations: Array<{ recommendedTopics: string[]; whatToImprove: string[] }>,
    coachingThemes: CoachingTheme[],
): string[] {
    const avoids: string[] = [];

    // Explicit avoids from plan
    for (const topic of explicitAvoids) {
        avoids.push(topic);
    }

    // Parked coaching themes
    const parkedThemes = coachingThemes.filter(t => t.status === 'parked');
    for (const theme of parkedThemes) {
        avoids.push(`${theme.theme} (user parked)`);
    }

    // Topics appearing in >3 of the last 5 evaluations' recommendedTopics
    // (if the same topic keeps being recommended, it's probably getting stale)
    if (recentEvaluations.length >= 4) {
        const topicCounts = new Map<string, number>();
        for (const eval_ of recentEvaluations) {
            for (const topic of eval_.recommendedTopics) {
                const normalized = topic.toLowerCase().trim();
                topicCounts.set(normalized, (topicCounts.get(normalized) ?? 0) + 1);
            }
        }
        for (const [topic, count] of topicCounts) {
            if (count > 3) {
                const alreadyListed = avoids.some(a => a.toLowerCase().includes(topic));
                if (!alreadyListed) {
                    avoids.push(`${topic} (discussed ${count}x recently)`);
                }
            }
        }
    }

    return avoids;
}

function buildStyleNotes(
    personality: PersonalityProfile,
    communication: CommunicationProfile,
): string {
    const notes: string[] = [];

    // Coaching adaptations are the primary source
    if (personality.coachingAdaptations && personality.coachingAdaptations.length > 0) {
        notes.push(...personality.coachingAdaptations);
    }

    // Communication style summary
    if (personality.communicationStyle) {
        notes.push(personality.communicationStyle);
    }

    // Add communication profile details if no adaptations yet
    if (notes.length === 0 && communication) {
        if (communication.directness) notes.push(`Directness: ${communication.directness}`);
        if (communication.pace) notes.push(`Pace: ${communication.pace}`);
        if (communication.preferredTopicEntry) notes.push(`Entry: ${communication.preferredTopicEntry}`);
    }

    return notes.join(' ');
}

function buildEmotionalContext(
    personality: PersonalityProfile,
    personalContext: { energyPatterns?: string | null; stressSignals?: string | null; values?: string[] } | null,
): string {
    const parts: string[] = [];

    if (personality.emotionalTriggers && personality.emotionalTriggers.length > 0) {
        parts.push(...personality.emotionalTriggers);
    }

    if (personalContext?.energyPatterns) {
        parts.push(personalContext.energyPatterns);
    }

    if (personalContext?.stressSignals) {
        parts.push(`Stress signal: ${personalContext.stressSignals}`);
    }

    return parts.join('. ');
}

// ============================================================================
// HELPERS
// ============================================================================

function daysAgoLabel(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}
