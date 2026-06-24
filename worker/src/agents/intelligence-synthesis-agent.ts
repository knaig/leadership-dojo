/**
 * Intelligence Synthesis Agent
 *
 * Phase 4: Now reads from the Knowledge Graph (KnowledgeEntity, KnowledgeFact,
 * KnowledgeCommunity) to build the user profile. Falls back to raw data if
 * graph has < 10 facts. Stores factBasis for traceability.
 *
 * This is the engine that makes pre-meeting coaching personal.
 * Runs daily after sync crons complete.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';

export interface UserIntelligenceProfile {
    role: string;
    responsibilities: string[];
    aspirations: string[];
    strengths: Array<{ area: string; evidence: string[]; confidence: number }>;
    growthAreas: Array<{ area: string; evidence: string[]; confidence: number }>;
    communicationStyle: string;
    decisionPattern: string;
    projectSnapshot: Record<string, {
        health: 'active' | 'stalling' | 'completed' | 'at_risk';
        userRole: string;
        keyPeople: string[];
        recentActivity: string;
    }>;
}

/**
 * Synthesize user intelligence profile from knowledge graph + goals.
 * Called daily by cron, or on-demand after significant new data.
 */
export async function synthesizeUserIntelligence(userId: string): Promise<void> {
    console.log(`[IntelSynthesis] Starting for user ${userId.substring(0, 8)}...`);

    // Daily dedup — only synthesize once per day
    const existing = await prisma.userIntelligence.findUnique({
        where: { userId }
    });

    if (existing?.synthesizedAt) {
        const hoursSinceLast = (Date.now() - existing.synthesizedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < 20) {
            console.log(`[IntelSynthesis] Skipping — last synthesized ${Math.round(hoursSinceLast)}h ago`);
            return;
        }
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, jobTitle: true, company: true, industry: true }
    });

    if (!user) {
        console.log(`[IntelSynthesis] User not found`);
        return;
    }

    // Check if graph has enough data to be the primary source
    const graphFactCount = await prisma.knowledgeFact.count({
        where: { userId, validTo: null }
    });

    const useGraph = graphFactCount >= 10;
    console.log(`[IntelSynthesis] Graph has ${graphFactCount} active facts — ${useGraph ? 'using graph' : 'falling back to raw data'}`);

    let prompt: string;
    let factBasis: string[] = [];
    let dataPointCount: number;

    if (useGraph) {
        const graphData = await gatherGraphData(userId);
        factBasis = graphData.factIds;
        dataPointCount = graphData.factIds.length + graphData.communityCount;
        prompt = buildGraphPrompt(user, graphData, existing?.profile as unknown as UserIntelligenceProfile | null);
    } else {
        const rawData = await gatherRawData(userId);
        dataPointCount = rawData.totalDataPoints;
        prompt = buildRawDataPrompt(user, rawData, existing?.profile as unknown as UserIntelligenceProfile | null);
    }

    try {
        const llmConfig = await getUserLLMConfig(userId);
        if (llmConfig.provider === 'none') {
            console.log(`[IntelSynthesis] No LLM configured — skipping`);
            return;
        }

        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.3, maxOutputTokens: 2000 }),
            { label: 'IntelSynthesis' }
        );

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error(`[IntelSynthesis] Failed to parse JSON from LLM response`);
            return;
        }

        const profile = JSON.parse(jsonMatch[0]) as UserIntelligenceProfile;
        const overallConfidence = Math.min(1, dataPointCount / 100);

        await prisma.userIntelligence.upsert({
            where: { userId },
            create: {
                userId,
                profile: profile as any,
                overallConfidence,
                dataPointCount,
                version: 1,
                synthesizedAt: new Date(),
                factBasis,
                graphVersion: useGraph ? 1 : 0,
            },
            update: {
                profile: profile as any,
                overallConfidence,
                dataPointCount,
                version: existing ? existing.version + 1 : 1,
                synthesizedAt: new Date(),
                factBasis,
                graphVersion: useGraph ? (existing?.graphVersion ?? 0) + 1 : existing?.graphVersion ?? 0,
            }
        });

        console.log(`[IntelSynthesis] Profile synthesized — v${existing ? existing.version + 1 : 1}, confidence ${overallConfidence.toFixed(2)}, ${dataPointCount} data points, source=${useGraph ? 'graph' : 'raw'}`);

    } catch (error: any) {
        console.error(`[IntelSynthesis] LLM error:`, error.message);
    }
}

