import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { DecisionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Map database status to frontend status
function mapStatusToFrontend(status: DecisionStatus): 'PENDING' | 'DECIDED' | 'IMPLEMENTED' | 'ABANDONED' {
    switch (status) {
        case 'ANALYZING':
        case 'DRAFT':
        case 'READY':
        case 'READY_TO_DECIDE':
            return 'PENDING';
        case 'DECIDED':
        case 'PREPPING':
            return 'DECIDED';
        case 'IMPLEMENTED':
        case 'EXECUTED':
        case 'REVIEWED':
            return 'IMPLEMENTED';
        case 'ABANDONED':
            return 'ABANDONED';
        default:
            return 'PENDING';
    }
}

/**
 * GET /api/decisions/[id]
 * Get a single decision with related data
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const decision = await prisma.decision.findUnique({
            where: { id },
            include: {
                scenarios: true,
                stakeholderImpacts: {
                    include: {
                        stakeholder: true,
                    },
                },
            },
        });

        if (!decision) {
            return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
        }

        if (decision.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            decision: {
                ...decision,
                context: decision.description,
                status: mapStatusToFrontend(decision.status),
                decidedAt: decision.decidedAt?.toISOString() ?? null,
                createdAt: decision.createdAt.toISOString(),
                updatedAt: decision.updatedAt.toISOString(),
                decisionDeadline: decision.decisionDeadline?.toISOString() ?? null,
            },
        });
    } catch (error) {
        console.error('[API] Error fetching decision:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch decision' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/decisions/[id]
 * Update a decision (supports action-based updates)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        // Verify ownership
        const existing = await prisma.decision.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
        }

        if (existing.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Handle action-based updates
        const { action, ...updateData } = body;

        let statusUpdate: DecisionStatus | undefined;
        let decidedAtUpdate: Date | undefined;

        if (action) {
            switch (action) {
                case 'decide':
                    statusUpdate = 'DECIDED';
                    decidedAtUpdate = new Date();
                    break;
                case 'implement':
                    statusUpdate = 'IMPLEMENTED';
                    break;
                case 'abandon':
                    statusUpdate = 'ABANDONED';
                    break;
                case 'review':
                    statusUpdate = 'REVIEWED';
                    break;
                case 'ready':
                    statusUpdate = 'READY_TO_DECIDE';
                    break;
            }
        }

        const decision = await prisma.decision.update({
            where: { id },
            data: {
                ...updateData,
                ...(statusUpdate && { status: statusUpdate }),
                ...(decidedAtUpdate && { decidedAt: decidedAtUpdate }),
            },
        });

        return NextResponse.json({
            decision: {
                id: decision.id,
                title: decision.title,
                context: decision.description,
                status: mapStatusToFrontend(decision.status),
                decidedAt: decision.decidedAt?.toISOString() ?? null,
                createdAt: decision.createdAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('[API] Error updating decision:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update decision' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/decisions/[id]
 * Delete a decision
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const existing = await prisma.decision.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
        }

        if (existing.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.decision.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Error deleting decision:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete decision' },
            { status: 500 }
        );
    }
}
