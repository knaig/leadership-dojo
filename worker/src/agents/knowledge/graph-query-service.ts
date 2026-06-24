/**
 * Graph Query Service
 *
 * Reusable query patterns for consuming the knowledge graph:
 * - Pre-meeting prep: find attendee entities -> facts -> shared communities
 * - Morning brief: top active communities, recent facts, knowledge gaps
 * - Context agent: entity lookup by name -> 2-hop facts -> communities
 * - Knowledge gap analysis: sparse entities, low-confidence facts, unsummarized communities
 */

import { prisma } from '../../lib/prisma';
import { normalizeName } from './entity-resolver';

// ============================================================================
// PRE-MEETING PREP
// ============================================================================

export interface AttendeeIntelligence {
    entityId: string;
    name: string;
    type: string;
    facts: Array<{
        predicate: string;
        objectName?: string;
        objectValue?: string;
        confidence: number;
        source: string;
    }>;
    sharedCommunities: Array<{
        communityId: string;
        communityName: string;
        summary?: string;
    }>;
    sharedFacts: Array<{
        predicate: string;
        objectName?: string;
        objectValue?: string;
    }>;
}

/**
 * Get rich intelligence about meeting attendees from the knowledge graph.
 * Replaces the ad-hoc queries in proactive-agent buildPreMeetingCoachingContext().
 */
export async function getAttendeeIntelligence(
    userId: string,
    attendeeNames: string[]
): Promise<AttendeeIntelligence[]> {
    const result: AttendeeIntelligence[] = [];

    for (const name of attendeeNames) {
        const normalized = normalizeName(name);
        if (!normalized) continue;

        // Find the person entity
        const entity = await prisma.knowledgeEntity.findUnique({
            where: {
                userId_type_nameNormalized: {
                    userId,
                    type: 'PERSON',
                    nameNormalized: normalized,
                },
            },
        });

        if (!entity) continue;

        // Get current facts about this person
        const facts = await prisma.knowledgeFact.findMany({
            where: {
                subjectId: entity.id,
                validTo: null,
                confidence: { gte: 0.3 },
            },
            include: {
                objectEntity: { select: { name: true, type: true } },
            },
            orderBy: { confidence: 'desc' },
            take: 20,
        });

        // Get communities this person belongs to
        const memberships = await prisma.communityMember.findMany({
            where: { entityId: entity.id },
            include: {
                community: {
                    select: { id: true, name: true, summary: true },
                },
            },
        });

        // Find facts shared between this person and the user's "Self" entity
        const selfEntity = await prisma.knowledgeEntity.findUnique({
            where: {
                userId_type_nameNormalized: {
                    userId,
                    type: 'PERSON',
                    nameNormalized: 'self',
                },
            },
        });

        let sharedFacts: any[] = [];
        if (selfEntity) {
            // Find facts where both entities are involved with the same object
            const personObjectIds = facts
                .filter(f => f.objectEntityId)
                .map(f => f.objectEntityId!);

            if (personObjectIds.length > 0) {
                const selfFacts = await prisma.knowledgeFact.findMany({
                    where: {
                        subjectId: selfEntity.id,
                        objectEntityId: { in: personObjectIds },
                        validTo: null,
                    },
                    include: {
                        objectEntity: { select: { name: true } },
                    },
                });

                sharedFacts = selfFacts.map(f => ({
                    predicate: f.predicate,
                    objectName: f.objectEntity?.name,
                    objectValue: f.objectValue,
                }));
            }
        }

        result.push({
            entityId: entity.id,
            name: entity.name,
            type: entity.type,
            facts: facts.map(f => ({
                predicate: f.predicate,
                objectName: f.objectEntity?.name,
                objectValue: f.objectValue || undefined,
                confidence: f.confidence,
                source: f.source,
            })),
            sharedCommunities: memberships.map(m => ({
                communityId: m.community.id,
                communityName: m.community.name,
                summary: m.community.summary || undefined,
            })),
            sharedFacts,
        });
    }

    return result;
}

// ============================================================================
// MORNING BRIEF
// ============================================================================

export interface MorningBriefContext {
    activeCommunities: Array<{
        name: string;
        summary?: string;
        activityScore: number;
        recentFacts: number;
    }>;
    recentFacts: Array<{
        subjectName: string;
        predicate: string;
        objectName?: string;
        objectValue?: string;
        source: string;
        recordedAt: Date;
    }>;
    knowledgeGaps: Array<{
        entityName: string;
        entityType: string;
        factCount: number;
        reason: string;
    }>;
}

