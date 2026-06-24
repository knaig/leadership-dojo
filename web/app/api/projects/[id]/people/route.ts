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

  // Build OR conditions to find facts related to this project
  const orConditions: Record<string, unknown>[] = [
    { projectId: id },
  ];

  if (project.knowledgeEntityId) {
    orConditions.push(
      { subjectId: project.knowledgeEntityId },
      { objectEntityId: project.knowledgeEntityId },
    );
  }

  // Find all facts related to this project
  const facts = await prisma.knowledgeFact.findMany({
    where: {
      userId,
      validTo: null,
      OR: orConditions,
    },
    select: {
      predicate: true,
      subjectId: true,
      objectEntityId: true,
      subject: {
        select: { id: true, type: true, name: true },
      },
      objectEntity: {
        select: { id: true, type: true, name: true },
      },
    },
  });

  // Collect unique PERSON entities and count their fact appearances
  const personMap = new Map<string, { entity: { id: string; name: string; type: string }; factCount: number; predicates: Set<string> }>();

  for (const fact of facts) {
    if (fact.subject.type === 'PERSON' && fact.subject.id !== project.knowledgeEntityId) {
      const existing = personMap.get(fact.subject.id);
      if (existing) {
        existing.factCount++;
        existing.predicates.add(fact.predicate);
      } else {
        personMap.set(fact.subject.id, { entity: fact.subject, factCount: 1, predicates: new Set([fact.predicate]) });
      }
    }

    if (fact.objectEntity?.type === 'PERSON' && fact.objectEntity.id !== project.knowledgeEntityId) {
      const existing = personMap.get(fact.objectEntity.id);
      if (existing) {
        existing.factCount++;
        existing.predicates.add(fact.predicate);
      } else {
        personMap.set(fact.objectEntity.id, { entity: fact.objectEntity, factCount: 1, predicates: new Set([fact.predicate]) });
      }
    }
  }

  const people = Array.from(personMap.values())
    .map(p => ({
      entityId: p.entity.id,
      name: p.entity.name,
      factCount: p.factCount,
      predicates: Array.from(p.predicates),
    }))
    .sort((a, b) => b.factCount - a.factCount);

  return NextResponse.json({ people });
}
