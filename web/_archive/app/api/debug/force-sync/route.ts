
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncAllConnectors } from '@/lib/sync-service';

export async function POST(req: NextRequest) {
    // Development only safety check
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const userIdParam = searchParams.get('userId');

        let userId = userIdParam;

        if (!userId) {
            // Pick first user
            const user = await prisma.user.findFirst();
            if (!user) return NextResponse.json({ error: 'No user found' }, { status: 404 });
            userId = user.id;
        }

        if (!userId) {
            return NextResponse.json({ error: 'User ID determination failed' }, { status: 400 });
        }

        console.log(`[Debug] Forcing Sync for User: ${userId}`);
        const results = await syncAllConnectors(userId);

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('Force Sync Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
