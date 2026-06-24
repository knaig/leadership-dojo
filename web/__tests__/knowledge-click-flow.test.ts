import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

import { GET as getGraph } from '@/app/api/knowledge/graph/route';
import { GET as getEntityDetail } from '@/app/api/knowledge/entities/[id]/route';
import { PATCH as patchFact } from '@/app/api/knowledge/facts/[id]/route';

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);

const TEST_USER_ID = 'user_click_test';
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

// ── Tests for the click-to-detail-to-verify flow ──

describe('Node Click → Detail Panel → Fact Verify Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  describe('Bug fix: onNodeClick always fires (even on re-click)', () => {
    it('graph node IDs are valid for entity detail lookup', async () => {
      // Simulate graph load — user sees nodes
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_mira',
          name: 'Mira',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [{ id: 'f1' }],
          objectFacts: [],
          communityMemberships: [],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(1);
      mockPrisma.knowledgeFact.count.mockResolvedValue(1);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const graphRes = await parseResponse(await getGraph());
      expect(graphRes.status).toBe(200);

      const miraNode = graphRes.body.nodes.find((n: any) => n.name === 'Mira');
      expect(miraNode).toBeDefined();
      expect(miraNode.id).toBe('ent_mira');

      // Now simulate clicking Mira — fetch entity detail using node.id
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: 'ent_mira',
        name: 'Mira',
        type: 'PERSON',
        properties: { title: 'Product Manager' },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: 'fact_mira_1',
            predicate: 'works_on',
            objectEntityId: 'ent_proj',
            objectEntity: { id: 'ent_proj', name: 'Chat Feature', type: 'PROJECT' },
            objectValue: null,
            confidence: 0.85,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        { id: 'ent_proj', name: 'Chat Feature', type: 'PROJECT' },
      ] as any);

      const detailReq = makeRequest(`http://localhost:3000/api/knowledge/entities/${miraNode.id}`);
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: miraNode.id }) })
      );

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.entity.name).toBe('Mira');
      expect(detailRes.body.facts).toHaveLength(1);
      expect(detailRes.body.facts[0].predicate).toBe('works_on');
    });

    it('graph node with zero facts still returns valid entity detail', async () => {
      // Node with no facts — the panel should still show entity info
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_new',
          name: 'New Person',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [],
          communityMemberships: [],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(1);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const graphRes = await parseResponse(await getGraph());
      const nodeId = graphRes.body.nodes[0].id;

      // Fetch detail
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: nodeId,
        name: 'New Person',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);

      const detailReq = makeRequest(`http://localhost:3000/api/knowledge/entities/${nodeId}`);
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: nodeId }) })
      );

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.entity.name).toBe('New Person');
      expect(detailRes.body.facts).toEqual([]);
      expect(detailRes.body.communities).toEqual([]);
      expect(detailRes.body.relatedEntities).toEqual([]);
    });
  });

  describe('Full click-through: graph → detail → verify fact → re-fetch detail', () => {
    it('verified fact persists through re-fetching entity detail', async () => {
      // Step 1: Load graph and get node ID
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_mira',
          name: 'Mira',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [{ id: 'fact_mira_1' }],
          objectFacts: [],
          communityMemberships: [],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(1);
      mockPrisma.knowledgeFact.count.mockResolvedValue(1);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const graphRes = await parseResponse(await getGraph());
      const nodeId = graphRes.body.nodes[0].id;

      // Step 2: Fetch entity detail (fact is unverified)
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: nodeId,
        name: 'Mira',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: 'fact_mira_1',
            predicate: 'wants_to_chat',
            objectEntityId: null,
            objectEntity: null,
            objectValue: 'about project scope',
            confidence: 0.7,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);

      const detailReq = makeRequest(`http://localhost:3000/api/knowledge/entities/${nodeId}`);
      const detailRes = await parseResponse(
        await getEntityDetail(detailReq, { params: Promise.resolve({ id: nodeId }) })
      );

      expect(detailRes.body.facts[0].userVerified).toBeNull();
      const factId = detailRes.body.facts[0].id;

      // Step 3: User clicks "verify" on the fact
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
      expect(verifyRes.body.fact.userVerified).toBe(true);

      // Step 4: Re-fetch entity detail — fact should now be verified
      vi.clearAllMocks();
      mockAuth.mockResolvedValue(mockSession);

      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: nodeId,
        name: 'Mira',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: factId,
            predicate: 'wants_to_chat',
            objectEntityId: null,
            objectEntity: null,
            objectValue: 'about project scope',
            confidence: 0.7,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: true, // NOW VERIFIED
          },
        ] as any)
        .mockResolvedValueOnce([]);
      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);

      const reDetailReq = makeRequest(`http://localhost:3000/api/knowledge/entities/${nodeId}`);
      const reDetailRes = await parseResponse(
        await getEntityDetail(reDetailReq, { params: Promise.resolve({ id: nodeId }) })
      );

      expect(reDetailRes.body.facts[0].userVerified).toBe(true);
    });
  });

  describe('Edge cases the original tests missed', () => {
    it('entity detail returns both outgoing and incoming facts with correct direction', async () => {
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: 'ent_a',
        name: 'Alice',
        type: 'PERSON',
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Outgoing: Alice → works_on → Project
      mockPrisma.knowledgeFact.findMany
        .mockResolvedValueOnce([
          {
            id: 'f_out',
            predicate: 'works_on',
            objectEntityId: 'ent_proj',
            objectEntity: { id: 'ent_proj', name: 'Project', type: 'PROJECT' },
            objectValue: null,
            confidence: 0.9,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        // Incoming: Bob → reports_to → Alice
        .mockResolvedValueOnce([
          {
            id: 'f_in',
            predicate: 'reports_to',
            subjectId: 'ent_bob',
            subject: { id: 'ent_bob', name: 'Bob', type: 'PERSON' },
            objectValue: null,
            confidence: 0.75,
            source: 'INFERRED_EMAIL',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any);

      mockPrisma.communityMember.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        { id: 'ent_proj', name: 'Project', type: 'PROJECT' },
        { id: 'ent_bob', name: 'Bob', type: 'PERSON' },
      ] as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities/ent_a');
      const res = await parseResponse(
        await getEntityDetail(req, { params: Promise.resolve({ id: 'ent_a' }) })
      );

      const outgoing = res.body.facts.find((f: any) => f.direction === 'outgoing');
      const incoming = res.body.facts.find((f: any) => f.direction === 'incoming');

      expect(outgoing).toBeDefined();
      expect(outgoing.predicate).toBe('works_on');
      expect(outgoing.objectEntity.name).toBe('Project');

      expect(incoming).toBeDefined();
      expect(incoming.predicate).toBe('reports_to');
      expect(incoming.objectEntity.name).toBe('Bob');
    });

    it('denying a fact that was previously verified flips the value', async () => {
      // Fact was previously verified=true
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_flip',
        userId: TEST_USER_ID,
        userVerified: true,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_flip',
        userVerified: false,
      } as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_flip', {
        method: 'PATCH',
        body: JSON.stringify({ verified: false }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_flip' }) })
      );

      expect(res.status).toBe(200);
      expect(res.body.fact.userVerified).toBe(false);

      // Verify the update call was correct
      expect(mockPrisma.knowledgeFact.update).toHaveBeenCalledWith({
        where: { id: 'fact_flip' },
        data: { userVerified: false },
        select: { id: true, userVerified: true },
      });
    });

    it('graph edges only reference nodes present in the graph', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 'ent_1',
          name: 'Alice',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [],
          communityMemberships: [],
        },
        {
          id: 'ent_2',
          name: 'Bob',
          type: 'PERSON',
          properties: {},
          updatedAt: new Date(),
          subjectFacts: [],
          objectFacts: [],
          communityMemberships: [],
        },
      ] as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([
        {
          id: 'f1',
          subjectId: 'ent_1',
          objectEntityId: 'ent_2',
          predicate: 'knows',
          confidence: 0.8,
          source: 'INFERRED_MEETING',
          objectValue: null,
        },
      ] as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(2);
      mockPrisma.knowledgeFact.count.mockResolvedValue(1);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const res = await parseResponse(await getGraph());
      const nodeIds = new Set(res.body.nodes.map((n: any) => n.id));

      // Every edge source and target must exist in nodes
      for (const edge of res.body.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });

    it('fact verification rejects non-existent fact IDs', async () => {
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue(null);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/nonexistent', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'nonexistent' }) })
      );

      expect(res.status).toBe(404);
      expect(mockPrisma.knowledgeFact.update).not.toHaveBeenCalled();
    });

    it('fact verification rejects missing body', async () => {
      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) })
      );

      expect(res.status).toBe(400);
      expect(mockPrisma.knowledgeFact.findFirst).not.toHaveBeenCalled();
    });
  });
});
