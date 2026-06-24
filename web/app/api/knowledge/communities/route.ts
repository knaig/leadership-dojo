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

    const communities = await prisma.knowledgeCommunity.findMany({
      where: { userId },
      orderBy: { activityScore: 'desc' },
      include: {
        members: {
          take: 5,
          orderBy: { weight: 'desc' },
          include: {
            entity: {
              select: { name: true, type: true },
            },
          },
        },
      },
    });

    const result = communities.map((c) => ({
      id: c.id,
      name: c.name,
      summary: c.summary,
      level: c.level,
      entityCount: c.entityCount,
      factCount: c.factCount,
      activityScore: c.activityScore,
      memberPreview: c.members.map((m) => ({
        name: m.entity.name,
        type: m.entity.type,
        role: m.role,
      })),
      lastAnalyzedAt: c.lastAnalyzedAt,
    }));

    return NextResponse.json({ communities: result });
  } catch (error) {
    console.error('[KNOWLEDGE_COMMUNITIES_GET]', error);
    return NextResponse.json({ error: 'Failed to fetch communities' }, { status: 500 });
  }
}
