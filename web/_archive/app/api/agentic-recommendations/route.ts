import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { generateRecommendations, buildUserContext } from '@/lib/agentic-coach';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has agentic coach access
    if (!user.subscription?.hasAgenticCoach) {
      return NextResponse.json(
        {
          error: 'Agentic coach requires Enterprise plan',
          upgrade: true,
        },
        { status: 403 }
      );
    }

    // Generate personalized recommendations
    const recommendations = await generateRecommendations(user.id);

    return NextResponse.json({ recommendations });
  } catch (error: any) {
    console.error('Agentic recommendations error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate recommendations' },
      { status: 500 }
    );
  }
}

// Get user context (without AI recommendations)
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const context = await buildUserContext(user.id);

    return NextResponse.json({ context });
  } catch (error: any) {
    console.error('User context error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to build user context' },
      { status: 500 }
    );
  }
}
