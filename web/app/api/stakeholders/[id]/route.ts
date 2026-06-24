import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stakeholders/[id] - Full stakeholder profile with intelligence + outcome history
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const stakeholder = await prisma.stakeholderProfile.findFirst({
            where: { id, userId },
            include: {
                intelligence: true,
            },
        });

        if (!stakeholder) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Get outcome history: meetings where this person was an attendee
        const meetingsWithOutcomes = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                outcomeResult: { not: null },
                OR: [
                    ...(stakeholder.email
                        ? [{ attendees: { string_contains: stakeholder.email } }]
                        : []),
                    { title: { contains: stakeholder.name.split(' ')[0], mode: 'insensitive' as const } },
                ],
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                outcomeResult: true,
                desiredOutcome: true,
                outcome: true,
                meetingCategory: true,
                conversationOutcome: {
                    select: {
                        whatWorked: true,
                        whatFailed: true,
                        surprises: true,
                        aiInsights: true,
                        suggestedImprovements: true,
                    },
                },
            },
            orderBy: { startTime: 'desc' },
            take: 15,
        });

        const outcomeStats = {
            total: meetingsWithOutcomes.length,
            landed: meetingsWithOutcomes.filter(m => m.outcomeResult === 'LANDED').length,
            partial: meetingsWithOutcomes.filter(m => m.outcomeResult === 'PARTIAL').length,
            missed: meetingsWithOutcomes.filter(m => m.outcomeResult === 'MISSED').length,
        };

        // Get recent meetings (with or without outcomes) — last 10
        const recentMeetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                OR: [
                    ...(stakeholder.email
                        ? [{ attendees: { string_contains: stakeholder.email } }]
                        : []),
                    { title: { contains: stakeholder.name.split(' ')[0], mode: 'insensitive' as const } },
                ],
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                endTime: true,
                outcomeResult: true,
                desiredOutcome: true,
                outcome: true,
                meetingCategory: true,
                followUps: true,
                conversationOutcome: {
                    select: {
                        whatWorked: true,
                        whatFailed: true,
                        surprises: true,
                        aiInsights: true,
                        suggestedImprovements: true,
                    },
                },
            },
            orderBy: { startTime: 'desc' },
            take: 10,
        });

        // Get commitments involving this person
        const commitments = await prisma.meetingCommitment.findMany({
            where: {
                userId,
                owner: { contains: stakeholder.name.split(' ')[0], mode: 'insensitive' },
            },
            select: {
                id: true,
                description: true,
                owner: true,
                dueDate: true,
                status: true,
                meeting: { select: { title: true, startTime: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        // Archetype playbook
        const archetypePlaybook = getArchetypePlaybook(stakeholder.personaArchetype);

        return NextResponse.json({
            stakeholder: {
                id: stakeholder.id,
                name: stakeholder.name,
                email: stakeholder.email,
                role: stakeholder.role,
                organization: stakeholder.organization,
                powerLevel: stakeholder.powerLevel,
                influenceRole: stakeholder.influenceRole,
                politicalStance: stakeholder.politicalStance,
                personaArchetype: stakeholder.personaArchetype,
                communicationStyle: stakeholder.communicationStyle,
                decisionStyle: stakeholder.decisionStyle,
                riskTolerance: stakeholder.riskTolerance,
                primaryMotivation: stakeholder.primaryMotivation,
                fears: stakeholder.fears,
                relationshipStrength: stakeholder.relationshipStrength,
                isImportant: stakeholder.isImportant,
                userNotes: stakeholder.userNotes,
                archetype: stakeholder.archetype, // relationship type
                enrichedAt: stakeholder.enrichedAt,
                enrichmentSource: stakeholder.enrichmentSource,
                linkedinUrl: stakeholder.linkedinUrl,
                linkedinHeadline: stakeholder.linkedinHeadline,
                linkedinSummary: stakeholder.linkedinSummary,
                recentPublicActivity: stakeholder.recentPublicActivity,
                externalIntel: stakeholder.externalIntel,
                companyDescription: stakeholder.companyDescription,
            },
            intelligence: stakeholder.intelligence
                ? {
                    profileSummary: stakeholder.intelligence.profileSummary,
                    successPatterns: stakeholder.intelligence.successPatterns,
                    failurePatterns: stakeholder.intelligence.failurePatterns,
                    objectionPatterns: stakeholder.intelligence.objectionPatterns,
                    recentTopics: stakeholder.intelligence.recentTopics,
                    currentMood: stakeholder.intelligence.currentMood,
                    decisionMakingNotes: stakeholder.intelligence.decisionMakingNotes,
                    evidenceCount: stakeholder.intelligence.evidenceCount,
                    lastRefreshedAt: stakeholder.intelligence.lastRefreshedAt,
                }
                : null,
            archetypePlaybook,
            outcomeStats,
            meetingHistory: meetingsWithOutcomes.map(m => ({
                id: m.id,
                title: m.title,
                date: m.startTime,
                outcomeResult: m.outcomeResult,
                desiredOutcome: m.desiredOutcome,
                outcome: m.outcome,
                category: m.meetingCategory,
                review: m.conversationOutcome || null,
            })),
            recentMeetings: recentMeetings.map(m => ({
                id: m.id,
                title: m.title,
                date: m.startTime,
                endTime: m.endTime,
                outcomeResult: m.outcomeResult,
                desiredOutcome: m.desiredOutcome,
                outcome: m.outcome,
                category: m.meetingCategory,
                followUps: m.followUps,
                review: m.conversationOutcome || null,
            })),
            commitments,
        });
    } catch (error: any) {
        console.error('[StakeholderProfile]', error.message);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

function getArchetypePlaybook(archetype: string | null): {
    label: string; brief: string; doThis: string; dontDoThis: string;
} | null {
    if (!archetype) return null;
    const playbooks: Record<string, { label: string; brief: string; doThis: string; dontDoThis: string }> = {
        DRIVER: { label: 'Driver', brief: 'Results-first, decisive, impatient with process', doThis: 'Lead with outcomes, be concise, show ROI', dontDoThis: 'Ramble, bury the ask, bring problems without solutions' },
        ANALYST: { label: 'Analyst', brief: 'Data-driven, methodical, cautious about claims', doThis: 'Bring evidence, give them time to process, be precise', dontDoThis: 'Use vague claims, rush decisions, skip the details' },
        COLLABORATOR: { label: 'Collaborator', brief: 'Consensus-seeking, values inclusion and harmony', doThis: 'Include them early, validate input, build agreement', dontDoThis: 'Steamroll, decide without consulting, create us-vs-them' },
        VISIONARY: { label: 'Visionary', brief: 'Big-picture thinker, inspired by possibility', doThis: 'Connect to vision, show long-term impact, be bold', dontDoThis: 'Get lost in minutiae, focus only on risks, be incremental' },
        GUARDIAN: { label: 'Guardian', brief: 'Risk-averse, protective of team and process', doThis: 'Show safety nets, propose incremental steps, respect tradition', dontDoThis: 'Propose radical change, dismiss concerns, move too fast' },
        POLITICIAN: { label: 'Politician', brief: 'Influence-driven, strategic, reads the room', doThis: 'Understand their agenda, find mutual wins, give them credit', dontDoThis: 'Challenge publicly, ignore their network, be naive about motives' },
        CHAMPION: { label: 'Champion', brief: 'Enthusiastic advocate, amplifies what they believe in', doThis: 'Give them something to champion, share early, offer public credit', dontDoThis: 'Keep them out of the loop, be cynical, undermine enthusiasm' },
        PRAGMATIST: { label: 'Pragmatist', brief: 'Practical, ROI-focused, wants concrete next steps', doThis: 'Show ROI, be specific about timelines, start small', dontDoThis: 'Be abstract, promise the moon, skip implementation details' },
        SKEPTIC: { label: 'Skeptic', brief: 'Questions everything, needs proof before commitment', doThis: 'Welcome objections, provide evidence, earn trust gradually', dontDoThis: 'Dismiss concerns, ask for blind trust, take shortcuts' },
        CONSERVATIVE: { label: 'Conservative', brief: 'Values stability, prefers proven approaches', doThis: 'Change slowly, show precedent, respect what exists', dontDoThis: 'Propose disruption, dismiss history, force urgency' },
        OPERATOR: { label: 'Operator', brief: 'Process-focused, reliable, detail-oriented', doThis: 'Be structured, respect their systems, follow up in writing', dontDoThis: 'Be disorganized, skip steps, change plans frequently' },
    };
    return playbooks[archetype] || null;
}
