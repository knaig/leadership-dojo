import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stakeholders/[id]/enrich
 * Trigger external enrichment for a stakeholder (LinkedIn, web search).
 * Queues a background job via pg-boss for the worker to process.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: stakeholderId } = await params;

    const stakeholder = await prisma.stakeholderProfile.findFirst({
        where: { id: stakeholderId, userId },
        select: { id: true, name: true, email: true, enrichedAt: true },
    });

    if (!stakeholder) {
        return NextResponse.json({ error: 'Stakeholder not found' }, { status: 404 });
    }

    // Check if recently enriched (skip if less than 7 days ago)
    if (stakeholder.enrichedAt) {
        const daysSince = (Date.now() - stakeholder.enrichedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSince < 7) {
            return NextResponse.json({
                status: 'recent',
                message: `Profile was enriched ${Math.floor(daysSince)} days ago. Enrichment is fresh.`,
                enrichedAt: stakeholder.enrichedAt,
            });
        }
    }

    // Queue enrichment job for worker (existing stakeholder-enrichment-agent)
    // The worker picks this up via pg-boss
    try {
        // Use the existing enrichment trigger — create a message that the worker monitors
        await prisma.message.create({
            data: {
                userId,
                role: 'system',
                content: JSON.stringify({
                    type: 'ENRICH_STAKEHOLDER',
                    stakeholderId: stakeholder.id,
                    name: stakeholder.name,
                    email: stakeholder.email,
                }),
                type: 'SYSTEM',
            },
        });

        return NextResponse.json({
            status: 'queued',
            message: `Enrichment queued for ${stakeholder.name}. Results will appear shortly.`,
        });
    } catch (error) {
        console.error('[Enrich] Failed to queue enrichment:', error);
        return NextResponse.json({ error: 'Failed to queue enrichment' }, { status: 500 });
    }
}

/**
 * GET /api/stakeholders/[id]/enrich
 * Get enrichment status and results for a stakeholder.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: stakeholderId } = await params;

    const stakeholder = await prisma.stakeholderProfile.findFirst({
        where: { id: stakeholderId, userId },
        select: {
            id: true,
            name: true,
            linkedinUrl: true,
            linkedinHeadline: true,
            linkedinSummary: true,
            recentPublicActivity: true,
            externalIntel: true,
            companyDescription: true,
            enrichedAt: true,
            enrichmentSource: true,
            intelligence: {
                select: {
                    profileSummary: true,
                    successPatterns: true,
                    failurePatterns: true,
                    objectionPatterns: true,
                    recentTopics: true,
                },
            },
        },
    });

    if (!stakeholder) {
        return NextResponse.json({ error: 'Stakeholder not found' }, { status: 404 });
    }

    return NextResponse.json({
        ...stakeholder,
        hasExternalIntel: !!(stakeholder.linkedinHeadline || stakeholder.recentPublicActivity || stakeholder.externalIntel),
    });
}
