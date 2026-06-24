import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/context/answer
 * Saves a context intelligence answer from the dashboard.
 * Stored as a ConversationInsight with high confidence.
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { area, question, answer } = await request.json();

        if (!area || !answer?.trim()) {
            return NextResponse.json({ error: 'Missing area or answer' }, { status: 400 });
        }

        // Map context area to ContextType
        const areaToContextType: Record<string, string> = {
            stakeholders: 'STAKEHOLDER_DYNAMIC',
            goals: 'STRATEGIC_BET',
            org_politics: 'STAKEHOLDER_DYNAMIC',
            domain: 'MARKET_POSITION',
            meeting_patterns: 'PAST_LEARNING',
            team_dynamics: 'TEAM_GAP',
            preferences: 'PAST_LEARNING',
            decisions: 'KEY_CONSTRAINT',
        };

        const contextType = areaToContextType[area] || 'PAST_LEARNING';

        // Save as ConversationInsight
        await prisma.conversationInsight.create({
            data: {
                userId,
                conversationDate: new Date(),
                insight: `[${area}] Q: ${question} A: ${answer.trim()}`,
                senderType: 'USER',
                contextType: contextType as any,
                explicit: true,
                confidence: 0.95, // High confidence — user stated directly
                conversationType: 'GENERAL',
            },
        });

        // If stakeholder-related, also try to update domain context
        if (area === 'domain' || area === 'org_politics') {
            try {
                // Fetch existing to merge JSON fields, then upsert
                const existing = await prisma.domainContext.findUnique({ where: { userId } });
                const orgData = area === 'org_politics'
                    ? { ...((existing?.organization as any) || {}), userInput: answer.trim() }
                    : (existing?.organization || {});
                const landscapeData = area === 'domain'
                    ? { ...((existing?.landscape as any) || {}), userInput: answer.trim() }
                    : (existing?.landscape || {});

                await prisma.domainContext.upsert({
                    where: { userId },
                    create: {
                        userId,
                        organization: orgData,
                        landscape: landscapeData,
                    },
                    update: {
                        ...(area === 'org_politics' ? { organization: orgData } : {}),
                        ...(area === 'domain' ? { landscape: landscapeData } : {}),
                    },
                });
            } catch (e) {
                console.error('[ContextAnswer] Failed to update domain context:', e);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[ContextAnswer] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
