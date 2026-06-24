import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/experiments
 *
 * Returns all coaching experiments with assignment counts and results.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    if (!adminUser || (adminUser.role !== 'ADMIN' && adminUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const experiments = await prisma.coachingExperiment.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
            user: { select: { name: true, email: true } },
            assignments: {
                select: {
                    variant: true,
                    primaryKpiScore: true,
                    overallScore: true,
                    createdAt: true,
                },
            },
        },
    });

    const formatted = experiments.map(exp => ({
        id: exp.id,
        userId: exp.userId,
        userName: exp.user.name || exp.user.email,
        dimension: exp.dimension,
        hypothesis: exp.hypothesis,
        primaryKpi: exp.primaryKpi,
        status: exp.status,
        variantA: { label: exp.variantALabel, instruction: exp.variantAInstruction },
        variantB: { label: exp.variantBLabel, instruction: exp.variantBInstruction },
        results: {
            variantACallCount: exp.variantACallCount,
            variantBCallCount: exp.variantBCallCount,
            variantAAvgKpi: exp.variantAAvgKpi,
            variantBAvgKpi: exp.variantBAvgKpi,
            effectSize: exp.effectSize,
            pValue: exp.pValue,
            winner: exp.winner,
            conclusion: exp.conclusion,
        },
        minCallsPerVariant: exp.minCallsPerVariant,
        progress: {
            a: exp.assignments.filter(a => a.variant === 'A' && a.primaryKpiScore !== null).length,
            b: exp.assignments.filter(a => a.variant === 'B' && a.primaryKpiScore !== null).length,
            target: exp.minCallsPerVariant,
        },
        activatedAt: exp.activatedAt?.toISOString() || null,
        concludedAt: exp.concludedAt?.toISOString() || null,
        createdAt: exp.createdAt.toISOString(),
    }));

    const summary = {
        total: experiments.length,
        active: experiments.filter(e => e.status === 'active').length,
        concluded: experiments.filter(e => e.status === 'concluded').length,
        withWinner: experiments.filter(e => e.winner === 'A' || e.winner === 'B').length,
        inconclusive: experiments.filter(e => e.winner === 'inconclusive').length,
    };

    return NextResponse.json({ experiments: formatted, summary });
}
