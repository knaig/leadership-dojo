import { prisma } from '@/lib/prisma';
import { createProvider } from '@/lib/llm/factory';
import { getUserLLMConfig } from '@/lib/llm/user-config';

interface PrepInput {
    userId: string;
    conversationId: string;
    title: string;
    type: string;
    objective: string;
    stakeholderNames?: string[];
    context?: string;
}

interface PrepOutput {
    primaryObjective: string;
    secondaryObjectives: string[];
    worstAcceptableOutcome: string;
    openingHook: string;
    keyMessages: KeyMessage[];
    anticipatedObjections: Objection[];
    closingAction: string;
    quickReference: QuickReference;
}

interface KeyMessage {
    message: string;
    shortForm: string;
    supportingData?: string;
    transition?: string;
}

interface Objection {
    objection: string;
    shortForm: string;
    response: string;
    quickResponse: string;
    reframe?: string;
    likelihood: 'VERY_LIKELY' | 'POSSIBLE' | 'UNLIKELY';
}

interface QuickReference {
    objective: string;
    pivots: Record<string, string>;
    closeChecklist: string[];
    avoid: string[];
    use: string[];
}

/**
 * Gather rich context for meeting prep from multiple sources:
 * - User profile & intelligence synthesis
 * - Stakeholder profiles for all attendees
 * - Knowledge graph facts about attendees and related topics
 * - Past meetings with same attendees (patterns)
 * - Active goals relevant to meeting
 */
