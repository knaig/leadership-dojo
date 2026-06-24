/**
 * Structured Onboarding
 *
 * When a user first connects their data (or has < 10 entities in the graph):
 * 1. Run intensive batch extraction on ALL synced data (not just new records)
 * 2. After extraction, generate 3-5 high-leverage onboarding questions
 *    based on the graph's sparsest areas
 * 3. Deliver as a focused onboarding conversation, not drip-fed one per day
 * 4. User answers feed through chat-fact-extractor with USER_STATED source
 *
 * This bootstraps the graph in hours instead of weeks.
 */

import { prisma } from '../../lib/prisma';
import { extractCalendarFacts } from './calendar-fact-extractor';
import { extractEmailFacts } from './email-fact-extractor';
import { extractDocumentFacts } from './document-fact-extractor';
import { analyzeKnowledgeGaps } from './graph-query-service';
import { getUserLLMConfig, generateText, withLLMRetry } from '../../lib/user-llm';

/**
 * Check if user needs onboarding (< 10 entities in graph).
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
    const entityCount = await prisma.knowledgeEntity.count({
        where: { userId }
    });
    return entityCount < 10;
}

/**
 * Run intensive batch extraction for onboarding.
 * Unlike normal extraction which only processes new records,
 * this runs on ALL existing data to bootstrap the graph.
 */
export async function runOnboardingExtraction(userId: string): Promise<{
    totalEntities: number;
    totalFacts: number;
}> {
    console.log(`[Onboarding] Running intensive extraction for user ${userId.substring(0, 8)}...`);

    // Run all extractors (they handle dedup via ExtractionLog internally)
    const [calendarResult, emailResult, docResult] = await Promise.all([
        extractCalendarFacts(userId).catch(e => {
            console.error(`[Onboarding] Calendar extraction failed: ${e.message}`);
            return { entitiesFound: 0, factsCreated: 0 };
        }),
        extractEmailFacts(userId).catch(e => {
            console.error(`[Onboarding] Email extraction failed: ${e.message}`);
            return { entitiesFound: 0, factsCreated: 0 };
        }),
        extractDocumentFacts(userId).catch(e => {
            console.error(`[Onboarding] Document extraction failed: ${e.message}`);
            return { entitiesFound: 0, factsCreated: 0 };
        }),
    ]);

    const totalEntities = calendarResult.entitiesFound + emailResult.entitiesFound + docResult.entitiesFound;
    const totalFacts = calendarResult.factsCreated + emailResult.factsCreated + docResult.factsCreated;

    console.log(`[Onboarding] Extraction complete — ${totalEntities} entities, ${totalFacts} facts`);
    return { totalEntities, totalFacts };
}

/**
 * Generate high-leverage onboarding questions based on graph gaps.
 * Returns 3-5 questions that will fill the most important knowledge gaps.
 */
export async function generateOnboardingQuestions(userId: string): Promise<string[]> {
    console.log(`[Onboarding] Generating onboarding questions...`);

    // Get graph state
    const [gaps, entityCounts, user] = await Promise.all([
        analyzeKnowledgeGaps(userId),
        prisma.knowledgeEntity.groupBy({
            by: ['type'],
            where: { userId },
            _count: true,
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, jobTitle: true, company: true }
        }),
    ]);

    const typeCountMap = new Map(entityCounts.map(e => [e.type, e._count]));
    const personCount = typeCountMap.get('PERSON') || 0;
    const projectCount = typeCountMap.get('PROJECT') || 0;
    const topicCount = typeCountMap.get('TOPIC') || 0;

    // Get top people and projects for context in the prompt
    const topPeople = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PERSON', nameNormalized: { not: 'self' } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { name: true },
    });

    const topProjects = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PROJECT' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { name: true },
    });

    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        // Fallback questions
        return getDefaultOnboardingQuestions(personCount, projectCount, topPeople, topProjects);
    }

    const prompt = `You are Mira, an AI work intelligence system doing initial onboarding for a new user. Based on what you've learned from their calendar, email, and documents, generate 3-5 focused questions to fill the biggest gaps in your understanding.

USER: ${user?.name || 'Unknown'}, ${user?.jobTitle || 'role unknown'} at ${user?.company || 'company unknown'}

WHAT WE KNOW SO FAR FROM DATA ANALYSIS:
- ${personCount} people identified
- ${projectCount} projects identified
- ${topicCount} topics identified
- Top people: ${topPeople.map(p => p.name).join(', ') || 'none yet'}
- Top projects: ${topProjects.map(p => p.name).join(', ') || 'none yet'}

KNOWLEDGE GAPS:
${gaps.length > 0
        ? gaps.slice(0, 5).map(g => `- ${g.entityName} (${g.entityType}): ${g.reason}`).join('\n')
        : '- Very limited data available'
    }

Generate 3-5 questions. Each question should:
1. Reference specific names/projects from the data above when possible
2. Be one sentence, conversational, specific
3. Target the most valuable missing information (role, team structure, priorities, key relationships)
4. Sound like Mira (observant, specific, not generic)

Return ONLY a JSON array of question strings. No other text.`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.5, maxOutputTokens: 500 }),
            { label: 'Onboarding' }
        );
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const questions = JSON.parse(jsonMatch[0]) as string[];
            return questions.slice(0, 5);
        }
    } catch (err: any) {
        console.error(`[Onboarding] LLM question generation failed: ${err.message}`);
    }

    return getDefaultOnboardingQuestions(personCount, projectCount, topPeople, topProjects);
}

function getDefaultOnboardingQuestions(
    personCount: number,
    projectCount: number,
    topPeople: Array<{ name: string }>,
    topProjects: Array<{ name: string }>
): string[] {
    const questions: string[] = [];

    questions.push("What's the single most important thing on your plate right now?");

    if (personCount > 0 && topPeople.length > 0) {
        questions.push(`I see you interact a lot with ${topPeople[0].name} — what's your working relationship? Do they report to you, or is this a peer/cross-functional thing?`);
    } else {
        questions.push("Who are the 2-3 people you work most closely with, and what are their roles?");
    }

    if (projectCount > 0 && topProjects.length > 0) {
        questions.push(`Tell me about ${topProjects[0].name} — what's the current status and what's your role in it?`);
    } else {
        questions.push("What are the main projects or workstreams you're driving right now?");
    }

    questions.push("What's one thing you wish you were better at in your current role?");

    return questions;
}

/**
 * Build the onboarding message combining extraction results and questions.
 */
export async function buildOnboardingMessage(userId: string): Promise<string | null> {
    const isNeeded = await needsOnboarding(userId);
    if (!isNeeded) return null;

    // Run extraction first
    const extractionResult = await runOnboardingExtraction(userId);

    // Generate questions based on what we found (and what we didn't)
    const questions = await generateOnboardingQuestions(userId);

    if (questions.length === 0) return null;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true }
    });

    const firstName = user?.name?.split(' ')[0] || 'there';

    let message = `Hey ${firstName} — I've been looking through your calendar, emails, and docs to get up to speed on your world.`;

    if (extractionResult.totalEntities > 0) {
        message += ` I've mapped out ${extractionResult.totalEntities} people, projects, and topics so far.`;
    }

    message += ` To make sure I'm tracking the right things, a few quick questions:\n\n`;

    for (let i = 0; i < questions.length; i++) {
        message += `${i + 1}. ${questions[i]}\n`;
    }

    message += `\nYou can answer any or all of these — whatever you share helps me give you better coaching and meeting prep.`;

    return message;
}
