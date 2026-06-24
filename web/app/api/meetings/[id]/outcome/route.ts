import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { desiredOutcome } = body;

    if (!desiredOutcome || typeof desiredOutcome !== 'string') {
      return NextResponse.json({ error: 'desiredOutcome is required' }, { status: 400 });
    }

    // Verify ownership
    const meeting = await prisma.meetingSyncRecord.findUnique({
      where: { id, userId }
    });

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Update outcome and lifecycle stage
    const updated = await prisma.meetingSyncRecord.update({
      where: { id },
      data: {
        desiredOutcome: desiredOutcome.trim(),
        lifecycleStage: (!meeting.lifecycleStage || meeting.lifecycleStage === 'OUTCOME_ASKED')
          ? 'OUTCOME_SET'
          : meeting.lifecycleStage
      }
    });

    return NextResponse.json({
      id: updated.id,
      desiredOutcome: updated.desiredOutcome,
      lifecycleStage: updated.lifecycleStage
    });
  } catch (error) {
    console.error('[Outcome API] Error:', error);
    return NextResponse.json({ error: 'Failed to save outcome' }, { status: 500 });
  }
}
