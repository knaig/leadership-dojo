/**
 * Unread Notifications Count API
 *
 * Returns the count of unread proactive prompts for the authenticated user.
 * Used by TopNav to show notification badge.
 */

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ count: 0 });
        }

        // Count unread proactive prompts from the last 24 hours
        const count = await prisma.proactivePrompt.count({
            where: {
                userId,
                responded: false,
                deliveredAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                }
            }
        });

        return NextResponse.json({ count });

    } catch (error: any) {
        console.error('[Unread Count API] Error:', error.message);
        return NextResponse.json({ count: 0 });
    }
}
