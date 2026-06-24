import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

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

  const orConditions: Record<string, unknown>[] = [
    { projectId: id },
  ];

  if (project.knowledgeEntityId) {
    orConditions.push(
      { subjectId: project.knowledgeEntityId },
      { objectEntityId: project.knowledgeEntityId },
    );
  }

  const facts = await prisma.knowledgeFact.findMany({
    where: {
      userId,
      validTo: null,
      OR: orConditions,
    },
    include: {
      subject: { select: { name: true } },
      objectEntity: { select: { name: true } },
    },
    orderBy: { recordedAt: 'desc' },
    take: 50,
  });

  const formatted = facts.map(f => ({
    id: f.id,
    subjectName: f.subject.name,
    predicate: f.predicate,
    objectName: f.objectEntity?.name,
    objectValue: f.objectValue,
    confidence: f.confidence,
    source: f.source,
    recordedAt: f.recordedAt,
  }));

  return NextResponse.json({ facts: formatted });
}
