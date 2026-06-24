
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

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

        // Verify ownership and existence
        const rec = await prisma.userActionPlan.findUnique({
            where: { id },
        });

        if (!rec) {
            return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
        }

        if (rec.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Commit
        const updated = await prisma.userActionPlan.update({
            where: { id },
            data: {
                status: 'COMMITTED',
                committedAt: new Date(),
            }
        });

        // Optionally, create a placeholder Reflection or schedule a notification
        // For MVP, just updating status is enough for the UI to change.

        return NextResponse.json({ success: true, recommendation: updated });
    } catch (error) {
        console.error('Failed to commit to recommendation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
