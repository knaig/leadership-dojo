import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { SignalCategory } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Map database category to frontend category
function mapCategoryToFrontend(category: SignalCategory): 'COMPETITIVE' | 'MARKET' | 'ECONOMIC' | 'REGULATORY' | 'TECHNOLOGICAL' | 'SOCIAL' {
    switch (category) {
        case 'COMPETITIVE':
            return 'COMPETITIVE';
        case 'MARKET':
            return 'MARKET';
        case 'ECONOMIC':
            return 'ECONOMIC';
        case 'REGULATORY':
            return 'REGULATORY';
        case 'TECHNOLOGY':
            return 'TECHNOLOGICAL';
        case 'CUSTOMER':
        case 'INTERNAL':
        case 'TEAM':
            return 'SOCIAL';
        default:
            return 'MARKET';
    }
}

/**
 * GET /api/signals/[id]
 * Get a single signal with full details
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

        const signal = await prisma.externalSignal.findUnique({
            where: { id },
        });

        if (!signal) {
            return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
        }

        if (signal.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json({
            signal: {
                id: signal.id,
                signal: signal.signal,
                category: mapCategoryToFrontend(signal.category),
                source: signal.source,
                relevanceScore: signal.relevanceScore,
                affectedKPIs: signal.affectedKPIs,
                implications: signal.implications,
                assumptionsAffected: signal.assumptionsAffected,
                acknowledged: signal.acknowledged,
                response: signal.response,
                kpisRevised: signal.kpisRevised,
                detectedAt: signal.detectedAt.toISOString(),
                acknowledgedAt: signal.acknowledgedAt?.toISOString() ?? null,
            },
        });
    } catch (error) {
        console.error('[API] Error fetching signal:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch signal' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/signals/[id]
 * Update a signal (acknowledge, add response, etc.)
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
        const existing = await prisma.externalSignal.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
        }

        if (existing.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { action, ...updateData } = body;

        // Handle acknowledge action
        let acknowledgeUpdate = {};
        if (action === 'acknowledge' || updateData.acknowledged === true) {
            acknowledgeUpdate = {
                acknowledged: true,
                acknowledgedAt: new Date(),
            };
        }

        const signal = await prisma.externalSignal.update({
            where: { id },
            data: {
                ...updateData,
                ...acknowledgeUpdate,
            },
        });

        return NextResponse.json({
            signal: {
                id: signal.id,
                signal: signal.signal,
                category: mapCategoryToFrontend(signal.category),
                source: signal.source,
                relevanceScore: signal.relevanceScore,
                affectedKPIs: signal.affectedKPIs,
                acknowledged: signal.acknowledged,
                detectedAt: signal.detectedAt.toISOString(),
            },
        });
    } catch (error) {
        console.error('[API] Error updating signal:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update signal' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/signals/[id]
 * Delete a signal
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
        const existing = await prisma.externalSignal.findUnique({
            where: { id },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
        }

        if (existing.userId !== session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.externalSignal.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Error deleting signal:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete signal' },
            { status: 500 }
        );
    }
}
