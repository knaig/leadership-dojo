import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { ProjectSourceType } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const resources = await prisma.projectResource.findMany({
    where: { projectId: id },
    include: { connector: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(resources);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { sourceType, externalId, name, url, connectorId, metadata } = body;

  if (!sourceType || !externalId || !name) {
    return NextResponse.json(
      { error: 'sourceType, externalId, and name are required' },
      { status: 400 }
    );
  }

  if (!Object.values(ProjectSourceType).includes(sourceType)) {
    return NextResponse.json(
      { error: `Invalid sourceType. Must be one of: ${Object.values(ProjectSourceType).join(', ')}` },
      { status: 400 }
    );
  }

  const resource = await prisma.projectResource.create({
    data: {
      projectId: id,
      sourceType,
      externalId,
      name,
      url: url || undefined,
      connectorId: connectorId || undefined,
      metadata: metadata || {},
    },
  });

  return NextResponse.json(resource, { status: 201 });
}
