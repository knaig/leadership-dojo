import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/channels/[channelId]/messages
 * Returns messages for a specific conversation thread.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ channelId: string }> },
) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId } = await params;
    const cursor = request.nextUrl.searchParams.get('cursor');
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);

    // Verify conversation belongs to user
    const conversation = await prisma.conversation.findFirst({
        where: { id: channelId, userId },
        select: { id: true, channel: true, title: true },
    });

    if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
        where: { conversationId: channelId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
            id: true,
            role: true,
            content: true,
            type: true,
            createdAt: true,
        },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return NextResponse.json({
        conversation,
        messages: messages.reverse(),
        hasMore,
        nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
    });
}
