import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/voice/personal-context
 * Fetch what Mira knows about the user (the "Honest Mirror").
 * Shows personal context + relationship strength metrics.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [personal, business, stakeholderCount, insightCount] = await Promise.all([
        prisma.personalContext.findUnique({
            where: { userId },
        }),
        prisma.businessContext.findUnique({
            where: { userId },
            select: {
                strengths: true,
                blindSpots: true,
                communicationStyle: true,
                decisionPatterns: true,
                businessModel: true,
                teamSize: true,
                directReports: true,
                reportingTo: true,
                currentChallenges: true,
                strategicPriorities: true,
            },
        }),
        prisma.stakeholderProfile.count({ where: { userId } }),
        prisma.conversationInsight.count({ where: { userId } }),
    ]);

    // Calculate what Mira knows vs doesn't know
    const knownAreas: string[] = [];
    const gapAreas: string[] = [];

    // Work context checks
    if (business?.businessModel) knownAreas.push('Business model');
    else gapAreas.push('Business model');

    if (business?.currentChallenges?.length) knownAreas.push('Current challenges');
    else gapAreas.push('Current challenges');

    if (business?.strategicPriorities?.length) knownAreas.push('Strategic priorities');
    else gapAreas.push('Strategic priorities');

    if (business?.strengths?.length) knownAreas.push('Your strengths');
    else gapAreas.push('Your strengths');

    if (business?.blindSpots?.length) knownAreas.push('Growth areas');
    else gapAreas.push('Growth areas');

    if (business?.communicationStyle) knownAreas.push('Communication style');
    else gapAreas.push('Communication style');

    if (business?.reportingTo) knownAreas.push('Reporting structure');
    else gapAreas.push('Reporting structure');

    if (stakeholderCount >= 5) knownAreas.push(`${stakeholderCount} stakeholders mapped`);
    else gapAreas.push('Key stakeholders');

    // Personal context checks
    if (personal?.energyPatterns) knownAreas.push('Energy patterns');
    if (personal?.interests?.length) knownAreas.push('Personal interests');
    if (personal?.stressSignals) knownAreas.push('Stress signals');
    if (personal?.preferredCallStyle) knownAreas.push('Call preferences');

    // Relationship strength score (0-100)
    const maxScore = 15; // total possible known areas
    const score = Math.round((knownAreas.length / maxScore) * 100);

    return NextResponse.json({
        personal: personal || null,
        relationship: {
            score,
            callCount: personal?.callCount || 0,
            totalMinutes: personal?.totalCallMinutes || 0,
            firstCall: personal?.firstCallDate || null,
            lastCall: personal?.lastCallDate || null,
            knownAreas,
            gapAreas,
            stakeholderCount,
            insightCount,
        },
    });
}

/**
 * PATCH /api/voice/personal-context
 * User updates what Mira remembers about them.
 * Each field is opt-in — user controls what's stored.
 */
export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // Only allow updating personal fields, not relationship metrics
    const allowedFields = [
        'energyPatterns', 'interests', 'stressSignals', 'values',
        'personalWins', 'preferredCallStyle', 'humorReceptivity',
        'commuteInfo', 'knownTopics', 'gapTopics',
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
        if (field in body) {
            data[field] = body[field];
        }
    }

    const result = await prisma.personalContext.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
    });

    return NextResponse.json(result);
}

/**
 * DELETE /api/voice/personal-context
 * User can delete specific personal fields or all personal data.
 * Work context (BusinessContext, stakeholders) is NOT affected.
 */
export async function DELETE(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { fields } = body as { fields?: string[] };

    if (fields && fields.length > 0) {
        // Delete specific fields by setting them to null/empty
        const data: Record<string, unknown> = {};
        for (const field of fields) {
            if (['energyPatterns', 'stressSignals', 'preferredCallStyle', 'humorReceptivity', 'commuteInfo'].includes(field)) {
                data[field] = null;
            } else if (['interests', 'values', 'knownTopics', 'gapTopics'].includes(field)) {
                data[field] = [];
            } else if (field === 'personalWins') {
                data[field] = null;
            }
        }

        await prisma.personalContext.update({
            where: { userId },
            data,
        });

        return NextResponse.json({ ok: true, cleared: fields });
    }

    // Delete ALL personal data (keep relationship metrics)
    await prisma.personalContext.update({
        where: { userId },
        data: {
            energyPatterns: null,
            interests: [],
            stressSignals: null,
            values: [],
            personalWins: null,
            preferredCallStyle: null,
            humorReceptivity: 'unknown',
            commuteInfo: null,
            knownTopics: [],
            gapTopics: [],
        },
    });

    return NextResponse.json({ ok: true, cleared: 'all personal data' });
}
