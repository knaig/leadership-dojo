import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/channels?channel=OUTCOMES
 * List conversation threads, optionally filtered by channel type.
 */
export async function GET(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const channel = request.nextUrl.searchParams.get('channel');

    const conversations = await prisma.conversation.findMany({
        where: {
            userId,
            ...(channel ? { channel: channel as any } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { content: true, role: true, createdAt: true },
            },
            _count: { select: { messages: true } },
        },
    });

    const result = conversations.map(c => ({
        id: c.id,
        channel: c.channel,
        title: c.title,
        isActive: c.isActive,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] ? {
            content: c.messages[0].content.substring(0, 120),
            role: c.messages[0].role,
            createdAt: c.messages[0].createdAt,
        } : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
    }));

    return NextResponse.json({ conversations: result });
}

/**
 * POST /api/chat/channels
 * Body: { channel: 'OUTCOMES' | 'DEVILS_ADVOCATE' | 'SKILL_BUILDING' | 'PERSONAL' | 'GENERAL', title?: string }
 * Creates a new conversation thread in the specified channel.
 */
export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { channel = 'GENERAL', title } = body;

    const validChannels = ['OUTCOMES', 'DEVILS_ADVOCATE', 'SKILL_BUILDING', 'PERSONAL', 'GENERAL'];
    if (!validChannels.includes(channel)) {
        return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }

    const conversation = await prisma.conversation.create({
        data: { userId, channel, title },
    });

    return NextResponse.json({ conversation }, { status: 201 });
}
