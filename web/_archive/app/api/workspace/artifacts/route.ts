import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { fetchPrescriptionSignals, generatePrescriptions } from '@/lib/intelligence/prescriptions';

export const dynamic = 'force-dynamic';

// GET /api/workspace/artifacts - List artifacts with observations
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const analyzed = searchParams.get('analyzed');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const whereClause: Record<string, unknown> = {
      userId: session.user.id
    };

    if (analyzed === 'true') {
      whereClause.analyzed = true;
    }

    const artifacts = await prisma.workArtifact.findMany({
      where: whereClause,
      include: {
        observations: {
          include: {
            capacity: {
              select: { slug: true, name: true }
            }
          }
        }
      },
      orderBy: { occurredAt: 'desc' },
      take: limit
    });

    // Get prescriptions for artifacts with negative observations
    const signals = await fetchPrescriptionSignals(session.user.id);
    const { generalPrescriptions } = await generatePrescriptions(signals);

    // Enrich artifacts with relevant prescriptions
    const enrichedArtifacts = artifacts.map(artifact => {
      const artifactObservations = artifact.observations;
      const negativeCapacities = artifactObservations
        .filter(o => o.type === 'NEGATIVE' || o.type === 'MISSED_OPPORTUNITY')
        .map(o => o.capacity.slug);

      // Find prescriptions that match this artifact's gaps
      const relevantPrescriptions = generalPrescriptions.filter(p =>
        p.capacitySlug && negativeCapacities.includes(p.capacitySlug)
      );

      return {
        ...artifact,
        prescriptions: relevantPrescriptions.slice(0, 2)
      };
    });

    return NextResponse.json({
      artifacts: enrichedArtifacts
    });
  } catch (error) {
    console.error('Failed to fetch artifacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artifacts' },
      { status: 500 }
    );
  }
}
