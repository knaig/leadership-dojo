/**
 * Community Detection Agent (GraphRAG-style)
 *
 * 1. Connected components via Postgres recursive CTE — find clusters of entities connected by shared facts
 * 2. LLM summarization — for each cluster of 3+ entities, generate name + narrative summary
 * 3. Hierarchy — Level 0 = raw clusters, Level 1 = merged clusters with shared members
 * 4. Activity scoring — weighted fact count in last 7 days
 *
 * Schedule: Daily at 12:30 UTC
 */

import { prisma } from '../../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry, WorkerLLMConfig } from '../../lib/user-llm';

/**
 * Run community detection for a user.
 */
export async function detectCommunities(userId: string): Promise<{ communitiesFound: number }> {
    console.log(`[CommunityDetection] Starting for user ${userId.substring(0, 8)}...`);

    // Fetch user's LLM config once for all summarization calls
    const llmConfig = await getUserLLMConfig(userId);

    // 1. Find connected components using adjacency from facts
    const components = await findConnectedComponents(userId);
    console.log(`[CommunityDetection] Found ${components.length} connected components`);

    // Filter to meaningful clusters (3+ entities)
    const meaningfulClusters = components.filter(c => c.length >= 3);

    if (meaningfulClusters.length === 0) {
        console.log(`[CommunityDetection] No meaningful clusters (need 3+ entities)`);
        return { communitiesFound: 0 };
    }

    // 2. Clear existing level-0 communities and recreate in a transaction
    //    to prevent data loss if the process crashes mid-way
    await prisma.$transaction(async (tx) => {
        await tx.communityMember.deleteMany({
            where: { community: { userId, level: 0 } },
        });
        await tx.knowledgeCommunity.deleteMany({
            where: { userId, level: 0 },
        });
    });

    // 3. Create communities and members
    let communitiesCreated = 0;
    for (const cluster of meaningfulClusters) {
        try {
            const community = await createCommunity(userId, cluster, llmConfig);
            if (community) communitiesCreated++;
        } catch (err: any) {
            console.error(`[CommunityDetection] Error creating community: ${err.message}`);
        }
    }

    // 4. Build Level 1 hierarchy (merge clusters with significant overlap)
    await buildHierarchy(userId);

    console.log(`[CommunityDetection] Done — ${communitiesCreated} communities created`);
    return { communitiesFound: communitiesCreated };
}

/**
 * Find connected components using entity-to-entity facts.
 * Uses a Union-Find approach in application code (simpler than recursive CTE for this use case).
 */
async function findConnectedComponents(userId: string): Promise<string[][]> {
    // Get current entity-to-entity facts (capped to prevent memory blowout)
    const facts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            validTo: null,
            objectEntityId: { not: null },
            confidence: { gte: 0.3 },
        },
        select: {
            subjectId: true,
            objectEntityId: true,
        },
        take: 5000,
    });

    // Union-Find
    const parent = new Map<string, string>();

    function find(x: string): string {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) {
            parent.set(x, find(parent.get(x)!));
        }
        return parent.get(x)!;
    }

    function union(a: string, b: string): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }

    // Build unions from facts
    for (const fact of facts) {
        if (fact.objectEntityId) {
            union(fact.subjectId, fact.objectEntityId);
        }
    }

    // Group by root
    const groups = new Map<string, Set<string>>();
    for (const entityId of parent.keys()) {
        const root = find(entityId);
        if (!groups.has(root)) groups.set(root, new Set());
        groups.get(root)!.add(entityId);
    }

    return Array.from(groups.values()).map(s => Array.from(s));
}

/**
 * Create a community from a cluster of entity IDs.
 */
async function createCommunity(userId: string, entityIds: string[], llmConfig: WorkerLLMConfig): Promise<any | null> {
    // Fetch entity details
    const entities = await prisma.knowledgeEntity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, name: true, type: true },
    });

    if (entities.length < 3) return null;

    // Count recent facts for activity scoring
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentFactCount = await prisma.knowledgeFact.count({
        where: {
            userId,
            subjectId: { in: entityIds },
            recordedAt: { gte: sevenDaysAgo },
        },
    });

    // Count all facts in cluster
    const totalFactCount = await prisma.knowledgeFact.count({
        where: {
            userId,
            subjectId: { in: entityIds },
            validTo: null,
        },
    });

    // Generate name and summary via LLM
    const { name, summary } = await summarizeCluster(entities, llmConfig);

    // Determine node roles (hub = most connections, bridge = connects subclusters)
    const factCounts = await getEntityFactCounts(entityIds);
    const maxFacts = Math.max(...Array.from(factCounts.values()), 1);

    const community = await prisma.knowledgeCommunity.create({
        data: {
            userId,
            name,
            summary,
            level: 0,
            entityCount: entities.length,
            factCount: totalFactCount,
            activityScore: recentFactCount,
            lastAnalyzedAt: new Date(),
        },
    });

    // Create members with roles
    for (const entity of entities) {
        const entityFacts = factCounts.get(entity.id) || 0;
        const ratio = entityFacts / maxFacts;
        const role = ratio > 0.7 ? 'hub' : ratio > 0.3 ? 'bridge' : 'peripheral';

        await prisma.communityMember.create({
            data: {
                communityId: community.id,
                entityId: entity.id,
                role,
                weight: ratio,
            },
        });
    }

    return community;
}

