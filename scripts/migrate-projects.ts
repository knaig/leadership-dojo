import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const prisma = new PrismaClient();

async function main() {
  console.log('Starting project migration...');

  // Step 1: Migrate UserProject → Project
  const userProjects = await prisma.userProject.findMany({
    include: { user: { select: { id: true } } },
  });

  let migratedUserProjects = 0;
  let createdResources = 0;

  for (const up of userProjects) {
    const project = await prisma.project.create({
      data: {
        userId: up.userId,
        name: up.name,
        description: up.description,
        status: 'ACTIVE', // UserProject doesn't have a structured status enum
        risks: up.risks,
        healthScore: up.status, // AI perception string
        userNotes: up.userNotes,
      },
    });

    // Parse drive link into resource
    if (up.driveLink) {
      try {
        // Try to extract folder ID from Google Drive URL
        const driveFolderMatch = up.driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
        const externalId = driveFolderMatch ? driveFolderMatch[1] : up.driveLink;

        await prisma.projectResource.create({
          data: {
            projectId: project.id,
            sourceType: 'DRIVE_FOLDER',
            externalId,
            name: `${up.name} Drive`,
            url: up.driveLink,
          },
        });
        createdResources++;
      } catch (e: any) {
        console.warn(`  Warning: Failed to create drive resource for ${up.name}:`, e.message);
      }
    }

    migratedUserProjects++;
  }

  console.log(`Migrated ${migratedUserProjects} UserProjects, created ${createdResources} drive resources`);

  // Step 2: Migrate ProfessionalProject → Project (avoid duplicates)
  const profProjects = await prisma.professionalProject.findMany({
    include: {
      objectives: { select: { id: true } },
    },
  });

  let migratedProfProjects = 0;
  let linkedObjectives = 0;

  for (const pp of profProjects) {
    // Check for name collision
    const existing = await prisma.project.findFirst({
      where: {
        userId: pp.userId,
        name: { equals: pp.name, mode: 'insensitive' },
      },
    });

    const statusMap: Record<string, any> = {
      ACTIVE: 'ACTIVE',
      DONE: 'COMPLETED',
      HOLD: 'ON_HOLD',
    };

    let projectId: string;

    if (existing) {
      // Update existing with org context if missing
      if (!existing.orgId && pp.orgId) {
        await prisma.project.update({
          where: { id: existing.id },
          data: { orgId: pp.orgId, startDate: pp.startDate, endDate: pp.endDate },
        });
      }
      projectId = existing.id;
    } else {
      const project = await prisma.project.create({
        data: {
          userId: pp.userId,
          name: pp.name,
          description: pp.context,
          status: statusMap[pp.status] || 'ACTIVE',
          orgId: pp.orgId,
          startDate: pp.startDate,
          endDate: pp.endDate,
        },
      });
      projectId = project.id;
      migratedProfProjects++;
    }

    // Link objectives
    for (const obj of pp.objectives) {
      await prisma.strategicObjective.update({
        where: { id: obj.id },
        data: { unifiedProjectId: projectId },
      });
      linkedObjectives++;
    }
  }

  console.log(`Migrated ${migratedProfProjects} ProfessionalProjects, linked ${linkedObjectives} objectives`);

  // Step 3: Bridge KnowledgeEntity(type=PROJECT) → Project.knowledgeEntityId
  const projectEntities = await prisma.knowledgeEntity.findMany({
    where: { type: 'PROJECT' },
    select: { id: true, userId: true, nameNormalized: true },
  });

  let linkedEntities = 0;

  for (const entity of projectEntities) {
    const project = await prisma.project.findFirst({
      where: {
        userId: entity.userId,
        name: { contains: entity.nameNormalized, mode: 'insensitive' },
        knowledgeEntityId: null,
      },
    });

    if (project) {
      await prisma.project.update({
        where: { id: project.id },
        data: { knowledgeEntityId: entity.id },
      });
      linkedEntities++;
    }
  }

  console.log(`Linked ${linkedEntities} knowledge entities to projects`);
  console.log('Migration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
