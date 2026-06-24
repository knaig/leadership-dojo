
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const goals = await prisma.goal.findMany({
            where: { userId: session.user.id },
            include: {
                stakeholders: {
                    include: { stakeholder: true } // Name, etc.
                },
                actions: true // Recent actions
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(goals);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
    }
}
