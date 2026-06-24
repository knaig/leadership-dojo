import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { KnowledgeEntityType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as KnowledgeEntityType | null;
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: any = { userId };
    if (type) where.type = type;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [entities, total] = await Promise.all([
      prisma.knowledgeEntity.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          subjectFacts: {
            where: { validTo: null },
            orderBy: { confidence: 'desc' },
            take: 3,
            select: {
              id: true,
              predicate: true,
              objectValue: true,
              confidence: true,
              source: true,
              objectEntity: { select: { id: true, name: true } },
            },
          },
          objectFacts: {
            where: { validTo: null },
            select: { id: true },
          },
          _count: {
            select: {
              subjectFacts: true,
              objectFacts: true,
            },
          },
          communityMemberships: {
            include: {
              community: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.knowledgeEntity.count({ where }),
    ]);

    const result = entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      properties: e.properties,
      factCount: e._count.subjectFacts + e._count.objectFacts,
      topFacts: e.subjectFacts.map((f) => ({
        id: f.id,
        predicate: f.predicate,
        objectValue: f.objectValue,
        objectEntityName: f.objectEntity?.name,
        confidence: f.confidence,
        source: f.source,
      })),
      communities: e.communityMemberships.map((m) => ({
        id: m.community.id,
        name: m.community.name,
      })),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return NextResponse.json({ entities: result, total });
  } catch (error) {
    console.error('[KNOWLEDGE_ENTITIES_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 });
  }
}
