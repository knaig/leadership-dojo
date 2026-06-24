import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/entities/merge-candidates
 * Returns pending entity merge candidates for user review.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const candidates = await prisma.entityMergeCandidate.findMany({
        where: { userId, status: 'pending' },
        orderBy: { similarity: 'desc' },
        take: 20,
    });

    // Enrich with entity names
    const entityIds = [...new Set(candidates.flatMap(c => [c.sourceEntityId, c.targetEntityId]))];
    const entities = await prisma.knowledgeEntity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, name: true, type: true, nameNormalized: true },
    });
    const entityMap = new Map(entities.map(e => [e.id, e]));

    const enriched = candidates.map(c => ({
        id: c.id,
        source: entityMap.get(c.sourceEntityId) || null,
        target: entityMap.get(c.targetEntityId) || null,
        similarity: c.similarity,
        createdAt: c.createdAt,
    }));

    return NextResponse.json({ candidates: enriched });
}

/**
 * POST /api/entities/merge-candidates
 * Body: { id: string, action: 'confirm' | 'reject' }
 *
 * Confirm merges the source entity into the target (updates all facts).
 * Reject dismisses the suggestion.
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { id, action } = body as { id?: string; action?: string };

    if (!id || !['confirm', 'reject'].includes(action || '')) {
        return NextResponse.json({ error: 'Invalid request. Need id and action (confirm/reject).' }, { status: 400 });
    }

    const candidate = await prisma.entityMergeCandidate.findFirst({
        where: { id, userId, status: 'pending' },
    });

    if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    if (action === 'reject') {
        await prisma.entityMergeCandidate.update({
            where: { id },
            data: { status: 'rejected', resolvedAt: new Date() },
        });
        return NextResponse.json({ status: 'rejected' });
    }

    // Confirm: merge source into target
    // 1. Update all facts pointing to source entity
    await prisma.knowledgeFact.updateMany({
        where: { subjectId: candidate.sourceEntityId },
        data: { subjectId: candidate.targetEntityId },
    });
    await prisma.knowledgeFact.updateMany({
        where: { objectEntityId: candidate.sourceEntityId },
        data: { objectEntityId: candidate.targetEntityId },
    });

    // 2. Update community memberships
    await prisma.communityMember.updateMany({
        where: { entityId: candidate.sourceEntityId },
        data: { entityId: candidate.targetEntityId },
    }).catch(() => {}); // Might fail on unique constraint — that's fine

    // 3. Delete the duplicate entity
    await prisma.knowledgeEntity.delete({
        where: { id: candidate.sourceEntityId },
    }).catch(() => {});

    // 4. Mark candidate as confirmed
    await prisma.entityMergeCandidate.update({
        where: { id },
        data: { status: 'confirmed', resolvedAt: new Date() },
    });

    // 5. Also dismiss any other candidates involving the deleted entity
    await prisma.entityMergeCandidate.updateMany({
        where: {
            OR: [
                { sourceEntityId: candidate.sourceEntityId },
                { targetEntityId: candidate.sourceEntityId },
            ],
            status: 'pending',
        },
        data: { status: 'rejected', resolvedAt: new Date() },
    });

    return NextResponse.json({ status: 'confirmed' });
}
