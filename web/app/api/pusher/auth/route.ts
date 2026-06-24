/**
 * Pusher Private Channel Authentication
 *
 * Validates that users can only subscribe to their own private channel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth as clerkAuth } from '@clerk/nextjs/server';
import { getPusher } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    console.log('[Pusher Auth] Received auth request');

    try {
        const { userId } = await clerkAuth();
        console.log('[Pusher Auth] UserId:', userId || 'No session');

        if (!userId) {
            console.warn('[Pusher Auth] Unauthorized - no session');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse body - support both form-urlencoded and formData
        let socketId: string | null = null;
        let channel: string | null = null;

        const contentType = req.headers.get('content-type') || '';
        console.log('[Pusher Auth] Content-Type:', contentType);

        if (contentType.includes('application/x-www-form-urlencoded')) {
            const text = await req.text();
            console.log('[Pusher Auth] Raw body:', text);
            const params = new URLSearchParams(text);
            socketId = params.get('socket_id');
            channel = params.get('channel_name');
        } else {
            const formData = await req.formData();
            socketId = formData.get('socket_id') as string;
            channel = formData.get('channel_name') as string;
        }

        console.log('[Pusher Auth] socketId:', socketId, 'channel:', channel);

        if (!socketId || !channel) {
            console.warn('[Pusher Auth] Missing params');
            return NextResponse.json({ error: 'Missing socket_id or channel_name' }, { status: 400 });
        }

        // Security: Ensure users can only subscribe to their own channel
        const expectedChannel = `private-user-${userId}`;
        if (channel !== expectedChannel) {
            console.warn(`[Pusher Auth] Channel mismatch: expected ${expectedChannel}, got ${channel}`);
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const pusher = getPusher();
        const authResponse = pusher.authorizeChannel(socketId, channel);
        console.log('[Pusher Auth] Success, returning auth response');

        return NextResponse.json(authResponse);
    } catch (error) {
        console.error('[Pusher Auth] Error:', error);
        return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
    }
}
