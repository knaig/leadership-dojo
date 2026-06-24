import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/observations - Get user's observations
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const capacitySlug = searchParams.get('capacity');

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (capacitySlug) {
      where.capacity = { slug: capacitySlug };
    }

    const observations = await prisma.skillObservation.findMany({
      where,
      include: {
        capacity: {
          select: {
            slug: true,
            name: true,
          },
        },
        artifact: {
          select: {
            title: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ observations });
  } catch (error) {
    console.error('Failed to fetch observations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch observations' },
      { status: 500 }
    );
  }
}
