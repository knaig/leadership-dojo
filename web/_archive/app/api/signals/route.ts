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

// Map frontend category to database category
function mapCategoryToDatabase(category: string): SignalCategory {
    switch (category) {
        case 'COMPETITIVE':
            return 'COMPETITIVE';
        case 'MARKET':
            return 'MARKET';
        case 'ECONOMIC':
            return 'ECONOMIC';
        case 'REGULATORY':
            return 'REGULATORY';
        case 'TECHNOLOGICAL':
            return 'TECHNOLOGY';
        case 'SOCIAL':
            return 'CUSTOMER'; // Default social to customer
        default:
            return 'MARKET';
    }
}

/**
 * GET /api/signals
 * List all external signals for the current user
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const signals = await prisma.externalSignal.findMany({
            where: { userId: session.user.id },
            orderBy: { detectedAt: 'desc' },
        });

        // Transform to frontend format
        const transformedSignals = signals.map(s => ({
            id: s.id,
            signal: s.signal,
            category: mapCategoryToFrontend(s.category),
            source: s.source,
            relevanceScore: s.relevanceScore,
            affectedKPIs: s.affectedKPIs,
            acknowledged: s.acknowledged,
            detectedAt: s.detectedAt.toISOString(),
        }));

        return NextResponse.json({ signals: transformedSignals });
    } catch (error) {
        console.error('[API] Error fetching signals:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch signals' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/signals
 * Create a new external signal
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            signal,
            category,
            source,
            relevanceScore,
            affectedKPIs = [],
            implications,
            assumptionsAffected = [],
        } = body;

        if (!signal || !category || relevanceScore === undefined) {
            return NextResponse.json(
                { error: 'signal, category, and relevanceScore are required' },
                { status: 400 }
            );
        }

        const externalSignal = await prisma.externalSignal.create({
            data: {
                userId: session.user.id,
                signal,
                category: mapCategoryToDatabase(category),
                source,
                relevanceScore: parseFloat(relevanceScore),
                affectedKPIs,
                implications,
                assumptionsAffected,
                acknowledged: false,
            },
        });

        return NextResponse.json({
            signal: {
                id: externalSignal.id,
                signal: externalSignal.signal,
                category: mapCategoryToFrontend(externalSignal.category),
                source: externalSignal.source,
                relevanceScore: externalSignal.relevanceScore,
                affectedKPIs: externalSignal.affectedKPIs,
                acknowledged: externalSignal.acknowledged,
                detectedAt: externalSignal.detectedAt.toISOString(),
            },
        }, { status: 201 });
    } catch (error) {
        console.error('[API] Error creating signal:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create signal' },
            { status: 500 }
        );
    }
}
