import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST: Create a new project/initiative
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, context } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
        }

        const project = await prisma.professionalProject.create({
            data: {
                userId,
                name: name.trim(),
                context: context?.trim() || null,
                status: 'ACTIVE',
            },
        });

        return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
        console.error('[NETWORK_PROJECTS_POST]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// DELETE: Remove a project
export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
        }

        const existing = await prisma.professionalProject.findFirst({
            where: { id, userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        await prisma.professionalProject.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[NETWORK_PROJECTS_DELETE]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
