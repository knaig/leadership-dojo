import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; resourceId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, resourceId } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const resource = await prisma.projectResource.findUnique({
    where: { id: resourceId },
  });

  if (!resource || resource.projectId !== id) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  await prisma.projectResource.delete({ where: { id: resourceId } });

  return NextResponse.json({ success: true });
}
