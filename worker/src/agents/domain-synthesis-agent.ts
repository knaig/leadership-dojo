/**
 * Domain Context Synthesis Agent
 *
 * Populates the DomainContext model (organization, history, vocabulary, landscape)
 * and creates DomainLearning entries from accumulated knowledge.
 *
 * Sources:
 * - KnowledgeFacts about ORGANIZATION and TEAM entities
 * - User-stated facts (tribal knowledge from chat — overweighted)
 * - Email patterns (org structure, communication norms)
 * - Meeting patterns (decision-making processes, political dynamics)
 *
 * Runs daily after stakeholder synthesis.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';

interface DomainSignals {
    orgFacts: Array<{ predicate: string; value: string; source: string; confidence: number }>;
    teamFacts: Array<{ teamName: string; predicate: string; value: string; source: string }>;
    userStatedInsights: Array<{ predicate: string; value: string }>;
    stakeholderDynamics: Array<{ name: string; role: string | null; powerLevel: string; influenceRole: string; interactionCount: number }>;
    meetingPatterns: Array<{ type: string; count: number }>;
    topProjects: Array<{ name: string; factCount: number }>;
}

interface ExternalDomainIntel {
    whatCompanyDoes: string | null;
    industry: string | null;
    industryDynamics: string | null;
    companyStage: string | null;
    competitors: string[];
    recentNews: string[];
    keyPeople: string[];
    fundingModel: string | null;
}

interface SynthesizedDomain {
    organization: {
        culture: string[];
        unwrittenRules: string[];
        norms: string[];
        decisionProcess: string | null;
    };
    history: {
        keyEvents: string[];
        sensitivities: string[];
    };
    vocabulary: Record<string, string>;
    landscape: {
        activeProjects: string[];
        politicalDynamics: string[];
        powerStructure: string[];
        constraints: string[];
    };
    learnings: Array<{
        type: string;
        content: string;
    }>;
}

/**
 * Synthesize domain context for a user's organization.
 * Runs daily — skips if refreshed within 20 hours.
 */
export async function synthesizeDomainContext(userId: string): Promise<{
    updated: boolean;
    learningsCreated: number;
}> {
    console.log(`[DomainSynthesis] Starting for user ${userId.substring(0, 8)}...`);

    // Check existing + dedup
    const existing = await prisma.domainContext.findUnique({
        where: { userId },
    });

    if (existing) {
        const hoursSince = (Date.now() - existing.updatedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 20) {
            console.log(`[DomainSynthesis] Skipping — last updated ${Math.round(hoursSince)}h ago`);
            return { updated: false, learningsCreated: 0 };
        }
    }

    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.log(`[DomainSynthesis] No LLM configured — skipping`);
        return { updated: false, learningsCreated: 0 };
    }

    const signals = await gatherDomainSignals(userId);
    const totalSignals = signals.orgFacts.length + signals.teamFacts.length +
        signals.userStatedInsights.length + signals.stakeholderDynamics.length;

    if (totalSignals < 3) {
        console.log(`[DomainSynthesis] Only ${totalSignals} signals — too few to synthesize`);
        return { updated: false, learningsCreated: 0 };
    }

    // Gather external intelligence if missing or stale (>30 days)
    let externalIntel: ExternalDomainIntel | null = existing?.externalIntel as ExternalDomainIntel | null;
    let externalIntelRefreshedAt: Date | null = existing?.externalIntelRefreshedAt ?? null;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const needsExternalRefresh = !externalIntel || !externalIntelRefreshedAt ||
        (Date.now() - new Date(externalIntelRefreshedAt).getTime()) > thirtyDaysMs;

    if (needsExternalRefresh) {
        console.log('[DomainSynthesis] Fetching external domain intelligence...');
        const freshIntel = await gatherExternalDomainIntelligence(userId);
        if (freshIntel) {
            externalIntel = freshIntel;
            externalIntelRefreshedAt = new Date();
        }
    } else {
        console.log('[DomainSynthesis] External intel still fresh — reusing cached');
    }

    const synthesized = await synthesizeWithLLM(llmConfig, signals, existing, externalIntel);

    // Upsert DomainContext
    const domainContext = await prisma.domainContext.upsert({
        where: { userId },
        create: {
            userId,
            organization: synthesized.organization as any,
            history: synthesized.history as any,
            vocabulary: synthesized.vocabulary as any,
            landscape: synthesized.landscape as any,
            externalIntel: externalIntel as any ?? undefined,
            externalIntelRefreshedAt: externalIntelRefreshedAt,
        },
        update: {
            organization: synthesized.organization as any,
            history: synthesized.history as any,
            vocabulary: synthesized.vocabulary as any,
            landscape: synthesized.landscape as any,
            externalIntel: externalIntel as any ?? undefined,
            externalIntelRefreshedAt: externalIntelRefreshedAt,
        },
    });

    // Create DomainLearning entries for new insights
    let learningsCreated = 0;
    for (const learning of synthesized.learnings) {
        const typeMap: Record<string, string> = {
            'culture': 'ORGANIZATION_CULTURE',
            'rule': 'UNWRITTEN_RULE',
            'stakeholder': 'STAKEHOLDER_INSIGHT',
            'history': 'HISTORICAL_CONTEXT',
            'vocabulary': 'VOCABULARY_TERM',
            'political': 'POLITICAL_DYNAMIC',
        };

        const learningType = typeMap[learning.type] || 'ORGANIZATION_CULTURE';

        // Dedup: don't create duplicate learnings
        const existingLearning = await prisma.domainLearning.findFirst({
            where: {
                domainContextId: domainContext.id,
                content: learning.content,
            },
        });

        if (!existingLearning) {
            await prisma.domainLearning.create({
                data: {
                    domainContextId: domainContext.id,
                    type: learningType as any,
                    source: 'synthesis',
                    content: learning.content,
                },
            });
            learningsCreated++;
        }
    }

    console.log(`[DomainSynthesis] Done: context updated, ${learningsCreated} new learnings`);
    return { updated: true, learningsCreated };
}

