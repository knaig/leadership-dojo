import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// PATCH: Update commitment status (mark done, snooze, drop)
export async function PATCH(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, action } = await request.json();

        if (!id || !action) {
            return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
        }

        // Verify ownership
        const commitment = await prisma.meetingCommitment.findFirst({
            where: { id, userId }
        });

        if (!commitment) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        let updateData: any = {};

        switch (action) {
            case 'done':
                updateData = { status: 'FULFILLED', fulfilledAt: new Date() };
                break;
            case 'snooze':
                // Push due date by 1 day
                const newDue = commitment.dueDate
                    ? new Date(commitment.dueDate.getTime() + 24 * 60 * 60 * 1000)
                    : new Date(Date.now() + 24 * 60 * 60 * 1000);
                updateData = { dueDate: newDue, status: 'PENDING' };
                break;
            case 'drop':
                updateData = { status: 'DROPPED' };
                break;
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const updated = await prisma.meetingCommitment.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({ success: true, commitment: updated });
    } catch (error) {
        console.error('[API] Commitment update failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
