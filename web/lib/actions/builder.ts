'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { CaseContent } from '../builder/types';
import { PublishStatus } from '@prisma/client';

export async function getMyCases() {
    let session = await auth();
    let userId = session?.user?.id;

    // DEV OVERRIDE: If no session, use Dev User
    if (!userId) {
        const devUser = await prisma.user.upsert({
            where: { email: 'dev@example.com' },
            update: {},
            create: {
                email: 'dev@example.com',
                name: 'Dev User',
                id: 'dev-user-id'
            }
        });
        userId = devUser.id;
    }

    // Fetch cases where the user created at least one version
    // NOTE: This could be optimized. For now, we assume curators own cases.
    const cases = await prisma.case.findMany({
        where: {
            versions: {
                some: {
                    createdBy: userId
                }
            }
        },
        include: {
            versions: {
                orderBy: { version: 'desc' },
                take: 1
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    return cases;
}

export async function createDraftCase(title: string) {
    let session = await auth();
    let userId = session?.user?.id;

    if (!userId) {
        // Ensure dev user exists (idempotent due to upsert in getMyCases, but safe to do here or just assume 'dev-user-id' if we know it exists)
        // For safety, let's just use the ID we know we created/will create.
        userId = 'dev-user-id';
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Create Case + First Version (Draft)
    const newCase = await prisma.case.create({
        data: {
            title,
            slug: `${slug}-${Date.now()}`, // Ensure uniqueness
            versions: {
                create: {
                    version: 1,
                    status: 'DRAFT',
                    content: {}, // Empty content initially
                    createdBy: userId
                }
            }
        }
    });

    return newCase.id;
}

export async function updateCaseContent(caseId: string, content: CaseContent) {
    const session = await auth();
    // if (!session?.user?.id) throw new Error("Unauthorized"); // Bypass for dev

    // Find the latest draft version
    const latestVersion = await prisma.caseVersion.findFirst({
        where: { caseId, status: 'DRAFT' },
        orderBy: { version: 'desc' }
    });

    if (latestVersion) {
        // Update existing draft
        await prisma.caseVersion.update({
            where: { id: latestVersion.id },
            data: { content: content as any } // Prisma JSON type workaround
        });
    } else {
        // Create new version if no draft exists
        // (This logic might be refined to only bump version on publish)
        // For now, we assume simple single-draft model.
    }
}

export async function getBuilderCase(id: string) {
    const session = await auth();
    // if (!session?.user) redirect('/'); // Bypass for dev

    const c = await prisma.case.findUnique({
        where: { id },
        include: {
            versions: {
                where: { status: 'DRAFT' },
                orderBy: { version: 'desc' },
                take: 1
            }
        }
    });

    if (!c) return null;

    return {
        id: c.id,
        title: c.title,
        content: c.versions[0]?.content as unknown as CaseContent || {}
    };
}
