import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { PowerLevel, InfluenceRole, PoliticalStance, CommunicationStyle, PersonaArchetype } from '@prisma/client';
import { recordCorrection } from '@/lib/correction-learning';

export const dynamic = 'force-dynamic';

// Relationship type -> PowerLevel + InfluenceRole mapping
const RELATIONSHIP_MAP: Record<string, { powerLevel: PowerLevel; influenceRole: InfluenceRole; politicalStance?: PoliticalStance }> = {
    // Org hierarchy
    manager:              { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    direct_report:        { powerLevel: 'LOW',    influenceRole: 'END_USER' },
    peer:                 { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    cross_functional:     { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    executive_sponsor:    { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    skip_level:           { powerLevel: 'HIGH',   influenceRole: 'INFLUENCER' },
    board_member:         { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    // Customer / External
    customer_buyer:       { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    customer_champion:    { powerLevel: 'HIGH',   influenceRole: 'INFLUENCER' },
    customer_influencer:  { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    customer_end_user:    { powerLevel: 'LOW',    influenceRole: 'END_USER' },
    customer_technical:   { powerLevel: 'MEDIUM', influenceRole: 'GATEKEEPER' },
    customer_executive:   { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    // Vendor / Partner
    vendor:               { powerLevel: 'MEDIUM', influenceRole: 'END_USER' },
    partner:              { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    investor:             { powerLevel: 'HIGH',   influenceRole: 'DECISION_MAKER' },
    // Advisory / Mentorship
    mentor:               { powerLevel: 'HIGH',   influenceRole: 'INFLUENCER' },
    mentee:               { powerLevel: 'LOW',    influenceRole: 'END_USER' },
    advisor:              { powerLevel: 'HIGH',   influenceRole: 'INFLUENCER' },
    // Dynamics
    blocker:              { powerLevel: 'HIGH',   influenceRole: 'GATEKEEPER', politicalStance: 'SKEPTIC' },
    gatekeeper:           { powerLevel: 'MEDIUM', influenceRole: 'GATEKEEPER' },
};

// Fallback for custom relationship types the user creates
const CUSTOM_RELATIONSHIP_DEFAULTS: { powerLevel: PowerLevel; influenceRole: InfluenceRole } = {
    powerLevel: 'MEDIUM',
    influenceRole: 'INFLUENCER',
};

// Valid enum values for validation
const VALID_POLITICAL_STANCES: Set<string> = new Set(['CHAMPION', 'SUPPORTIVE', 'NEUTRAL', 'SKEPTIC', 'HOSTILE', 'UNKNOWN']);
const VALID_COMM_STYLES: Set<string> = new Set(['DIRECT', 'DIPLOMATIC', 'DATA_DRIVEN', 'NARRATIVE', 'VISUAL', 'RELATIONSHIP', 'COLLABORATIVE', 'FORMAL', 'STORY_DRIVEN']);
const VALID_PERSONA_ARCHETYPES: Set<string> = new Set(['DRIVER', 'ANALYST', 'COLLABORATOR', 'VISIONARY', 'GUARDIAN', 'POLITICIAN', 'CHAMPION', 'PRAGMATIST', 'SKEPTIC', 'CONSERVATIVE', 'OPERATOR']);

// Derive context from relationship type
function getContextFromRelationship(relationship: string): string {
    if (['customer_buyer', 'customer_champion', 'customer_influencer', 'customer_end_user', 'customer_technical', 'customer_executive'].includes(relationship)) {
        return 'customer';
    }
    if (['vendor', 'partner', 'investor'].includes(relationship)) {
        return 'customer'; // external context
    }
    return 'org';
}

// GET: Returns user's complete network data
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const stakeholderSelect = {
            id: true,
            name: true,
            email: true,
            role: true,
            organization: true,
            teamId: true,
            powerLevel: true,
            influenceRole: true,
            politicalStance: true,
            archetype: true, // stores relationship type label
            influenceLevel: true, // stores context: org|project|customer
            relationshipStrength: true,
            lastInteraction: true,
            interactionCount: true,
            // Extended attributes
            communicationStyle: true,
            personaArchetype: true,
            primaryMotivation: true,
            userNotes: true,
            isImportant: true,
            createdAt: true,
        };

        // Get user email to filter self out of stakeholder list
        const selfUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const selfEmail = selfUser?.email?.toLowerCase();

        const [allStakeholdersRaw, teams, projects, domainContext, orgs, relationshipFacts] = await Promise.all([
            prisma.stakeholderProfile.findMany({
                where: { userId, validationStatus: { not: 'ARCHIVED' } },
                orderBy: [{ relationshipStrength: 'desc' }, { name: 'asc' }],
                select: {
                    ...stakeholderSelect,
                    orgId: true,
                },
            }),
            prisma.professionalTeam.findMany({
                where: { userId },
                select: { id: true, name: true, context: true, orgId: true },
            }),
            prisma.professionalProject.findMany({
                where: { userId },
                select: { id: true, name: true, context: true, status: true, orgId: true },
            }),
            prisma.domainContext.findFirst({
                where: { userId },
                select: { organization: true, landscape: true },
            }),
            prisma.organization.findMany({
                where: { userId },
                select: {
                    id: true, name: true, domain: true, industry: true,
                    relationToUser: true, size: true, parentOrgId: true,
                },
            }),
            // Pull relationships directly from the knowledge graph — single source of truth
            prisma.knowledgeFact.findMany({
                where: {
                    userId,
                    predicate: { in: ['reports_to', 'manages', 'blocks', 'supports', 'allies_with', 'objects_to', 'mentors', 'works_with'] },
                    validTo: null, // current facts only
                    confidence: { gte: 0.4 },
                },
                select: {
                    predicate: true,
                    confidence: true,
                    source: true,
                    subject: { select: { id: true, name: true, type: true } },
                    objectEntity: { select: { id: true, name: true, type: true } },
                },
            }),
        ]);

        // Filter out user's own profile if auto-discovered
        const allStakeholders = selfEmail
            ? allStakeholdersRaw.filter(s => s.email?.toLowerCase() !== selfEmail)
            : allStakeholdersRaw;

        // Split: classified (user set archetype) vs discovered (auto-created from meetings)
        const classified: typeof allStakeholders = [];
        const discovered: typeof allStakeholders = [];

        for (const s of allStakeholders) {
            if (s.archetype) {
                classified.push(s);
            } else {
                discovered.push(s);
            }
        }

        // Group classified stakeholders by context
        const org: typeof classified = [];
        const project: typeof classified = [];
        const customer: typeof classified = [];

        for (const s of classified) {
            const ctx = s.influenceLevel || 'org';
            if (ctx === 'customer') {
                customer.push(s);
            } else if (ctx === 'project' || s.teamId) {
                project.push(s);
            } else {
                org.push(s);
            }
        }

        // Build graph edges from knowledge graph facts
        // Map KnowledgeEntity names → StakeholderProfile IDs for rendering
        const stakeholderByName = new Map<string, string>();
        for (const s of allStakeholders) {
            stakeholderByName.set(s.name.toLowerCase(), s.id);
        }

        const graphEdges: Array<{
            source: string; sourceType: string;
            target: string; targetType: string;
            relationType: string; confidence: number;
        }> = [];

        for (const fact of relationshipFacts) {
            if (!fact.subject || !fact.objectEntity) continue;
            if (fact.subject.type !== 'PERSON' || fact.objectEntity.type !== 'PERSON') continue;

            // Match entity names to stakeholder profile IDs
            const sourceId = stakeholderByName.get(fact.subject.name.toLowerCase());
            const targetId = stakeholderByName.get(fact.objectEntity.name.toLowerCase());

            // If either person is the user themselves, use userId as the source/target
            const subjectIsUser = fact.subject.name.toLowerCase() === 'self' ||
                (selfEmail && fact.subject.name.toLowerCase().includes(selfEmail.split('@')[0]));
            const objectIsUser = fact.objectEntity.name.toLowerCase() === 'self' ||
                (selfEmail && fact.objectEntity.name.toLowerCase().includes(selfEmail.split('@')[0]));

            const fromId = subjectIsUser ? userId : sourceId;
            const fromType = subjectIsUser ? 'USER' : 'STAKEHOLDER';
            const toId = objectIsUser ? userId : targetId;
            const toType = objectIsUser ? 'USER' : 'STAKEHOLDER';

            if (fromId && toId && fromId !== toId) {
                graphEdges.push({
                    source: fromId,
                    sourceType: fromType,
                    target: toId,
                    targetType: toType,
                    relationType: fact.predicate,
                    confidence: fact.confidence,
                });
            }
        }

        // Also update StakeholderProfile.archetype from reports_to/manages facts
        // so the stakeholder list shows hierarchy labels
        for (const fact of relationshipFacts) {
            if (!fact.objectEntity || fact.objectEntity.type !== 'PERSON') continue;
            const subjectIsUser = fact.subject?.name?.toLowerCase() === 'self';
            if (!subjectIsUser) continue;

            // The user reports_to someone → that person is "manager"
            // The user manages someone → that person is "direct_report"
            const targetName = fact.objectEntity.name.toLowerCase();
            const targetId = stakeholderByName.get(targetName);
            if (!targetId) continue;

            const archetypeMap: Record<string, string> = {
                reports_to: 'manager',
                manages: 'direct_report',
                mentors: 'mentee',
                blocks: 'blocker',
                allies_with: 'peer',
            };

            const archetype = archetypeMap[fact.predicate];
            if (archetype) {
                const target = allStakeholders.find(s => s.id === targetId);
                if (target && !target.archetype) {
                    // Update in-memory for this response (non-blocking DB update)
                    target.archetype = archetype;
                    prisma.stakeholderProfile.update({
                        where: { id: targetId },
                        data: { archetype },
                    }).catch(err => console.error('[NETWORK] Failed to update archetype for', targetId, err));
                }
            }
        }

        return NextResponse.json({
            stakeholders: classified,
            discovered,
            grouped: { org, project, customer },
            teams,
            projects,
            orgs,
            orgContext: domainContext,
            graphEdges,
            totalCount: classified.length,
            discoveredCount: discovered.length,
        });
    } catch (error) {
        console.error('[NETWORK_GET]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// POST: Add a new stakeholder
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            name, email, role, relationship, context, teamId, projectId, company, orgId,
            // Extended attributes
            politicalStance: bodyStance, communicationStyle: bodyCommStyle,
            personaArchetype: bodyArchetype, primaryMotivation, userNotes,
        } = body;

        if (!name || !relationship) {
            return NextResponse.json({ error: 'Name and relationship are required' }, { status: 400 });
        }

        // Support both known and custom relationship types
        const mapping = RELATIONSHIP_MAP[relationship] || CUSTOM_RELATIONSHIP_DEFAULTS;

        // Determine context
        const effectiveContext = context || getContextFromRelationship(relationship);

        // Validate optional enum fields
        const stance = bodyStance && VALID_POLITICAL_STANCES.has(bodyStance)
            ? bodyStance as PoliticalStance
            : mapping.politicalStance || 'UNKNOWN';
        const commStyle = bodyCommStyle && VALID_COMM_STYLES.has(bodyCommStyle)
            ? bodyCommStyle as CommunicationStyle
            : undefined;
        const persona = bodyArchetype && VALID_PERSONA_ARCHETYPES.has(bodyArchetype)
            ? bodyArchetype as PersonaArchetype
            : undefined;

        const stakeholder = await prisma.stakeholderProfile.create({
            data: {
                userId,
                name,
                email: email || undefined,
                role: role || undefined,
                organization: company || undefined,
                orgId: orgId || undefined,
                teamId: teamId || undefined,
                powerLevel: mapping.powerLevel,
                influenceRole: mapping.influenceRole,
                politicalStance: stance,
                archetype: relationship,
                influenceLevel: effectiveContext,
                relationshipStrength: 0.5,
                validationStatus: 'DRAFT',
                // Extended
                communicationStyle: commStyle,
                personaArchetype: persona,
                primaryMotivation: primaryMotivation || undefined,
                userNotes: userNotes || undefined,
            },
        });

        return NextResponse.json({ stakeholder }, { status: 201 });
    } catch (error) {
        console.error('[NETWORK_POST]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// PATCH: Update a stakeholder
export async function PATCH(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            id, name, email, role, relationship, context, teamId, company, orgId,
            politicalStance: bodyStance, communicationStyle: bodyCommStyle,
            personaArchetype: bodyArchetype, primaryMotivation, userNotes,
            isImportant,
        } = body;

        if (!id) {
            return NextResponse.json({ error: 'Stakeholder id is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await prisma.stakeholderProfile.findFirst({
            where: { id, userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};

        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (company !== undefined) updateData.organization = company;
        if (orgId !== undefined) updateData.orgId = orgId || null;
        if (teamId !== undefined) updateData.teamId = teamId;
        if (context !== undefined) updateData.influenceLevel = context;

        if (relationship !== undefined) {
            // Support both known and custom relationship types
            const mapping = RELATIONSHIP_MAP[relationship] || CUSTOM_RELATIONSHIP_DEFAULTS;
            updateData.archetype = relationship;
            updateData.powerLevel = mapping.powerLevel;
            updateData.influenceRole = mapping.influenceRole;
            if (mapping.politicalStance) {
                updateData.politicalStance = mapping.politicalStance;
            }
        }

        // Extended attributes
        if (bodyStance !== undefined && VALID_POLITICAL_STANCES.has(bodyStance)) {
            updateData.politicalStance = bodyStance;
        }
        if (bodyCommStyle !== undefined && VALID_COMM_STYLES.has(bodyCommStyle)) {
            updateData.communicationStyle = bodyCommStyle;
        }
        if (bodyArchetype !== undefined && VALID_PERSONA_ARCHETYPES.has(bodyArchetype)) {
            updateData.personaArchetype = bodyArchetype;
        }
        if (primaryMotivation !== undefined) updateData.primaryMotivation = primaryMotivation;
        if (userNotes !== undefined) updateData.userNotes = userNotes;
        if (typeof isImportant === 'boolean') updateData.isImportant = isImportant;

        const stakeholder = await prisma.stakeholderProfile.update({
            where: { id },
            data: updateData,
        });

        // Record corrections for AI-generated fields
        const AI_FIELDS = ['personaArchetype', 'communicationStyle', 'politicalStance',
            'powerLevel', 'influenceRole', 'role', 'organization'] as const;
        let correctionsRecorded = 0;
        const correctionContext = {
            name: existing.name,
            email: existing.email,
            organization: existing.organization,
        };

        for (const field of AI_FIELDS) {
            const updateKey = field === 'organization' ? 'organization' : field;
            if (updateKey in updateData) {
                const aiValue = (existing as Record<string, unknown>)[field];
                const userValue = updateData[updateKey];
                if (aiValue !== userValue && userValue != null) {
                    await recordCorrection({
                        userId,
                        entityType: 'stakeholder_profile',
                        entityId: id,
                        field,
                        aiValue: aiValue != null ? String(aiValue) : null,
                        userValue: String(userValue),
                        context: correctionContext,
                    });
                    correctionsRecorded++;
                }
            }
        }

        return NextResponse.json({
            stakeholder,
            learned: correctionsRecorded > 0,
            learnedMessage: correctionsRecorded > 0
                ? `Got it — Mira will remember this about ${existing.name}.`
                : undefined,
        });
    } catch (error) {
        console.error('[NETWORK_PATCH]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}

// DELETE: Remove a stakeholder
export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Stakeholder id is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await prisma.stakeholderProfile.findFirst({
            where: { id, userId },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Archive instead of hard delete — preserves discovered people for re-classification
        await prisma.stakeholderProfile.update({
            where: { id },
            data: {
                validationStatus: 'ARCHIVED',
                archetype: null, // Reset classification so it won't appear in grouped sections
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[NETWORK_DELETE]', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
