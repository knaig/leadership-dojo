import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdmin(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return user?.role === 'ADMIN' || user?.role === 'CURATOR';
}

// Apply manual discount to a user's subscription
export async function POST(req: NextRequest) {
    return NextResponse.json({ error: 'Manual discounts are no longer supported in the new schema' }, { status: 501 });
}
