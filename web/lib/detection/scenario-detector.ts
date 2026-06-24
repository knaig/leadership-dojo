/**
 * Smart Scenario Detection Engine
 * 
 * Uses AI to detect leadership scenarios from synced data (emails, meetings, stakeholders).
 * Designed to surface "oh shit, that's exactly what I'm dealing with" moments.
 * 
 * Key design principles:
 * 1. AI abstracts scenarios naturally (not rigid pattern matching)
 * 2. Conversational framing (questions, not declarations) for error tolerance
 * 3. Evidence-based observations from actual data signals
 */

import { prisma } from '@/lib/prisma';
import { createProvider } from '@/lib/llm/factory';

// Scenario library - used as reference, not rigid matching
const SCENARIO_LIBRARY = [
    // Director/VP Level
    { id: 'peer_undermining', label: 'Peer positioning around you', signals: ['cc_escalation', 'declined_meetings', 'silence'] },
    { id: 'promo_conversation', label: 'Top performer wants growth discussion', signals: ['growth_keywords', 'frequent_1on1', 'tenure'] },
    { id: 'disagree_with_boss', label: 'Being asked to weigh in when you disagree with your manager', signals: ['exec_meeting', 'manager_conflict'] },
    { id: 'talent_flight', label: 'Key person may be disengaging', signals: ['engagement_drop', 'short_responses', 'declined_1on1'] },
    { id: 'board_prep', label: 'High-stakes presentation coming', signals: ['board_meeting', 'exec_attendees', 'metrics_discussion'] },
    { id: 'cross_func_blocker', label: 'Cross-functional friction', signals: ['escalation_pattern', 'stalled_threads', 'repeated_topic'] },
    { id: 'new_team_trust', label: 'Building trust with inherited team', signals: ['new_stakeholders', 'low_engagement', 'reorg_context'] },
    { id: 'credit_theft', label: 'Work attribution concerns', signals: ['forwarded_without_cc', 'presentation_overlap'] },
    { id: 'team_conflict', label: 'Tension between reports', signals: ['separate_threads', 'no_mutual_cc', 'conflict_sentiment'] },
    { id: 'layoff_decisions', label: 'Headcount reduction planning', signals: ['hr_threads', 'confidential', 'headcount_keywords'] },

    // Manager Level
    { id: 'new_lead_struggling', label: 'Recently promoted IC needs support', signals: ['new_1on1_pattern', 'escalations_from_team'] },
    { id: 'remote_disconnect', label: 'Remote team member drifting', signals: ['timezone_gaps', 'low_attendance', 'short_responses'] },
    { id: 'skip_level_complaint', label: 'Issues surfacing from skip-levels', signals: ['hr_threads', 'skip_meetings'] },
    { id: 'former_peer_mgmt', label: 'Managing someone who was your peer', signals: ['role_change', 'relationship_shift'] },
    { id: 'burnout_signals', label: 'High performer showing strain', signals: ['late_night_work', 'weekend_emails', 'declining_participation'] },
    { id: 'pip_needed', label: 'Performance conversation needed', signals: ['performance_threads', 'hr_involvement', 'correction_pattern'] },

    // Transition scenarios
    { id: 'first_90_days', label: 'New role onboarding', signals: ['new_calendar_pattern', 'intro_meetings'] },
    { id: 'reorg_impact', label: 'Org change affecting your team', signals: ['org_discussions', 'new_reporting'] },
    { id: 'project_cancelled', label: 'Initiative getting deprioritized', signals: ['priority_shift', 'budget_threads'] },

    // Difficult conversations
    { id: 'bad_news_delivery', label: 'Need to communicate negative news', signals: ['upcoming_allhands', 'negative_decisions'] },
    { id: 'budget_ask', label: 'Resource request during constraints', signals: ['budget_discussions', 'cost_cutting'] },
    { id: 'pushback_to_exec', label: 'Need to give candid feedback upward', signals: ['exec_threads', 'disagreement_signals'] },
];

interface DetectedScenario {
    scenarioId: string;
    headline: string;           // Conversational, question-based
    evidence: string[];         // Specific data points
    stakeholders: string[];     // People involved
    confidence: number;         // 0-1
    suggestedAction: string;    // What they might want to do
    conversationalPrompt: string; // Question to ask user
}

interface DataContext {
    user: {
        id: string;
        name: string | null;
        jobTitle: string | null;
        role: string;
    };
    recentMeetings: Array<{
        title: string;
        startTime: Date;
        meetingType: string | null;
        participants: string[];
        attendees: any;
    }>;
    recentEmails: Array<{
        subject: string | null;
        summary: string;
        sentiment: string;
        keyTopics: string[];
        participants: string[];
        from: string | null;
        lastMessageAt: Date;
        requiresAction: boolean;
    }>;
    stakeholders: Array<{
        name: string | null;
        email: string;
        interactionCount: number;
        topics: string[];
        lastInteraction: Date | null;
    }>;
}