// ============================================================================
// GRAPH-BASED SYNTHESIS (Phase 4 — primary path)
// ============================================================================

interface GraphData {
    selfFacts: Array<{ predicate: string; objectName?: string; objectValue?: string; confidence: number; source: string }>;
    peopleFacts: Array<{ personName: string; facts: Array<{ predicate: string; objectName?: string; objectValue?: string; confidence: number }> }>;
    projectEntities: Array<{ name: string; factCount: number; relatedPeople: string[] }>;
    communities: Array<{ name: string; summary?: string; entityCount: number; activityScore: number }>;
    userStatedFacts: Array<{ predicate: string; objectName?: string; objectValue?: string }>;
    goals: Array<{ description: string; stakeholderCount: number; actionCount: number; completedCount: number; overdueCount: number }>;
    factIds: string[];
    communityCount: number;
}

async function gatherGraphData(userId: string): Promise<GraphData> {
    // Get the user's "Self" entity
    const selfEntity = await prisma.knowledgeEntity.findUnique({
        where: { userId_type_nameNormalized: { userId, type: 'PERSON', nameNormalized: 'self' } }
    });

    // Get all current facts — these are the foundation
    const allFacts = await prisma.knowledgeFact.findMany({
        where: { userId, validTo: null, confidence: { gte: 0.3 } },
        include: {
            subject: { select: { name: true, type: true } },
            objectEntity: { select: { name: true, type: true } },
        },
        orderBy: { confidence: 'desc' },
        take: 200,
    });

    // Self facts
    const selfFacts = selfEntity
        ? allFacts.filter(f => f.subjectId === selfEntity.id).map(f => ({
            predicate: f.predicate,
            objectName: f.objectEntity?.name,
            objectValue: f.objectValue || undefined,
            confidence: f.confidence,
            source: f.source,
        }))
        : [];

    // User-stated facts (highest provenance)
    const userStatedFacts = allFacts
        .filter(f => f.source === 'USER_STATED')
        .map(f => ({
            predicate: f.predicate,
            objectName: f.objectEntity?.name,
            objectValue: f.objectValue || undefined,
        }));

    // People and their facts
    const personEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PERSON', nameNormalized: { not: 'self' } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
    });

    const peopleFacts = personEntities.map(person => ({
        personName: person.name,
        facts: allFacts
            .filter(f => f.subjectId === person.id)
            .slice(0, 5)
            .map(f => ({
                predicate: f.predicate,
                objectName: f.objectEntity?.name,
                objectValue: f.objectValue || undefined,
                confidence: f.confidence,
            })),
    })).filter(p => p.facts.length > 0);

    // Project entities with related people
    const projectEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PROJECT' },
    });

    const projectData = await Promise.all(projectEntities.map(async project => {
        const projectFacts = allFacts.filter(f =>
            f.objectEntityId === project.id || f.subjectId === project.id
        );
        const relatedPeople = projectFacts
            .map(f => f.subject.type === 'PERSON' ? f.subject.name : f.objectEntity?.name)
            .filter((n): n is string => !!n && n !== 'Self');

        return {
            name: project.name,
            factCount: projectFacts.length,
            relatedPeople: [...new Set(relatedPeople)].slice(0, 5),
        };
    }));

    // Communities
    const communities = await prisma.knowledgeCommunity.findMany({
        where: { userId, level: 0 },
        orderBy: { activityScore: 'desc' },
        take: 10,
    });

    // Goals (still from raw data — goals aren't in the graph yet)
    const goals = await prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { stakeholders: true, actions: true }
    });

    return {
        selfFacts,
        peopleFacts,
        projectEntities: projectData.filter(p => p.factCount > 0),
        communities: communities.map(c => ({
            name: c.name,
            summary: c.summary || undefined,
            entityCount: c.entityCount,
            activityScore: c.activityScore,
        })),
        userStatedFacts,
        goals: goals.map(g => ({
            description: g.description,
            stakeholderCount: g.stakeholders.length,
            actionCount: g.actions.length,
            completedCount: g.actions.filter(a => a.status === 'COMPLETED').length,
            overdueCount: g.actions.filter(a => a.status === 'IN_PROGRESS' && a.dueDate && a.dueDate < new Date()).length,
        })),
        factIds: allFacts.map(f => f.id),
        communityCount: communities.length,
    };
}

