import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getUserLLMConfig } from '@/lib/llm/user-config';
import { createProvider } from '@/lib/llm/factory';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/[id]/influence-plan
 * Get existing influence plan for a meeting.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: meetingId } = await params;

    const plan = await prisma.influencePlan.findUnique({
        where: { meetingId },
    });

    if (!plan || plan.userId !== userId) {
        return NextResponse.json({ plan: null });
    }

    return NextResponse.json({ plan });
}

/**
 * POST /api/meetings/[id]/influence-plan
 * Generate or regenerate an influence plan using Room Read + LLM.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: meetingId } = await params;

    // Get meeting with stakeholder context
    const meeting = await prisma.meetingSyncRecord.findFirst({
        where: { id: meetingId, userId },
        select: {
            id: true,
            title: true,
            description: true,
            startTime: true,
            participants: true,
            desiredOutcome: true,
            meetingCategory: true,
        },
    });

    if (!meeting) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const participants = (meeting.participants || []) as string[];

    // Get stakeholder profiles for all participants
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            email: { in: participants.map(e => e.toLowerCase()), mode: 'insensitive' },
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            organization: true,
            politicalStance: true,
            influenceRole: true,
            powerLevel: true,
            personaArchetype: true,
            relationshipStrength: true,
            lastInteraction: true,
            primaryMotivation: true,
            fears: true,
            communicationStyle: true,
            intelligence: {
                select: {
                    profileSummary: true,
                    successPatterns: true,
                    failurePatterns: true,
                    objectionPatterns: true,
                },
            },
        },
    });

    if (stakeholders.length === 0) {
        return NextResponse.json({ error: 'No stakeholder profiles found for meeting participants' }, { status: 400 });
    }

    // Build context for LLM
    const now = Date.now();
    const stakeholderContext = stakeholders.map(s => {
        const daysSince = s.lastInteraction
            ? Math.floor((now - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
            : null;

        return {
            name: s.name,
            role: s.role,
            organization: s.organization,
            stance: s.politicalStance,
            influence: s.influenceRole,
            power: s.powerLevel,
            archetype: s.personaArchetype,
            relationshipStrength: s.relationshipStrength,
            daysSinceContact: daysSince,
            motivation: s.primaryMotivation,
            fears: s.fears,
            communicationStyle: s.communicationStyle,
            summary: s.intelligence?.profileSummary,
            whatWorks: s.intelligence?.successPatterns?.slice(0, 2),
            concerns: s.intelligence?.objectionPatterns?.slice(0, 2),
            whatFails: s.intelligence?.failurePatterns?.slice(0, 2),
        };
    });

    const prompt = `You are a senior executive coach advising a leader preparing for a high-stakes meeting.

MEETING: "${meeting.title}"
${meeting.description ? `CONTEXT: ${meeting.description}` : ''}
${meeting.desiredOutcome ? `DESIRED OUTCOME: ${meeting.desiredOutcome}` : ''}
CATEGORY: ${meeting.meetingCategory || 'Unknown'}
DATE: ${meeting.startTime.toISOString()}

STAKEHOLDERS IN THE ROOM:
${JSON.stringify(stakeholderContext, null, 2)}

Generate a tactical influence plan. Return ONLY valid JSON with this structure:
{
  "roomTemperature": <0-1 float — overall likelihood of achieving desired outcome>,
  "roomRead": "<2-3 sentence narrative of the room dynamics — who has power, who's aligned, where the risk is>",
  "tacticalAdvice": "<3-4 sentences of specific tactical advice for this meeting>",
  "influenceSteps": [
    {
      "action": "<specific action to take>",
      "stakeholderName": "<who this action targets>",
      "timing": "before|during|after",
      "priority": "critical|important|nice-to-have"
    }
  ],
  "suggestedPreMeetings": [
    {
      "stakeholderName": "<name>",
      "reason": "<why meet them first>",
      "talkingPoints": ["<point 1>", "<point 2>"]
    }
  ]
}

Guidelines:
- Be specific and actionable, not generic. Reference people by name.
- Focus on political dynamics, not just content prep.
- If someone is a skeptic or hostile, suggest how to neutralize or bring them onside.
- If someone is a champion, suggest how to leverage them.
- Suggest pre-meetings only for people where it would meaningfully change the meeting outcome.
- Keep influence steps to 3-6 max. Quality over quantity.`;

    try {
        const config = await getUserLLMConfig(userId);
        const provider = createProvider(config);
        const response = await provider.generateText(prompt);

        // Parse LLM response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'Failed to generate plan — invalid response' }, { status: 500 });
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Map stakeholder names back to IDs for storage
        const nameToId = new Map(stakeholders.map(s => [s.name.toLowerCase(), s.id]));

        const roomRead = (parsed.influenceSteps || []).map((step: { stakeholderName?: string; [key: string]: unknown }) => {
            const stakeholderId = nameToId.get(step.stakeholderName?.toLowerCase() || '') || null;
            return { ...step, stakeholderId };
        });

        const suggestedMeetings = (parsed.suggestedPreMeetings || []).map((m: { stakeholderName?: string; [key: string]: unknown }) => {
            const stakeholderId = nameToId.get(m.stakeholderName?.toLowerCase() || '') || null;
            return { ...m, stakeholderId, status: 'pending' };
        });

        // Upsert influence plan
        const plan = await prisma.influencePlan.upsert({
            where: { meetingId },
            create: {
                userId,
                meetingId,
                roomTemperature: parsed.roomTemperature || 0.5,
                roomRead: { narrative: parsed.roomRead, stakeholders: roomRead },
                tacticalAdvice: parsed.tacticalAdvice,
                influenceSteps: parsed.influenceSteps || [],
                suggestedMeetings: suggestedMeetings,
                status: 'active',
            },
            update: {
                roomTemperature: parsed.roomTemperature || 0.5,
                roomRead: { narrative: parsed.roomRead, stakeholders: roomRead },
                tacticalAdvice: parsed.tacticalAdvice,
                influenceSteps: parsed.influenceSteps || [],
                suggestedMeetings: suggestedMeetings,
                updatedAt: new Date(),
            },
        });

        return NextResponse.json({ plan });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[InfluencePlan] Generation failed:', message);
        return NextResponse.json({ error: `Failed to generate plan: ${message}` }, { status: 500 });
    }
}
