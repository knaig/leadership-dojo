
import { prisma } from '@/lib/prisma';
import { createProvider } from '@/lib/llm/factory';
import { caseSummaries } from '@/lib/case-index';
import type { Prisma } from '@prisma/client';
import { BRAND } from '@/lib/brand';

export interface Surfacingresult {
    surfacedCount: number;
    topMatch?: {
        caseId: string;
        reason: string;
        trigger: string;
    };
}

export class CaseSurfacingEngine {

    /**
     * Main entry point to run the matching logic for a user.
     * Scans their context (Profile, Meetings, Decisions) and surfaces relevant cases.
     */
    static async run(userId: string): Promise<Surfacingresult> {
        // 1. Gather Context
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                jobTitle: true,
                companyStage: true,
                industry: true,
                role: true, // Enum role
            }
        });

        if (!user) return { surfacedCount: 0 };

        // Recent/Upcoming Meetings (High Stakes)
        const upcomingMeetings = await prisma.meetingLog.findMany({
            where: {
                userId,
                date: { gte: new Date() },
            },
            take: 3,
            orderBy: { date: 'asc' }
            // In a real scenario, we'd filter by 'importance' or 'stakes' if available
        });

        // Draft Decisions
        const draftDecisions = await prisma.decision.findMany({
            where: {
                userId,
                status: 'DRAFT'
            },
            take: 2,
            orderBy: { updatedAt: 'desc' }
        });

        // Recent Signals
        const recentSignals = await prisma.externalSignal.findMany({
            where: {
                // Linked to user via Kpi or inferred? 
                // For now, assume global signals relevant to user's industry?
            },
            take: 5
        });

        // 2. Construct Prompt
        const contextDescription = `
      User Role: ${user.jobTitle || user.role || 'Leader'}
      Company Stage: ${user.companyStage || 'Unknown'}
      Industry: ${user.industry || 'Tech'}
      
      Upcoming Context:
      ${upcomingMeetings.map(m => `- Meeting on ${m.date.toDateString()}: ${m.notes?.substring(0, 50)}...`).join('\n')}
      
      Active Decisions (Drafts):
      ${draftDecisions.map(d => `- ${d.title}: ${d.description?.substring(0, 50)}...`).join('\n')}
    `;

        const prompt = `
      You are the ${BRAND.name} Case Engine. Your goal is to surface a relevant Harvard Business School style case study to the user based on their immediate context.
      
      USER CONTEXT:
      ${contextDescription}
      
      AVAILABLE CASE LIBRARY:
      ${JSON.stringify(caseSummaries.map(c => ({
            id: c.id,
            title: c.title,
            summary: c.contextSummary,
            objectives: c.learningObjectives,
            type: c.caseType
        })))}
      
      INSTRUCTIONS:
      1. Analyze the User Context and identify the most pressing leadership challenge (e.g., specific high-stakes meeting, decision block, or transition).
      2. Select 1-3 Cases from the library that provide the specific mental model or lesson needed.
      3. Assign a "Trigger" type: "UPCOMING_MEETING", "DECISION_BLOCKER", "ROLE_TRANSITION", or "GROWTH_OPPORTUNITY".
      4. Write a "Surfacing Reason" (1 sentence) explaining why this case is relevant NOW.
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "matches": [
          {
            "caseId": "string (must match id in library)",
            "relevanceScore": number (0-1),
            "reason": "string",
            "trigger": "string"
          }
        ]
      }
    `;

        // 3. Call LLM
        try {
            const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!apiKey) {
                console.warn('CaseSurfacingEngine: No GOOGLE_GENERATIVE_AI_API_KEY found, skipping surfacing.');
                return { surfacedCount: 0 };
            }

            const llm = createProvider({
                provider: 'gemini',
                model: 'gemini-2.0-flash',
                apiKey
            });

            const result = await llm.analyze(prompt, {
                model: 'gemini-2.0-flash',
                temperature: 0.2,
                maxTokens: 1000
            });

            // 4. Parse & Upsert
            const raw = result.raw || {};
            const matches = raw.matches || [];

            if (!Array.isArray(matches) || matches.length === 0) {
                return { surfacedCount: 0 };
            }

            const topMatch = matches[0]; // Highest relevance

            // Persist the surfacing
            for (const match of matches) {
                if (match.relevanceScore > 0.7) {
                    // Map string to Enum (SurfacingTrigger)
                    // CALENDAR_UPCOMING, DECISION_MENTIONED, TRANSITION_DETECTED, SIGNAL_BASED, AMBIENT
                    let triggerEnum: any = 'AMBIENT';
                    const t = (match.trigger || '').toUpperCase();
                    if (t.includes('MEETING')) triggerEnum = 'CALENDAR_UPCOMING';
                    if (t.includes('DECISION')) triggerEnum = 'DECISION_MENTIONED';
                    if (t.includes('TRANSITION')) triggerEnum = 'TRANSITION_DETECTED';
                    if (t.includes('SIGNAL')) triggerEnum = 'SIGNAL_BASED';

                    await prisma.caseSurfacing.create({
                        data: {
                            userId,
                            caseId: match.caseId,
                            trigger: triggerEnum,
                            triggerContext: { reason: match.reason }, // Store reason in JSON
                            relevanceScore: match.relevanceScore,
                            // response is null by default (PENDING equivalent)
                        }
                    }).catch(e => {
                        console.log('Error creating surfacing:', e);
                    });
                }
            }

            return {
                surfacedCount: matches.length,
                topMatch: {
                    caseId: topMatch.caseId,
                    reason: topMatch.reason,
                    trigger: topMatch.trigger
                }
            };

        } catch (error) {
            console.error('Case Surfacing Engine Failed:', error);
            return { surfacedCount: 0 };
        }
    }
}