/**
 * Gather external domain intelligence via Perplexity Sonar.
 * Runs once at first synthesis, then refreshes monthly.
 */
async function gatherExternalDomainIntelligence(userId: string): Promise<ExternalDomainIntel | null> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        console.log('[DomainSynthesis] No PERPLEXITY_API_KEY — skipping external intelligence');
        return null;
    }

    // Get user's company info
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { company: true, email: true, jobTitle: true },
    });

    if (!user?.company) {
        console.log('[DomainSynthesis] No company set — skipping external intelligence');
        return null;
    }

    const domain = user.email?.split('@')[1] || '';

    try {
        const prompt = `Research the company "${user.company}" (domain: ${domain}). The person asking is a ${user.jobTitle || 'leader'} at this company.

Return ONLY valid JSON with these fields:
{
  "whatCompanyDoes": "1-2 sentence description of what the company does",
  "industry": "sector/industry name",
  "industryDynamics": "2-3 sentences on key trends, challenges, and opportunities in this sector right now",
  "companyStage": "one of: startup, growth, mature, nonprofit, government, enterprise",
  "competitors": ["up to 5 peer companies or competitors"],
  "recentNews": ["up to 3 recent notable events or news items about this company"],
  "keyPeople": ["up to 5 public leadership team members with titles if findable"],
  "fundingModel": "one of: VC-funded, bootstrapped, grant-funded, public, government, nonprofit"
}

If you cannot find information for a field, use null for strings or empty array for arrays. Return ONLY the JSON, no markdown fences.`;

        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1000,
            }),
        });

        if (!res.ok) {
            console.warn(`[DomainSynthesis] Perplexity returned ${res.status}`);
            return null;
        }

        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        console.log(`[DomainSynthesis] External intel gathered for "${user.company}": ${parsed.industry || 'unknown industry'}`);

        return {
            whatCompanyDoes: parsed.whatCompanyDoes || null,
            industry: parsed.industry || null,
            industryDynamics: parsed.industryDynamics || null,
            companyStage: parsed.companyStage || null,
            competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
            recentNews: Array.isArray(parsed.recentNews) ? parsed.recentNews : [],
            keyPeople: Array.isArray(parsed.keyPeople) ? parsed.keyPeople : [],
            fundingModel: parsed.fundingModel || null,
        };
    } catch (err: any) {
        console.error(`[DomainSynthesis] External intelligence failed: ${err.message}`);
        return null;
    }
}

