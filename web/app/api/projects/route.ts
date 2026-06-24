import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { ProjectStatus } from '@prisma/client';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as ProjectStatus | null;
  const orgId = searchParams.get('orgId');

  const where: Record<string, unknown> = { userId };
  if (status) where.status = status;
  if (orgId) where.orgId = orgId;

  const projects = await prisma.project.findMany({
    where,
    include: {
      org: { select: { name: true } },
      _count: {
        select: {
          resources: true,
          facts: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description, status, orgId, startDate, endDate } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name: name.trim(),
      description: description || undefined,
      status: status || undefined,
      orgId: orgId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