function buildGraphPrompt(
    user: { name: string | null; jobTitle: string | null; company: string | null; industry: string | null },
    data: GraphData,
    previousProfile: UserIntelligenceProfile | null
): string {
    return `You are analyzing a professional's work patterns to build a coaching profile. Be specific and evidence-based. Do NOT make generic statements — every insight must reference specific data from the knowledge graph below.

USER PROFILE:
- Name: ${user.name || 'Unknown'}
- Title: ${user.jobTitle || 'Unknown'}
- Company: ${user.company || 'Unknown'}
- Industry: ${user.industry || 'Unknown'}

USER-STATED FACTS (highest confidence — the user told us this directly):
${data.userStatedFacts.length > 0
            ? data.userStatedFacts.map(f => `- ${f.predicate}: ${f.objectName || f.objectValue}`).join('\n')
            : '- None yet'}

FACTS ABOUT THE USER (from graph analysis):
${data.selfFacts.length > 0
            ? data.selfFacts.slice(0, 15).map(f => `- ${f.predicate}: ${f.objectName || f.objectValue} (confidence: ${f.confidence.toFixed(2)}, source: ${f.source})`).join('\n')
            : '- Limited data available'}

KEY PEOPLE (${data.peopleFacts.length} people with known facts):
${data.peopleFacts.slice(0, 10).map(p => {
        const factSummary = p.facts.map(f => `${f.predicate}${f.objectName ? ': ' + f.objectName : ''}${f.objectValue ? ': ' + f.objectValue : ''}`).join(', ');
        return `- ${p.personName}: ${factSummary}`;
    }).join('\n')}

PROJECTS (${data.projectEntities.length} identified):
${data.projectEntities.map(p => `- "${p.name}": ${p.factCount} facts, people: ${p.relatedPeople.join(', ') || 'unknown'}`).join('\n')}

WORK COMMUNITIES (clusters of related entities):
${data.communities.length > 0
            ? data.communities.map(c => `- "${c.name}" (${c.entityCount} entities, activity: ${c.activityScore})${c.summary ? ': ' + c.summary : ''}`).join('\n')
            : '- No communities detected yet'}

GOALS:
${data.goals.length > 0
            ? data.goals.map(g => `- "${g.description}" — ${g.stakeholderCount} stakeholders, ${g.actionCount} actions (${g.completedCount} done, ${g.overdueCount} overdue)`).join('\n')
            : '- No active goals set'}

${previousProfile ? `
PREVIOUS PROFILE (to build on — update, don't start over):
- Role: ${previousProfile.role}
- Strengths: ${previousProfile.strengths?.map(s => s.area).join(', ') || 'None identified'}
- Growth areas: ${previousProfile.growthAreas?.map(g => g.area).join(', ') || 'None identified'}
- Communication style: ${previousProfile.communicationStyle}
` : 'NO PREVIOUS PROFILE — this is the first synthesis.'}

---

${PROFILE_JSON_INSTRUCTIONS}`;
}

// ============================================================================
// RAW DATA FALLBACK (for users without enough graph data)
// ============================================================================

interface RawData {
    meetings: any[];
    emails: any[];
    documents: any[];
    stakeholders: any[];
    goals: any[];
    totalDataPoints: number;
}

async function gatherRawData(userId: string): Promise<RawData> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [meetings, emails, documents, stakeholders, goals] = await Promise.all([
        prisma.meetingSyncRecord.findMany({
            where: { userId, startTime: { gte: ninetyDaysAgo } },
            orderBy: { startTime: 'desc' },
            take: 50
        }),
        prisma.emailSummary.findMany({
            where: { userId, lastMessageAt: { gte: thirtyDaysAgo } },
            orderBy: { lastMessageAt: 'desc' },
            take: 30
        }),
        prisma.workArtifact.findMany({
            where: { userId, ingestedAt: { gte: thirtyDaysAgo } },
            orderBy: { ingestedAt: 'desc' },
            take: 20
        }),
        prisma.stakeholderProfile.findMany({
            where: { userId },
            orderBy: { interactionCount: 'desc' },
            take: 20,
            select: {
                name: true, email: true, role: true, organization: true,
                interactionCount: true, relationshipStrength: true,
                lastInteraction: true
            }
        }),
        prisma.goal.findMany({
            where: { userId, status: 'ACTIVE' },
            include: { stakeholders: true, actions: true }
        }),
    ]);

    return {
        meetings, emails, documents, stakeholders, goals,
        totalDataPoints: meetings.length + emails.length + documents.length + stakeholders.length + goals.length,
    };
}

