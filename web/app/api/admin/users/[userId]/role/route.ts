import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const VALID_ROLES = ['ADMIN', 'CURATOR', 'MANAGER', 'STUDENT'] as const;
type ValidRole = typeof VALID_ROLES[number];

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    const { userId: callerId } = await auth();
    if (!callerId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const adminUser = await prisma.user.findUnique({
        where: { id: callerId },
        select: { role: true },
    });
    if (!adminUser || adminUser.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId: targetUserId } = await params;

    try {
        const body = await req.json();
        const { role } = body;

        if (!role || !VALID_ROLES.includes(role as ValidRole)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
                { status: 400 }
            );
        }

        // Verify target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, role: true },
        });
        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Prevent removing the last ADMIN
        if (targetUser.role === 'ADMIN' && role !== 'ADMIN') {
            const adminCount = await prisma.user.count({
                where: { role: 'ADMIN' },
            });
            if (adminCount <= 1) {
                return NextResponse.json(
                    { error: 'Cannot remove the last admin. Promote another user to ADMIN first.' },
                    { status: 409 }
                );
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
            data: { role: role as ValidRole },
        });

        return NextResponse.json({ user: updatedUser });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Admin Role Update] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
