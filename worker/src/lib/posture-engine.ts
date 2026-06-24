/**
 * Posture Engine — Selects the coaching posture for Mira's next call.
 *
 * 9 postures define HOW Mira shows up (celebrate, uplift, prepare, advise,
 * listen, nudge, challenge, connect, debrief). Each posture has rules, tone,
 * maturity gates, and archetype affinities.
 *
 * Phase 1: Deterministic heuristic selection from available data.
 * Phase 2+: Signal-driven selection from SignalCollector.
 */

// ============================================================================
// TYPES
// ============================================================================

export type PostureName =
    | 'celebrate'
    | 'uplift'
    | 'prepare'
    | 'advise'
    | 'listen'
    | 'nudge'
    | 'challenge'
    | 'connect'
    | 'debrief';

export type MaturityLevel = 'LEARNING' | 'OBSERVING' | 'COACHING';

export interface PostureDefinition {
    name: PostureName;
    intent: string;
    tone: string;
    rules: string[];
    segments: string;
    duration: string;
    minMaturity: MaturityLevel | null; // null = available at all levels
    incompatibleWith: PostureName[];
}

export interface PostureSelection {
    primary: PostureName;
    secondary: PostureName | null;
    reason: string;
    rules: string[];
    tone: string;
    segments: string;
    duration: string;
}

export interface PostureContext {
    callType: string;
    callCount: number;
    maturityLevel: MaturityLevel;
    archetype?: string | null;
    // Data signals (Phase 1 heuristics)
    hasRecentLanded?: boolean;      // outcome LANDED in last 48h
    hasRecentMissed?: boolean;      // outcome MISSED in last 48h
    overdueCommitmentCount?: number;
    meetingCount?: number;          // today's meetings
    hasUpcomingHighStakes?: boolean; // high-stakes meeting in next 2h
    hasRecentMeetingEnd?: boolean;  // meeting ended in last 45min
    isLightDay?: boolean;           // 0-2 meetings
    personalThreadReady?: boolean;  // thread ready to water
    userInitiatedCallback?: boolean;
    depthTrendingUp?: boolean;      // depth-of-sharing trending up
    engagementTrendingDown?: boolean;
}

// ============================================================================
// POSTURE DEFINITIONS
// ============================================================================

