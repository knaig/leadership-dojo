
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db'; // Assuming web has its own prisma lib, likely @/lib/db or @/lib/prisma

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const now = new Date();
        const next48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        // 1. Upcoming Meetings
        const upcomingMeetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: {
                    gte: now,
                    lte: next48h
                },
                status: 'confirmed'
            },
            orderBy: {
                startTime: 'asc'
            },
            take: 5
        });

        // 2. Key Stakeholders
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId },
            orderBy: { interactionCount: 'desc' },
            take: 5,
            select: {
                name: true,
                role: true,
                relationshipStrength: true,
                primaryMotivation: true
            }
        });

        // 3. Active KPIs
        const kpis = await prisma.userKPI.findMany({
            where: {
                userId,
                status: {
                    in: ['ON_TRACK', 'AT_RISK', 'OFF_TRACK']
                }
            },
            take: 3,
            orderBy: { updatedAt: 'desc' },
            select: {
                name: true,
                status: true,
                currentValue: true,
                targetValue: true
            }
        });

        return NextResponse.json({
            upcomingMeetings,
            stakeholders,
            kpis
        });

    } catch (error) {
        console.error('[CONTEXT_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
