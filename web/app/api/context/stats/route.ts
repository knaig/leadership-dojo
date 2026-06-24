import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [meetings, emails, documents, stakeholders] = await Promise.all([
        prisma.meetingSyncRecord.count({ where: { userId } }),
        prisma.emailSummary.count({ where: { userId } }),
        prisma.workArtifact.count({ where: { userId } }),
        prisma.stakeholderProfile.count({ where: { userId, mergedIntoId: null } }),
    ]);

    return NextResponse.json({ meetings, emails, documents, stakeholders });
}
