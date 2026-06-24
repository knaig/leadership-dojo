import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { analyzeArtifact } from '@/lib/intelligence/analyzer';

export const dynamic = 'force-dynamic';

// POST /api/artifacts/[id]/analyze - Analyze artifact for capacity observations
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get artifact
    const artifact = await prisma.workArtifact.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    // Perform analysis
    const analysisResult = await analyzeArtifact(artifact, session.user.id);

    // Update artifact with analysis result
    await prisma.workArtifact.update({
      where: { id },
      data: {
        analyzed: true,
        analysisResult: JSON.parse(JSON.stringify(analysisResult)),
      },
    });

    // Fetch created observations
    const observations = await prisma.skillObservation.findMany({
      where: { artifactId: id },
      include: {
        capacity: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      observations,
      analysisResult,
    });
  } catch (error) {
    console.error('Failed to analyze artifact:', error);
    return NextResponse.json(
      { error: 'Failed to analyze artifact' },
      { status: 500 }
    );
  }
}
