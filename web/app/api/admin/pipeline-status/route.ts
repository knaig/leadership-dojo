import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/pipeline-status - Get complete pipeline visibility
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. Connector Status with artifact counts
    const connectors = await prisma.dataConnector.findMany({
      where: { userId },
      orderBy: { provider: 'asc' },
    });

    const connectorStats = await Promise.all(
      connectors.map(async (connector) => {
        const artifactCount = await prisma.workArtifact.count({
          where: { connectorId: connector.id },
        });
        const recentArtifacts = await prisma.workArtifact.findMany({
          where: { connectorId: connector.id },
          orderBy: { ingestedAt: 'desc' },
          take: 3,
          select: { id: true, title: true, type: true, ingestedAt: true, analyzed: true },
        });
        return {
          id: connector.id,
          provider: connector.provider,
          type: connector.type,
          status: connector.status,
          lastSyncAt: connector.lastSyncAt,
          lastSyncStatus: connector.lastSyncStatus,
          totalArtifacts: artifactCount,
          recentArtifacts,
        };
      })
    );

    // 2. Artifact Analysis Status
    const [totalArtifacts, analyzedArtifacts, unanalyzedArtifacts] = await Promise.all([
      prisma.workArtifact.count({ where: { userId } }),
      prisma.workArtifact.count({ where: { userId, analyzed: true } }),
      prisma.workArtifact.count({ where: { userId, analyzed: false } }),
    ]);

    // Get artifacts by type
    const artifactsByType = await prisma.workArtifact.groupBy({
      by: ['type'],
      where: { userId },
      _count: { id: true },
    });

    // Get unanalyzed artifacts for display
    const pendingAnalysis = await prisma.workArtifact.findMany({
      where: { userId, analyzed: false },
      orderBy: { ingestedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        type: true,
        ingestedAt: true,
        connector: { select: { provider: true } },
      },
    });

    // 3. Intelligence Extraction Status
    const [totalObservations, capacityScores] = await Promise.all([
      prisma.skillObservation.count({ where: { userId } }),
      prisma.capacityScore.findMany({
        where: { userId },
        include: { capacity: { select: { name: true, slug: true } } },
      }),
    ]);

    // Get observations by type
    const observationsByType = await prisma.skillObservation.groupBy({
      by: ['type'],
      where: { userId },
      _count: { id: true },
    });

    // Get recent observations with their artifacts
    const recentObservations = await prisma.skillObservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        observation: true,
        evidence: true,
        type: true,
        score: true,
        confidence: true,
        createdAt: true,
        capacity: { select: { name: true, slug: true } },
        artifact: { select: { id: true, title: true, type: true } },
      },
    });

    // 4. Capacity Coverage
    const capacities = await prisma.capacity.findMany({
      orderBy: { name: 'asc' },
    });

    const capacityCoverage = await Promise.all(
      capacities.map(async (capacity) => {
        const observationCount = await prisma.skillObservation.count({
          where: { userId, capacityId: capacity.id },
        });
        const score = capacityScores.find(s => s.capacityId === capacity.id);
        return {
          slug: capacity.slug,
          name: capacity.name,
          observationCount,
          score: score?.score ?? null,
          confidence: score?.confidence ?? null,
          trend: score?.trend ?? 'INSUFFICIENT_DATA',
        };
      })
    );

    return NextResponse.json({
      // Sync Layer
      sync: {
        connectors: connectorStats,
        summary: {
          totalConnected: connectors.filter(c => c.status === 'CONNECTED').length,
          totalConnectors: connectors.length,
        },
      },
      // Analysis Layer
      analysis: {
        total: totalArtifacts,
        analyzed: analyzedArtifacts,
        pending: unanalyzedArtifacts,
        percentComplete: totalArtifacts > 0 ? Math.round((analyzedArtifacts / totalArtifacts) * 100) : 0,
        byType: artifactsByType.map(t => ({ type: t.type, count: t._count.id })),
        pendingArtifacts: pendingAnalysis,
      },
      // Intelligence Layer
      intelligence: {
        totalObservations,
        byType: observationsByType.map(t => ({ type: t.type, count: t._count.id })),
        recentObservations,
        capacityCoverage,
      },
    });
  } catch (error) {
    console.error('Failed to get pipeline status:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
