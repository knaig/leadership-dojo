
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';
import { PushSubscription } from '@prisma/client';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: session.user.id }
        });

        if (subscriptions.length === 0) {
            return NextResponse.json({ error: 'No subscriptions found' }, { status: 404 });
        }


        const results = await Promise.all(subscriptions.map(async (sub: PushSubscription) => {
            try {
                await sendPushNotification(sub, {
                    title: 'Test Notification',
                    body: `This is a test notification from ${BRAND.name}!`,
                    url: '/dashboard'
                });
                return { id: sub.id, status: 'success' };
            } catch (error: any) {
                console.error('Push error:', error);

                // If 410 Gone, delete subscription as it's invalid
                if (error.statusCode === 410) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                    return { id: sub.id, status: 'deleted' };
                }
                return { id: sub.id, status: 'failed', error: error.message };
            }
        }));

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Test endpoint error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
