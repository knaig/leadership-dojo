import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import type { PersonaArchetype, PoliticalStance, PowerLevel, InfluenceRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface RoomReadStakeholder {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    stance: PoliticalStance | null;
    influence: InfluenceRole | null;
    powerLevel: PowerLevel | null;
    archetype: PersonaArchetype | null;
    relationshipStrength: number;
    lastInteraction: string | null;
    daysSinceContact: number | null;
    isStale: boolean;
    concerns: string[];
    whatWorks: string[];
    linkedinHeadline: string | null;
    recentPublicActivity: string | null;
    briefTip: string | null; // One-liner coaching tip for this person
}

interface RoomRead {
    meetingId: string;
    meetingTitle: string;
    startTime: string;
    stakeholders: RoomReadStakeholder[];
    roomTemperature: number; // 0-1 aggregate confidence
    tacticalAdvice: string | null;
    suggestedPreMeetings: { stakeholderId: string; name: string; reason: string }[];
    existingPlan: boolean;
}

/**
 * GET /api/meetings/[id]/room-read
 * Build a Room Read for a meeting — who's in the room, stances, tactical advice.
 * This is the core Ground Game feature.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: meetingId } = await params;

    const meeting = await prisma.meetingSyncRecord.findUnique({
        where: { id: meetingId, userId },
        select: {
            id: true,
            title: true,
            startTime: true,
            participants: true,
            desiredOutcome: true,
            meetingCategory: true,
            influencePlan: { select: { id: true, roomTemperature: true, tacticalAdvice: true, roomRead: true, suggestedMeetings: true } },
        },
    });

    if (!meeting) {
        return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const participants = (meeting.participants || []) as string[];
    if (participants.length < 2) {
        return NextResponse.json({ stakeholders: [], roomTemperature: 0.5, suggestedPreMeetings: [] });
    }

    // Get all stakeholder profiles for participants
    const profiles = await prisma.stakeholderProfile.findMany({
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
            interactionCount: true,
            communicationStyle: true,
            primaryMotivation: true,
            fears: true,
            linkedinHeadline: true,
            recentPublicActivity: true,
            intelligence: {
                select: {
                    profileSummary: true,
                    successPatterns: true,
                    failurePatterns: true,
                    objectionPatterns: true,
                    currentMood: true,
                },
            },
        },
    });

    const now = Date.now();

    const stakeholders: RoomReadStakeholder[] = profiles.map(p => {
        const daysSinceContact = p.lastInteraction
            ? Math.floor((now - p.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
            : null;

        // Stale if important person hasn't been contacted in 14+ days
        const isImportant = p.powerLevel === 'HIGH' || p.influenceRole === 'DECISION_MAKER' || p.influenceRole === 'KEY_INFLUENCER';
        const isStale = daysSinceContact !== null && daysSinceContact > (isImportant ? 14 : 30);

        // Build one-liner tip based on archetype and patterns
        const briefTip = buildBriefTip(p);

        return {
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role,
            stance: p.politicalStance,
            influence: p.influenceRole,
            powerLevel: p.powerLevel,
            archetype: p.personaArchetype,
            relationshipStrength: p.relationshipStrength,
            lastInteraction: p.lastInteraction?.toISOString() || null,
            daysSinceContact,
            isStale,
            concerns: p.intelligence?.objectionPatterns || [],
            whatWorks: p.intelligence?.successPatterns || [],
            linkedinHeadline: p.linkedinHeadline,
            recentPublicActivity: p.recentPublicActivity,
            briefTip,
        };
    });

    // Sort: decision-makers first, then by power level, then by staleness
    stakeholders.sort((a, b) => {
        const influenceOrder: Record<string, number> = { DECISION_MAKER: 0, KEY_INFLUENCER: 1, INFLUENCER: 2, OBSERVER: 3, UNKNOWN: 4 };
        const aOrder = influenceOrder[a.influence || 'UNKNOWN'] ?? 4;
        const bOrder = influenceOrder[b.influence || 'UNKNOWN'] ?? 4;
        if (aOrder !== bOrder) return aOrder - bOrder;
        if (a.isStale && !b.isStale) return -1;
        return 0;
    });

    // Calculate room temperature
    const roomTemperature = calculateRoomTemperature(stakeholders);

    // Suggest pre-meetings for stale or unknown-stance key people
    const suggestedPreMeetings = stakeholders
        .filter(s =>
            (s.isStale || s.stance === 'UNKNOWN' || s.stance === 'SKEPTIC' || s.stance === 'HOSTILE') &&
            (s.powerLevel === 'HIGH' || s.influence === 'DECISION_MAKER' || s.influence === 'KEY_INFLUENCER')
        )
        .slice(0, 3)
        .map(s => ({
            stakeholderId: s.id,
            name: s.name,
            reason: s.isStale
                ? `No contact in ${s.daysSinceContact} days — unclear where they stand`
                : s.stance === 'SKEPTIC' || s.stance === 'HOSTILE'
                    ? `Currently ${s.stance?.toLowerCase()} — address concerns before the group meeting`
                    : `Unknown stance — get a read before the meeting`,
        }));

    // Build tactical advice if we have enough data
    const tacticalAdvice = buildTacticalAdvice(stakeholders, meeting.desiredOutcome);

    // Return existing influence plan data if it exists, merged with fresh Room Read
    const roomRead: RoomRead = {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        startTime: meeting.startTime.toISOString(),
        stakeholders,
        roomTemperature: meeting.influencePlan?.roomTemperature ?? roomTemperature,
        tacticalAdvice: meeting.influencePlan?.tacticalAdvice ?? tacticalAdvice,
        suggestedPreMeetings,
        existingPlan: !!meeting.influencePlan,
    };

    return NextResponse.json(roomRead);
}

// ── Helpers ──

function calculateRoomTemperature(stakeholders: RoomReadStakeholder[]): number {
    if (stakeholders.length === 0) return 0.5;

    const keyPeople = stakeholders.filter(s =>
        s.powerLevel === 'HIGH' || s.influence === 'DECISION_MAKER' || s.influence === 'KEY_INFLUENCER'
    );

    const toScore = (s: RoomReadStakeholder): number => {
        const stanceScores: Record<string, number> = {
            CHAMPION: 1.0, SUPPORTIVE: 0.75, NEUTRAL: 0.5, SKEPTIC: 0.25, HOSTILE: 0.0, UNKNOWN: 0.4,
        };
        return stanceScores[s.stance || 'UNKNOWN'] ?? 0.4;
    };

    const people = keyPeople.length > 0 ? keyPeople : stakeholders;
    const avgScore = people.reduce((sum, s) => sum + toScore(s), 0) / people.length;

    return Math.round(avgScore * 100) / 100;
}

function buildBriefTip(p: {
    personaArchetype: PersonaArchetype | null;
    primaryMotivation: string | null;
    fears: string[];
    intelligence: { successPatterns: string[]; objectionPatterns: string[]; currentMood: string | null } | null;
}): string | null {
    const archetype = p.personaArchetype;
    if (!archetype) return null;

    const archetypeTips: Record<string, string> = {
        DRIVER: 'Lead with outcomes, not process. Be direct.',
        ANALYST: 'Lead with data, then narrative. Give them time to process.',
        COLLABORATOR: 'Seek their input early. Frame as "together."',
        VISIONARY: 'Connect to the big picture. Don\'t lead with details.',
        GUARDIAN: 'Address risks upfront. Show you\'ve thought about what could go wrong.',
        POLITICIAN: 'Build private alignment before the group. They rarely show their hand publicly.',
        CHAMPION: 'They\'re your ally. Brief them so they can advocate effectively.',
        PRAGMATIST: 'Show it works. Case studies, precedents, proven approaches.',
        SKEPTIC: 'Acknowledge their concerns first, then present evidence.',
        CONSERVATIVE: 'Minimize disruption. Frame change as evolution, not revolution.',
        OPERATOR: 'Focus on execution. They care about feasibility, not vision.',
    };

    const baseTip = archetypeTips[archetype] || null;

    // Enrich with specific patterns if available
    if (p.intelligence?.objectionPatterns?.length) {
        const concern = p.intelligence.objectionPatterns[0];
        return baseTip ? `${baseTip} Watch for: "${concern}"` : `Watch for: "${concern}"`;
    }

    return baseTip;
}

function buildTacticalAdvice(stakeholders: RoomReadStakeholder[], desiredOutcome: string | null): string | null {
    const skeptics = stakeholders.filter(s => s.stance === 'SKEPTIC' || s.stance === 'HOSTILE');
    const champions = stakeholders.filter(s => s.stance === 'CHAMPION');
    const staleKeyPeople = stakeholders.filter(s => s.isStale && (s.powerLevel === 'HIGH' || s.influence === 'DECISION_MAKER'));

    const parts: string[] = [];

    if (staleKeyPeople.length > 0) {
        parts.push(`You haven't spoken to ${staleKeyPeople.map(s => s.name).join(' or ')} recently — get a read before this meeting.`);
    }

    if (skeptics.length > 0 && champions.length > 0) {
        parts.push(`${champions[0].name} is your ally — brief them to speak early. Address ${skeptics[0].name}'s concerns directly.`);
    } else if (skeptics.length > 0) {
        parts.push(`${skeptics[0].name} has concerns. Meet them beforehand or address their objections head-on.`);
    }

    if (desiredOutcome && parts.length === 0) {
        parts.push(`Your goal: "${desiredOutcome}". Make sure the key decision-maker knows this going in.`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
}
