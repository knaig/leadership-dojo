/**
 * Stakeholder Intelligence Synthesis Agent
 *
 * Rolls up KnowledgeFacts about each PERSON entity into StakeholderIntelligence.
 * This is the missing link: facts exist in the graph, but StakeholderIntelligence
 * (successPatterns, objectionPatterns, recentTopics, etc.) was never populated.
 *
 * Runs daily after intelligence synthesis. Also triggered on-demand when
 * significant new chat facts are extracted (chat is overweighted as signal).
 *
 * Write path: StakeholderProfile → StakeholderIntelligence (upsert)
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';

interface StakeholderFactBundle {
    stakeholderId: string;
    name: string;
    email: string | null;
    role: string | null;
    facts: Array<{
        predicate: string;
        objectValue: string | null;
        objectName: string | null;
        confidence: number;
        source: string;
    }>;
    recentMeetings: string[];
    recentEmails: string[];
    interactionCount: number;
}

interface SynthesizedIntel {
    profileSummary: string;
    successPatterns: string[];
    failurePatterns: string[];
    objectionPatterns: string[];
    recentTopics: string[];
    currentMood: string | null;
    decisionMakingNotes: string | null;
    // Personality typing
    inferredArchetype: string | null;
    archetypeEvidence: string | null;
    inferredCommStyle: string | null;
    inferredDecisionStyle: string | null;
    inferredRiskTolerance: string | null;
    primaryMotivation: string | null;
    fears: string[];
}

/**
 * Synthesize intelligence for all stakeholders of a user.
 * Skips stakeholders refreshed in the last 20 hours.
 */
export async function synthesizeStakeholderIntelligence(userId: string): Promise<{
    processed: number;
    skipped: number;
    errors: number;
}> {
    return withAgentRun('stakeholder-synthesis', userId, 'cron', async (ctx) => {
        return _synthesizeStakeholderIntelligence(userId, ctx);
    });
}

