import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/conversations - List user's conversation preps
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // upcoming, completed, all

    try {
        const whereClause: any = { userId };

        if (status === 'upcoming') {
            whereClause.scheduledAt = { gte: new Date() };
            whereClause.status = { in: ['PREPPING'] };
        } else if (status === 'completed') {
            whereClause.status = 'COMPLETED';
        }

        const conversations = await prisma.conversationPrep.findMany({
            where: whereClause,
            orderBy: { scheduledAt: 'asc' }
        });

        return NextResponse.json({ conversations });
    } catch (error) {
        console.error('Conversations fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }
}

// POST /api/conversations - Create a new conversation prep
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
        title,
        type = 'ONE_ON_ONE',
        stakeholders = [],
        primaryObjective,
        scheduledAt
    } = body;

    if (!title || !primaryObjective) {
        return NextResponse.json({ error: 'title and primaryObjective are required' }, { status: 400 });
    }

    try {
        const conversation = await prisma.conversationPrep.create({
            data: {
                userId,
                title,
                type,
                stakeholders,
                primaryObjective,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                status: 'PREPPING'
            }
        });

        return NextResponse.json({ conversation }, { status: 201 });
    } catch (error) {
        console.error('Conversation create error:', error);
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }
}
