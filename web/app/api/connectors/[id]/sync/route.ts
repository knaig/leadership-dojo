import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { syncGmailConnector } from '@/lib/connectors/gmail';
import { syncCalendarConnector } from '@/lib/connectors/calendar';
import { syncDriveConnector } from '@/lib/connectors/drive';
import { analyzeArtifact } from '@/lib/intelligence/analyzer';

export const dynamic = 'force-dynamic';

// Helper function to analyze newly synced artifacts
async function analyzeNewArtifacts(userId: string, connectorId: string, limit: number = 5) {
  const unanalyzed = await prisma.workArtifact.findMany({
    where: {
      userId,
      connectorId,
      analyzed: false,
    },
    orderBy: { ingestedAt: 'desc' },
    take: limit,
  });

  let analyzed = 0;
  for (const artifact of unanalyzed) {
    try {
      const result = await analyzeArtifact(artifact, userId);
      await prisma.workArtifact.update({
        where: { id: artifact.id },
        data: {
          analyzed: true,
          analysisResult: JSON.parse(JSON.stringify(result)),
        },
      });
      analyzed++;
    } catch (err) {
      console.error(`Auto-analysis failed for ${artifact.id}:`, err);
    }
  }
  return analyzed;
}

// POST /api/connectors/[id]/sync - Trigger manual sync
// Query params:
//   fullResync=true - Clear existing artifacts and resync from 30 days ago
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
    const { searchParams } = new URL(request.url);
    const fullResync = searchParams.get('fullResync') === 'true';

    // Get connector with account info
    const connector = await prisma.dataConnector.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        account: true
      }
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    if (connector.status === 'PAUSED') {
      return NextResponse.json(
        { error: 'Connector is paused. Resume it first.' },
        { status: 400 }
      );
    }

    // If full resync requested, delete existing artifacts and reset lastSyncAt to user's onboarding date
    if (fullResync) {
      await prisma.workArtifact.deleteMany({
        where: { connectorId: id }
      });
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { createdAt: true } });
      const syncFromDate = user?.createdAt || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await prisma.dataConnector.update({
        where: { id },
        data: {
          lastSyncAt: syncFromDate,
          status: 'SYNCING'
        }
      });
    } else {
      // Mark as syncing
      await prisma.dataConnector.update({
        where: { id },
        data: { status: 'SYNCING' }
      });
    }

    let syncResult: { success: boolean; artifactsCreated: number; error?: string };

    try {
      // Call the appropriate sync function based on provider
      switch (connector.provider) {
        case 'gmail':
          syncResult = await syncGmailConnector(connector, session.user.id);
          break;
        case 'gcal':
          syncResult = await syncCalendarConnector(connector, session.user.id);
          break;
        case 'gdrive':
          syncResult = await syncDriveConnector(connector, session.user.id);
          break;
        case 'manual':
        case 'voice_memo':
          // Manual connectors don't sync automatically
          syncResult = { success: true, artifactsCreated: 0 };
          break;
        default:
          syncResult = { success: false, artifactsCreated: 0, error: 'Unsupported provider' };
      }
    } catch (syncError) {
      const errorMessage = syncError instanceof Error ? syncError.message : 'Sync failed';

      // Check for token-related errors that require re-authentication
      const isTokenError = errorMessage.includes('invalid_grant') ||
                           errorMessage.includes('Token has been expired') ||
                           errorMessage.includes('Invalid Credentials') ||
                           errorMessage.includes('No access token') ||
                           errorMessage.includes('access_denied');

      syncResult = {
        success: false,
        artifactsCreated: 0,
        error: isTokenError
          ? 'Authentication expired. Please reconnect your Google account.'
          : errorMessage
      };

      // If token error, mark connector as disconnected
      if (isTokenError) {
        await prisma.dataConnector.update({
          where: { id },
          data: {
            status: 'DISCONNECTED',
            lastSyncStatus: 'Authentication expired. Please reconnect.'
          }
        });

        return NextResponse.json({
          success: false,
          error: syncResult.error,
          requiresReconnect: true
        }, { status: 401 });
      }
    }

    // Update connector status
    await prisma.dataConnector.update({
      where: { id },
      data: {
        status: syncResult.success ? 'CONNECTED' : 'ERROR',
        lastSyncAt: new Date(),
        lastSyncStatus: syncResult.success
          ? `Synced ${syncResult.artifactsCreated} artifacts`
          : syncResult.error || 'Sync failed'
      }
    });

    if (!syncResult.success) {
      return NextResponse.json(
        { error: syncResult.error || 'Sync failed' },
        { status: 500 }
      );
    }

    // Auto-analyze newly synced artifacts (up to 5 at a time to avoid timeouts)
    let artifactsAnalyzed = 0;
    if (syncResult.artifactsCreated > 0) {
      try {
        artifactsAnalyzed = await analyzeNewArtifacts(session.user.id, id, 5);
      } catch (err) {
        console.error('Auto-analysis after sync failed:', err);
      }
    }

    return NextResponse.json({
      success: true,
      artifactsCreated: syncResult.artifactsCreated,
      artifactsAnalyzed,
      lastSyncAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to sync connector:', error);
    return NextResponse.json(
      { error: 'Failed to sync connector' },
      { status: 500 }
    );
  }
}