async function gatherPrepContext(userId: string, title: string, stakeholderNames: string[]) {
    const sections: string[] = [];

    // 1. User intelligence profile (strengths, growth areas, patterns)
    const intel = await prisma.userIntelligence.findUnique({ where: { userId } });
    if (intel?.profile) {
        const profile = intel.profile as any;
        const parts: string[] = [];
        if (profile.role) parts.push(`Role: ${profile.role}`);
        if (profile.responsibilities) parts.push(`Responsibilities: ${profile.responsibilities}`);
        if (profile.strengths?.length) {
            parts.push(`Strengths: ${profile.strengths.map((s: any) => s.area).join(', ')}`);
        }
        if (profile.growthAreas?.length) {
            parts.push(`Growth areas: ${profile.growthAreas.map((g: any) => g.area).join(', ')}`);
        }
        if (profile.communicationStyle) parts.push(`Communication style: ${profile.communicationStyle}`);
        if (parts.length) {
            sections.push(`YOUR PROFILE (from coaching analysis):\n${parts.join('\n')}`);
        }
    }

    // 2. Stakeholder profiles for ALL attendees
    if (stakeholderNames.length > 0) {
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: {
                userId,
                name: { in: stakeholderNames, mode: 'insensitive' },
            },
            include: { intelligence: true },
        });

        if (stakeholders.length > 0) {
            const attendeeProfiles = stakeholders.map(s => {
                const intel = s.intelligence;
                const lines = [`  ${s.name} — ${s.role || 'Role unknown'}`];
                if (s.personaArchetype) lines.push(`    Persona: ${s.personaArchetype}`);
                if (s.primaryMotivation) lines.push(`    Motivated by: ${s.primaryMotivation}`);
                if (s.communicationStyle) lines.push(`    Communication style: ${s.communicationStyle}`);
                if (s.politicalStance && s.politicalStance !== 'UNKNOWN') lines.push(`    Stance: ${s.politicalStance}`);
                if (s.decisionStyle) lines.push(`    Decision style: ${s.decisionStyle}`);
                if (Array.isArray(s.fears) && s.fears.length) lines.push(`    Concerns: ${s.fears.join(', ')}`);
                if (s.relationshipStrength) lines.push(`    Relationship strength: ${s.relationshipStrength}`);
                // Stakeholder intelligence (behavioral patterns from past interactions)
                if (intel?.profileSummary) lines.push(`    Profile: ${intel.profileSummary}`);
                if (intel?.successPatterns?.length) lines.push(`    What works: ${intel.successPatterns.join('; ')}`);
                if (intel?.objectionPatterns?.length) lines.push(`    Common objections: ${intel.objectionPatterns.join('; ')}`);
                if (intel?.failurePatterns?.length) lines.push(`    Avoid: ${intel.failurePatterns.join('; ')}`);
                if (intel?.decisionMakingNotes) lines.push(`    How they decide: ${intel.decisionMakingNotes}`);
                if (intel?.currentMood) lines.push(`    Current mood: ${intel.currentMood}`);
                if (intel?.recentTopics?.length) lines.push(`    Recent focus: ${intel.recentTopics.join(', ')}`);
                return lines.join('\n');
            }).join('\n\n');
            sections.push(`ATTENDEES YOU KNOW:\n${attendeeProfiles}`);
        }
    }

    // 3. Knowledge graph facts about attendees and meeting topic
    try {
        // Find entities matching attendee names or meeting title keywords
        const searchTerms = [
            ...stakeholderNames,
            ...title.split(/[\s\-\/]+/).filter(w => w.length > 3),
        ];

        if (searchTerms.length > 0) {
            const entities = await prisma.knowledgeEntity.findMany({
                where: {
                    userId,
                    OR: searchTerms.map(term => ({
                        nameNormalized: { contains: term.toLowerCase() },
                    })),
                },
                take: 10,
            });

            if (entities.length > 0) {
                const entityIds = entities.map(e => e.id);
                const facts = await prisma.knowledgeFact.findMany({
                    where: {
                        userId,
                        validTo: null,
                        confidence: { gte: 0.4 },
                        OR: [
                            { subjectId: { in: entityIds } },
                            { objectEntityId: { in: entityIds } },
                        ],
                    },
                    include: {
                        subject: true,
                        objectEntity: true,
                    },
                    orderBy: { confidence: 'desc' },
                    take: 15,
                });

                if (facts.length > 0) {
                    const factLines = facts.map(f => {
                        const obj = f.objectEntity?.name || f.objectValue || '';
                        return `  - ${f.subject.name} ${f.predicate.replace(/_/g, ' ')} ${obj}`;
                    });
                    sections.push(`WHAT YOU KNOW (from your work data):\n${factLines.join('\n')}`);
                }
            }
        }
    } catch (e) {
        console.error('[Prep] Knowledge graph query failed:', e);
    }

    // 4. Past meetings with same people (patterns, recurring topics)
    if (stakeholderNames.length > 0) {
        try {
            const pastMeetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    startTime: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
                        lt: new Date(),
                    },
                    OR: stakeholderNames.map(name => ({
                        participants: { has: name },
                    })),
                },
                orderBy: { startTime: 'desc' },
                take: 5,
                select: { title: true, startTime: true, description: true },
            });

            if (pastMeetings.length > 0) {
                const meetingLines = pastMeetings.map(m => {
                    const date = m.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return `  - ${date}: ${m.title}${m.description ? ` — ${m.description.slice(0, 100)}` : ''}`;
                });
                sections.push(`RECENT MEETINGS WITH THESE PEOPLE:\n${meetingLines.join('\n')}`);
            }
        } catch (e) {
            // participants field may not support `has` — try string search fallback
            try {
                const pastMeetings = await prisma.meetingSyncRecord.findMany({
                    where: {
                        userId,
                        startTime: {
                            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                            lt: new Date(),
                        },
                    },
                    orderBy: { startTime: 'desc' },
                    take: 20,
                    select: { title: true, startTime: true, description: true, participants: true },
                });

                const relevant = pastMeetings.filter(m => {
                    const pStr = JSON.stringify(m.participants).toLowerCase();
                    return stakeholderNames.some(n => pStr.includes(n.toLowerCase()));
                }).slice(0, 5);

                if (relevant.length > 0) {
                    const meetingLines = relevant.map(m => {
                        const date = m.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        return `  - ${date}: ${m.title}`;
                    });
                    sections.push(`RECENT MEETINGS WITH THESE PEOPLE:\n${meetingLines.join('\n')}`);
                }
            } catch {
                // skip
            }
        }
    }

    // 5. Active goals that might be relevant
    try {
        const goals = await prisma.goal.findMany({
            where: {
                userId,
                status: { in: ['ACTIVE', 'AT_RISK'] },
            },
            take: 5,
            select: { title: true, status: true, magnitude: true },
        });

        if (goals.length > 0) {
            const goalLines = goals.map(g =>
                `  - ${g.title} (${g.status}${g.magnitude ? `, ${g.magnitude}` : ''})`
            );
            sections.push(`YOUR ACTIVE GOALS:\n${goalLines.join('\n')}`);
        }
    } catch {
        // skip
    }

    return sections.join('\n\n');
}

