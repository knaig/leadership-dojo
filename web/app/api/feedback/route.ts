import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { FeedbackStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/feedback - Get user's feedback items
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.log('[API] Feedback check: No user session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`[API] Fetching feedback for user: ${session.user.id}`);

    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (statusParam) {
      const statuses = statusParam.split(',') as FeedbackStatus[];
      where.status = { in: statuses };
    }

    const feedback = await prisma.feedbackItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    console.log(`[API] Returning ${feedback.length} feedback items`);

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('Failed to fetch feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}