async function _synthesizeStakeholderIntelligence(userId: string, ctx?: { itemsProcessed: number; itemsSkipped: number; logs: string[] }): Promise<{
    processed: number;
    skipped: number;
    errors: number;
}> {
    console.log(`[StakeholderSynthesis] Starting for user ${userId.substring(0, 8)}...`);

    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.warn(`[StakeholderSynthesis] WARNING: No LLM configured for user ${userId.substring(0, 8)} — this should not happen with platform key`);
        return { processed: 0, skipped: 0, errors: 0 };
    }

    // Get stakeholder profiles — prioritize by importance score (AI-computed),
    // fall back to interaction count for unscored profiles
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, mergedIntoId: null },
        include: { intelligence: true },
        orderBy: [
            { importanceScore: { sort: 'desc', nulls: 'last' } },
            { interactionCount: 'desc' },
        ],
        take: 50,
    });

    if (stakeholders.length === 0) {
        console.log(`[StakeholderSynthesis] No stakeholders found`);
        return { processed: 0, skipped: 0, errors: 0 };
    }

    // Get all PERSON entities for this user (to match stakeholders to graph)
    const personEntities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PERSON' },
        select: { id: true, name: true, nameNormalized: true, properties: true },
    });

    // Build multiple lookup maps for fuzzy matching
    const entityByNormName = new Map(personEntities.map(e => [e.nameNormalized, e.id]));
    const entityByEmail = new Map<string, string>();
    const entityByFirstName = new Map<string, string[]>(); // first name → [entityIds] (may collide)
    for (const e of personEntities) {
        // Extract email from properties JSON
        const props = (e.properties && typeof e.properties === 'object') ? e.properties as Record<string, unknown> : {};
        if (typeof props.email === 'string') {
            entityByEmail.set(props.email.toLowerCase(), e.id);
        }
        // Index by first name for partial matching
        const firstName = e.nameNormalized.split(' ')[0];
        if (firstName && firstName.length > 2) { // skip very short names
            if (!entityByFirstName.has(firstName)) entityByFirstName.set(firstName, []);
            entityByFirstName.get(firstName)!.push(e.id);
        }
    }

    // Get all current facts about PERSON entities in one query
    const personEntityIds = personEntities.map(e => e.id);
    const allPersonFacts = personEntityIds.length > 0 ? await prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: { in: personEntityIds },
            validTo: null,
            confidence: { gte: 0.3 },
        },
        include: {
            subject: { select: { name: true, nameNormalized: true } },
            objectEntity: { select: { name: true, type: true } },
        },
        orderBy: { confidence: 'desc' },
    }) : [];

    // Group facts by subject entity
    const factsByEntity = new Map<string, typeof allPersonFacts>();
    for (const fact of allPersonFacts) {
        const key = fact.subjectId;
        if (!factsByEntity.has(key)) factsByEntity.set(key, []);
        factsByEntity.get(key)!.push(fact);
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const stakeholder of stakeholders) {
        try {
            // Skip if recently refreshed
            if (stakeholder.intelligence?.lastRefreshedAt) {
                const hoursSince = (Date.now() - stakeholder.intelligence.lastRefreshedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSince < 20) {
                    skipped++;
                    continue;
                }
            }

            // Match stakeholder to knowledge entity (multi-strategy)
            const nameNorm = stakeholder.name.toLowerCase().replace(/\s+/g, ' ').trim();
            let entityId: string | undefined;

            // Strategy 1: exact normalized name match
            entityId = entityByNormName.get(nameNorm);

            // Strategy 2: match by email (handles email-derived profile names like "merson.jai")
            if (!entityId && stakeholder.email) {
                entityId = entityByEmail.get(stakeholder.email.toLowerCase());
            }

            // Strategy 3: stakeholder name is email-local-part (e.g. "b.aravinth") — try matching
            // against entity email local parts
            if (!entityId && stakeholder.email) {
                const localPart = stakeholder.email.split('@')[0].toLowerCase();
                if (nameNorm === localPart || nameNorm.replace(/\./g, '') === localPart.replace(/\./g, '')) {
                    // Name IS the email local part — already tried email match above, try substring
                    for (const e of personEntities) {
                        const props = (e.properties && typeof e.properties === 'object') ? e.properties as Record<string, unknown> : {};
                        if (typeof props.email === 'string' && props.email.toLowerCase() === stakeholder.email.toLowerCase()) {
                            entityId = e.id;
                            break;
                        }
                    }
                }
            }

            // Strategy 4: first-name match when stakeholder has single-word name
            // and only one entity shares that first name (unambiguous)
            if (!entityId && nameNorm.indexOf(' ') === -1 && nameNorm.length > 2) {
                const candidates = entityByFirstName.get(nameNorm);
                if (candidates && candidates.length === 1) {
                    entityId = candidates[0];
                }
            }

            const facts = entityId ? (factsByEntity.get(entityId) || []) : [];

            // Also gather recent meeting/email context
            const recentMeetings = await getRecentMeetingTitles(userId, stakeholder.name, stakeholder.email);
            const recentEmails = await getRecentEmailSubjects(userId, stakeholder.email);

            const totalSignals = facts.length + recentMeetings.length + recentEmails.length;

            // Skip stakeholders with zero signal — nothing to synthesize
            if (totalSignals === 0) {
                skipped++;
                continue;
            }

            const bundle: StakeholderFactBundle = {
                stakeholderId: stakeholder.id,
                name: stakeholder.name,
                email: stakeholder.email,
                role: stakeholder.role,
                facts: facts.map(f => ({
                    predicate: f.predicate,
                    objectValue: f.objectValue,
                    objectName: f.objectEntity?.name || null,
                    confidence: f.confidence,
                    source: f.source,
                })),
                recentMeetings,
                recentEmails,
                interactionCount: stakeholder.interactionCount,
            };

            const intel = await synthesizeOne(llmConfig, bundle);

            await prisma.stakeholderIntelligence.upsert({
                where: { stakeholderId: stakeholder.id },
                create: {
                    stakeholderId: stakeholder.id,
                    profileSummary: intel.profileSummary,
                    successPatterns: intel.successPatterns,
                    failurePatterns: intel.failurePatterns,
                    objectionPatterns: intel.objectionPatterns,
                    recentTopics: intel.recentTopics,
                    currentMood: intel.currentMood,
                    decisionMakingNotes: intel.decisionMakingNotes,
                    evidenceCount: totalSignals,
                    lastRefreshedAt: new Date(),
                },
                update: {
                    profileSummary: intel.profileSummary,
                    successPatterns: intel.successPatterns,
                    failurePatterns: intel.failurePatterns,
                    objectionPatterns: intel.objectionPatterns,
                    recentTopics: intel.recentTopics,
                    currentMood: intel.currentMood,
                    decisionMakingNotes: intel.decisionMakingNotes,
                    evidenceCount: totalSignals,
                    lastRefreshedAt: new Date(),
                },
            });

            // Write inferred personality back to StakeholderProfile (only if not user-corrected)
            const personalityUpdate: Record<string, unknown> = {};
            if (intel.inferredArchetype && !stakeholder.personaArchetype) {
                personalityUpdate.personaArchetype = intel.inferredArchetype;
            }
            if (intel.inferredCommStyle && !stakeholder.communicationStyle) {
                personalityUpdate.communicationStyle = intel.inferredCommStyle;
            }
            if (intel.inferredDecisionStyle && !stakeholder.decisionStyle) {
                personalityUpdate.decisionStyle = intel.inferredDecisionStyle;
            }
            if (intel.inferredRiskTolerance && !stakeholder.riskTolerance) {
                personalityUpdate.riskTolerance = intel.inferredRiskTolerance;
            }
            if (intel.primaryMotivation && !stakeholder.primaryMotivation) {
                personalityUpdate.primaryMotivation = intel.primaryMotivation;
            }
            if (intel.fears.length > 0 && stakeholder.fears.length === 0) {
                personalityUpdate.fears = intel.fears;
            }
            if (Object.keys(personalityUpdate).length > 0) {
                await prisma.stakeholderProfile.update({
                    where: { id: stakeholder.id },
                    data: personalityUpdate,
                });
            }

            processed++;
            if (ctx) { ctx.itemsProcessed++; ctx.logs.push(`${stakeholder.name}: ${totalSignals} signals → synthesized`); }
            console.log(`[StakeholderSynthesis] ${stakeholder.name}: ${totalSignals} signals → synthesized${Object.keys(personalityUpdate).length > 0 ? ` + personality typed` : ''}`);
        } catch (err: any) {
            errors++;
            console.error(`[StakeholderSynthesis] Error for ${stakeholder.name}: ${err.message}`);
        }
    }

    if (ctx) ctx.itemsSkipped = skipped;
    console.log(`[StakeholderSynthesis] Done: ${processed} processed, ${skipped} skipped, ${errors} errors`);
    return { processed, skipped, errors };
}

