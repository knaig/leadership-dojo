import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/connectors/[id]/reconnect - Mark connector for reconnection
// The actual OAuth flow happens on the client side via signIn('google')
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

    // Verify ownership and get connector
    const connector = await prisma.dataConnector.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    });

    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // Check if this is a Google connector
    if (!['gmail', 'gcal', 'gdrive'].includes(connector.provider)) {
      return NextResponse.json(
        { error: 'This connector does not require OAuth reconnection' },
        { status: 400 }
      );
    }

    // Mark connector as needing reconnection
    await prisma.dataConnector.update({
      where: { id },
      data: {
        status: 'DISCONNECTED',
        lastSyncStatus: 'Waiting for reconnection...'
      }
    });

    // Return URL for client to redirect to OAuth
    // The client should call signIn('google') which will go through the OAuth flow
    return NextResponse.json({
      success: true,
      message: 'Connector marked for reconnection. Please complete Google sign-in.',
      action: 'SIGN_IN_REQUIRED',
      provider: 'google',
      callbackUrl: '/settings/connectors'
    });

  } catch (error) {
    console.error('Failed to initiate reconnect:', error);
    return NextResponse.json(
      { error: 'Failed to initiate reconnection' },
      { status: 500 }
    );
  }
}
