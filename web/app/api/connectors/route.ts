import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';
import { ConnectorType, ConnectionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/connectors - List user's connectors
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectors = await prisma.dataConnector.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ connectors });
  } catch (error) {
    console.error('Failed to fetch connectors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connectors' },
      { status: 500 }
    );
  }
}

// POST /api/connectors - Create a new connector
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure user exists in database (for Clerk users)
    await ensureUserExists(session.user.id);

    const body = await request.json();
    const { provider, type, accountId, mcpConfig } = body;

    // Validate provider
    const validProviders = ['gmail', 'gcal', 'gdrive', 'apple_notes', 'notion', 'manual', 'voice_memo'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Map provider to connector type
    const typeMap: Record<string, ConnectorType> = {
      gmail: 'EMAIL',
      gcal: 'CALENDAR',
      gdrive: 'DOCUMENTS',
      apple_notes: 'NOTES',
      notion: 'NOTES',
      manual: 'MANUAL',
      voice_memo: 'MANUAL'
    };

    const connectorType = typeMap[provider] || type;

    // Check if connector already exists
    const existingConnector = await prisma.dataConnector.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider
        }
      }
    });

    // For Google connectors, find the user's Google account
    let googleAccountId = accountId;
    if (['gmail', 'gcal', 'gdrive'].includes(provider) && !accountId) {
      const googleAccount = await prisma.account.findFirst({
        where: {
          userId: session.user.id,
          provider: 'google'
        }
      });
      googleAccountId = googleAccount?.id;
    }

    const status = googleAccountId ? 'CONNECTED' : (['manual', 'voice_memo'].includes(provider) ? 'CONNECTED' : 'DISCONNECTED');

    // Upsert: reconnect existing connector or create new one
    if (existingConnector) {
      const connector = await prisma.dataConnector.update({
        where: { id: existingConnector.id },
        data: {
          status,
          accountId: googleAccountId || existingConnector.accountId,
        },
      });
      return NextResponse.json({ connector });
    }

    const connector = await prisma.dataConnector.create({
      data: {
        userId: session.user.id,
        type: connectorType as ConnectorType,
        provider,
        status,
        accountId: googleAccountId,
        mcpConfig: mcpConfig || null,
        syncFrequency: 60,
        permissions: {}
      }
    });

    return NextResponse.json({ connector }, { status: 201 });
  } catch (error) {
    console.error('Failed to create connector:', error);
    return NextResponse.json(
      { error: 'Failed to create connector' },
      { status: 500 }
    );
  }
}
