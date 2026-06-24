import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST: Create a new organization
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, domain, industry, relationToUser, size } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
        }

        const validRelations = ['EMPLOYER', 'CLIENT', 'VENDOR', 'PARTNER', 'COMPETITOR', 'INVESTOR', 'REGULATOR', 'OTHER'];
        const relation = validRelations.includes(relationToUser) ? relationToUser : 'OTHER';

        const org = await prisma.organization.create({
            data: {
                userId,
                name: name.trim(),
                domain: domain?.trim() || undefined,
                industry: industry?.trim() || undefined,
                relationToUser: relation,
                size: size?.trim() || undefined,
            },
        });

        return NextResponse.json({ org }, { status: 201 });
    } catch (error: any) {
        // Handle unique constraint (user already has this org name)
        if (error?.code === 'P2002') {
            return NextResponse.json({ error: 'Organization already exists' }, { status: 409 });
        }
        console.error('[NETWORK_ORGS_POST]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// PATCH: Update an organization
export async function PATCH(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { id, name, domain, industry, relationToUser, size } = body;

        if (!id) {
            return NextResponse.json({ error: 'Organization id required' }, { status: 400 });
        }

        const existing = await prisma.organization.findFirst({ where: { id, userId } });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const validRelations = ['EMPLOYER', 'CLIENT', 'VENDOR', 'PARTNER', 'COMPETITOR', 'INVESTOR', 'REGULATOR', 'OTHER'];
        const updateData: Record<string, unknown> = {};

        if (name !== undefined) updateData.name = name.trim();
        if (domain !== undefined) updateData.domain = domain.trim() || null;
        if (industry !== undefined) updateData.industry = industry.trim() || null;
        if (size !== undefined) updateData.size = size.trim() || null;
        if (relationToUser !== undefined && validRelations.includes(relationToUser)) {
            updateData.relationToUser = relationToUser;
        }

        const org = await prisma.organization.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ org });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return NextResponse.json({ error: 'Organization with that name already exists' }, { status: 409 });
        }
        console.error('[NETWORK_ORGS_PATCH]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// DELETE: Remove an organization
export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Organization id required' }, { status: 400 });
        }

        const existing = await prisma.organization.findFirst({ where: { id, userId } });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        await prisma.organization.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[NETWORK_ORGS_DELETE]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
