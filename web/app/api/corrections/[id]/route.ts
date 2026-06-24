import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/corrections/[id]
 * Remove a specific learned correction.
 * Used when user wants Mira to "forget" a learned preference.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        // Verify ownership
        const correction = await prisma.userCorrection.findUnique({
            where: { id },
        });

        if (!correction || correction.userId !== userId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        await prisma.userCorrection.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Corrections DELETE] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
