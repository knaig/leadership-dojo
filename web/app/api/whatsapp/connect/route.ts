/**
 * WhatsApp Connect API
 *
 * POST: Initiates WhatsApp connection for the user.
 *       Worker generates a QR code, user scans with phone.
 *       Returns status (qr_pending, connected, error).
 *
 * GET: Check current WhatsApp connection status.
 *
 * DELETE: Disconnect WhatsApp.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const waSession = await prisma.whatsAppSession.findUnique({
        where: { userId },
        select: { status: true, updatedAt: true },
    });

    const groups = await prisma.whatsAppGroup.findMany({
        where: { userId, isActive: true },
        select: { groupId: true, groupName: true, participantCount: true },
    });

    return NextResponse.json({
        connected: waSession?.status === 'CONNECTED',
        status: waSession?.status || 'DISCONNECTED',
        lastUpdated: waSession?.updatedAt || null,
        groups,
    });
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Queue a WhatsApp connect job for the worker
    try {
        const payload = JSON.stringify({ userId, action: 'connect' });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, expire_seconds, start_after, keep_until)
            VALUES ('whatsapp-connect', ${payload}::jsonb, 'created', 1, 300, now(), now() + INTERVAL '1 day')
            RETURNING id
        `;

        // Mark as QR pending
        await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, credentials: '{}', status: 'QR_PENDING' },
            update: { status: 'QR_PENDING' },
        });

        return NextResponse.json({
            status: 'qr_pending',
            message: 'WhatsApp connection initiated. Check your notifications for QR code.',
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        // Queue disconnect job
        const payload = JSON.stringify({ userId, action: 'disconnect' });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, expire_seconds, start_after, keep_until)
            VALUES ('whatsapp-connect', ${payload}::jsonb, 'created', 1, 300, now(), now() + INTERVAL '1 day')
            RETURNING id
        `;

        await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, credentials: '{}', status: 'DISCONNECTED' },
            update: { status: 'DISCONNECTED' },
        });

        return NextResponse.json({ status: 'disconnected' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
