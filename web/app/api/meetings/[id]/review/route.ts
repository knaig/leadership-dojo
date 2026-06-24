import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST: Log post-meeting outcome result
export async function POST(
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
        const { result, note } = body;

        if (!result || !['LANDED', 'PARTIAL', 'MISSED', 'SKIPPED'].includes(result)) {
            return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
        }

        const meeting = await prisma.meetingSyncRecord.findFirst({
            where: { id, userId }
        });

        if (!meeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        const updated = await prisma.meetingSyncRecord.update({
            where: { id },
            data: {
                outcomeResult: result,
                outcome: note || null,
                lifecycleStage: 'REVIEWED'
            }
        });

        return NextResponse.json({
            success: true,
            id: updated.id,
            outcomeResult: updated.outcomeResult
        });
    } catch (error) {
        console.error('[Meeting Review API] Error:', error);
        return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
    }
}
