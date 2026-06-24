import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hypotheses
 *
 * Returns the current user's hypotheses that are visible to them (visibility = USER).
 * Groups into: confirmed (what Mira knows), pending (what Mira is curious about),
 * rejected (what Mira got wrong).
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const hypotheses = await prisma.hypothesis.findMany({
        where: {
            userId,
            visibility: 'USER',
            status: { notIn: ['EXPIRED'] },
        },
        select: {
            id: true,
            category: true,
            statement: true,
            evidence: true,
            confidence: true,
            status: true,
            sourceType: true,
            userResponse: true,
            validatedAt: true,
            createdAt: true,
        },
        orderBy: [
            { status: 'asc' },
            { createdAt: 'desc' },
        ],
    });

    // Group by lifecycle state for the UI
    const confirmed = hypotheses.filter(h => h.status === 'CONFIRMED');
    const pending = hypotheses.filter(h => ['PENDING', 'READY', 'PRESENTED'].includes(h.status));
    const revised = hypotheses.filter(h => h.status === 'REVISED');
    const rejected = hypotheses.filter(h => h.status === 'REJECTED');

    return NextResponse.json({
        confirmed,
        pending,
        revised,
        rejected,
        total: hypotheses.length,
    });
}

/**
 * PATCH /api/hypotheses
 *
 * User validates a hypothesis: confirm, correct, or dismiss.
 * Body: { id: string, action: 'confirm' | 'correct' | 'dismiss', correction?: string }
 */
export async function PATCH(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, action, correction } = body;

    if (!id || !action) {
        return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    // Verify ownership and visibility
    const hypothesis = await prisma.hypothesis.findFirst({
        where: { id, userId, visibility: 'USER' },
    });

    if (!hypothesis) {
        return NextResponse.json({ error: 'Hypothesis not found' }, { status: 404 });
    }

    if (action === 'confirm') {
        await prisma.hypothesis.update({
            where: { id },
            data: {
                status: 'CONFIRMED',
                validatedAt: new Date(),
                userResponse: 'Confirmed by user via dashboard',
            },
        });
    } else if (action === 'correct') {
        // Mark original as revised
        await prisma.hypothesis.update({
            where: { id },
            data: {
                status: 'REVISED',
                validatedAt: new Date(),
                userResponse: correction || 'Corrected by user via dashboard',
            },
        });

        // Create corrected version if correction text provided
        if (correction) {
            await prisma.hypothesis.create({
                data: {
                    userId,
                    category: hypothesis.category,
                    statement: correction,
                    evidence: `User correction: "${correction}"`,
                    presentationText: '',
                    confidence: 0.95,
                    status: 'CONFIRMED',
                    priority: 1,
                    sourceType: 'user_correction',
                    revisedFromId: id,
                    validatedAt: new Date(),
                    visibility: hypothesis.visibility,
                },
            });
        }
    } else if (action === 'dismiss') {
        await prisma.hypothesis.update({
            where: { id },
            data: {
                status: 'REJECTED',
                validatedAt: new Date(),
                userResponse: 'Dismissed by user via dashboard',
            },
        });
    } else {
        return NextResponse.json({ error: 'Invalid action. Use confirm, correct, or dismiss.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
