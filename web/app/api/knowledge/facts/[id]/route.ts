import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;
    const body = await request.json();

    if (typeof body.verified !== 'boolean') {
      return NextResponse.json({ error: 'verified must be a boolean' }, { status: 400 });
    }

    // Verify fact belongs to user
    const existing = await prisma.knowledgeFact.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Fact not found' }, { status: 404 });
    }

    const fact = await prisma.knowledgeFact.update({
      where: { id },
      data: { userVerified: body.verified },
      select: { id: true, userVerified: true },
    });

    return NextResponse.json({ success: true, fact });
  } catch (error) {
    console.error('[KNOWLEDGE_FACT_PATCH]', error);
    return NextResponse.json({ error: 'Failed to update fact' }, { status: 500 });
  }
}
