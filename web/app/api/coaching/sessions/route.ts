import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Fetch active mission (Recommended Scenario)
        const activeMission = await prisma.practiceMission.findFirst({
            where: {
                userId,
                status: { in: ['ACTIVE', 'IN_PROGRESS'] }
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                description: true
            }
        });

        // Fetch past sessions
        const pastSessions = await prisma.practiceMission.findMany({
            where: {
                userId,
                status: { in: ['COMPLETED', 'VALIDATED', 'FAILED'] }
            },
            orderBy: { completedAt: 'desc' },
            take: 10,
            select: {
                id: true,
                title: true,
                completedAt: true,
                currentScore: true,
                targetScore: true
            }
        });

        return NextResponse.json({
            activeMission,
            pastSessions
        });

    } catch (error) {
        console.error('[COACHING_SESSIONS_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
