/**
 * Proactive Prompt History API
 *
 * GET /api/proactive/history
 *
 * Returns recent proactive prompts for the notification dropdown.
 */

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ prompts: [] });
        }

        const prompts = await prisma.proactivePrompt.findMany({
            where: {
                userId,
                deliveredAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                }
            },
            orderBy: { deliveredAt: 'desc' },
            take: 10,
            select: {
                id: true,
                type: true,
                content: true,
                responded: true,
                deliveredAt: true,
            }
        });

        return NextResponse.json({ prompts });

    } catch (error: any) {
        console.error('[Proactive History API] Error:', error.message);
        return NextResponse.json({ prompts: [] });
    }
}
