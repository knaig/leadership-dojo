import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stakeholders/relationships
 * Relationship health dashboard — all stakeholders sorted by health signals.
 * Powers the relationship intelligence view.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId, mergedIntoId: null },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            organization: true,
            powerLevel: true,
            influenceRole: true,
            politicalStance: true,
            personaArchetype: true,
            relationshipStrength: true,
            lastInteraction: true,
            interactionCount: true,
            isImportant: true,
            linkedinHeadline: true,
            enrichedAt: true,
            intelligence: {
                select: {
                    profileSummary: true,
                    currentMood: true,
                    objectionPatterns: true,
                    successPatterns: true,
                },
            },
        },
        orderBy: [
            { isImportant: 'desc' },
            { powerLevel: 'asc' }, // HIGH first
            { lastInteraction: 'asc' }, // Oldest first (most stale)
        ],
    });

    const now = Date.now();

    const enriched = stakeholders.map(s => {
        const daysSinceContact = s.lastInteraction
            ? Math.floor((now - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
            : null;

        const isImportant = s.isImportant || s.powerLevel === 'HIGH' || s.influenceRole === 'DECISION_MAKER';
        const isStale = daysSinceContact !== null && daysSinceContact > (isImportant ? 14 : 30);

        // Trend: improving if recent interactions, declining if stale
        let trend: 'improving' | 'stable' | 'declining' = 'stable';
        if (isStale) trend = 'declining';
        else if (daysSinceContact !== null && daysSinceContact < 7 && s.interactionCount > 3) trend = 'improving';

        return {
            ...s,
            daysSinceContact,
            isStale,
            trend,
            lastInteraction: s.lastInteraction?.toISOString() || null,
        };
    });

    // Summary stats
    const stats = {
        total: enriched.length,
        healthy: enriched.filter(s => s.relationshipStrength >= 0.6 && !s.isStale).length,
        stale: enriched.filter(s => s.isStale).length,
        unknown: enriched.filter(s => s.politicalStance === 'UNKNOWN' || s.politicalStance === null).length,
        champions: enriched.filter(s => s.politicalStance === 'CHAMPION').length,
        skeptics: enriched.filter(s => s.politicalStance === 'SKEPTIC' || s.politicalStance === 'HOSTILE').length,
        needsEnrichment: enriched.filter(s => !s.enrichedAt && (s.isImportant || s.powerLevel === 'HIGH')).length,
    };

    return NextResponse.json({
        stakeholders: enriched,
        stats,
    });
}
