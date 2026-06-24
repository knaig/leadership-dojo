import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';

// GET /api/admin/config — Get active conversation config
export async function GET() {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const configs = await prisma.conversationConfig.findMany({
        orderBy: { version: 'desc' },
        take: 10,
    });

    const active = configs.find(c => c.status === 'active');

    return NextResponse.json({ active, history: configs });
}

// POST /api/admin/config — Create a new config version
export async function POST(req: Request) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { confidenceThresholds, adaptationRules, maturityTransitions, voiceOverrides, guardrails, notes, activate } = body;

    // Get latest version
    const latest = await prisma.conversationConfig.findFirst({
        orderBy: { version: 'desc' },
    });
    const newVersion = (latest?.version || 0) + 1;

    // Archive current active if activating
    if (activate) {
        await prisma.conversationConfig.updateMany({
            where: { status: 'active' },
            data: { status: 'archived' },
        });
    }

    const config = await prisma.conversationConfig.create({
        data: {
            version: newVersion,
            confidenceThresholds: confidenceThresholds || latest?.confidenceThresholds || {},
            adaptationRules: adaptationRules || latest?.adaptationRules || {},
            maturityTransitions: maturityTransitions || latest?.maturityTransitions || {},
            voiceOverrides: voiceOverrides || latest?.voiceOverrides || {},
            guardrails: guardrails || latest?.guardrails || {},
            status: activate ? 'active' : 'draft',
            notes: notes || `Version ${newVersion}`,
        },
    });

    return NextResponse.json({ config });
}
