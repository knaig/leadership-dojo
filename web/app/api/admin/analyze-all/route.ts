import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { analyzeArtifact } from '@/lib/intelligence/analyzer';

export const dynamic = 'force-dynamic';

// POST /api/admin/analyze-all - Analyze all unanalyzed artifacts for the current user (Streaming)
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Get all unanalyzed artifacts
        const artifacts = await prisma.workArtifact.findMany({
          where: {
            userId: session.user.id,
            analyzed: false,
          },
          orderBy: { occurredAt: 'desc' },

          include: {
            connector: true, // Include connector to get provider info
          },
        });

        if (artifacts.length === 0) {
          send({ type: 'complete', count: 0, message: 'No unanalyzed artifacts found' });
          controller.close();
          return;
        }

        send({ type: 'start', total: artifacts.length, message: `Starting analysis of ${artifacts.length} artifacts...` });

        let successCount = 0;
        let errorCount = 0;
        let totalObservationsCreated = 0;
        // Increased to 10 since billing is enabled and verified
        const CONCURRENCY = 10;
        const VALIDATION_CHECK_INTERVAL = 10; // Check every 10 artifacts

        for (let i = 0; i < artifacts.length; i += CONCURRENCY) {
          const batch = artifacts.slice(i, i + CONCURRENCY);

          await Promise.all(batch.map(async (artifact) => {
            try {
              // Extract metadata for display
              // @ts-ignore
              const meta = artifact.metadata || {};
              const source = artifact.connector.provider;
              const date = artifact.occurredAt;

              send({
                type: 'progress',
                id: artifact.id,
                title: artifact.title,
                status: 'analyzing',
                source,
                date,
                meta
              });

              // Perform analysis
              const analysisResult = await analyzeArtifact(artifact, session.user.id);

              // Update artifact
              await prisma.workArtifact.update({
                where: { id: artifact.id },
                data: {
                  analyzed: true,
                  analysisResult: JSON.parse(JSON.stringify(analysisResult)),
                },
              });

              // Count observations
              const observationCount = await prisma.skillObservation.count({
                where: { artifactId: artifact.id },
              });

              totalObservationsCreated += observationCount;
              successCount++;

              // VALIDATION: Check if observations are being created
              // After first batch and every VALIDATION_CHECK_INTERVAL artifacts
              if (successCount === CONCURRENCY || successCount % VALIDATION_CHECK_INTERVAL === 0) {
                if (totalObservationsCreated === 0) {
                  const errorMsg = `❌ VALIDATION FAILED: Analyzed ${successCount} artifacts but created 0 observations. Analysis is broken - stopping to prevent API waste.`;
                  console.error(errorMsg);
                  send({ type: 'error', message: errorMsg });
                  throw new Error(errorMsg);
                }
              }

              send({
                type: 'result',
                id: artifact.id,
                title: artifact.title,
                status: 'success',
                observations: observationCount,
                successCount,
                errorCount,
                source,
                date,
                meta
              });
            } catch (error) {
              console.error(`Failed to analyze artifact ${artifact.id}:`, error);
              errorCount++;
              send({
                type: 'result',
                id: artifact.id,
                title: artifact.title,
                status: 'error',
                error: String(error),
                successCount,
                errorCount
              });
            }
          }));
        }

        send({ type: 'complete', count: successCount, errors: errorCount, totalObservations: totalObservationsCreated, message: `Analysis complete: ${totalObservationsCreated} observations created` });
      } catch (error) {
        console.error('Stream error:', error);
        send({ type: 'error', message: String(error) });
      } finally {
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Keep GET for status check (unchanged)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [totalArtifacts, unanalyzedCount, analyzedCount, observationCount] = await Promise.all([
      prisma.workArtifact.count({ where: { userId: session.user.id } }),
      prisma.workArtifact.count({ where: { userId: session.user.id, analyzed: false } }),
      prisma.workArtifact.count({ where: { userId: session.user.id, analyzed: true } }),
      prisma.skillObservation.count({ where: { userId: session.user.id } }),
    ]);

    return NextResponse.json({
      totalArtifacts,
      unanalyzedCount,
      analyzedCount,
      observationCount,
    });
  } catch (error) {
    console.error('Failed to get artifact status:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