function buildRawDataPrompt(
    user: { name: string | null; jobTitle: string | null; company: string | null; industry: string | null },
    data: RawData,
    previousProfile: UserIntelligenceProfile | null
): string {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { meetings, emails, documents, stakeholders, goals } = data;

    const meetingsByType = groupBy(meetings, m => m.meetingType || 'unknown');
    const oneOnOnes = meetings.filter(m => m.meetingType === '1:1');
    const teamMeetings = meetings.filter(m => m.meetingType === 'team' || m.meetingType === 'standup');
    const largeMeetings = meetings.filter(m => m.meetingType === 'large-meeting' || m.meetingType === 'all-hands');
    const overdueActions = goals.flatMap(g => g.actions.filter(a => a.status === 'IN_PROGRESS' && a.dueDate && a.dueDate < new Date()));
    const completedActions = goals.flatMap(g => g.actions.filter(a => a.status === 'COMPLETED'));
    const projectClusters = extractProjectClusters(meetings);

    return `You are analyzing a professional's work patterns to build a coaching profile. Be specific and evidence-based.

USER PROFILE:
- Name: ${user.name || 'Unknown'}
- Title: ${user.jobTitle || 'Unknown'}
- Company: ${user.company || 'Unknown'}
- Industry: ${user.industry || 'Unknown'}

MEETING PATTERNS (last 90 days, ${meetings.length} total):
- 1:1s: ${oneOnOnes.length}, Team: ${teamMeetings.length}, Large: ${largeMeetings.length}
- Types: ${Object.entries(meetingsByType).map(([type, arr]) => `${type}: ${(arr as any[]).length}`).join(', ')}

RECENT MEETINGS:
${meetings.filter(m => m.startTime >= thirtyDaysAgo).slice(0, 20).map(m => {
        const attendees = (m.attendees as any[]) || [];
        return `- "${m.title}" (${m.meetingType || '?'}) ${m.startTime.toLocaleDateString()} — ${attendees.length} people`;
    }).join('\n')}

PROJECT CLUSTERS: ${projectClusters.map(p => `"${p.name}" (${p.meetingCount} mtgs)`).join(', ')}

STAKEHOLDERS: ${stakeholders.slice(0, 10).map(s => `${s.name}${s.role ? ' (' + s.role + ')' : ''}`).join(', ')}

EMAILS: ${emails.slice(0, 10).map(e => `"${e.subject}" (${e.participants.length} people)`).join(', ')}

DOCUMENTS: ${documents.slice(0, 10).map(d => `"${d.title}" (${d.type})`).join(', ')}

GOALS: ${goals.map(g => `"${g.description}" (${completedActions.length} done, ${overdueActions.length} overdue)`).join(', ') || 'None'}

${previousProfile ? `PREVIOUS PROFILE: Role: ${previousProfile.role}, Strengths: ${previousProfile.strengths?.map(s => s.area).join(', ')}` : 'First synthesis.'}

---

${PROFILE_JSON_INSTRUCTIONS}`;
}

