import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';

// GET /api/admin/prompts — List all prompt templates grouped by name
export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const templates = await prisma.promptTemplate.findMany({
        orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });

    // Group by name
    const grouped = templates.reduce((acc, t) => {
        if (!acc[t.name]) acc[t.name] = [];
        acc[t.name].push(t);
        return acc;
    }, {} as Record<string, typeof templates>);

    return NextResponse.json({ templates: grouped });
}

// POST /api/admin/prompts — Create a new version of a prompt template
export async function POST(req: Request) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { name, content, firstMessageOptions, variables, maxDurationSeconds, notes, activate } = body;

    if (!name || !content) {
        return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
    }

    // Get the latest version for this name
    const latest = await prisma.promptTemplate.findFirst({
        where: { name },
        orderBy: { version: 'desc' },
    });

    const newVersion = (latest?.version || 0) + 1;

    // If activating, archive the current active version
    if (activate) {
        await prisma.promptTemplate.updateMany({
            where: { name, status: 'active' },
            data: { status: 'archived' },
        });
    }

    const template = await prisma.promptTemplate.create({
        data: {
            name,
            version: newVersion,
            content,
            firstMessageOptions: firstMessageOptions || latest?.firstMessageOptions,
            variables: variables || latest?.variables,
            maxDurationSeconds: maxDurationSeconds ?? latest?.maxDurationSeconds,
            status: activate ? 'active' : 'draft',
            notes: notes || `Version ${newVersion} created by ${user.emailAddresses[0]?.emailAddress}`,
        },
    });

    return NextResponse.json({ template });
}

// PATCH /api/admin/prompts — Activate/archive a specific version
export async function PATCH(req: Request) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { id, status: newStatus } = body;

    if (!id || !newStatus || !['active', 'archived', 'draft'].includes(newStatus)) {
        return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
    }

    const target = await prisma.promptTemplate.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If activating, archive the current active version of this name
    if (newStatus === 'active') {
        await prisma.promptTemplate.updateMany({
            where: { name: target.name, status: 'active', id: { not: id } },
            data: { status: 'archived' },
        });
    }

    const updated = await prisma.promptTemplate.update({
        where: { id },
        data: { status: newStatus },
    });

    return NextResponse.json({ template: updated });
}