const POSTURES: Record<PostureName, PostureDefinition> = {
    celebrate: {
        name: 'celebrate',
        intent: 'Acknowledge a win. Let them feel it.',
        tone: 'Warm, genuine, not sycophantic. Dry humor welcome.',
        rules: [
            'Lead with the win — name it specifically.',
            'No accountability in this call. No nudges.',
            'Ask "What made it work?" to extract the learning.',
            'Keep it short. Let the win breathe.',
        ],
        segments: `OPENER (acknowledgment, not calendar) → REFLECTION ("What made it work?") → CONNECT (personal win) → CLOSER (momentum).`,
        duration: '3-5 min',
        minMaturity: null,
        incompatibleWith: ['nudge', 'challenge'],
    },
    uplift: {
        name: 'uplift',
        intent: 'Lighten a heavy day. Find one bright spot.',
        tone: 'Warm, light, dry humor if receptive. "I\'m tired just looking at your calendar."',
        rules: [
            'Lead with empathy, not calendar facts.',
            'Skip accountability. Skip coaching.',
            'Find one small win or say one kind word.',
            'Keep it short — don\'t pile on.',
        ],
        segments: `OPENER (empathy lead) → BRIEFING (compressed — headlines only) → PERSONAL (light — "What recharges you?") → CLOSER (one small win or one kind word).`,
        duration: '3-5 min',
        minMaturity: null,
        incompatibleWith: ['challenge'],
    },
    prepare: {
        name: 'prepare',
        intent: 'Sharpen their edge before a moment that matters.',
        tone: 'Focused, coach-like. Pre-game huddle energy.',
        rules: [
            'Reference the specific meeting and attendees.',
            'Ask for desired outcome if not set.',
            'One tactical tip — confidence-gated.',
            'End with an anchoring phrase they can carry in.',
        ],
        segments: `OPENER (context) → BRIEFING (meeting intelligence, attendee intel) → COACHING (desired outcome, tactical tips) → CLOSER (anchoring phrase).`,
        duration: '3-7 min',
        minMaturity: null,
        incompatibleWith: [],
    },
    advise: {
        name: 'advise',
        intent: 'Offer a specific, earned insight.',
        tone: 'Direct for COACHING maturity, hedged for OBSERVING. Match archetype.',
        rules: [
            'Must reference a specific person, meeting, or pattern.',
            'Never generic. Specificity test applies.',
            'Frame by archetype: data-first for Skeptic, narrative for Connector, frameworks for Reluctant.',
            'Include a related commitment check if applicable.',
        ],
        segments: `OPENER (context) → COACHING (the insight, framed by archetype) → ACCOUNTABILITY (related commitment) → CLOSER.`,
        duration: '5-10 min',
        minMaturity: 'OBSERVING',
        incompatibleWith: [],
    },
    listen: {
        name: 'listen',
        intent: 'Hold space. Reflect back. Don\'t solve.',
        tone: 'Present. Warm. No advice unless asked.',
        rules: [
            '70/30 user/Mira talk ratio. Mostly silence.',
            'No segment structure imposed — follow user\'s lead.',
            'Reflect back, don\'t solve. "Tell me more about that."',
            'Don\'t turn venting into coaching.',
        ],
        segments: `OPENER (check-in, not calendar) → OPEN SPACE (follow user's lead, reflect back) → CLOSER (validate, don't solve).`,
        duration: 'User-determined. No target.',
        minMaturity: null,
        incompatibleWith: ['advise'],
    },
    nudge: {
        name: 'nudge',
        intent: 'Hold them accountable without nagging.',
        tone: 'Matter-of-fact, not nagging. "Just keeping you honest."',
        rules: [
            'Reference the specific commitment with context.',
            'Max 2 nudges per call.',
            'If user pushes back, accept immediately.',
            'Ask "What\'s blocking this?" — light coaching.',
        ],
        segments: `OPENER (brief) → ACCOUNTABILITY (the commitment, with context) → COACHING (light — "What's blocking this?") → CLOSER.`,
        duration: '3-5 min',
        minMaturity: null,
        incompatibleWith: ['celebrate', 'listen'],
    },
    challenge: {
        name: 'challenge',
        intent: 'Push back on something they\'re avoiding.',
        tone: 'Direct but caring. "I\'ve noticed something I want to name."',
        rules: [
            'ONLY in COACHING maturity with high trust.',
            'Only one challenge per call.',
            'Always offer an out: "Want to go there, or save it?"',
            'Earn the right with a warm opener first.',
        ],
        segments: `OPENER (warm — earn the right) → COACHING (the challenge, framed as observation) → OPEN SPACE (let them respond) → REFLECTION → CLOSER.`,
        duration: '7-12 min',
        minMaturity: 'COACHING',
        incompatibleWith: ['uplift', 'celebrate'],
    },
    connect: {
        name: 'connect',
        intent: 'Be human. Talk about life, not just work.',
        tone: 'Curious, warm, human. This is the "Mira is a friend" call.',
        rules: [
            'Lead with personal, not calendar.',
            'No accountability. Light on work.',
            'This call builds the relationship, not the to-do list.',
            'Water a personal thread if one is ready.',
        ],
        segments: `OPENER (personal lead) → PERSONAL (thread water/maintain) → BRIEFING (light — day shape only) → CLOSER (warm).`,
        duration: '5-8 min',
        minMaturity: null, // available from call 3+, enforced in selection logic
        incompatibleWith: ['nudge'],
    },
    debrief: {
        name: 'debrief',
        intent: 'Extract learning from something that just happened.',
        tone: 'Curious, not judgmental. "Tell me what happened."',
        rules: [
            'Always reference the desired outcome if one was set.',
            'Capture commitments made IN the meeting.',
            'Ask what worked and what didn\'t.',
            'Feed learnings back — no wasted experience.',
        ],
        segments: `OPENER (reference the meeting) → ACCOUNTABILITY (outcome check — LANDED/PARTIAL/MISSED) → COACHING (what worked, what didn't, what's next) → CLOSER.`,
        duration: '3-7 min',
        minMaturity: null,
        incompatibleWith: ['prepare'],
    },
};

// ============================================================================
// ARCHETYPE → POSTURE AFFINITY
// ============================================================================

const ARCHETYPE_FAVORED: Record<string, PostureName[]> = {
    wartime_operator: ['prepare', 'nudge', 'debrief'],
    ambitious_climber: ['prepare', 'advise', 'challenge'],
    political_navigator: ['prepare', 'advise', 'debrief'],
    seasoned_skeptic: ['debrief', 'prepare'],
    reluctant_manager: ['advise', 'prepare'],
    juggler: ['uplift', 'connect', 'prepare'],
    founder: ['listen', 'challenge', 'debrief'],
    only_one: ['uplift', 'connect', 'advise'],
    connector: ['connect', 'advise', 'debrief'],
    returner: ['prepare', 'advise', 'connect'],
    portfolio: ['prepare', 'debrief'],
    community_builder: ['connect', 'celebrate', 'advise'],
};

