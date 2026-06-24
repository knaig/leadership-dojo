import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch entities (nodes) — limit 200
    const entities = await prisma.knowledgeEntity.findMany({
      where: { userId },
      take: 200,
      orderBy: { updatedAt: 'desc' },
      include: {
        subjectFacts: { where: { validTo: null }, select: { id: true } },
        objectFacts: { where: { validTo: null }, select: { id: true } },
        communityMemberships: { select: { communityId: true } },
      },
    });

    // Fetch entity-to-entity facts (edges) — where objectEntityId is set and validTo is null
    const entityIds = entities.map((e) => e.id);
    const facts = await prisma.knowledgeFact.findMany({
      where: {
        userId,
        validTo: null,
        objectEntityId: { not: null },
        subjectId: { in: entityIds },
        objectEntity: { id: { in: entityIds } },
      },
      take: 500,
      orderBy: { confidence: 'desc' },
      select: {
        id: true,
        subjectId: true,
        objectEntityId: true,
        predicate: true,
        confidence: true,
        source: true,
        objectValue: true,
      },
    });

    // Counts for stats
    const [entityCount, factCount, communityCount] = await Promise.all([
      prisma.knowledgeEntity.count({ where: { userId } }),
      prisma.knowledgeFact.count({ where: { userId, validTo: null } }),
      prisma.knowledgeCommunity.count({ where: { userId } }),
    ]);

    const nodes = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      properties: e.properties,
      factCount: e.subjectFacts.length + e.objectFacts.length,
      communityIds: e.communityMemberships.map((m) => m.communityId),
      updatedAt: e.updatedAt,
    }));

    const edges = facts.map((f) => ({
      id: f.id,
      source: f.subjectId,
      target: f.objectEntityId!,
      predicate: f.predicate,
      confidence: f.confidence,
      factSource: f.source,
      objectValue: f.objectValue,
    }));

    return NextResponse.json({
      nodes,
      edges,
      stats: { entityCount, factCount, communityCount },
    });
  } catch (error) {
    console.error('[KNOWLEDGE_GRAPH_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch knowledge graph' }, { status: 500 });
  }
}
