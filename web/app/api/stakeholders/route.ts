import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // 1. Fetch Top 15 Stakeholders (Nodes)
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId, mergedIntoId: null },
            orderBy: [
                { relationshipStrength: 'desc' },
                { interactionCount: 'desc' }
            ],
            take: 15, // Limit to Top 15 for readability
            select: {
                id: true,
                name: true,
                role: true,
                relationshipStrength: true,
                lastInteraction: true
            }
        });

        // 2. Fetch Recent Artifacts for Co-occurrence (Links)
        const recentArtifacts = await prisma.workArtifact.findMany({
            where: {
                userId,
                participants: { not: Prisma.JsonNull } // Only if participants exist
            },
            take: 100,
            orderBy: { occurredAt: 'desc' },
            select: { participants: true }
        });

        // 3. Build Links (with Fuzzy Matching)
        const stakeholderMap = new Map(stakeholders.map(s => [s.name.toLowerCase(), s.id]));
        const links: Record<string, { source: string, target: string, value: number }> = {};

        recentArtifacts.forEach(art => {
            const participants = art.participants as string[];
            if (!Array.isArray(participants)) return;

            // Filter for known stakeholders using partial matching (e.g. name inside email)
            const known = participants
                .map(p => {
                    const normalized = p.trim().toLowerCase();
                    if (stakeholderMap.has(normalized)) return stakeholderMap.get(normalized);

                    for (const [name, id] of stakeholderMap.entries()) {
                        if (normalized.includes(name) || name.includes(normalized)) {
                            return id;
                        }
                    }
                    return null;
                })
                .filter((id): id is string => !!id);

            // Create pairings (undirected)
            for (let i = 0; i < known.length; i++) {
                for (let j = i + 1; j < known.length; j++) {
                    const idA = known[i];
                    const idB = known[j];
                    const key = [idA, idB].sort().join('-'); // Consistent key

                    if (!links[key]) {
                        links[key] = { source: idA, target: idB, value: 0 };
                    }
                    links[key].value += 1; // Increment strength
                }
            }
        });

        // 4. Assign Groups based on Role (Simple heuristic)
        const nodes = stakeholders.map(s => {
            let group = 'Other';
            const role = (s.role || '').toLowerCase();
            if (role.includes('eng') || role.includes('tech') || role.includes('dev')) group = 'Engineering';
            else if (role.includes('prod') || role.includes('pm')) group = 'Product';
            else if (role.includes('lead') || role.includes('exec') || role.includes('vp') || role.includes('ceo')) group = 'Leadership';
            else if (role.includes('design') || role.includes('ux')) group = 'Design';

            return {
                ...s,
                group
            };
        });

        // 5. Enrich with Knowledge Graph intelligence
        const stakeholderNames = stakeholders.map(s => s.name.toLowerCase());
        const knowledgeEntities = stakeholderNames.length > 0
            ? await prisma.knowledgeEntity.findMany({
                where: {
                    userId,
                    type: 'PERSON',
                    nameNormalized: { in: stakeholderNames },
                },
                include: {
                    subjectFacts: {
                        where: { validTo: null },
                        orderBy: { confidence: 'desc' },
                        take: 3,
                        select: {
                            predicate: true,
                            objectValue: true,
                            confidence: true,
                            objectEntity: { select: { name: true } },
                        },
                    },
                    communityMemberships: {
                        include: {
                            community: { select: { name: true } },
                        },
                    },
                    _count: {
                        select: {
                            subjectFacts: { where: { validTo: null } },
                            objectFacts: { where: { validTo: null } },
                        },
                    },
                },
            })
            : [];

        // Build lookup by normalized name
        const graphIntelMap = new Map(
            knowledgeEntities.map(e => [
                e.nameNormalized,
                {
                    facts: e.subjectFacts.map(f => ({
                        predicate: f.predicate,
                        value: f.objectEntity?.name || f.objectValue,
                        confidence: f.confidence,
                    })),
                    communities: e.communityMemberships.map(m => m.community.name),
                    factCount: e._count.subjectFacts + e._count.objectFacts,
                },
            ])
        );

        const enrichedNodes = nodes.map(n => ({
            ...n,
            graphIntel: graphIntelMap.get(n.name.toLowerCase()) || null,
        }));

        return NextResponse.json({
            stakeholders: enrichedNodes, // Backwards combat for Grid
            graph: {
                nodes: enrichedNodes,
                links: Object.values(links)
            }
        });
    } catch (error) {
        console.error('[STAKEHOLDERS_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