const ARCHETYPE_AVOID: Record<string, PostureName[]> = {
    wartime_operator: ['connect', 'listen'],
    seasoned_skeptic: ['advise', 'challenge'],
    reluctant_manager: ['challenge'],
    juggler: ['nudge'],
    founder: ['prepare'],
    community_builder: ['nudge'],
};

// ============================================================================
// MATURITY GATE CHECK
// ============================================================================

const MATURITY_ORDER: Record<MaturityLevel, number> = {
    LEARNING: 0,
    OBSERVING: 1,
    COACHING: 2,
};

function passesMaturityGate(posture: PostureDefinition, maturity: MaturityLevel): boolean {
    if (!posture.minMaturity) return true;
    return MATURITY_ORDER[maturity] >= MATURITY_ORDER[posture.minMaturity];
}

// ============================================================================
// COMPATIBILITY CHECK
// ============================================================================

function isCompatible(primary: PostureName, secondary: PostureName): boolean {
    const primaryDef = POSTURES[primary];
    const secondaryDef = POSTURES[secondary];
    return (
        !primaryDef.incompatibleWith.includes(secondary) &&
        !secondaryDef.incompatibleWith.includes(primary)
    );
}

// ============================================================================
// POSTURE SELECTION — Phase 1 Heuristics
// ============================================================================

export function selectPosture(ctx: PostureContext): PostureSelection {
    const candidates = rankCandidates(ctx);

    // Pick primary (first that passes gates)
    let primary: PostureName = 'advise'; // ultimate fallback
    for (const c of candidates) {
        if (passesMaturityGate(POSTURES[c.posture], ctx.maturityLevel)) {
            // Connect requires 3+ calls
            if (c.posture === 'connect' && ctx.callCount < 3) continue;
            primary = c.posture;
            break;
        }
    }

    // Pick secondary (first compatible that passes gates, different from primary)
    let secondary: PostureName | null = null;
    for (const c of candidates) {
        if (c.posture === primary) continue;
        if (!passesMaturityGate(POSTURES[c.posture], ctx.maturityLevel)) continue;
        if (c.posture === 'connect' && ctx.callCount < 3) continue;
        if (!isCompatible(primary, c.posture)) continue;
        secondary = c.posture;
        break;
    }

    const primaryDef = POSTURES[primary];
    const reason = candidates.find(c => c.posture === primary)?.reason || 'default selection';

    return {
        primary,
        secondary,
        reason,
        rules: primaryDef.rules,
        tone: primaryDef.tone,
        segments: primaryDef.segments,
        duration: primaryDef.duration,
    };
}

interface PostureCandidate {
    posture: PostureName;
    score: number;
    reason: string;
}

