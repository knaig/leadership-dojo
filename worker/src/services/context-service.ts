
import { prisma } from '../lib/prisma';

export interface ContextData {
    upcomingMeetings: Array<{
        title: string;
        startTime: Date;
        participants: string[];
        description: string | null;
    }>;
    stakeholders: Array<{
        name: string;
        role: string | null;
        relationshipStrength: number;
        primaryMotivation: string | null;
    }>;
    kpis: Array<{
        name: string;
        status: string;
        currentValue: number | null;
        targetValue: number;
    }>;
    syncStatus: {
        isStale: boolean;
        lastSync: Date | null;
        meetingCount: number;
    };
    relevantArtifacts: Array<{
        title: string;
        type: string;
        contentSnippet: string;
        createdAt: Date;
    }>;
}

export class ContextService {
    /**
     * Fetches the "Context Garden" for a user to prime the LLM.
     * Looks at NEXT 48 hours of meetings, Top 5 Stakeholders, and Active KPIs.
     */
    static async getRecentContext(userId: string, query?: string): Promise<ContextData> {
        const now = new Date();
        const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        // 0. Check Sync Health
        const connector = await prisma.dataConnector.findFirst({
            where: { userId, type: 'CALENDAR' }, // Check calendar primarily
            orderBy: { lastSyncAt: 'desc' }
        });

        const lastSync = connector?.lastSyncAt || null;
        // Consider stale if > 24 hours (or whatever threshold)
        const isStale = !lastSync || (now.getTime() - lastSync.getTime() > 24 * 60 * 60 * 1000);

        // 1. Upcoming Meetings
        const upcomingMeetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: {
                    gte: now,
                    lte: next48h
                },
                status: 'confirmed'
            },
            orderBy: {
                startTime: 'asc'
            },
            take: 5
        });

        // 2. Key Stakeholders (Top by interaction count)
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: {
                userId
            },
            orderBy: {
                interactionCount: 'desc'
            },
            take: 5,
            select: {
                name: true,
                role: true,
                relationshipStrength: true,
                primaryMotivation: true
            }
        });

        // 3. Active KPIs (Prioritize 'AT_RISK' or 'OFF_TRACK')
        const kpis = await prisma.userKPI.findMany({
            where: {
                userId,
                status: {
                    in: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK']
                }
            },
            take: 3,
            orderBy: {
                updatedAt: 'desc'
            },
            select: {
                name: true,
                status: true,
                currentValue: true,
                targetValue: true
            }
        });

        // 4. Relevant Artifacts (Simple Keyword Search)
        let relevantArtifacts: any[] = [];
        if (query && query.length > 3) {
            // Extract meaningful keywords (naive approach)
            const keywords = query.split(' ')
                .filter(w => w.length > 3)
                .filter(w => !['what', 'when', 'where', 'tell', 'about', 'show', 'give'].includes(w.toLowerCase()))
                .slice(0, 3); // Take top 3 keywords

            if (keywords.length > 0) {
                // Construct OR clause for keywords
                const orConditions = keywords.map(w => ({
                    OR: [
                        { title: { contains: w, mode: 'insensitive' as const } },
                        { content: { contains: w, mode: 'insensitive' as const } }
                    ]
                }));

                relevantArtifacts = await prisma.workArtifact.findMany({
                    where: {
                        userId,
                        AND: [{ OR: orConditions }] // Match ANY keyword
                    },
                    take: 5,
                    orderBy: { ingestedAt: 'desc' },
                    select: {
                        title: true,
                        type: true,
                        content: true,
                        ingestedAt: true
                    }
                });
            }
        }

        return {
            upcomingMeetings: upcomingMeetings.map(m => ({
                title: m.title,
                startTime: m.startTime,
                participants: m.participants,
                description: m.description
            })),
            stakeholders,
            kpis: kpis.map(k => ({
                name: k.name,
                status: k.status,
                currentValue: k.currentValue,
                targetValue: k.targetValue
            })),
            syncStatus: {
                isStale,
                lastSync,
                meetingCount: upcomingMeetings.length
            },
            relevantArtifacts: relevantArtifacts.map(a => ({
                title: a.title || 'Untitled',
                type: a.type,
                contentSnippet: a.content ? a.content.substring(0, 500) : '', // Limit context size
                createdAt: a.ingestedAt // Use ingestedAt instead of createdAt
            }))
        };
    }

    /**
     * Formats the context into a string for the LLM System Prompt.
     */
    static formatContextForPrompt(context: ContextData): string {
        let prompt = "## CURRENT CONTEXT (The Situation)\n";

        // Sync Status Warning
        if (context.syncStatus.isStale) {
            prompt += `\n> [!SYSTEM WARNING] Calendar sync is STALE (Last sync: ${context.syncStatus.lastSync ? context.syncStatus.lastSync.toDateString() : 'Never'}). Data may be outdated. ASK user if unsure.\n`;
        }

        // Meetings
        if (context.upcomingMeetings.length > 0) {
            prompt += "\n**Upcoming Meetings (Next 48h):**\n";
            context.upcomingMeetings.forEach(m => {
                const dateStr = m.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                prompt += `- [${dateStr}] ${m.title} (Participants: ${m.participants.join(', ')})\n`;
            });
        } else {
            prompt += "\n**Upcoming Meetings:** None scheduled.\n";
        }

        // Stakeholders
        if (context.stakeholders.length > 0) {
            prompt += "\n**Key Stakeholders:**\n";
            context.stakeholders.forEach(s => {
                prompt += `- ${s.name} (${s.role || 'Unknown'}) - Rel: ${s.relationshipStrength.toFixed(1)}/1.0\n`;
            });
        }

        // KPIs
        context.kpis.forEach(k => {
            prompt += `- ${k.name}: ${k.status} (Current: ${k.currentValue || '?'}, Target: ${k.targetValue})\n`;
        });


        // Relevant Artifacts (RAG)
        if (context.relevantArtifacts && context.relevantArtifacts.length > 0) {
            prompt += "\n**RELEVANT KNOWLEDGE (From Documents):**\n";
            context.relevantArtifacts.forEach(doc => {
                prompt += `> Type: ${doc.type} | Date: ${doc.createdAt.toLocaleDateString()} | Title: ${doc.title}\n`;
                prompt += `> Content: "${doc.contentSnippet}..."\n\n`;
            });
        }

        return prompt;
    }
}
