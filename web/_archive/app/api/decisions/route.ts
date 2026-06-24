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
 * GET /api/decisions
 * List all decisions for the current user
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decisions = await prisma.decision.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: 'desc' },
        });

        // Transform to frontend format
        const transformedDecisions = decisions.map(d => ({
            id: d.id,
            title: d.title,
            context: d.description, // Map description to context for frontend
            status: mapStatusToFrontend(d.status),
            decidedAt: d.decidedAt?.toISOString() ?? null,
            createdAt: d.createdAt.toISOString(),
        }));

        return NextResponse.json({ decisions: transformedDecisions });
    } catch (error) {
        console.error('[API] Error fetching decisions:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch decisions' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/decisions
 * Create a new decision
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            title,
            description,
            decisionType,
            reversibility,
            timeframe,
            impactScope,
            decisionDeadline,
        } = body;

        if (!title || !decisionType) {
            return NextResponse.json(
                { error: 'title and decisionType are required' },
                { status: 400 }
            );
        }

        const decision = await prisma.decision.create({
            data: {
                userId: session.user.id,
                title,
                description,
                decisionType,
                reversibility,
                timeframe,
                impactScope,
                decisionDeadline: decisionDeadline ? new Date(decisionDeadline) : null,
                status: 'ANALYZING',
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
        }, { status: 201 });
    } catch (error) {
        console.error('[API] Error creating decision:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create decision' },
            { status: 500 }
        );
    }
}
