import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/kpis - List user's KPIs
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const kpis = await prisma.userKPI.findMany({
            where: { userId },
            orderBy: { priority: 'asc' },
            include: {
                assumptions: true
            }
        });

        return NextResponse.json({ kpis });
    } catch (error) {
        console.error('KPI fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 });
    }
}

// POST /api/kpis - Create a new KPI
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
        name,
        description,
        metric = 'completion',
        targetValue = 100,
        targetDate,
        type = 'STRATEGIC',
        timeframe = 'QUARTERLY',
        priority,
        isPersonal = false
    } = body;

    if (!name || !targetDate) {
        return NextResponse.json({ error: 'name and targetDate are required' }, { status: 400 });
    }

    try {
        // Auto-assign priority if not provided
        let assignedPriority = priority;
        if (!assignedPriority) {
            const kpiCount = await prisma.userKPI.count({ where: { userId } });
            assignedPriority = kpiCount + 1;
        }

        const kpi = await prisma.userKPI.create({
            data: {
                userId,
                name,
                description,
                metric,
                targetValue,
                targetDate: new Date(targetDate),
                type,
                timeframe,
                priority: assignedPriority,
                isPersonal,
                status: 'ON_TRACK',
                confidence: 50
            }
        });

        return NextResponse.json({ kpi }, { status: 201 });
    } catch (error) {
        console.error('KPI create error:', error);
        return NextResponse.json({ error: 'Failed to create KPI' }, { status: 500 });
    }
}