export async function generateConversationPrep(input: PrepInput): Promise<PrepOutput> {
    const { userId, title, type, objective, stakeholderNames = [], context } = input;

    // Get user context
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    // Gather rich context from knowledge graph, meetings, goals
    const richContext = await gatherPrepContext(userId, title, stakeholderNames);

    const prompt = `You are Mira, an executive coach preparing a leader for an upcoming meeting.
Generate a practical, specific meeting prep based on the context below.

MEETING:
- Title: ${title}
- Type: ${type}
- Stated objective: ${objective}

ABOUT THE USER:
- Name: ${user?.name || 'Unknown'}
- Role: ${user?.jobTitle || 'Leader'}
- Company: ${user?.company || 'Unknown'}

${richContext ? `CONTEXT FROM THEIR WORK:\n${richContext}` : ''}

${context ? `ADDITIONAL NOTES:\n${context}` : ''}

Based on ALL the context above, generate a meeting prep. Be SPECIFIC — reference actual people, projects, and patterns from the context. Do NOT be generic.

If this is a standup or recurring sync, focus on:
- What specific topics/blockers to raise based on active goals
- Which attendees to check in with and why
- What to listen for based on known dynamics

Return valid JSON with this exact structure:
{
  "primaryObjective": "The ONE thing to achieve (10 words max, specific to THIS meeting)",
  "secondaryObjectives": ["2-3 specific nice-to-haves based on context"],
  "worstAcceptableOutcome": "Walk-away point for this specific meeting",
  "openingHook": "2 sentences to start — reference something specific",
  "keyMessages": [
    {
      "message": "Full point (2-3 sentences, specific to context)",
      "shortForm": "5-word version",
      "supportingData": "Specific proof point from context",
      "transition": "How to get here in conversation"
    }
  ],
  "anticipatedObjections": [
    {
      "objection": "What they might say (based on known personas/dynamics)",
      "shortForm": "3-word trigger",
      "response": "Full response (2-3 sentences)",
      "quickResponse": "10-word in-flight response",
      "reframe": "How to shift the frame",
      "likelihood": "VERY_LIKELY | POSSIBLE | UNLIKELY"
    }
  ],
  "closingAction": "How to end with a specific commitment",
  "quickReference": {
    "objective": "10-word objective",
    "pivots": {"trigger phrase": "response | proof"},
    "closeChecklist": ["Max 5 items to confirm before leaving"],
    "avoid": ["Phrases to avoid in this specific meeting"],
    "use": ["Power phrases to use"]
  }
}

Return ONLY the JSON, no markdown fences.`;

    try {
        const config = await getUserLLMConfig(userId);
        console.log('[Prep] LLM config:', { provider: config.provider, model: config.model });

        if (config.provider === 'none') {
            throw new Error('No LLM configured. Please add an API key in Settings.');
        }

        const provider = createProvider(config);
        const response = await provider.generateText(prompt);

        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[Prep] No JSON in LLM response:', response.slice(0, 500));
            throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return parsed as PrepOutput;
    } catch (error: any) {
        console.error('[Prep] Generation failed:', error?.message || error);

        // Re-throw so the caller can show a real error instead of fake content
        throw new Error(
            `Deep prep generation failed: ${error?.message || 'Unknown error'}. ` +
            `Check your LLM API key in Settings.`
        );
    }
}
