import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/kpis/[id] - Get single KPI
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const kpi = await prisma.userKPI.findFirst({
            where: { id, userId },
            include: {
                assumptions: true,
                updates: { orderBy: { createdAt: 'desc' }, take: 5 },
                linkedActions: { include: { action: true } }
            }
        });

        if (!kpi) {
            return NextResponse.json({ error: 'KPI not found' }, { status: 404 });
        }

        return NextResponse.json({ kpi });
    } catch (error) {
        console.error('KPI fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch KPI' }, { status: 500 });
    }
}

// PUT /api/kpis/[id] - Update KPI
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    try {
        // Verify ownership
        const existing = await prisma.userKPI.findFirst({ where: { id, userId } });
        if (!existing) {
            return NextResponse.json({ error: 'KPI not found' }, { status: 404 });
        }

        const kpi = await prisma.userKPI.update({
            where: { id },
            data: {
                name: body.name ?? existing.name,
                description: body.description ?? existing.description,
                targetValue: body.targetValue ?? existing.targetValue,
                targetDate: body.targetDate ? new Date(body.targetDate) : existing.targetDate,
                currentValue: body.currentValue ?? existing.currentValue,
                status: body.status ?? existing.status,
                confidence: body.confidence ?? existing.confidence,
                priority: body.priority ?? existing.priority
            }
        });

        return NextResponse.json({ kpi });
    } catch (error) {
        console.error('KPI update error:', error);
        return NextResponse.json({ error: 'Failed to update KPI' }, { status: 500 });
    }
}

// DELETE /api/kpis/[id] - Delete KPI
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const existing = await prisma.userKPI.findFirst({ where: { id, userId } });
        if (!existing) {
            return NextResponse.json({ error: 'KPI not found' }, { status: 404 });
        }

        await prisma.userKPI.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('KPI delete error:', error);
        return NextResponse.json({ error: 'Failed to delete KPI' }, { status: 500 });
    }
}