// ============================================================================
// SHARED
// ============================================================================

const PROFILE_JSON_INSTRUCTIONS = `Produce a JSON profile. For strengths and growth areas, cite SPECIFIC evidence from the data above. Confidence 0-1.

{
  "role": "their actual role based on evidence",
  "responsibilities": ["what they DO based on data"],
  "aspirations": ["inferred or stated goals"],
  "strengths": [{ "area": "name", "evidence": ["specific evidence"], "confidence": 0.7 }],
  "growthAreas": [{ "area": "name", "evidence": ["specific evidence"], "confidence": 0.6 }],
  "communicationStyle": "based on patterns",
  "decisionPattern": "how they make decisions",
  "projectSnapshot": {
    "ProjectName": { "health": "active|stalling|at_risk|completed", "userRole": "role", "keyPeople": ["names"], "recentActivity": "what happened" }
  }
}

Respond with ONLY the JSON. No markdown, no explanation.`;

/**
 * Extract project clusters from meeting titles
 */
function extractProjectClusters(meetings: any[]): Array<{ name: string; meetingCount: number; people: string[]; lastActivity: string }> {
    const titleWords = new Map<string, { count: number; people: Set<string>; lastDate: Date }>();

    for (const meeting of meetings) {
        const stopWords = new Set([
            'meeting', 'call', 'sync', 'weekly', 'daily', 'standup', 'stand',
            'review', 'with', 'team', 'catch', 'check', 'follow', 'update',
            'discussion', 'chat', 'talk', 'session', 'huddle', 'planning',
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
            'morning', 'afternoon', 'zoom', 'teams', 'meet', 'google',
            'sprint', 'board', 'committee', 'group', 'forum', 'monthly',
            'quarterly', 'biweekly', 'prep', 'agenda', 'notes', 'about',
            'from', 'this', 'that', 'into', 'over', 'next', 'last',
        ]);
        const words = meeting.title.split(/[\s\-:]+/).filter((w: string) =>
            w.length > 3 && !stopWords.has(w.toLowerCase())
        );

        const attendees = (meeting.attendees as any[]) || [];
        const people = attendees.map((a: any) => a.name || a.email || '').filter(Boolean);

        for (const word of words) {
            const key = word.toLowerCase();
            if (!titleWords.has(key)) {
                titleWords.set(key, { count: 0, people: new Set(), lastDate: meeting.startTime });
            }
            const entry = titleWords.get(key)!;
            entry.count++;
            people.forEach(p => entry.people.add(p));
            if (meeting.startTime > entry.lastDate) entry.lastDate = meeting.startTime;
        }
    }

    return Array.from(titleWords.entries())
        .filter(([_, data]) => data.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([name, data]) => ({
            name,
            meetingCount: data.count,
            people: Array.from(data.people).slice(0, 5),
            lastActivity: data.lastDate.toLocaleDateString()
        }));
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
    return arr.reduce((acc, item) => {
        const key = fn(item);
        (acc[key] = acc[key] || []).push(item);
        return acc;
    }, {} as Record<string, T[]>);
}