/**
 * Synthesize intelligence for a single stakeholder using LLM.
 */
async function synthesizeOne(
    llmConfig: any,
    bundle: StakeholderFactBundle
): Promise<SynthesizedIntel> {
    // Separate user-stated facts (highest weight) from inferred
    const userStatedFacts = bundle.facts.filter(f => f.source === 'USER_STATED');
    const chatFacts = bundle.facts.filter(f => f.source === 'INFERRED_CHAT');
    const otherFacts = bundle.facts.filter(f => f.source !== 'USER_STATED' && f.source !== 'INFERRED_CHAT');

    const prompt = `You are analyzing a professional relationship to build an intelligence profile. Be specific and evidence-based. Every insight must come from the data below.

STAKEHOLDER: ${bundle.name}
${bundle.role ? `Role: ${bundle.role}` : ''}
${bundle.email ? `Email: ${bundle.email}` : ''}
Interaction count: ${bundle.interactionCount}

USER-STATED FACTS (highest confidence — the user told us this directly about ${bundle.name}):
${userStatedFacts.length > 0
            ? userStatedFacts.map(f => `- ${f.predicate}: ${f.objectName || f.objectValue}`).join('\n')
            : '- None yet'}

CHAT-DERIVED FACTS (from conversations — second highest confidence):
${chatFacts.length > 0
            ? chatFacts.map(f => `- ${f.predicate}: ${f.objectName || f.objectValue} (conf: ${f.confidence.toFixed(2)})`).join('\n')
            : '- None'}

OTHER INFERRED FACTS (from calendar, email, documents):
${otherFacts.length > 0
            ? otherFacts.slice(0, 15).map(f => `- ${f.predicate}: ${f.objectName || f.objectValue} (source: ${f.source}, conf: ${f.confidence.toFixed(2)})`).join('\n')
            : '- None'}

RECENT MEETINGS involving ${bundle.name}:
${bundle.recentMeetings.length > 0
            ? bundle.recentMeetings.map(t => `- ${t}`).join('\n')
            : '- None found'}

RECENT EMAIL THREADS involving ${bundle.name}:
${bundle.recentEmails.length > 0
            ? bundle.recentEmails.map(t => `- ${t}`).join('\n')
            : '- None found'}

---

Based on the evidence above, produce a JSON intelligence profile. Do NOT hallucinate — if insufficient data for a field, use an empty array or null.

IMPORTANT FRAMING RULES:
- "successPatterns" = what the user does well with this person (confidence-building)
- "failurePatterns" = reframe as growth opportunities, not failures. Say "works better when..." not "failed because..."
- "objectionPatterns" = their concerns — understand them as valid perspectives, not obstacles

{
  "profileSummary": "1-2 sentence summary of who this person is and their working relationship with the user",
  "successPatterns": ["approaches that work well with this person — based on evidence"],
  "failurePatterns": ["growth opportunities — reframed positively, e.g. 'Works better when...' instead of 'Failed because...'"],
  "objectionPatterns": ["concerns they commonly raise — framed as their perspective, not resistance"],
  "recentTopics": ["topics from recent interactions"],
  "currentMood": "inferred from recent interactions, or null if insufficient data",
  "decisionMakingNotes": "how they make decisions, or null if unknown",

  "inferredArchetype": "One of: DRIVER, ANALYST, COLLABORATOR, VISIONARY, GUARDIAN, POLITICIAN, CHAMPION, PRAGMATIST, SKEPTIC, CONSERVATIVE, OPERATOR — or null if insufficient evidence. DRIVER=results-first decisive. ANALYST=data-driven methodical. COLLABORATOR=consensus-seeking inclusive. VISIONARY=big-picture inspired. GUARDIAN=risk-averse protective. POLITICIAN=influence-driven strategic. CHAMPION=enthusiastic advocate. PRAGMATIST=ROI-focused practical. SKEPTIC=questions everything needs proof. CONSERVATIVE=values stability. OPERATOR=process-focused reliable.",
  "archetypeEvidence": "1 sentence explaining WHY you chose this archetype, citing specific evidence. Or null.",
  "inferredCommStyle": "One of: DIRECT, DIPLOMATIC, DATA_DRIVEN, NARRATIVE, COLLABORATIVE, FORMAL, RELATIONSHIP — or null",
  "inferredDecisionStyle": "One of: ANALYTICAL, INTUITIVE, COLLABORATIVE, DIRECTIVE — or null",
  "inferredRiskTolerance": "One of: HIGH, MODERATE, LOW — or null",
  "primaryMotivation": "What drives this person professionally — 1 sentence or null",
  "fears": ["professional fears or concerns inferred from behavior — only if evidence supports it"]
}

Respond with ONLY the JSON. No markdown, no explanation.`;

    const text = await withLLMRetry(
        () => generateText(llmConfig, prompt, { temperature: 0.2, maxOutputTokens: 1000 }),
        { label: 'StakeholderSynthesis' }
    );

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Failed to parse JSON from LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
        profileSummary: parsed.profileSummary || `${bundle.name}${bundle.role ? ` — ${bundle.role}` : ''}`,
        successPatterns: Array.isArray(parsed.successPatterns) ? parsed.successPatterns : [],
        failurePatterns: Array.isArray(parsed.failurePatterns) ? parsed.failurePatterns : [],
        objectionPatterns: Array.isArray(parsed.objectionPatterns) ? parsed.objectionPatterns : [],
        recentTopics: Array.isArray(parsed.recentTopics) ? parsed.recentTopics : [],
        currentMood: parsed.currentMood || null,
        decisionMakingNotes: parsed.decisionMakingNotes || null,
        // Personality typing
        inferredArchetype: parsed.inferredArchetype || null,
        archetypeEvidence: parsed.archetypeEvidence || null,
        inferredCommStyle: parsed.inferredCommStyle || null,
        inferredDecisionStyle: parsed.inferredDecisionStyle || null,
        inferredRiskTolerance: parsed.inferredRiskTolerance || null,
        primaryMotivation: parsed.primaryMotivation || null,
        fears: Array.isArray(parsed.fears) ? parsed.fears : [],
    };
}