/**
 * Gather context data for scenario detection
 */
async function gatherContext(userId: string): Promise<DataContext | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, jobTitle: true, role: true }
    });

    if (!user) return null;

    // Get recent meetings (past 14 days + next 7 days)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const recentMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: fourteenDaysAgo, lte: sevenDaysAhead }
        },
        orderBy: { startTime: 'desc' },
        take: 50
    });

    // Get recent email summaries
    const recentEmails = await prisma.emailSummary.findMany({
        where: {
            userId,
            lastMessageAt: { gte: fourteenDaysAgo }
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50
    });

    // Get stakeholder profiles
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        orderBy: { interactionCount: 'desc' },
        take: 30
    });

    return {
        user: {
            id: user.id,
            name: user.name,
            jobTitle: user.jobTitle,
            role: user.role
        },
        recentMeetings: recentMeetings.map(m => ({
            title: m.title,
            startTime: m.startTime,
            meetingType: m.meetingType,
            participants: m.participants || [],
            attendees: m.attendees
        })),
        recentEmails: recentEmails.map(e => ({
            subject: e.subject,
            summary: e.summary,
            sentiment: e.sentiment,
            keyTopics: e.keyTopics || [],
            participants: e.participants || [],
            from: e.from,
            lastMessageAt: e.lastMessageAt,
            requiresAction: e.requiresAction
        })),
        stakeholders: stakeholders.map(s => ({
            name: s.name,
            email: s.email,
            interactionCount: s.interactionCount,
            topics: Array.isArray(s.topics) ? s.topics : [],
            lastInteraction: s.lastInteraction
        })) as any
    };
}

/**
 * Build behavioral markers from data
 */
