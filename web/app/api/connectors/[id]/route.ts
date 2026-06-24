import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ConnectionStatus } from '@prisma/client';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/connectors/[id] - Get connector details
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

    const connector = await prisma.dataConnector.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        _count: {
          select: { artifacts: true }
        }
      }
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    return NextResponse.json({ connector });
  } catch (error) {
    console.error('Failed to fetch connector:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connector' },
      { status: 500 }
    );
  }
}

// PATCH /api/connectors/[id] - Update connector
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
    const { status, syncFrequency, permissions } = body;

    // Verify ownership
    const existingConnector = await prisma.dataConnector.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    });

    if (!existingConnector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (status && ['CONNECTED', 'PAUSED'].includes(status)) {
      updateData.status = status as ConnectionStatus;
    }

    if (typeof syncFrequency === 'number' && syncFrequency >= 5) {
      updateData.syncFrequency = syncFrequency;
    }

    if (permissions) {
      updateData.permissions = permissions;
    }

    const connector = await prisma.dataConnector.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ connector });
  } catch (error) {
    console.error('Failed to update connector:', error);
    return NextResponse.json(
      { error: 'Failed to update connector' },
      { status: 500 }
    );
  }
}

// DELETE /api/connectors/[id] - Delete connector and all associated data
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
    const existingConnector = await prisma.dataConnector.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    });

    if (!existingConnector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // If this is a Google connector, revoke the OAuth token
    if (['gmail', 'gcal', 'gdrive'].includes(existingConnector.provider)) {
      try {
        const account = await prisma.account.findFirst({
          where: { userId: session.user.id, provider: 'google' },
          select: { id: true, access_token: true },
        });
        if (account?.access_token) {
          const token = decryptOAuthToken(account.access_token);
          if (token) {
            // Revoke the token with Google
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }).catch(() => {}); // Best-effort revocation

            // Check if any other Google connectors remain
            const otherGoogleConnectors = await prisma.dataConnector.count({
              where: {
                userId: session.user.id,
                provider: { in: ['gmail', 'gcal', 'gdrive'] },
                id: { not: id },
              },
            });

            // If no other Google connectors, remove the Account record
            if (otherGoogleConnectors === 0) {
              await prisma.account.delete({ where: { id: account.id } });
              console.log('[Connector] Revoked Google tokens and removed account');
            }
          }
        }
      } catch (revokeErr: any) {
        console.error('[Connector] Token revocation failed:', revokeErr.message);
        // Continue with deletion even if revocation fails
      }
    }

    // Delete all artifacts associated with this connector first
    await prisma.workArtifact.deleteMany({
      where: { connectorId: id }
    });

    // Now delete the connector
    await prisma.dataConnector.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete connector:', error);
    return NextResponse.json(
      { error: 'Failed to delete connector' },
      { status: 500 }
    );
  }
}