/**
 * Get fact counts per entity ID.
 */
async function getEntityFactCounts(entityIds: string[]): Promise<Map<string, number>> {
    const counts = await prisma.knowledgeFact.groupBy({
        by: ['subjectId'],
        where: {
            subjectId: { in: entityIds },
            validTo: null,
        },
        _count: true,
    });

    const result = new Map<string, number>();
    for (const c of counts) {
        result.set(c.subjectId, c._count);
    }
    return result;
}

/**
 * Generate community name and summary via LLM.
 */
async function summarizeCluster(
    entities: Array<{ id: string; name: string; type: string }>,
    llmConfig: WorkerLLMConfig
): Promise<{ name: string; summary: string }> {
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        // Heuristic fallback
        const types = new Map<string, number>();
        for (const e of entities) {
            types.set(e.type, (types.get(e.type) || 0) + 1);
        }
        const dominantType = Array.from(types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';
        const sampleNames = entities.slice(0, 3).map(e => e.name).join(', ');
        return {
            name: `${dominantType} Cluster`,
            summary: `A group of ${entities.length} entities including ${sampleNames}.`,
        };
    }

    const entityList = entities.map(e => `- ${e.name} (${e.type})`).join('\n');

    const prompt = `These entities are connected in a professional knowledge graph. Generate a concise community name and 1-2 sentence summary describing what this cluster represents (e.g., a project team, a topic area, an organizational group).

ENTITIES:
${entityList}

Return JSON: { "name": "short descriptive name", "summary": "1-2 sentence narrative" }`;

    try {
        const text = await withLLMRetry(
            () => generateText(llmConfig, prompt, { temperature: 0.3, maxOutputTokens: 200 }),
            { label: 'CommunityDetection' }
        );

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (err: any) {
        console.error(`[CommunityDetection] LLM summarization failed: ${err.message}`);
    }

    // Fallback
    return {
        name: `Cluster (${entities.length} entities)`,
        summary: `Connected group including ${entities.slice(0, 3).map(e => e.name).join(', ')}.`,
    };
}

/**
 * Build Level 1 hierarchy by merging Level 0 communities with significant member overlap.
 */
async function buildHierarchy(userId: string): Promise<void> {
    const level0 = await prisma.knowledgeCommunity.findMany({
        where: { userId, level: 0 },
        include: { members: { select: { entityId: true } } },
    });

    if (level0.length < 2) return;

    // Clean up existing level-1 communities
    await prisma.communityMember.deleteMany({
        where: { community: { userId, level: 1 } },
    });
    await prisma.knowledgeCommunity.deleteMany({
        where: { userId, level: 1 },
    });

    // Find pairs with significant overlap (>30% shared members)
    const merged = new Set<string>();
    for (let i = 0; i < level0.length; i++) {
        if (merged.has(level0[i].id)) continue;

        const membersI = new Set(level0[i].members.map(m => m.entityId));
        const childIds = [level0[i].id];

        for (let j = i + 1; j < level0.length; j++) {
            if (merged.has(level0[j].id)) continue;

            const membersJ = new Set(level0[j].members.map(m => m.entityId));
            const overlap = Array.from(membersI).filter(id => membersJ.has(id)).length;
            const minSize = Math.min(membersI.size, membersJ.size);

            if (minSize > 0 && overlap / minSize > 0.3) {
                childIds.push(level0[j].id);
                merged.add(level0[j].id);
                membersJ.forEach(id => membersI.add(id));
            }
        }

        if (childIds.length > 1) {
            merged.add(level0[i].id);

            // Create level-1 parent
            const parent = await prisma.knowledgeCommunity.create({
                data: {
                    userId,
                    name: `Meta: ${level0[i].name}`,
                    level: 1,
                    entityCount: membersI.size,
                    lastAnalyzedAt: new Date(),
                },
            });

            // Link children
            for (const childId of childIds) {
                await prisma.knowledgeCommunity.update({
                    where: { id: childId },
                    data: { parentId: parent.id },
                });
            }

            // Add all unique members to parent
            for (const entityId of membersI) {
                await prisma.communityMember.create({
                    data: {
                        communityId: parent.id,
                        entityId,
                        role: 'bridge',
                        weight: 1.0,
                    },
                });
            }
        }
    }
}