/**
 * Gather context for the morning brief from the knowledge graph.
 */
export async function getMorningBriefContext(userId: string): Promise<MorningBriefContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Active communities
    const communities = await prisma.knowledgeCommunity.findMany({
        where: { userId, level: 0, activityScore: { gt: 0 } },
        orderBy: { activityScore: 'desc' },
        take: 5,
    });

    // Recent facts (last 24 hours)
    const recentFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            recordedAt: { gte: twentyFourHoursAgo },
            validTo: null,
        },
        include: {
            subject: { select: { name: true } },
            objectEntity: { select: { name: true } },
        },
        orderBy: { recordedAt: 'desc' },
        take: 10,
    });

    // Knowledge gaps: entities with few facts
    const gaps = await analyzeKnowledgeGaps(userId);

    return {
        activeCommunities: communities.map(c => ({
            name: c.name,
            summary: c.summary || undefined,
            activityScore: c.activityScore,
            recentFacts: c.factCount,
        })),
        recentFacts: recentFacts.map(f => ({
            subjectName: f.subject.name,
            predicate: f.predicate,
            objectName: f.objectEntity?.name,
            objectValue: f.objectValue || undefined,
            source: f.source,
            recordedAt: f.recordedAt,
        })),
        knowledgeGaps: gaps,
    };
}

// ============================================================================
// KNOWLEDGE GAP ANALYSIS
// ============================================================================

/**
 * Analyze the graph for knowledge gaps:
 * - Entities with < 5 facts
 * - High-interaction entities with low-confidence facts
 * - Communities without summaries
 */
export async function analyzeKnowledgeGaps(userId: string): Promise<Array<{
    entityName: string;
    entityType: string;
    factCount: number;
    reason: string;
}>> {
    const gaps: Array<{ entityName: string; entityType: string; factCount: number; reason: string }> = [];

    // Find PERSON entities with few facts (important people we don't know much about)
    const sparsePeople = await prisma.knowledgeEntity.findMany({
        where: { userId, type: 'PERSON', nameNormalized: { not: 'self' } },
        include: {
            subjectFacts: {
                where: { validTo: null },
                select: { id: true },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 200, // Cap to prevent memory blowout for users with many contacts
    });

    for (const person of sparsePeople) {
        if (person.subjectFacts.length < 5 && person.subjectFacts.length > 0) {
            gaps.push({
                entityName: person.name,
                entityType: person.type,
                factCount: person.subjectFacts.length,
                reason: `Only ${person.subjectFacts.length} facts known about this person`,
            });
        }
    }

    // Sort by fact count (ascending) — most sparse first
    gaps.sort((a, b) => a.factCount - b.factCount);

    return gaps.slice(0, 10);
}

// ============================================================================
// CONTEXT AGENT SUPPORT
// ============================================================================

/**
 * Find entities matching a name query (fuzzy match via normalized name).
 */
export async function findEntitiesByName(
    userId: string,
    query: string
): Promise<Array<{ id: string; name: string; type: string }>> {
    const normalized = normalizeName(query);
    if (!normalized) return [];

    return prisma.knowledgeEntity.findMany({
        where: {
            userId,
            nameNormalized: { contains: normalized },
        },
        select: { id: true, name: true, type: true },
        take: 10,
    });
}

/**
 * Get 2-hop facts from an entity:
 * Hop 1: Direct facts about the entity
 * Hop 2: Facts about entities connected in hop 1
 */
export async function getTwoHopFacts(
    userId: string,
    entityId: string
): Promise<{
    directFacts: any[];
    connectedFacts: any[];
}> {
    // Hop 1: Direct facts
    const directFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            subjectId: entityId,
            validTo: null,
            confidence: { gte: 0.3 },
        },
        include: {
            objectEntity: { select: { id: true, name: true, type: true } },
        },
        orderBy: { confidence: 'desc' },
        take: 20,
    });

    // Collect connected entity IDs
    const connectedIds = directFacts
        .filter(f => f.objectEntityId)
        .map(f => f.objectEntityId!)
        .filter((id, i, arr) => arr.indexOf(id) === i); // unique

    // Hop 2: Facts about connected entities
    const connectedFacts = connectedIds.length > 0
        ? await prisma.knowledgeFact.findMany({
            where: {
                userId,
                subjectId: { in: connectedIds },
                validTo: null,
                confidence: { gte: 0.4 },
            },
            include: {
                subject: { select: { name: true, type: true } },
                objectEntity: { select: { name: true, type: true } },
            },
            orderBy: { confidence: 'desc' },
            take: 30,
        })
        : [];

    return { directFacts, connectedFacts };
}

