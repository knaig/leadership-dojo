/**
 * Knowledge Graph Migration
 *
 * One-time backfill from existing StakeholderProfile/StakeholderIntelligence
 * into KnowledgeEntity + KnowledgeFact with source=MIGRATED.
 *
 * Run once per user. Safe to re-run (uses sourceModelType/sourceModelId for dedup).
 */

import { prisma } from '../../lib/prisma';
import { resolveEntity } from './entity-resolver';
import { createFact } from './fact-manager';

/**
 * Migrate a user's existing stakeholder data into the knowledge graph.
 */
export async function migrateStakeholdersToGraph(userId: string): Promise<{
    entitiesMigrated: number;
    factsMigrated: number;
}> {
    console.log(`[KGMigration] Starting migration for user ${userId.substring(0, 8)}...`);

    let entitiesMigrated = 0;
    let factsMigrated = 0;

    // Fetch all stakeholders with their intelligence
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        include: {
            intelligence: true,
            org: true,
            team: true,
        },
    });

    if (stakeholders.length === 0) {
        console.log(`[KGMigration] No stakeholders to migrate`);
        return { entitiesMigrated: 0, factsMigrated: 0 };
    }

    console.log(`[KGMigration] Migrating ${stakeholders.length} stakeholders`);

    // Create "Self" entity for the user
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, jobTitle: true, company: true },
    });

    const selfEntityId = await resolveEntity({
        userId,
        type: 'PERSON',
        name: 'Self',
        properties: {
            isSelf: true,
            jobTitle: user?.jobTitle,
            company: user?.company,
        },
    });
    entitiesMigrated++;

    // Migrate user's own role if known
    if (user?.jobTitle) {
        const result = await createFact({
            userId,
            subjectId: selfEntityId,
            predicate: 'has_role',
            objectValue: user.jobTitle,
            source: 'MIGRATED',
            confidence: 0.8,
        });
        if (result.action === 'CREATED') factsMigrated++;
    }

    if (user?.company) {
        const orgEntityId = await resolveEntity({
            userId,
            type: 'ORGANIZATION',
            name: user.company,
        });
        entitiesMigrated++;

        const result = await createFact({
            userId,
            subjectId: selfEntityId,
            predicate: 'works_at',
            objectEntityId: orgEntityId,
            source: 'MIGRATED',
            confidence: 0.9,
        });
        if (result.action === 'CREATED') factsMigrated++;
    }

    // Process each stakeholder
    for (const stakeholder of stakeholders) {
        try {
            // Create PERSON entity
            const personEntityId = await resolveEntity({
                userId,
                type: 'PERSON',
                name: stakeholder.name,
                properties: {
                    email: stakeholder.email,
                    role: stakeholder.role,
                    powerLevel: stakeholder.powerLevel,
                    influenceRole: stakeholder.influenceRole,
                    politicalStance: stakeholder.politicalStance,
                },
                sourceModelType: 'StakeholderProfile',
                sourceModelId: stakeholder.id,
            });
            entitiesMigrated++;

            // Migrate role
            if (stakeholder.role) {
                const result = await createFact({
                    userId,
                    subjectId: personEntityId,
                    predicate: 'has_role',
                    objectValue: stakeholder.role,
                    source: 'MIGRATED',
                    sourceRefType: 'StakeholderProfile',
                    sourceRefId: stakeholder.id,
                    confidence: 0.7,
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            // Migrate organization
            if (stakeholder.organization) {
                const orgEntityId = await resolveEntity({
                    userId,
                    type: 'ORGANIZATION',
                    name: stakeholder.organization,
                });
                entitiesMigrated++;

                const result = await createFact({
                    userId,
                    subjectId: personEntityId,
                    predicate: 'works_at',
                    objectEntityId: orgEntityId,
                    source: 'MIGRATED',
                    sourceRefType: 'StakeholderProfile',
                    sourceRefId: stakeholder.id,
                    confidence: 0.7,
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            // Migrate team
            if (stakeholder.team) {
                const teamEntityId = await resolveEntity({
                    userId,
                    type: 'TEAM',
                    name: stakeholder.team.name,
                    sourceModelType: 'ProfessionalTeam',
                    sourceModelId: stakeholder.teamId || undefined,
                });
                entitiesMigrated++;

                const result = await createFact({
                    userId,
                    subjectId: personEntityId,
                    predicate: 'part_of_team',
                    objectEntityId: teamEntityId,
                    source: 'MIGRATED',
                    confidence: 0.7,
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            // Migrate power dynamics as facts
            if (stakeholder.powerLevel && stakeholder.powerLevel !== 'LOW') {
                const result = await createFact({
                    userId,
                    subjectId: personEntityId,
                    predicate: 'has_power_level',
                    objectValue: stakeholder.powerLevel,
                    source: 'MIGRATED',
                    confidence: 0.6,
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            if (stakeholder.influenceRole && stakeholder.influenceRole !== 'UNKNOWN') {
                const result = await createFact({
                    userId,
                    subjectId: personEntityId,
                    predicate: 'has_influence_role',
                    objectValue: stakeholder.influenceRole,
                    source: 'MIGRATED',
                    confidence: 0.6,
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            // Migrate relationship to self
            if (stakeholder.interactionCount && stakeholder.interactionCount > 0) {
                const result = await createFact({
                    userId,
                    subjectId: selfEntityId,
                    predicate: 'interacts_with',
                    objectEntityId: personEntityId,
                    source: 'MIGRATED',
                    confidence: 0.7,
                    metadata: {
                        interactionCount: stakeholder.interactionCount,
                        relationshipStrength: stakeholder.relationshipStrength,
                    },
                });
                if (result.action === 'CREATED') factsMigrated++;
            }

            // Migrate StakeholderIntelligence if available
            if (stakeholder.intelligence) {
                const intel = stakeholder.intelligence;

                if (intel.profileSummary) {
                    const result = await createFact({
                        userId,
                        subjectId: personEntityId,
                        predicate: 'has_profile_summary',
                        objectValue: intel.profileSummary.substring(0, 500),
                        source: 'MIGRATED',
                        confidence: 0.5,
                    });
                    if (result.action === 'CREATED') factsMigrated++;
                }

                if (intel.recentTopics && intel.recentTopics.length > 0) {
                    for (const topic of intel.recentTopics.slice(0, 5)) {
                        const topicEntityId = await resolveEntity({
                            userId,
                            type: 'TOPIC',
                            name: topic,
                        });
                        entitiesMigrated++;

                        const result = await createFact({
                            userId,
                            subjectId: personEntityId,
                            predicate: 'discusses',
                            objectEntityId: topicEntityId,
                            source: 'MIGRATED',
                            confidence: 0.5,
                        });
                        if (result.action === 'CREATED') factsMigrated++;
                    }
                }

                if (intel.successPatterns && intel.successPatterns.length > 0) {
                    for (const pattern of intel.successPatterns.slice(0, 3)) {
                        const result = await createFact({
                            userId,
                            subjectId: personEntityId,
                            predicate: 'has_success_pattern',
                            objectValue: pattern,
                            source: 'MIGRATED',
                            confidence: 0.5,
                        });
                        if (result.action === 'CREATED') factsMigrated++;
                    }
                }
            }
        } catch (err: any) {
            console.error(`[KGMigration] Error migrating stakeholder ${stakeholder.name}: ${err.message}`);
        }
    }

    console.log(`[KGMigration] Done — ${entitiesMigrated} entities, ${factsMigrated} facts migrated`);
    return { entitiesMigrated, factsMigrated };
}
