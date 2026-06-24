/**
 * Pinned Sources API
 *
 * GET  - List user's pinned sources
 * POST - Pin a new source (Drive folder/doc)
 *
 * Pinned sources are always synced and extracted, bypassing the 90-day rolling window.
 * Users pin specific folders or documents that are important to their work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sources = await prisma.pinnedSource.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sourceType, externalId, name, description } = await req.json();

    if (!sourceType || !externalId || !name) {
        return NextResponse.json({ error: 'sourceType, externalId, and name are required' }, { status: 400 });
    }

    const validTypes = ['drive_folder', 'drive_doc', 'email_label'];
    if (!validTypes.includes(sourceType)) {
        return NextResponse.json({ error: `sourceType must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const source = await prisma.pinnedSource.upsert({
        where: {
            userId_sourceType_externalId: { userId, sourceType, externalId },
        },
        create: { userId, sourceType, externalId, name, description },
        update: { name, description },
    });

    return NextResponse.json({ source }, { status: 201 });
}
