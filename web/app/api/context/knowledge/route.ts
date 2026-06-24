
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch Link Edges
        const links = await prisma.artifactLink.findMany({
            where: {
                source: { userId: session.user.id }
            },
            take: 200,
            include: {
                source: { select: { id: true, title: true, type: true } },
                target: { select: { id: true, title: true, type: true } }
            }
        });

        // 2. Collect unique node IDs from links
        // (We only want to show connected nodes to keep graph clean)
        const nodeIds = new Set<string>();
        links.forEach(link => {
            nodeIds.add(link.sourceId);
            nodeIds.add(link.targetId);
        });

        // 3. Fetch full node details if needed, or just use what we have.
        // Let's just flatten the data for the frontend.

        const nodes = Array.from(nodeIds).map(id => {
            // Find a link that has this node info
            const linkAsSource = links.find(l => l.sourceId === id);
            if (linkAsSource) return linkAsSource.source;

            const linkAsTarget = links.find(l => l.targetId === id);
            return linkAsTarget!.target;
        });

        return NextResponse.json({ nodes, links });
    } catch (error) {
        console.error('Failed to fetch knowledge graph:', error);
        return NextResponse.json({ error: 'Failed to fetch graph' }, { status: 500 });
    }
}