/**
 * Get recent meeting titles that include this stakeholder.
 */
async function getRecentMeetingTitles(userId: string, name: string, email: string | null): Promise<string[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: thirtyDaysAgo },
        },
        select: { title: true, startTime: true, attendees: true },
        orderBy: { startTime: 'desc' },
        take: 100,
    });

    const nameLower = name.toLowerCase();
    const emailLower = email?.toLowerCase();

    return meetings
        .filter(m => {
            const attendees = (m.attendees as any[]) || [];
            return attendees.some(a => {
                const aName = (a.name || '').toLowerCase();
                const aEmail = (a.email || '').toLowerCase();
                return aName.includes(nameLower) || nameLower.includes(aName) ||
                    (emailLower && aEmail === emailLower);
            });
        })
        .slice(0, 10)
        .map(m => `${m.title} (${m.startTime.toLocaleDateString()})`);
}

/**
 * Get recent email subjects involving this stakeholder.
 */
async function getRecentEmailSubjects(userId: string, email: string | null): Promise<string[]> {
    if (!email) return [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const emails = await prisma.emailSummary.findMany({
        where: {
            userId,
            lastMessageAt: { gte: thirtyDaysAgo },
        },
        select: { subject: true, participants: true, lastMessageAt: true },
        orderBy: { lastMessageAt: 'desc' },
        take: 50,
    });

    const emailLower = email.toLowerCase();

    return emails
        .filter(e => {
            const participants = (e.participants as string[]) || [];
            return participants.some(p => p.toLowerCase().includes(emailLower));
        })
        .slice(0, 10)
        .map(e => `${e.subject} (${e.lastMessageAt?.toLocaleDateString() || '?'})`);
}
