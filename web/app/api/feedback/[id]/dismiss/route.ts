import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/feedback/[id]/dismiss - Dismiss feedback
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const feedback = await prisma.feedbackItem.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!feedback) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    await prisma.feedbackItem.update({
      where: { id },
      data: {
        status: 'DISMISSED',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to dismiss feedback:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss feedback' },
      { status: 500 }
    );
  }
}
