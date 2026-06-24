
import { prisma } from '@/lib/prisma';
import { FeedbackType } from '@prisma/client';
import { createProvider } from '@/lib/llm/factory';
import { getUserLLMConfig } from '@/lib/llm/user-config';

// Helper to subtract days
function subDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
}

/**
 * Generate prescriptions (Recommendations) from observations.
 * 
 * Rules:
 * 1. Filter observations: confidence > 0.7, recent (7 days)
 * 2. Group by capacity
 * 3. Max 1 prescription per capacity per day
 * 4. Synthesize evidence and action
 */
export async function generatePrescriptions(userId: string) {
    console.log(`[RecService] Generating for ${userId}`);

    // 1. Check if we already generated for today to avoid dupes logic (naive check)
    // In a real system, we might want to regenerate if new data came in, 
    // but for now let's just see what we can generate.

    // 2. Get recent high-confidence observations
    const sevenDaysAgo = subDays(new Date(), 7);


    // 1. Fetch relevant artifacts (Last 2 weeks)
    const artifacts = await prisma.workArtifact.findMany({
        where: {
            userId,
            ingestedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { ingestedAt: 'desc' },
        take: 20
    });

    // 2. Fetch Context Graph (VERIFIED ONLY) - The World Model 🌍
    const contextGraph = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            validationStatus: "VERIFIED"
        },
        select: {
            name: true,
            role: true,
            organization: true,
            influenceLevel: true, // "High", "Low"
            relationshipStrength: true, // 0-1
            keyInterests: true // ["Stability", "Cost"]
        }
    });

    const contextString = contextGraph.map(s =>
        `- ${s.name} (${s.role || 'Unknown'}): Influence=${s.influenceLevel || 'Unknown'}, Strength=${Math.round(s.relationshipStrength * 100)}%`
    ).join('\n');

    // 3. Construct the Prompt
    const basePrompt = `
    You are an AI Executive Coach.
    
    CRITICAL CONTEXT GRAPH (The "World Model"):
    The following people are KEY PLAYERS in the user's political landscape. 
    You MUST tailor your advice based on these relationships.
    ${contextString ? contextString : "[No verified context yet. Assume generic landscape.]"}

    RECENT OBSERVATIONS:
    ${artifacts.map(a => `[${a.type}] ${(typeof a.content === 'string' ? a.content.substring(0, 200) : String(a.content).substring(0, 200))}`).join('\n')}
    
    TASK:
    Based on the above, generate a daily leadership plan.
    `;

    // We fetch raw observations first to process them
    const observations = await prisma.skillObservation.findMany({
        where: {
            userId,
            createdAt: { gte: sevenDaysAgo },
            // confidence: { gte: 0.7 }, // Enable in prod, relaxing for dev/MVP to ensure data flows
            type: { in: ['NEGATIVE', 'MISSED_OPPORTUNITY'] }
        },
        orderBy: { createdAt: 'desc' },
        include: { capacity: true }
    });

    console.log(`[RecService] Found ${observations.length} candidate observations`);

    // Group by capacity
    const byCapacity: Record<string, typeof observations> = {};
    for (const obs of observations) {
        if (!byCapacity[obs.capacityId]) {
            byCapacity[obs.capacityId] = [];
        }
        byCapacity[obs.capacityId].push(obs);
    }

    const createdRecs: any[] = [];

    // Process each capacity group
    for (const [capacityId, group] of Object.entries(byCapacity)) {
        if (group.length === 0) continue;

        // Check if we already have a pending action plan for this capacity generated recently
        const existing = await prisma.userActionPlan.findFirst({
            where: {
                userId,
                capacity: group[0].capacity.name,
                status: 'PENDING',
                createdAt: { gte: subDays(new Date(), 1) }
            }
        });

        if (existing) {
            console.log(`[RecService] Skipping ${group[0].capacity.name} - already pending action plan`);
            continue;
        }

        // Synthesize (Template based for MVP)
        const topObs = group[0]; // Most recent/confident
        const capacityName = topObs.capacity.name;

        // Generate Dynamic Action Plan via LLM
        let plan: { summary: string, bullets: string[] };

        try {
            const llmConfig = await getUserLLMConfig(userId);
            if (llmConfig.provider !== 'none') {
                // Pattern Recognition: Use top 3 observations
                const contextObs = group.slice(0, 3).map(o => `- "${o.observation}" (Context: ${o.context})`).join('\n');

                const prompt = `Act as an executive leadership coach.
Your client has demonstrated a gap in the capacity: "${capacityName}".

Here are recent observations of their behavior:
${contextObs}

Identity the pattern in these observations.
Then, suggest a specific, high-leverage micro-action they can take in their next meeting to practice this capacity.

Return ONLY JSON:
{
  "summary": "Short, punchy action title (max 60 chars)",
  "bullets": ["Why this works", "Specific step 1", "Specific step 2"]
}`;

                const provider = createProvider(llmConfig);
                const response = await provider.analyze(prompt, {
                    model: llmConfig.model,
                    temperature: 0.7,
                    maxTokens: 1000
                });

                let parsed = response.raw || response;
                if (Array.isArray(parsed)) {
                    parsed = parsed[0];
                }

                if (parsed?.summary && parsed?.bullets) {
                    plan = {
                        summary: parsed.summary,
                        bullets: parsed.bullets
                    };
                } else {
                    console.warn("[RecService] LLM returned unexpected format:", parsed);
                    // Fallback within try block if parsing failed but no error thrown
                    plan = {
                        summary: `Practice ${capacityName}`,
                        bullets: ['Reflect on recent interactions', 'Identify one small improvement', 'Apply it tomorrow']
                    }
                }

            } else {
                throw new Error("No LLM");
            }
        } catch (e) {
            console.error("[RecService] LLM Gen Failed, using fallback", e);
            plan = {
                summary: `Practice ${capacityName}`,
                bullets: ['Notice when this skill is needed', 'Pause and reflect before acting', 'Log what happened afterwards']
            };
        }

        // Create Action Plan
        const newRec = await prisma.userActionPlan.create({
            data: {
                userId,
                capacity: capacityName,
                type: 'NUDGE',
                evidenceObservation: `Pattern detected: "${topObs.observation}"`, // Leading with the main one
                evidenceBenchmark: 'High performers consistently demonstrate this.',
                actionSummary: plan.summary,
                actionBullets: plan.bullets,
                status: 'PENDING',
                metadata: {
                    sourceArtifactId: topObs.artifactId
                }
            }
        });

        createdRecs.push(newRec);
        console.log(`[RecService] Created action plan for ${capacityName}`);
    }

    return createdRecs;
}

