import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/capacities/scores
 * 
 * Fetch capacity scores for the current user
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scores = await prisma.capacityScore.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        capacity: {
          select: {
            slug: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: {
        score: 'desc',
      },
    });

    return NextResponse.json({ scores });
  } catch (error) {
    console.error('Failed to fetch capacity scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch capacity scores' },
      { status: 500 }
    );
  }
}
