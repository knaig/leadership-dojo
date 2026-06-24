import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/calls/[id]/feedback
 * Save user feedback for a voice call.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: voiceCallId } = await params;

        // Verify the call belongs to this user
        const call = await prisma.voiceCall.findFirst({
            where: { id: voiceCallId, userId },
            select: { id: true, callType: true },
        });

        if (!call) {
            return NextResponse.json({ error: 'Call not found' }, { status: 404 });
        }

        const body = await req.json();
        const { rating, tooLong, tooShort, wasRelevant, wasActionable, verbatimFeedback } = body as {
            rating?: number;
            tooLong?: boolean;
            tooShort?: boolean;
            wasRelevant?: boolean;
            wasActionable?: boolean;
            verbatimFeedback?: string;
        };

        // Upsert: update if manual feedback already exists, otherwise create
        const existing = await prisma.callFeedback.findFirst({
            where: { voiceCallId, userId, feedbackSource: 'in_app' },
            select: { id: true },
        });

        if (existing) {
            const feedback = await prisma.callFeedback.update({
                where: { id: existing.id },
                data: {
                    ...(rating !== undefined && { rating }),
                    ...(tooLong !== undefined && { tooLong }),
                    ...(tooShort !== undefined && { tooShort }),
                    ...(wasRelevant !== undefined && { wasRelevant }),
                    ...(wasActionable !== undefined && { wasActionable }),
                    ...(verbatimFeedback !== undefined && { verbatimFeedback }),
                },
            });
            return NextResponse.json({ feedback });
        }

        const feedback = await prisma.callFeedback.create({
            data: {
                userId,
                voiceCallId,
                callType: call.callType,
                feedbackSource: 'in_app',
                ...(rating !== undefined && { rating }),
                ...(tooLong !== undefined && { tooLong }),
                ...(tooShort !== undefined && { tooShort }),
                ...(wasRelevant !== undefined && { wasRelevant }),
                ...(wasActionable !== undefined && { wasActionable }),
                ...(verbatimFeedback !== undefined && { verbatimFeedback }),
            },
        });

        return NextResponse.json({ feedback });
    } catch (error) {
        console.error('[CallFeedback] POST error:', error);
        return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
    }
}

/**
 * GET /api/calls/[id]/feedback
 * Get existing feedback for a call.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: voiceCallId } = await params;

        const feedback = await prisma.callFeedback.findFirst({
            where: { voiceCallId, userId, feedbackSource: 'in_app' },
        });

        return NextResponse.json({ feedback: feedback || null });
    } catch (error) {
        console.error('[CallFeedback] GET error:', error);
        return NextResponse.json({ error: 'Failed to get feedback' }, { status: 500 });
    }
}