function buildBehavioralMarkers(context: DataContext) {
    const now = new Date();

    // 1:1 meetings in next 7 days
    const upcoming1on1s = context.recentMeetings.filter(m =>
        m.meetingType === '1:1' && m.startTime > now
    );

    // High-stakes meetings (board, exec, external)
    const highStakesMeetings = context.recentMeetings.filter(m => {
        const title = m.title.toLowerCase();
        return title.includes('board') ||
            title.includes('exec') ||
            title.includes('client') ||
            title.includes('external') ||
            m.meetingType === 'external';
    });

    // Emails requiring action
    const actionRequired = context.recentEmails.filter(e => e.requiresAction);

    // Negative sentiment threads
    const tensionThreads = context.recentEmails.filter(e =>
        e.sentiment === 'negative' || e.sentiment === 'action_required'
    );

    // Topic clusters (topics appearing in multiple threads)
    const topicCounts: Record<string, number> = {};
    context.recentEmails.forEach(e => {
        e.keyTopics.forEach(topic => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
    });
    const hotTopics = Object.entries(topicCounts)
        .filter(([_, count]) => count >= 3)
        .map(([topic]) => topic);

    // High-engagement stakeholders
    const frequentContacts = context.stakeholders
        .filter(s => s.interactionCount >= 5)
        .map(s => s.name || s.email);

    // Keywords suggesting growth/promo discussions
    const growthDiscussions = context.recentEmails.filter(e => {
        const content = `${e.subject || ''} ${e.summary}`.toLowerCase();
        return content.includes('growth') ||
            content.includes('promotion') ||
            content.includes('career') ||
            content.includes('next step') ||
            content.includes('opportunity');
    });

    return {
        upcoming1on1s,
        highStakesMeetings,
        actionRequired,
        tensionThreads,
        hotTopics,
        frequentContacts,
        growthDiscussions,
        totalMeetings: context.recentMeetings.length,
        totalEmails: context.recentEmails.length,
        totalStakeholders: context.stakeholders.length
    };
}

/**
 * Main detection function - uses AI to interpret patterns naturally
 */
export async function detectScenarios(userId: string): Promise<DetectedScenario[]> {
    const context = await gatherContext(userId);

    if (!context) {
        console.log('[ScenarioDetector] User not found:', userId);
        return [];
    }

    if (context.recentMeetings.length === 0 && context.recentEmails.length === 0) {
        console.log('[ScenarioDetector] No data to analyze for user:', userId);
        return [];
    }

    const markers = buildBehavioralMarkers(context);

    // Build LLM prompt
    const prompt = `You are a leadership coach analyzing a leader's work context to surface relevant challenges they might be facing.

USER PROFILE:
- Role: ${context.user.jobTitle || context.user.role || 'Leader'}
- Name: ${context.user.name || 'Unknown'}

DATA SUMMARY:
- ${markers.totalMeetings} meetings in past 14 days
- ${markers.totalEmails} email threads
- ${markers.totalStakeholders} known stakeholders
- ${markers.upcoming1on1s.length} upcoming 1:1s
- ${markers.highStakesMeetings.length} high-stakes meetings upcoming
- ${markers.tensionThreads.length} threads with tension/negative sentiment
- ${markers.growthDiscussions.length} threads about career growth
- Hot topics: ${markers.hotTopics.join(', ') || 'None detected'}
- Frequent contacts: ${markers.frequentContacts.slice(0, 5).join(', ') || 'None'}

UPCOMING 1:1s:
${markers.upcoming1on1s.slice(0, 5).map(m =>
        `- ${m.title} on ${m.startTime.toISOString().split('T')[0]}`
    ).join('\n') || 'None'}

HIGH-STAKES MEETINGS:
${markers.highStakesMeetings.slice(0, 5).map(m =>
        `- ${m.title} on ${m.startTime.toISOString().split('T')[0]}`
    ).join('\n') || 'None'}

THREADS WITH TENSION:
${markers.tensionThreads.slice(0, 5).map(e =>
        `- "${e.subject}" (${e.sentiment}) - ${e.summary.substring(0, 100)}...`
    ).join('\n') || 'None detected'}

GROWTH/CAREER DISCUSSIONS:
${markers.growthDiscussions.slice(0, 5).map(e =>
        `- "${e.subject}" with ${e.from || 'unknown'}`
    ).join('\n') || 'None detected'}

SCENARIO LIBRARY (for reference, abstract naturally):
${SCENARIO_LIBRARY.map(s => `- ${s.id}: ${s.label}`).join('\n')}

INSTRUCTIONS:
1. Analyze the data patterns to identify 1-3 specific leadership challenges this person might be facing RIGHT NOW
2. Frame each as a conversational observation (question-based, not declarative)
3. Be specific to their actual data - mention real meeting titles, stakeholder names, topics
4. If there's not enough signal for a scenario, don't force it
5. Use "I noticed..." framing to create error tolerance

OUTPUT (JSON array):
[
  {
    "scenarioId": "string from library or 'custom'",
    "headline": "Brief conversational headline (max 10 words)",
    "conversationalPrompt": "Question to ask user, e.g. 'I noticed X. Is this related to Y?'",
    "evidence": ["specific data point 1", "specific data point 2"],
    "stakeholders": ["name1", "name2"],
    "confidence": 0.0-1.0,
    "suggestedAction": "What they might want to do"
  }
]

Return empty array [] if no scenarios detected with confidence > 0.5.`;

    try {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) {
            console.warn('[ScenarioDetector] No API key configured');
            return [];
        }

        const llm = createProvider({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            apiKey
        });

        const result = await llm.analyze(prompt, {
            model: 'gemini-2.0-flash',
            temperature: 0.3,
            maxTokens: 2000
        });

        const scenarios = result.raw || [];

        if (!Array.isArray(scenarios)) {
            console.warn('[ScenarioDetector] Unexpected response format');
            return [];
        }

        // Filter to high-confidence scenarios only
        return scenarios
            .filter((s: any) => s.confidence >= 0.5)
            .slice(0, 3) // Max 3 scenarios at a time
            .map((s: any) => ({
                scenarioId: s.scenarioId || 'custom',
                headline: s.headline || 'Something to consider',
                evidence: s.evidence || [],
                stakeholders: s.stakeholders || [],
                confidence: s.confidence || 0.5,
                suggestedAction: s.suggestedAction || 'Review the situation',
                conversationalPrompt: s.conversationalPrompt || s.headline
            }));

    } catch (error) {
        console.error('[ScenarioDetector] Detection failed:', error);
        return [];
    }
}

/**
 * Store detected scenarios and track user responses
 */
export async function persistScenarios(
    userId: string,
    scenarios: DetectedScenario[]
): Promise<void> {
    for (const scenario of scenarios) {
        await prisma.caseSurfacing.create({
            data: {
                userId,
                caseId: scenario.scenarioId, // We'll use scenarioId as caseId for now
                trigger: 'AMBIENT',
                triggerContext: {
                    headline: scenario.headline,
                    evidence: scenario.evidence,
                    stakeholders: scenario.stakeholders,
                    conversationalPrompt: scenario.conversationalPrompt,
                    suggestedAction: scenario.suggestedAction
                },
                relevanceScore: scenario.confidence
            }
        }).catch(e => {
            // May fail if caseId doesn't exist - that's OK for custom scenarios
            console.log('[ScenarioDetector] Could not persist scenario:', e.message);
        });
    }
}

/**
 * Main entry point - detect and optionally persist
 */
export async function runScenarioDetection(
    userId: string,
    persist: boolean = false
): Promise<DetectedScenario[]> {
    console.log('[ScenarioDetector] Running for user:', userId);

    const scenarios = await detectScenarios(userId);

    console.log('[ScenarioDetector] Detected', scenarios.length, 'scenarios');

    if (persist && scenarios.length > 0) {
        await persistScenarios(userId, scenarios);
    }

    return scenarios;
}
