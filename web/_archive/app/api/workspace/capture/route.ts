import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { analyzeArtifact } from '@/lib/intelligence/analyzer';
import { ArtifactType } from '@prisma/client';

// POST /api/workspace/capture - Capture a work event
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventType, whatHappened, outcome, keyMoments, analyzImmediately } = body;

    if (!whatHappened || !eventType) {
      return NextResponse.json(
        { error: 'Event type and description are required' },
        { status: 400 }
      );
    }

    // Map event type to artifact type
    const artifactTypeMap: Record<string, ArtifactType> = {
      meeting: 'MEETING_NOTES',
      email: 'EMAIL_SENT',
      conversation: 'TEXT_NOTE',
      decision: 'QUICK_REFLECTION'
    };

    // Find or create manual connector
    let connector = await prisma.dataConnector.findFirst({
      where: {
        userId: session.user.id,
        provider: 'manual'
      }
    });

    if (!connector) {
      connector = await prisma.dataConnector.create({
        data: {
          userId: session.user.id,
          type: 'MANUAL',
          provider: 'manual',
          status: 'CONNECTED',
          permissions: {}
        }
      });
    }

    // Create the artifact
    const artifact = await prisma.workArtifact.create({
      data: {
        userId: session.user.id,
        connectorId: connector.id,
        type: artifactTypeMap[eventType] || 'TEXT_NOTE',
        title: generateTitle(eventType, whatHappened),
        content: whatHappened,
        rawContent: whatHappened,
        metadata: {
          eventType,
          outcome,
          keyMoments,
          capturedAt: new Date().toISOString()
        },
        occurredAt: new Date(),
        analyzed: false
      }
    });

    // Analyze immediately if requested
    if (analyzImmediately) {
      try {
        const analysisResult = await analyzeArtifact(artifact, session.user.id);

        await prisma.workArtifact.update({
          where: { id: artifact.id },
          data: {
            analyzed: true,
            analysisResult: analysisResult as object
          }
        });

        // Fetch created observations
        const observations = await prisma.skillObservation.findMany({
          where: { artifactId: artifact.id },
          include: {
            capacity: {
              select: { slug: true, name: true }
            }
          }
        });

        return NextResponse.json({
          success: true,
          artifact,
          analyzed: true,
          observations
        });
      } catch (analysisError) {
        console.error('Analysis failed:', analysisError);
        // Return success anyway - capture was saved
        return NextResponse.json({
          success: true,
          artifact,
          analyzed: false,
          analysisError: 'Analysis failed but capture was saved'
        });
      }
    }

    return NextResponse.json({
      success: true,
      artifact,
      analyzed: false
    });
  } catch (error) {
    console.error('Failed to capture work event:', error);
    return NextResponse.json(
      { error: 'Failed to capture work event' },
      { status: 500 }
    );
  }
}

function generateTitle(eventType: string, content: string): string {
  // Generate a title from the first line or first N characters
  const firstLine = content.split('\n')[0];
  const truncated = firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;

  const prefixes: Record<string, string> = {
    meeting: 'Meeting: ',
    email: 'Email: ',
    conversation: 'Conversation: ',
    decision: 'Decision: '
  };

  return (prefixes[eventType] || '') + truncated;
}
