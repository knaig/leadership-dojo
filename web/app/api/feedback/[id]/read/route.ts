import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/feedback/[id]/read - Mark feedback as read
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
        status: 'READ',
        readAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to mark feedback as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark feedback as read' },
      { status: 500 }
    );
  }
}