function rankCandidates(ctx: PostureContext): PostureCandidate[] {
    const candidates: PostureCandidate[] = [];

    // --- Call-type driven (highest priority) ---

    if (ctx.callType === 'pre_meeting_prep') {
        candidates.push({ posture: 'prepare', score: 1.0, reason: 'pre-meeting prep call' });
    }

    if (ctx.callType === 'post_meeting_debrief') {
        candidates.push({ posture: 'debrief', score: 1.0, reason: 'post-meeting debrief call' });
    }

    if (ctx.callType === 'commitment_reminder') {
        candidates.push({ posture: 'nudge', score: 0.9, reason: 'commitment reminder call' });
    }

    if (ctx.callType === 'friday_ritual') {
        candidates.push({ posture: 'celebrate', score: 0.8, reason: 'friday ritual — celebrate the week' });
        candidates.push({ posture: 'connect', score: 0.7, reason: 'friday ritual — connect moment' });
    }

    if (ctx.callType === 'weekly_reflection') {
        candidates.push({ posture: 'debrief', score: 0.8, reason: 'weekly reflection' });
        candidates.push({ posture: 'advise', score: 0.6, reason: 'weekly reflection — share patterns' });
    }

    // --- User-initiated ---

    if (ctx.userInitiatedCallback) {
        candidates.push({ posture: 'listen', score: 0.95, reason: 'user requested callback — listen first' });
    }

    // --- Outcome signals ---

    if (ctx.hasRecentLanded) {
        candidates.push({ posture: 'celebrate', score: 0.85, reason: 'recent outcome LANDED — celebrate the win' });
    }

    if (ctx.hasRecentMissed) {
        candidates.push({ posture: 'uplift', score: 0.8, reason: 'recent outcome MISSED — uplift and support' });
        candidates.push({ posture: 'debrief', score: 0.7, reason: 'recent outcome MISSED — debrief what happened' });
    }

    // --- Meeting-driven ---

    if (ctx.hasRecentMeetingEnd) {
        candidates.push({ posture: 'debrief', score: 0.75, reason: 'meeting just ended — debrief while fresh' });
    }

    if (ctx.hasUpcomingHighStakes) {
        candidates.push({ posture: 'prepare', score: 0.8, reason: 'high-stakes meeting approaching' });
    }

    // --- Coaching signals ---

    if (ctx.overdueCommitmentCount && ctx.overdueCommitmentCount > 0) {
        candidates.push({
            posture: 'nudge',
            score: 0.6 + Math.min(ctx.overdueCommitmentCount * 0.1, 0.2),
            reason: `${ctx.overdueCommitmentCount} overdue commitment(s)`,
        });
    }

    // --- Maturity + relationship depth ---

    if (ctx.maturityLevel === 'COACHING' && ctx.callCount >= 20) {
        candidates.push({ posture: 'challenge', score: 0.5, reason: 'deep coaching phase — high trust established' });
    }

    // --- Relationship signals ---

    if (ctx.depthTrendingUp) {
        candidates.push({ posture: 'listen', score: 0.6, reason: 'depth-of-sharing trending up — hold space' });
    }

    if (ctx.personalThreadReady) {
        candidates.push({ posture: 'connect', score: 0.55, reason: 'personal thread ready to water' });
    }

    // --- Calendar shape ---

    if (ctx.isLightDay) {
        candidates.push({ posture: 'connect', score: 0.45, reason: 'light calendar day — connect moment' });
    }

    // --- Maturity defaults ---

    if (ctx.maturityLevel === 'LEARNING') {
        candidates.push({ posture: 'listen', score: 0.3, reason: 'LEARNING maturity — mirror and learn' });
        candidates.push({ posture: 'prepare', score: 0.25, reason: 'LEARNING maturity — safe value delivery' });
    }

    if (ctx.maturityLevel === 'OBSERVING') {
        candidates.push({ posture: 'advise', score: 0.35, reason: 'OBSERVING maturity — surface hedged observations' });
        candidates.push({ posture: 'prepare', score: 0.3, reason: 'OBSERVING maturity — meeting preparation' });
    }

    if (ctx.maturityLevel === 'COACHING') {
        candidates.push({ posture: 'advise', score: 0.4, reason: 'COACHING maturity — direct insights' });
    }

    // --- Archetype adjustments ---

    if (ctx.archetype) {
        const favored = ARCHETYPE_FAVORED[ctx.archetype];
        const avoid = ARCHETYPE_AVOID[ctx.archetype];

        if (favored) {
            for (const c of candidates) {
                if (favored.includes(c.posture)) {
                    c.score += 0.1; // boost favored
                }
            }
        }
        if (avoid) {
            for (const c of candidates) {
                if (avoid.includes(c.posture)) {
                    c.score -= 0.15; // penalize avoided
                }
            }
        }
    }

    // --- Engagement-trending-down → change approach ---

    if (ctx.engagementTrendingDown) {
        // Boost postures that change the dynamic
        for (const c of candidates) {
            if (['challenge', 'connect', 'listen'].includes(c.posture)) {
                c.score += 0.1;
            }
        }
    }

    // Default fallback
    if (candidates.length === 0) {
        candidates.push({ posture: 'advise', score: 0.2, reason: 'default — no strong signals' });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
}

// ============================================================================
// POSTURE → CONVERSATION PLAN (override for buildConversationPlan)
// ============================================================================

/**
 * Build posture-driven conversation arc.
 * Used when posture is known — replaces the maturity-only plan for calls 4+.
 */
export function buildPostureConversationPlan(
    posture: PostureSelection,
    vars: Record<string, string>,
    callCount: number,
): string {
    const primary = POSTURES[posture.primary];
    const hasOverdue = vars.overdueCommitments && vars.overdueCommitments !== '';

    const parts: string[] = [];

    parts.push(`COACHING POSTURE: ${posture.primary.toUpperCase()}${posture.secondary ? ` + ${posture.secondary.toUpperCase()}` : ''}`);
    parts.push(`Intent: ${primary.intent}`);
    parts.push(`Tone: ${primary.tone}`);
    parts.push(`Target duration: ${primary.duration}`);
    parts.push(`Arc: ${primary.segments}`);
    parts.push('');
    parts.push('POSTURE RULES:');
    for (const rule of primary.rules) {
        parts.push(`- ${rule}`);
    }

    // Secondary posture weave
    if (posture.secondary) {
        const sec = POSTURES[posture.secondary];
        parts.push('');
        parts.push(`SECONDARY POSTURE (${posture.secondary.toUpperCase()}): Weave into later segments.`);
        parts.push(`Secondary intent: ${sec.intent}`);
        if (sec.rules.length > 0) {
            parts.push(`Key rule: ${sec.rules[0]}`);
        }
    }

    // Context-specific additions
    if (hasOverdue && !['celebrate', 'listen', 'connect'].includes(posture.primary)) {
        parts.push('');
        parts.push(`ACCOUNTABILITY: ${vars.overdueCommitments}`);
    }

    parts.push('');
    parts.push(`Reason for this posture: ${posture.reason}`);

    return parts.join('\n');
}

// ============================================================================
// POSTURE-SPECIFIC OPENERS
// ============================================================================

export function buildPostureOpener(
    firstName: string,
    posture: PostureSelection,
    vars: Record<string, string>,
): string | null {
    const meetingCount = parseInt(vars.meetingCount || '0', 10);

    switch (posture.primary) {
        case 'celebrate':
            return `Morning, ${firstName}. I saw what happened — I want to talk about it.`;

        case 'uplift':
            if (meetingCount >= 6) {
                return `Hey ${firstName}. ${meetingCount} meetings today. Before we get into it — how are you actually doing?`;
            }
            return `Morning, ${firstName}. I wanted to check in on you.`;

        case 'prepare':
            if (vars.meetingTitle) {
                return `Hey ${firstName}. Quick prep before your ${vars.meetingTitle}.`;
            }
            return null; // let default opener handle

        case 'debrief':
            if (vars.meetingTitle) {
                return `Hey ${firstName}. How'd ${vars.meetingTitle} go?`;
            }
            return `Hey ${firstName}. I want to debrief on something.`;

        case 'nudge':
            return `Morning, ${firstName}. There's something I want to check in on.`;

        case 'challenge':
            return `Hey ${firstName}. I've noticed something I want to name — if you're up for it.`;

        case 'connect':
            return `Hey ${firstName}. No agenda today — just wanted to check in.`;

        case 'listen':
            return `Hey ${firstName}. I'm here. What's on your mind?`;

        case 'advise':
            return null; // let default opener handle — advise openers depend on content

        default:
            return null;
    }
}

// ============================================================================
// EXPORTS FOR EXTERNAL USE
// ============================================================================

export function getPostureDefinition(name: PostureName): PostureDefinition {
    return POSTURES[name];
}

export function getAllPostureNames(): PostureName[] {
    return Object.keys(POSTURES) as PostureName[];
}

// ============================================================================
// POSTURE RECEPTIVITY LEARNING (Phase 4)
// ============================================================================

/**
 * After call evaluation, aggregate posture match scores over last 20 calls
 * to build a per-user receptivity profile.
 */
export async function updatePostureReceptivity(userId: string): Promise<void> {
    const { prisma } = await import('./prisma');

    // Get last 20 evaluations with posture data
    const evaluations = await prisma.callEvaluation.findMany({
        where: {
            userId,
            selectedPosture: { not: null },
            postureMatch: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
            selectedPosture: true,
            postureMatch: true,
        },
    });

    if (evaluations.length < 3) {
        // Not enough data to learn from
        return;
    }

    // Aggregate scores by posture
    const postureScores: Record<string, { total: number; count: number }> = {};

    for (const eval_ of evaluations) {
        const posture = eval_.selectedPosture!;
        if (!postureScores[posture]) {
            postureScores[posture] = { total: 0, count: 0 };
        }
        postureScores[posture].total += eval_.postureMatch!;
        postureScores[posture].count++;
    }

    // Compute average receptivity per posture (normalize to 0-1)
    const receptivity: Record<string, number> = {};
    for (const [posture, scores] of Object.entries(postureScores)) {
        receptivity[posture] = Math.round((scores.total / scores.count / 10) * 100) / 100;
    }

    // Save to UserPreferences
    await prisma.userPreferences.update({
        where: { userId },
        data: {
            postureReceptivity: receptivity as object,
        },
    });

    console.log(`[PostureReceptivity] Updated for user=${userId.substring(0, 8)}: ${JSON.stringify(receptivity)}`);
}