/**
 * Get communities that an entity belongs to, with member details.
 */
export async function getEntityCommunities(
    entityId: string,
    userId?: string
): Promise<Array<{
    communityId: string;
    name: string;
    summary?: string;
    members: Array<{ name: string; type: string; role?: string }>;
}>> {
    const memberships = await prisma.communityMember.findMany({
        where: { entityId, ...(userId ? { community: { userId } } : {}) },
        include: {
            community: {
                select: {
                    id: true,
                    name: true,
                    summary: true,
                    members: {
                        include: {
                            entity: { select: { name: true, type: true } },
                        },
                        take: 10,
                    },
                },
            },
        },
    });

    return memberships.map(m => ({
        communityId: m.community.id,
        name: m.community.name,
        summary: m.community.summary || undefined,
        members: m.community.members.map(cm => ({
            name: cm.entity.name,
            type: cm.entity.type,
            role: cm.role || undefined,
        })),
    }));
}

// ============================================================================
// PROJECT-SCOPED QUERIES
// ============================================================================

/**
 * Get all facts related to a project:
 * - Facts explicitly tagged with projectId
 * - Facts where subject or object is the project's knowledge entity
 */
export async function getProjectFacts(
    userId: string,
    projectId: string,
    knowledgeEntityId?: string | null,
    limit: number = 50
): Promise<Array<{
    id: string;
    subjectName: string;
    predicate: string;
    objectName?: string;
    objectValue?: string;
    confidence: number;
    source: string;
    recordedAt: Date;
}>> {
    const conditions: any[] = [
        { userId, projectId, validTo: null },
    ];

    if (knowledgeEntityId) {
        conditions.push(
            { userId, subjectId: knowledgeEntityId, validTo: null },
            { userId, objectEntityId: knowledgeEntityId, validTo: null },
        );
    }

    const facts = await prisma.knowledgeFact.findMany({
        where: { OR: conditions },
        include: {
            subject: { select: { name: true, type: true } },
            objectEntity: { select: { name: true, type: true } },
        },
        orderBy: { recordedAt: 'desc' },
        take: limit,
    });

    return facts.map(f => ({
        id: f.id,
        subjectName: f.subject.name,
        predicate: f.predicate,
        objectName: f.objectEntity?.name,
        objectValue: f.objectValue || undefined,
        confidence: f.confidence,
        source: f.source,
        recordedAt: f.recordedAt,
    }));
}

/**
 * Get people connected to a project via knowledge facts.
 */
export async function getProjectPeople(
    userId: string,
    projectId: string,
    knowledgeEntityId?: string | null
): Promise<Array<{
    entityId: string;
    name: string;
    factCount: number;
    predicates: string[];
}>> {
    const conditions: any[] = [
        { userId, projectId, validTo: null },
    ];

    if (knowledgeEntityId) {
        conditions.push(
            { userId, objectEntityId: knowledgeEntityId, validTo: null },
        );
    }

    // Find facts and extract person entities
    const facts = await prisma.knowledgeFact.findMany({
        where: { OR: conditions },
        include: {
            subject: { select: { id: true, name: true, type: true } },
        },
    });

    // Group by person entity
    const personMap = new Map<string, { name: string; predicates: Set<string>; count: number }>();

    for (const fact of facts) {
        if (fact.subject.type !== 'PERSON') continue;
        const existing = personMap.get(fact.subject.id);
        if (existing) {
            existing.predicates.add(fact.predicate);
            existing.count++;
        } else {
            personMap.set(fact.subject.id, {
                name: fact.subject.name,
                predicates: new Set([fact.predicate]),
                count: 1,
            });
        }
    }

    return Array.from(personMap.entries())
        .map(([entityId, data]) => ({
            entityId,
            name: data.name,
            factCount: data.count,
            predicates: Array.from(data.predicates),
        }))
        .sort((a, b) => b.factCount - a.factCount);
}