export type FeedItem =
    | { type: 'INTERVENTION'; id: string; title: string; evidence: string; action: string; meetingTime?: Date; meetingTitle?: string }
    | { type: 'NUDGE'; id: string; capacity: string; evidenceObservation: string; actionSummary: string; actionBullets: string[]; status: string }
    | { type: 'CELEBRATION'; id: string; title: string; message: string; capacity: string; newScore: number };

/**
 * Get urgent intervention (Mock for now, normally checks Calendar events)
 */
async function getUrgentIntervention(userId: string): Promise<FeedItem | null> {
    // TODO: Connect to real CalendarEvent model when available
    // For now, we return null unless we want to force a test case
    return null;
}

/**
 * Get the current feed of recommendations (Action Plans) for the user.
 * Priority: 
 * 1. INTERVENTION (Urgent, max 1)
 * 2. NUDGE (Action Plans, max 2)
 * 3. CELEBRATION (Recent wins, max 1)
 * Hard limit: 3 items total.
 */
export async function getTodayFeed(userId: string): Promise<FeedItem[]> {
    const feed: FeedItem[] = [];

    // 1. Ensure we have fresh recommendations
    await generatePrescriptions(userId);

    // 2. Slot 1: Urgent Intervention
    const intervention = await getUrgentIntervention(userId);
    if (intervention) {
        feed.push(intervention);
    }

    // 3. Slot 2: Nudges (UserActionPlans)
    // If we have an intervention, we only want 1 nudge. If not, up to 2.
    // Total max is 3, so we can fetch a few and slice later.
    const nudges = await prisma.userActionPlan.findMany({
        where: {
            userId,
            status: { in: ['PENDING', 'COMMITTED'] },
            type: { not: 'INTERVENTION' } // Exclude interventions stored in DB if any
        },
        orderBy: { createdAt: 'desc' },
        take: 3
    });

    const mappedNudges: FeedItem[] = nudges.map(nudge => ({
        type: 'NUDGE',
        id: nudge.id,
        capacity: nudge.capacity,
        // Map Prisma DB naming to FeedItem naming
        evidenceObservation: nudge.evidenceObservation || '',
        actionSummary: nudge.actionSummary,
        actionBullets: (nudge.actionBullets as string[]) || [],
        status: nudge.status
    }));

    feed.push(...mappedNudges);

    // 4. Slot 3: Celebration (Mock for now, or check generic FeedbackItem with CELEBRATION type)
    // const celebration = ... 

    // 5. Hard Limit: 3 items
    return feed.slice(0, 3);
}

// Keep generic fetch for backward compat if needed, or remove. 
// For now, let's keep a simplified version that wraps getTodayFeed or just leave it for other consumers.
// But mostly we want to use getTodayFeed.
export async function getRecommendationsFeed(userId: string) {
    return getTodayFeed(userId);
}