async function gatherDomainSignals(userId: string): Promise<DomainSignals> {
    // Organization entity facts
    const orgEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'ORGANIZATION' },
        select: { id: true, name: true },
    });

    const orgEntityIds = orgEntities.map(e => e.id);

    const orgFacts = orgEntityIds.length > 0 ? await prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: { in: orgEntityIds },
            validTo: null,
            confidence: { gte: 0.3 },
        },
        include: {
            objectEntity: { select: { name: true } },
        },
        orderBy: { confidence: 'desc' },
        take: 30,
    }) : [];

    // Team entity facts
    const teamEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'TEAM' },
        select: { id: true, name: true },
    });

    const teamEntityIds = teamEntities.map(e => e.id);

    const teamFactsRaw = teamEntityIds.length > 0 ? await prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: { in: teamEntityIds },
            validTo: null,
            confidence: { gte: 0.3 },
        },
        include: {
            subject: { select: { name: true } },
            objectEntity: { select: { name: true } },
        },
        orderBy: { confidence: 'desc' },
        take: 20,
    }) : [];

    // User-stated facts (tribal knowledge — overweighted)
    const userStatedFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            source: 'USER_STATED',
            validTo: null,
            predicate: {
                in: [
                    'has_opinion_on', 'concerned_about', 'prefers', 'dislikes',
                    'part_of_team', 'works_at', 'reports_to', 'manages',
                ],
            },
        },
        include: {
            objectEntity: { select: { name: true } },
        },
        take: 30,
    });

    // Stakeholder power dynamics
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        select: {
            name: true, role: true, powerLevel: true,
            influenceRole: true, interactionCount: true,
        },
        orderBy: { interactionCount: 'desc' },
        take: 20,
    });

    // Meeting type distribution
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: ninetyDaysAgo } },
        select: { meetingType: true },
    });

    const meetingCounts = new Map<string, number>();
    for (const m of meetings) {
        const type = m.meetingType || 'unknown';
        meetingCounts.set(type, (meetingCounts.get(type) || 0) + 1);
    }

    // Top projects from graph
    const projectEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PROJECT' },
        select: { id: true, name: true },
    });

    const projectFactCounts = await Promise.all(
        projectEntities.slice(0, 10).map(async p => ({
            name: p.name,
            factCount: await prisma.knowledgeFact.count({
                where: { userId, OR: [{ subjectId: p.id }, { objectEntityId: p.id }], validTo: null },
            }),
        }))
    );

    return {
        orgFacts: orgFacts.map(f => ({
            predicate: f.predicate,
            value: f.objectEntity?.name || f.objectValue || '',
            source: f.source,
            confidence: f.confidence,
        })),
        teamFacts: teamFactsRaw.map(f => ({
            teamName: f.subject.name,
            predicate: f.predicate,
            value: f.objectEntity?.name || f.objectValue || '',
            source: f.source,
        })),
        userStatedInsights: userStatedFacts.map(f => ({
            predicate: f.predicate,
            value: f.objectEntity?.name || f.objectValue || '',
        })),
        stakeholderDynamics: stakeholders.map(s => ({
            name: s.name,
            role: s.role,
            powerLevel: s.powerLevel,
            influenceRole: s.influenceRole,
            interactionCount: s.interactionCount,
        })),
        meetingPatterns: Array.from(meetingCounts.entries()).map(([type, count]) => ({ type, count })),
        topProjects: projectFactCounts.filter(p => p.factCount > 0).sort((a, b) => b.factCount - a.factCount),
    };
}

