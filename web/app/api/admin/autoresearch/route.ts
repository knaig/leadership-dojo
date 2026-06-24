import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/autoresearch
 *
 * Returns all autoresearch areas — both existing and planned.
 * Each area tracks: status, results achieved, admin verification count.
 */

interface AutoresearchArea {
    id: string;
    name: string;
    category: 'coaching' | 'intelligence' | 'engagement' | 'operations' | 'knowledge';
    priority: number; // 1 = highest
    description: string;
    status: 'active' | 'dormant' | 'planned' | 'blocked';
    statusReason: string;
    dataRequired: string;
    dataAvailable: string;
    resultsAchieved: number;
    resultsDetail: string;
    verifiedByAdmin: number;
    lastRunAt: string | null;
    impactSummary: string | null;
}

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Gather live data for each area ──

    // 1. Prompt Insights (existing autoresearch)
    const promptInsights = await prisma.promptInsight.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true, pattern: true, recommendation: true, category: true,
            scope: true, status: true, confidence: true,
            impactDelta: true, preActivateAvgScore: true, postActivateAvgScore: true,
            callsSinceActivation: true, activatedAt: true, updatedAt: true, createdAt: true,
        },
    });

    const insightsByStatus = {
        proposed: promptInsights.filter(i => i.status === 'proposed').length,
        active: promptInsights.filter(i => i.status === 'active').length,
        validated: promptInsights.filter(i => i.status === 'validated').length,
        retired: promptInsights.filter(i => i.status === 'retired').length,
    };

    // 2. Call Evaluations (powers multiple autoresearch areas)
    const [evalCount, evalUsers] = await Promise.all([
        prisma.callEvaluation.count(),
        prisma.callEvaluation.groupBy({ by: ['userId'], _count: { id: true } }),
    ]);

    // 3. Stakeholder Intelligence
    const [stakeholderProfileCount, stakeholderIntelCount, knowledgeFactCount, knowledgeEntityCount] = await Promise.all([
        prisma.stakeholderProfile.count(),
        prisma.stakeholderIntelligence.count(),
        prisma.knowledgeFact.count(),
        prisma.knowledgeEntity.count(),
    ]);

    // 4. Voice calls (for data sufficiency checks)
    const [voiceCallCount, voiceCallsWithTranscript] = await Promise.all([
        prisma.voiceCall.count(),
        prisma.voiceCall.count({ where: { transcript: { not: null } } }),
    ]);

    // 5. Coaching relationship plans
    const [relationshipPlanCount, trajectoryCount] = await Promise.all([
        prisma.coachingRelationshipPlan.count(),
        prisma.coachingTrajectory.count(),
    ]);

    // 6. Personal threads
    const personalThreadCount = await prisma.personalThread.count().catch(() => 0);

    // 7. User corrections (signal for confidence engine)
    const correctionCount = await prisma.userCorrection.count();

    // ── Build the 10 autoresearch areas ──

    const areas: AutoresearchArea[] = [
        {
            id: 'prompt-coaching-strategies',
            name: 'Coaching Strategy Discovery',
            category: 'coaching',
            priority: 1,
            description: 'Analyzes call evaluation KPIs to discover what coaching strategies work. Auto-proposes insights, activates high-confidence ones, measures impact, validates or retires.',
            status: evalCount >= 5 ? 'active' : 'dormant',
            statusReason: evalCount >= 5
                ? `${evalCount} evaluations available. ${insightsByStatus.active} insights testing, ${insightsByStatus.validated} proven.`
                : `Needs 5+ call evaluations to start. Currently: ${evalCount}.`,
            dataRequired: '10+ evaluated calls per user (per-user), 50+ across 3+ users (system)',
            dataAvailable: `${evalCount} evaluations across ${evalUsers.length} users`,
            resultsAchieved: promptInsights.length,
            resultsDetail: `${insightsByStatus.proposed} proposed, ${insightsByStatus.active} testing, ${insightsByStatus.validated} proven, ${insightsByStatus.retired} retired`,
            verifiedByAdmin: 0, // TODO: track admin verification
            lastRunAt: promptInsights.length > 0 ? promptInsights[0].updatedAt.toISOString() : null,
            impactSummary: promptInsights.filter(i => i.impactDelta !== null && i.impactDelta > 0).length > 0
                ? `${promptInsights.filter(i => i.impactDelta !== null && i.impactDelta > 0).length} insights showing positive impact`
                : null,
        },
        {
            id: 'personality-profiling',
            name: 'User Personality Profiling',
            category: 'intelligence',
            priority: 2,
            description: 'Weekly deep analysis of call transcripts to build Big Five personality profile, communication style, emotional triggers, decision-making patterns. Feeds coaching adaptations into pre-call directives.',
            status: relationshipPlanCount > 0 ? 'active' : 'dormant',
            statusReason: relationshipPlanCount > 0
                ? `${relationshipPlanCount} relationship plans active. Weekly analysis via deepAnalyzeRelationship().`
                : 'Needs CoachingRelationshipPlan records (created after call evaluations).',
            dataRequired: '5+ calls per user for moderate confidence, 15+ for high',
            dataAvailable: `${voiceCallsWithTranscript} calls with transcripts, ${relationshipPlanCount} relationship plans`,
            resultsAchieved: relationshipPlanCount,
            resultsDetail: `${relationshipPlanCount} personality profiles built`,
            verifiedByAdmin: 0,
            lastRunAt: null, // Would need to query last cron run
            impactSummary: null,
        },
        {
            id: 'stakeholder-synthesis',
            name: 'Stakeholder Personality Synthesis',
            category: 'intelligence',
            priority: 3,
            description: 'Rolls up knowledge graph facts about people into personality archetypes, communication styles, decision patterns. Multi-signal: emails, meetings, voice mentions, web search.',
            status: stakeholderIntelCount > 0 ? 'active' : 'blocked',
            statusReason: stakeholderIntelCount > 0
                ? `${stakeholderIntelCount} intelligence records synthesized from ${knowledgeFactCount} facts.`
                : `Pipeline runs daily but producing 0 intelligence records. ${stakeholderProfileCount} profiles exist, ${knowledgeFactCount} facts available. Likely insufficient signal or LLM config issue.`,
            dataRequired: 'KnowledgeFacts about PERSON entities with confidence >= 0.3',
            dataAvailable: `${knowledgeFactCount} facts, ${knowledgeEntityCount} entities, ${stakeholderProfileCount} profiles`,
            resultsAchieved: stakeholderIntelCount,
            resultsDetail: stakeholderIntelCount > 0
                ? `${stakeholderIntelCount} stakeholder intelligence records`
                : 'Zero results — silent failure',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: stakeholderIntelCount === 0 ? 'SILENT FAILURE: Agent runs daily but produces nothing' : null,
        },
        {
            id: 'commitment-tracking',
            name: 'Commitment Lifecycle Tracking',
            category: 'coaching',
            priority: 4,
            description: 'Extracts commitments from calls, tracks follow-up, detects dropped commitments. Auto-surfaces overdue commitments in pre-call directives.',
            status: evalCount > 0 ? 'active' : 'planned',
            statusReason: evalCount > 0
                ? 'Commitments extracted via call evaluation agent. Overdue commitments piped into call directives.'
                : 'Requires call evaluation agent to be running.',
            dataRequired: 'CallEvaluation.commitmentsExtracted populated post-call',
            dataAvailable: `${evalCount} evaluations with commitment data`,
            resultsAchieved: 0, // Would need to count commitments in CoachingRelationshipPlan
            resultsDetail: 'Commitments tracked in CoachingRelationshipPlan.commitments JSON',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'theme-detection',
            name: 'Coaching Theme Through-Lines',
            category: 'coaching',
            priority: 5,
            description: 'Identifies recurring coaching themes across calls (delegation struggles, board anxiety, etc.). Tracks theme lifecycle: active → resolved → parked. Feeds topic selection for future calls.',
            status: relationshipPlanCount > 0 ? 'active' : 'planned',
            statusReason: relationshipPlanCount > 0
                ? 'Themes tracked in CoachingRelationshipPlan.coachingThemes. Updated by weekly deep analysis.'
                : 'Requires CoachingRelationshipPlan (Phase A of Coaching Intelligence).',
            dataRequired: '2+ weeks of CallEvaluations per user',
            dataAvailable: `${evalCount} evaluations`,
            resultsAchieved: 0, // Would need to count themes
            resultsDetail: 'Themes stored in CoachingRelationshipPlan.coachingThemes JSON',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'personal-thread-lifecycle',
            name: 'Personal Thread Manager',
            category: 'engagement',
            priority: 6,
            description: 'Extracts personal topics (family, hobbies, aspirations) from conversations. Manages lifecycle: PLANTED → WATERED → GROWING → HARVESTED → MAINTAINED. Selects which thread to nurture per call.',
            status: personalThreadCount > 0 ? 'active' : 'planned',
            statusReason: personalThreadCount > 0
                ? `${personalThreadCount} personal threads tracked.`
                : 'PersonalThread model exists in schema but thread extraction not yet running post-call.',
            dataRequired: 'Post-call LLM extraction of personal topics from transcripts',
            dataAvailable: `${voiceCallsWithTranscript} transcripts available for extraction`,
            resultsAchieved: personalThreadCount,
            resultsDetail: `${personalThreadCount} threads across all lifecycle stages`,
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'confidence-engine',
            name: 'Stakeholder Confidence Scoring',
            category: 'intelligence',
            priority: 7,
            description: 'Per-stakeholder confidence scores (0-1) based on interaction density, recency, source quality, user corrections. Gates people intelligence output: SILENT → PROBE → SUGGEST → ASSERT.',
            status: 'planned',
            statusReason: `Confidence engine designed but not implemented. ${correctionCount} user corrections available as signal. ${stakeholderProfileCount} profiles to score.`,
            dataRequired: 'StakeholderProfile + KnowledgeFacts + UserCorrections + interaction history',
            dataAvailable: `${stakeholderProfileCount} profiles, ${knowledgeFactCount} facts, ${correctionCount} corrections`,
            resultsAchieved: 0,
            resultsDetail: 'Not yet implemented — designed in conversation-engine-design.md',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'maturity-transitions',
            name: 'Data-Driven Maturity Transitions',
            category: 'engagement',
            priority: 8,
            description: 'Upgrades confidence mode (LEARNING → OBSERVING → COACHING) based on data signals rather than call count. Regression when user goes silent or correction rate spikes.',
            status: 'planned',
            statusReason: 'Currently uses simple call count. Data-driven transitions require confidence engine + evaluation data.',
            dataRequired: 'CallEvaluations + stakeholder confidence scores + call count + correction rate',
            dataAvailable: `${evalCount} evaluations, ${correctionCount} corrections`,
            resultsAchieved: 0,
            resultsDetail: 'Phase detection logic exists in coaching-relationship-agent but uses call count, not data signals',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'email-relationship-profiling',
            name: 'Email-Based Relationship Profiling',
            category: 'intelligence',
            priority: 9,
            description: 'Psychological profiling from email patterns: tone shifts, response times, formality gradients, power dynamics. Richest signal for stakeholder relationships.',
            status: 'planned',
            statusReason: 'Email sync exists (email-sync.ts) but only stores metadata. Content analysis for relationship profiling not yet built.',
            dataRequired: 'Email threads with content + sender/recipient mapping',
            dataAvailable: 'Email sync agent operational, storing thread metadata',
            resultsAchieved: 0,
            resultsDetail: 'Email sync stores threads but no psychological analysis runs on content',
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
        {
            id: 'trajectory-kpi-trends',
            name: 'Coaching Trajectory & KPI Trends',
            category: 'operations',
            priority: 10,
            description: 'Weekly snapshots of coaching KPIs per user: call quality trend, relationship depth velocity, knowledge graph growth, commitment completion rate, call retention. Powers admin dashboard trends.',
            status: trajectoryCount > 0 ? 'active' : 'planned',
            statusReason: trajectoryCount > 0
                ? `${trajectoryCount} weekly snapshots recorded.`
                : 'CoachingTrajectory model exists. Weekly cron scheduled (Sundays 11:00 UTC) but needs CallEvaluation data.',
            dataRequired: 'Weekly aggregate of CallEvaluations + KnowledgeFacts + commitment tracking',
            dataAvailable: `${evalCount} evaluations, ${knowledgeFactCount} facts`,
            resultsAchieved: trajectoryCount,
            resultsDetail: `${trajectoryCount} weekly trajectory snapshots`,
            verifiedByAdmin: 0,
            lastRunAt: null,
            impactSummary: null,
        },
    ];

    // Also return the raw prompt insights for the detail view
    const insightDetails = promptInsights.map(i => ({
        id: i.id,
        pattern: i.pattern,
        recommendation: i.recommendation,
        category: i.category,
        scope: i.scope,
        status: i.status,
        confidence: i.confidence,
        impactDelta: i.impactDelta,
        preScore: i.preActivateAvgScore,
        postScore: i.postActivateAvgScore,
        callsSinceActivation: i.callsSinceActivation,
        activatedAt: i.activatedAt?.toISOString() ?? null,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
    }));

    return NextResponse.json({
        areas,
        insights: insightDetails,
        summary: {
            total: areas.length,
            active: areas.filter(a => a.status === 'active').length,
            dormant: areas.filter(a => a.status === 'dormant').length,
            planned: areas.filter(a => a.status === 'planned').length,
            blocked: areas.filter(a => a.status === 'blocked').length,
            totalResults: areas.reduce((s, a) => s + a.resultsAchieved, 0),
            totalVerified: areas.reduce((s, a) => s + a.verifiedByAdmin, 0),
        },
    });
}
