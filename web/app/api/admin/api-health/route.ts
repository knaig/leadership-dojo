import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/api-health
 * Returns the latest API key health status for all services.
 * Used by the admin dashboard to show alerts.
 */
export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check if user is admin (simple check — first user or specific email)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });

    // For now, allow any authenticated user (you're the only user)
    // TODO: add proper admin check when multi-tenant

    // Try to get recent alerts from SystemAlert if it exists
    let alerts: any[] = [];
    try {
        alerts = await (prisma as any).systemAlert.findMany({
            where: { type: 'API_KEY_HEALTH', resolved: false },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    } catch {
        // SystemAlert model doesn't exist — return empty
    }

    // Also do a live check of key configuration
    const keyStatus = {
        tavily: {
            configured: !!process.env.TAVILY_API_KEY,
            keyPrefix: process.env.TAVILY_API_KEY?.substring(0, 10) + '...',
        },
        perplexity: {
            configured: !!process.env.PERPLEXITY_API_KEY,
            keyPrefix: process.env.PERPLEXITY_API_KEY?.substring(0, 10) + '...',
        },
        google_search: {
            configured: !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX),
        },
        gemini: {
            configured: !!process.env.GEMINI_API_KEY,
        },
    };

    return NextResponse.json({
        keys: keyStatus,
        alerts: alerts.map((a: any) => ({
            id: a.id,
            service: a.title,
            severity: a.severity,
            message: a.message,
            createdAt: a.createdAt,
            metadata: a.metadata,
        })),
    });
}

/**
 * POST /api/admin/api-health
 * Dismiss/resolve an alert.
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { alertId } = await req.json();
    if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });

    try {
        await (prisma as any).systemAlert.update({
            where: { id: alertId },
            data: { resolved: true, resolvedAt: new Date() },
        });
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