async function synthesizeWithLLM(
    llmConfig: any,
    signals: DomainSignals,
    existing: any | null,
    externalIntel: ExternalDomainIntel | null = null,
): Promise<SynthesizedDomain> {
    const existingOrg = existing?.organization as any || {};
    const existingLandscape = existing?.landscape as any || {};

    const prompt = `You are analyzing an organization's culture, dynamics, and landscape from accumulated intelligence. Be specific — every insight must be grounded in the data below. Do NOT hallucinate.

ORGANIZATION FACTS (from knowledge graph):
${signals.orgFacts.length > 0
            ? signals.orgFacts.map(f => `- ${f.predicate}: ${f.value} (${f.source}, conf: ${f.confidence.toFixed(2)})`).join('\n')
            : '- None'}

TEAM FACTS:
${signals.teamFacts.length > 0
            ? signals.teamFacts.map(f => `- ${f.teamName} ${f.predicate}: ${f.value}`).join('\n')
            : '- None'}

USER-STATED INSIGHTS (tribal knowledge — highest weight, the user told us this):
${signals.userStatedInsights.length > 0
            ? signals.userStatedInsights.map(f => `- ${f.predicate}: ${f.value}`).join('\n')
            : '- None yet'}

STAKEHOLDER POWER MAP:
${signals.stakeholderDynamics.slice(0, 15).map(s =>
                `- ${s.name}${s.role ? ` (${s.role})` : ''}: power=${s.powerLevel}, influence=${s.influenceRole}, interactions=${s.interactionCount}`
            ).join('\n')}

MEETING DISTRIBUTION (90 days):
${signals.meetingPatterns.map(m => `- ${m.type}: ${m.count}`).join('\n')}

ACTIVE PROJECTS:
${signals.topProjects.map(p => `- ${p.name} (${p.factCount} facts)`).join('\n') || '- None identified'}
${externalIntel ? `
EXTERNAL INTELLIGENCE (from web research):
Company: ${externalIntel.whatCompanyDoes}
Industry: ${externalIntel.industry}
Industry dynamics: ${externalIntel.industryDynamics}
Company stage: ${externalIntel.companyStage}
Competitors: ${externalIntel.competitors?.join(', ')}
Recent news: ${externalIntel.recentNews?.join('; ')}
Key people: ${externalIntel.keyPeople?.join(', ')}
Funding: ${externalIntel.fundingModel}
` : ''}
${existing ? `PREVIOUS CONTEXT (build on this — update, don't start over):
Culture: ${JSON.stringify(existingOrg.culture || [])}
Landscape: ${JSON.stringify(existingLandscape)}
` : 'FIRST SYNTHESIS — no previous context.'}

---

Produce a JSON domain context. For fields without evidence, use empty arrays/null. Create "learnings" entries only for new, specific, actionable insights.

{
  "organization": {
    "culture": ["observed cultural norms"],
    "unwrittenRules": ["unwritten rules the user should know"],
    "norms": ["communication/work norms"],
    "decisionProcess": "how decisions get made, or null"
  },
  "history": {
    "keyEvents": ["significant past events"],
    "sensitivities": ["topics to be careful about"]
  },
  "vocabulary": { "ACRONYM": "what it means" },
  "landscape": {
    "activeProjects": ["project names"],
    "politicalDynamics": ["observed political dynamics"],
    "powerStructure": ["who influences whom"],
    "constraints": ["organizational constraints"]
  },
  "learnings": [
    { "type": "culture|rule|stakeholder|history|vocabulary|political", "content": "specific insight" }
  ]
}

Respond with ONLY the JSON.`;

    const text = await withLLMRetry(
        () => generateText(llmConfig, prompt, { temperature: 0.2, maxOutputTokens: 1500 }),
        { label: 'DomainSynthesis' }
    );

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse JSON from LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
        organization: {
            culture: Array.isArray(parsed.organization?.culture) ? parsed.organization.culture : [],
            unwrittenRules: Array.isArray(parsed.organization?.unwrittenRules) ? parsed.organization.unwrittenRules : [],
            norms: Array.isArray(parsed.organization?.norms) ? parsed.organization.norms : [],
            decisionProcess: parsed.organization?.decisionProcess || null,
        },
        history: {
            keyEvents: Array.isArray(parsed.history?.keyEvents) ? parsed.history.keyEvents : [],
            sensitivities: Array.isArray(parsed.history?.sensitivities) ? parsed.history.sensitivities : [],
        },
        vocabulary: (typeof parsed.vocabulary === 'object' && !Array.isArray(parsed.vocabulary))
            ? parsed.vocabulary : {},
        landscape: {
            activeProjects: Array.isArray(parsed.landscape?.activeProjects) ? parsed.landscape.activeProjects : [],
            politicalDynamics: Array.isArray(parsed.landscape?.politicalDynamics) ? parsed.landscape.politicalDynamics : [],
            powerStructure: Array.isArray(parsed.landscape?.powerStructure) ? parsed.landscape.powerStructure : [],
            constraints: Array.isArray(parsed.landscape?.constraints) ? parsed.landscape.constraints : [],
        },
        learnings: Array.isArray(parsed.learnings) ? parsed.learnings : [],
    };
}
