import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const entity = await prisma.knowledgeEntity.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        type: true,
        properties: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    // All facts where this entity is subject or object
    const [subjectFacts, objectFacts] = await Promise.all([
      prisma.knowledgeFact.findMany({
        where: { subjectId: id, userId },
        orderBy: { confidence: 'desc' },
        select: {
          id: true,
          predicate: true,
          objectEntityId: true,
          objectEntity: { select: { id: true, name: true, type: true } },
          objectValue: true,
          confidence: true,
          source: true,
          validFrom: true,
          validTo: true,
          userVerified: true,
        },
      }),
      prisma.knowledgeFact.findMany({
        where: { objectEntityId: id, userId },
        orderBy: { confidence: 'desc' },
        select: {
          id: true,
          predicate: true,
          subjectId: true,
          subject: { select: { id: true, name: true, type: true } },
          objectValue: true,
          confidence: true,
          source: true,
          validFrom: true,
          validTo: true,
          userVerified: true,
        },
      }),
    ]);

    const facts = [
      ...subjectFacts.map((f) => ({
        id: f.id,
        predicate: f.predicate,
        objectEntity: f.objectEntity,
        objectValue: f.objectValue,
        confidence: f.confidence,
        source: f.source,
        validFrom: f.validFrom,
        validTo: f.validTo,
        userVerified: f.userVerified,
        direction: 'outgoing' as const,
      })),
      ...objectFacts.map((f) => ({
        id: f.id,
        predicate: f.predicate,
        objectEntity: f.subject,
        objectValue: f.objectValue,
        confidence: f.confidence,
        source: f.source,
        validFrom: f.validFrom,
        validTo: f.validTo,
        userVerified: f.userVerified,
        direction: 'incoming' as const,
      })),
    ];

    // Communities
    const memberships = await prisma.communityMember.findMany({
      where: { entityId: id, community: { userId } },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            summary: true,
            entityCount: true,
          },
        },
      },
    });

    const communities = memberships.map((m) => ({
      id: m.community.id,
      name: m.community.name,
      summary: m.community.summary,
      role: m.role,
      entityCount: m.community.entityCount,
    }));

    // Related entities (connected via shared facts)
    const relatedEntityIds = new Set<string>();
    subjectFacts.forEach((f) => {
      if (f.objectEntityId) relatedEntityIds.add(f.objectEntityId);
    });
    objectFacts.forEach((f) => {
      relatedEntityIds.add(f.subjectId);
    });
    relatedEntityIds.delete(id);

    const relatedEntities = relatedEntityIds.size > 0
      ? await prisma.knowledgeEntity.findMany({
          where: { id: { in: Array.from(relatedEntityIds) }, userId },
          select: { id: true, name: true, type: true },
        })
      : [];

    return NextResponse.json({
      entity,
      facts,
      communities,
      relatedEntities,
    });
  } catch (error) {
    console.error('[KNOWLEDGE_ENTITY_DETAIL_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch entity' }, { status: 500 });
  }
}
