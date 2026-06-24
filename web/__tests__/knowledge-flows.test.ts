import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { prisma as dbPrisma } from '@/lib/db';

// Routes
import { GET as getGraph } from '@/app/api/knowledge/graph/route';
import { GET as getEntities } from '@/app/api/knowledge/entities/route';
import { GET as getEntityDetail } from '@/app/api/knowledge/entities/[id]/route';
import { GET as getCommunities } from '@/app/api/knowledge/communities/route';
import { PATCH as patchFact } from '@/app/api/knowledge/facts/[id]/route';

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);
const mockDbPrisma = vi.mocked(dbPrisma);

const TEST_USER_ID = 'user_flow_test';

const mockSession = {
  user: { id: TEST_USER_ID, email: 'test@example.com', name: 'Test', image: null },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

async function parseResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

// ── Cross-Module Flow Tests ──────────────────────────────────

describe('Cross-Module Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  describe('Flow: Graph → Entity Detail → Fact Verification', () => {
    it('graph nodes can be used to fetch entity details, and facts can be verified', async () => {
      // Step 1: Get graph — user sees nodes
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_1',
          name: 'Alice',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [{ id: 'fact_1' }],
          objectFacts: [],
          communityMemberships: [{ communityId: 'comm_1' }],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(1);
      mockPrisma.knowledgeFact.count.mockResolvedValue(1);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(1);

      const graphRes = await parseResponse(await getGraph());
      expect(graphRes.status).toBe(200);

      const nodeId = graphRes.body.nodes[0].id;
      expect(nodeId).toBe('ent_1');

      // Step 2: Click node → fetch entity detail
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: nodeId,
        name: 'Alice',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: 'fact_1',
            predicate: 'works_on',
            objectEntityId: 'ent_2',
            objectEntity: { id: 'ent_2', name: 'Project X', type: 'PROJECT' },
            objectValue: null,
            confidence: 0.85,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        .mockResolvedValueOnce([] as any);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        { id: 'ent_2', name: 'Project X', type: 'PROJECT' },
      ] as any);

      const detailReq = makeRequest(`http://localhost:3000/api/knowledge/entities/${nodeId}`);
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: nodeId }) })
      );
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.entity.id).toBe(nodeId);
      expect(detailRes.body.facts).toHaveLength(1);

      const factId = detailRes.body.facts[0].id;
      expect(detailRes.body.facts[0].userVerified).toBeNull();

      // Step 3: Verify the fact
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: factId,
        userId: TEST_USER_ID,
        userVerified: null,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: factId,
        userVerified: true,
      } as any);

      const verifyReq = makeRequest(`http://localhost:3000/api/knowledge/facts/${factId}`, {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const verifyRes = await parseResponse(
        await patchFact(verifyReq, { params: Promise.resolve({ id: factId }) })
      );

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.fact.userVerified).toBe(true);

      // Verify the correct fact was updated
      expect(mockPrisma.knowledgeFact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: factId },
          data: { userVerified: true },
        })
      );
    });
  });

  describe('Flow: Graph stats match entity/community list totals', () => {
    it('stats from graph endpoint are consistent with list endpoints', async () => {
      const entityData = [
        {
          id: 'ent_a',
          name: 'Person A',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [{ id: 'f1' }],
          objectFacts: [],
          communityMemberships: [],
        },
        {
          id: 'ent_b',
          name: 'Topic B',
          type: 'TOPIC',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [{ id: 'f2' }],
          communityMemberships: [],
        },
      ];

      const communityData = [
        {
          id: 'comm_a',
          name: 'Team A',
          summary: null,
          level: 0,
          entityCount: 2,
          factCount: 3,
          activityScore: 5.0,
          lastAnalyzedAt: null,
          members: [],
        },
      ];

      // Get graph stats
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(entityData as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(2);
      mockPrisma.knowledgeFact.count.mockResolvedValue(3);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(1);

      const graphRes = await parseResponse(await getGraph());
      const stats = graphRes.body.stats;

      // Get entity list
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(entityData.map((e) => ({
        ...e,
        subjectFacts: [],
        objectFacts: [],
        communityMemberships: [],
        _count: { subjectFacts: (e.subjectFacts as any[]).length, objectFacts: (e.objectFacts as any[]).length },
      })) as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(2);

      const entitiesReq = makeRequest('http://localhost:3000/api/knowledge/entities');
      const entitiesRes = await parseResponse(await getEntities(entitiesReq));

      // Get community list
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);
      mockPrisma.knowledgeCommunity.findMany.mockResolvedValue(communityData as any);

      const communitiesRes = await parseResponse(await getCommunities());

      // Stats consistency
      expect(stats.entityCount).toBe(entitiesRes.body.total);
      expect(stats.communityCount).toBe(communitiesRes.body.communities.length);
    });
  });

  describe('Flow: Entity type filter consistency', () => {
    it('filtering entities by type returns only that type', async () => {
      const personEntities = [
        {
          id: 'p1',
          name: 'Alice',
          type: 'PERSON',
          properties: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [],
          communityMemberships: [],
          _count: { subjectFacts: 0, objectFacts: 0 },
        },
      ];

      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(personEntities as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(1);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities?type=PERSON');
      const res = await parseResponse(await getEntities(req));

      expect(res.status).toBe(200);
      res.body.entities.forEach((e: any) => {
        expect(e.type).toBe('PERSON');
      });

      // Verify Prisma was called with correct filter
      expect(mockPrisma.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: TEST_USER_ID,
            type: 'PERSON',
          }),
        })
      );
    });
  });

  describe('Flow: Entity detail → community membership', () => {
    it('entity detail communities match community list data', async () => {
      // Entity detail
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: 'ent_1',
        name: 'Alice',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([
        {
          community: {
            id: 'comm_1',
            name: 'AI Team',
            summary: 'The AI team',
            entityCount: 5,
          },
          role: 'hub',
        },
      ] as any);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);

      const detailReq = makeRequest('http://localhost:3000/api/knowledge/entities/ent_1');
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: 'ent_1' }) })
      );

      // Community list
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);
      mockPrisma.knowledgeCommunity.findMany.mockResolvedValue([
        {
          id: 'comm_1',
          name: 'AI Team',
          summary: 'The AI team',
          level: 0,
          entityCount: 5,
          factCount: 10,
          activityScore: 7.0,
          lastAnalyzedAt: null,
          members: [
            {
              entity: { name: 'Alice', type: 'PERSON' },
              role: 'hub',
              weight: 1.0,
            },
          ],
        },
      ] as any);

      const commRes = await parseResponse(await getCommunities());

      // The community referenced in entity detail should exist in community list
      const entityCommunityId = detailRes.body.communities[0].id;
      const listedCommunity = commRes.body.communities.find((c: any) => c.id === entityCommunityId);
      expect(listedCommunity).toBeDefined();
      expect(listedCommunity.name).toBe(detailRes.body.communities[0].name);

      // The entity should appear as a member in the community's member preview
      const memberNames = listedCommunity.memberPreview.map((m: any) => m.name);
      expect(memberNames).toContain('Alice');
    });
  });

  describe('Flow: Fact verification round-trip', () => {
    it('can verify and then deny the same fact', async () => {
      // Verify fact
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_rt',
        userId: TEST_USER_ID,
        userVerified: null,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_rt',
        userVerified: true,
      } as any);

      const verifyReq = makeRequest('http://localhost:3000/api/knowledge/facts/fact_rt', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const verifyRes = await parseResponse(
        await patchFact(verifyReq, { params: Promise.resolve({ id: 'fact_rt' }) })
      );
      expect(verifyRes.body.fact.userVerified).toBe(true);

      // Now deny the same fact
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_rt',
        userId: TEST_USER_ID,
        userVerified: true,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_rt',
        userVerified: false,
      } as any);

      const denyReq = makeRequest('http://localhost:3000/api/knowledge/facts/fact_rt', {
        method: 'PATCH',
        body: JSON.stringify({ verified: false }),
      });
      const denyRes = await parseResponse(
        await patchFact(denyReq, { params: Promise.resolve({ id: 'fact_rt' }) })
      );
      expect(denyRes.body.fact.userVerified).toBe(false);

      // Verify Prisma was called with false
      expect(mockPrisma.knowledgeFact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userVerified: false },
        })
      );
    });
  });

  describe('Flow: Graph UI data contract', () => {
    it('graph response matches the shape expected by NetworkGraph component', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_1',
          name: 'Alice',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [{ id: 'f1' }, { id: 'f2' }],
          objectFacts: [],
          communityMemberships: [{ communityId: 'c1' }],
        },
        {
          id: 'ent_2',
          name: 'Project',
          type: 'PROJECT',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [{ id: 'f1' }],
          communityMemberships: [],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([
        {
          id: 'f1',
          subjectId: 'ent_1',
          objectEntityId: 'ent_2',
          predicate: 'works_on',
          confidence: 0.9,
          source: 'INFERRED_MEETING',
          objectValue: null,
        },
      ] as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(2);
      mockPrisma.knowledgeFact.count.mockResolvedValue(1);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(1);

      const res = await parseResponse(await getGraph());

      // The knowledge page transforms this data for NetworkGraph:
      // nodes need: id, name (for label), type (for color), factCount (for size)
      // edges need: source, target (for links), confidence (for link value)

      const node = res.body.nodes[0];
      expect(typeof node.id).toBe('string');
      expect(typeof node.name).toBe('string');
      expect(typeof node.type).toBe('string');
      expect(typeof node.factCount).toBe('number');
      expect(Array.isArray(node.communityIds)).toBe(true);

      const edge = res.body.edges[0];
      expect(typeof edge.source).toBe('string');
      expect(typeof edge.target).toBe('string');
      expect(typeof edge.predicate).toBe('string');
      expect(typeof edge.confidence).toBe('number');
      expect(edge.confidence).toBeGreaterThanOrEqual(0);
      expect(edge.confidence).toBeLessThanOrEqual(1);

      // source and target must reference existing node IDs
      const nodeIds = new Set(res.body.nodes.map((n: any) => n.id));
      res.body.edges.forEach((e: any) => {
        expect(nodeIds.has(e.source)).toBe(true);
        expect(nodeIds.has(e.target)).toBe(true);
      });
    });
  });

  describe('Flow: Stakeholder enrichment with graph intelligence', () => {
    it('stakeholder route enriches with knowledge graph data', async () => {
      // Import the stakeholder route (uses @clerk/nextjs/server auth and @/lib/db)
      const clerkAuth = await import('@clerk/nextjs/server');
      vi.mocked(clerkAuth.auth).mockResolvedValue({ userId: TEST_USER_ID } as any);

      mockDbPrisma.stakeholderProfile.findMany.mockResolvedValue([
        {
          id: 'sh_1',
          name: 'Alice Johnson',
          role: 'VP Engineering',
          relationshipStrength: 0.8,
          lastInteraction: new Date(),
          interactionCount: 5,
        },
        {
          id: 'sh_2',
          name: 'Bob Smith',
          role: 'Product Manager',
          relationshipStrength: 0.6,
          lastInteraction: new Date(),
          interactionCount: 3,
        },
      ] as any);

      mockDbPrisma.workArtifact.findMany.mockResolvedValue([]);

      // Knowledge graph entities for enrichment
      mockDbPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ke_1',
          nameNormalized: 'alice johnson',
          type: 'PERSON',
          subjectFacts: [
            {
              predicate: 'leads',
              objectValue: 'Platform Team',
              confidence: 0.9,
              objectEntity: null,
            },
          ],
          communityMemberships: [
            { community: { name: 'Engineering Leadership' } },
          ],
          _count: { subjectFacts: 5, objectFacts: 3 },
        },
      ] as any);

      // Dynamically import the stakeholder route since it uses different auth
      const { GET: getStakeholders } = await import('@/app/api/stakeholders/route');
      const res = await parseResponse(await getStakeholders());

      expect(res.status).toBe(200);
      expect(res.body.stakeholders).toHaveLength(2);

      // Alice should have graph intel
      const alice = res.body.stakeholders.find((s: any) => s.name === 'Alice Johnson');
      expect(alice.graphIntel).toBeDefined();
      expect(alice.graphIntel.factCount).toBe(8); // 5 subject + 3 object
      expect(alice.graphIntel.communities).toContain('Engineering Leadership');
      expect(alice.graphIntel.facts).toHaveLength(1);
      expect(alice.graphIntel.facts[0].predicate).toBe('leads');

      // Bob has no knowledge entity match
      const bob = res.body.stakeholders.find((s: any) => s.name === 'Bob Smith');
      expect(bob.graphIntel).toBeNull();
    });

    it('stakeholder graph data also includes graph intel', async () => {
      const clerkAuth = await import('@clerk/nextjs/server');
      vi.mocked(clerkAuth.auth).mockResolvedValue({ userId: TEST_USER_ID } as any);

      mockDbPrisma.stakeholderProfile.findMany.mockResolvedValue([
        {
          id: 'sh_1',
          name: 'Alice Johnson',
          role: 'Engineer',
          relationshipStrength: 0.8,
          lastInteraction: new Date(),
          interactionCount: 5,
        },
      ] as any);

      mockDbPrisma.workArtifact.findMany.mockResolvedValue([]);
      mockDbPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ke_1',
          nameNormalized: 'alice johnson',
          type: 'PERSON',
          subjectFacts: [],
          communityMemberships: [],
          _count: { subjectFacts: 2, objectFacts: 1 },
        },
      ] as any);

      const { GET: getStakeholders } = await import('@/app/api/stakeholders/route');
      const res = await parseResponse(await getStakeholders());

      // Graph nodes should also have graphIntel
      const graphNode = res.body.graph.nodes.find((n: any) => n.name === 'Alice Johnson');
      expect(graphNode.graphIntel).toBeDefined();
      expect(graphNode.graphIntel.factCount).toBe(3);
    });
  });

  describe('Flow: Cross-entity referential integrity', () => {
    it('related entities from detail can all be individually fetched', async () => {
      // Get entity detail with related entities
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: 'ent_main',
        name: 'Main Entity',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: 'f1',
            predicate: 'knows',
            objectEntityId: 'ent_rel1',
            objectEntity: { id: 'ent_rel1', name: 'Related 1', type: 'PERSON' },
            objectValue: null,
            confidence: 0.8,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
          {
            id: 'f2',
            predicate: 'works_on',
            objectEntityId: 'ent_rel2',
            objectEntity: { id: 'ent_rel2', name: 'Related 2', type: 'PROJECT' },
            objectValue: null,
            confidence: 0.6,
            source: 'INFERRED_EMAIL',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        { id: 'ent_rel1', name: 'Related 1', type: 'PERSON' },
        { id: 'ent_rel2', name: 'Related 2', type: 'PROJECT' },
      ] as any);

      const detailReq = makeRequest('http://localhost:3000/api/knowledge/entities/ent_main');
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: 'ent_main' }) })
      );

      expect(detailRes.body.relatedEntities).toHaveLength(2);

      // Each related entity should have a valid ID that can be fetched
      for (const related of detailRes.body.relatedEntities) {
        expect(typeof related.id).toBe('string');
        expect(typeof related.name).toBe('string');
        expect(typeof related.type).toBe('string');
        expect(related.id).not.toBe('ent_main'); // no self-reference
      }
    });
  });

  describe('Flow: Edge case — empty state handling', () => {
    it('all endpoints handle empty data gracefully', async () => {
      // Graph with no data
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const graphRes = await parseResponse(await getGraph());
      expect(graphRes.status).toBe(200);
      expect(graphRes.body.nodes).toEqual([]);
      expect(graphRes.body.edges).toEqual([]);

      // Entities with no data
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);

      const entReq = makeRequest('http://localhost:3000/api/knowledge/entities');
      const entRes = await parseResponse(await getEntities(entReq));
      expect(entRes.status).toBe(200);
      expect(entRes.body.entities).toEqual([]);
      expect(entRes.body.total).toBe(0);

      // Communities with no data
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);
      mockPrisma.knowledgeCommunity.findMany.mockResolvedValue([]);

      const commRes = await parseResponse(await getCommunities());
      expect(commRes.status).toBe(200);
      expect(commRes.body.communities).toEqual([]);
    });
  });
});
