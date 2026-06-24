import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ArtifactType } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/artifacts - List artifacts with pagination
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type') as ArtifactType | null;
    const connectorId = searchParams.get('connectorId');
    const analyzed = searchParams.get('analyzed');

    const skip = (page - 1) * limit;

    // Build filter
    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (type) {
      where.type = type;
    }

    if (connectorId) {
      where.connectorId = connectorId;
    }

    if (analyzed !== null) {
      where.analyzed = analyzed === 'true';
    }

    const [artifacts, total] = await Promise.all([
      prisma.workArtifact.findMany({
        where,
        include: {
          connector: {
            select: {
              provider: true,
              type: true,
            },
          },
          _count: {
            select: { observations: true },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.workArtifact.count({ where }),
    ]);

    return NextResponse.json({
      artifacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch artifacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artifacts' },
      { status: 500 }
    );
  }
}

// POST /api/artifacts - Create a manual artifact
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, title, content, occurredAt, metadata } = body;

    // Validate type
    const validManualTypes: ArtifactType[] = [
      'TEXT_NOTE',
      'QUICK_REFLECTION',
      'STRUCTURED_REFLECTION',
      'CONTEXT_TEACHING',
      'MEETING_NOTES',
      'VOICE_NOTE',
    ];

    if (!validManualTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid artifact type for manual creation' },
        { status: 400 }
      );
    }

    // Get or create the manual connector
    let manualConnector = await prisma.dataConnector.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: 'manual',
        },
      },
    });

    if (!manualConnector) {
      manualConnector = await prisma.dataConnector.create({
        data: {
          userId: session.user.id,
          type: 'MANUAL',
          provider: 'manual',
          status: 'CONNECTED',
          permissions: {},
        },
      });
    }

    const artifact = await prisma.workArtifact.create({
      data: {
        userId: session.user.id,
        connectorId: manualConnector.id,
        type,
        title: title || null,
        content,
        rawContent: content,
        metadata: metadata || {},
        participants: [],
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    console.error('Failed to create artifact:', error);
    return NextResponse.json(
      { error: 'Failed to create artifact' },
      { status: 500 }
    );
  }
}
