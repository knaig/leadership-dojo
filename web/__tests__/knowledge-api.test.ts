// @ts-nocheck — Prisma's deeply-nested generic types are incompatible with vi.mocked() casts.
// Tests pass at runtime; the mock typing is a known vitest/Prisma limitation.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Import mocked modules
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Import route handlers
import { GET as getGraph } from '@/app/api/knowledge/graph/route';
import { GET as getEntities } from '@/app/api/knowledge/entities/route';
import { GET as getEntityDetail } from '@/app/api/knowledge/entities/[id]/route';
import { GET as getCommunities } from '@/app/api/knowledge/communities/route';
import { PATCH as patchFact } from '@/app/api/knowledge/facts/[id]/route';

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);

// ── Test Fixtures ──────────────────────────────────────────────

const TEST_USER_ID = 'user_test_123';

const mockSession = {
  user: { id: TEST_USER_ID, email: 'test@example.com', name: 'Test User', image: null },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockEntities = [
  {
    id: 'ent_1',
    userId: TEST_USER_ID,
    name: 'Alice Johnson',
    nameNormalized: 'alice johnson',
    type: 'PERSON',
    properties: { title: 'VP Engineering' },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-03-01'),
    subjectFacts: [{ id: 'fact_1' }, { id: 'fact_2' }],
    objectFacts: [{ id: 'fact_3' }],
    communityMemberships: [{ communityId: 'comm_1' }],
  },
  {
    id: 'ent_2',
    userId: TEST_USER_ID,
    name: 'Project Alpha',
    nameNormalized: 'project alpha',
    type: 'PROJECT',
    properties: { status: 'active' },
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-02-20'),
    subjectFacts: [{ id: 'fact_4' }],
    objectFacts: [],
    communityMemberships: [{ communityId: 'comm_1' }],
  },
  {
    id: 'ent_3',
    userId: TEST_USER_ID,
    name: 'Machine Learning',
    nameNormalized: 'machine learning',
    type: 'TOPIC',
    properties: {},
    createdAt: new Date('2025-02-01'),
    updatedAt: new Date('2025-02-28'),
    subjectFacts: [],
    objectFacts: [{ id: 'fact_5' }],
    communityMemberships: [],
  },
];

const mockFacts = [
  {
    id: 'fact_1',
    userId: TEST_USER_ID,
    subjectId: 'ent_1',
    objectEntityId: 'ent_2',
    predicate: 'works_on',
    confidence: 0.9,
    source: 'INFERRED_MEETING',
    objectValue: null,
    validFrom: new Date('2025-01-01'),
    validTo: null,
    userVerified: null,
  },
  {
    id: 'fact_2',
    userId: TEST_USER_ID,
    subjectId: 'ent_1',
    objectEntityId: 'ent_3',
    predicate: 'interested_in',
    confidence: 0.7,
    source: 'INFERRED_EMAIL',
    objectValue: null,
    validFrom: new Date('2025-02-01'),
    validTo: null,
    userVerified: null,
  },
];

const mockCommunities = [
  {
    id: 'comm_1',
    userId: TEST_USER_ID,
    name: 'AI Engineering Team',
    summary: 'Core team working on ML infrastructure',
    level: 0,
    entityCount: 5,
    factCount: 12,
    activityScore: 8.5,
    lastAnalyzedAt: new Date('2025-03-01'),
    members: [
      {
        entity: { name: 'Alice Johnson', type: 'PERSON' },
        role: 'hub',
        weight: 1.0,
      },
      {
        entity: { name: 'Project Alpha', type: 'PROJECT' },
        role: 'peripheral',
        weight: 0.5,
      },
    ],
  },
];

// ── Helper ──────────────────────────────────────────────

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

async function parseResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

// ── Tests ──────────────────────────────────────────────

describe('Knowledge Graph API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  // ── Auth guard tests (shared pattern) ──

  describe('Authentication', () => {
    it('returns 401 when not authenticated for /graph', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await parseResponse(await getGraph());
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when not authenticated for /entities', async () => {
      mockAuth.mockResolvedValue(null);
      const req = makeRequest('http://localhost:3000/api/knowledge/entities');
      const res = await parseResponse(await getEntities(req));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when not authenticated for /communities', async () => {
      mockAuth.mockResolvedValue(null);
      const res = await parseResponse(await getCommunities());
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when not authenticated for /entities/[id]', async () => {
      mockAuth.mockResolvedValue(null);
      const req = makeRequest('http://localhost:3000/api/knowledge/entities/ent_1');
      const res = await parseResponse(
        await getEntityDetail(req, { params: Promise.resolve({ id: 'ent_1' }) })
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when not authenticated for /facts/[id] PATCH', async () => {
      mockAuth.mockResolvedValue(null);
      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) })
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  // ── /api/knowledge/graph ──

  describe('GET /api/knowledge/graph', () => {
    it('returns nodes, edges, and stats', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(mockEntities as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue(mockFacts as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(3);
      mockPrisma.knowledgeFact.count.mockResolvedValue(5);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(1);

      const res = await parseResponse(await getGraph());

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(3);
      expect(res.body.edges).toHaveLength(2);
      expect(res.body.stats).toEqual({
        entityCount: 3,
        factCount: 5,
        communityCount: 1,
      });
    });

    it('nodes contain correct shape for UI consumption', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(mockEntities as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(3);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const res = await parseResponse(await getGraph());
      const node = res.body.nodes[0];

      // Verify the UI-expected shape
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('name');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('factCount');
      expect(node).toHaveProperty('communityIds');
      expect(node).toHaveProperty('updatedAt');
    });

    it('computes factCount from both subject and object facts', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(mockEntities as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(3);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const res = await parseResponse(await getGraph());

      // Alice: 2 subject facts + 1 object fact = 3
      expect(res.body.nodes[0].factCount).toBe(3);
      // Project Alpha: 1 subject fact + 0 object facts = 1
      expect(res.body.nodes[1].factCount).toBe(1);
      // ML: 0 subject facts + 1 object fact = 1
      expect(res.body.nodes[2].factCount).toBe(1);
    });

    it('edges map source/target correctly from facts', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(mockEntities as any);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue(mockFacts as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(3);
      mockPrisma.knowledgeFact.count.mockResolvedValue(2);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const res = await parseResponse(await getGraph());
      const edge = res.body.edges[0];

      expect(edge.source).toBe('ent_1');
      expect(edge.target).toBe('ent_2');
      expect(edge.predicate).toBe('works_on');
      expect(edge.confidence).toBe(0.9);
      expect(edge.factSource).toBe('INFERRED_MEETING');
    });

    it('returns empty graph when no data exists', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      const res = await parseResponse(await getGraph());

      expect(res.status).toBe(200);
      expect(res.body.nodes).toHaveLength(0);
      expect(res.body.edges).toHaveLength(0);
      expect(res.body.stats.entityCount).toBe(0);
    });

    it('scopes queries to authenticated user', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeFact.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);
      mockPrisma.knowledgeFact.count.mockResolvedValue(0);
      mockPrisma.knowledgeCommunity.count.mockResolvedValue(0);

      await getGraph();

      // Entity query scoped to userId
      expect(mockPrisma.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID },
        })
      );

      // Count queries scoped to userId
      expect(mockPrisma.knowledgeEntity.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER_ID },
        })
      );
    });
  });

  // ── /api/knowledge/entities ──

  describe('GET /api/knowledge/entities', () => {
    const entitiesWithDetails = mockEntities.map((e) => ({
      ...e,
      subjectFacts: [
        {
          id: 'tf_1',
          predicate: 'works_on',
          objectValue: null,
          confidence: 0.9,
          source: 'INFERRED_MEETING',
          objectEntity: { id: 'ent_2', name: 'Project Alpha' },
        },
      ],
      objectFacts: [{ id: 'of_1' }],
      _count: { subjectFacts: 1, objectFacts: 1 },
      communityMemberships: [
        {
          community: { id: 'comm_1', name: 'AI Engineering Team' },
        },
      ],
    }));

    it('returns entities with fact counts and top facts', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue(entitiesWithDetails as any);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(3);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities');
      const res = await parseResponse(await getEntities(req));

      expect(res.status).toBe(200);
      expect(res.body.entities).toHaveLength(3);
      expect(res.body.total).toBe(3);

      const entity = res.body.entities[0];
      expect(entity).toHaveProperty('id');
      expect(entity).toHaveProperty('name');
      expect(entity).toHaveProperty('type');
      expect(entity).toHaveProperty('factCount');
      expect(entity).toHaveProperty('topFacts');
      expect(entity).toHaveProperty('communities');
      expect(entity.topFacts[0]).toHaveProperty('predicate');
      expect(entity.topFacts[0]).toHaveProperty('objectEntityName');
    });

    it('filters entities by type query param', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities?type=PERSON');
      await getEntities(req);

      expect(mockPrisma.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'PERSON' }),
        })
      );
    });

    it('filters entities by search query param', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities?search=alice');
      await getEntities(req);

      expect(mockPrisma.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'alice', mode: 'insensitive' },
          }),
        })
      );
    });

    it('respects limit param (capped at 100)', async () => {
      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEntity.count.mockResolvedValue(0);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities?limit=200');
      await getEntities(req);

      expect(mockPrisma.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }) // capped
      );
    });
  });

  // ── /api/knowledge/entities/[id] ──

  describe('GET /api/knowledge/entities/[id]', () => {
    it('returns entity with facts, communities, and related entities', async () => {
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue({
        id: 'ent_1',
        name: 'Alice Johnson',
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
            objectEntity: { id: 'ent_2', name: 'Project Alpha', type: 'PROJECT' },
            objectValue: null,
            confidence: 0.9,
            source: 'INFERRED_MEETING',
            validFrom: new Date(),
            validTo: null,
            userVerified: null,
          },
        ] as any)
        .mockResolvedValueOnce([
          {
            id: 'fact_3',
            predicate: 'reports_to',
            subjectId: 'ent_4',
            subject: { id: 'ent_4', name: 'Bob Manager', type: 'PERSON' },
            objectValue: null,
            confidence: 0.6,
            source: 'INFERRED_EMAIL',
            validFrom: new Date(),
            validTo: null,
            userVerified: true,
          },
        ] as any);

      mockPrisma.communityMember.findMany.mockResolvedValue([
        {
          community: {
            id: 'comm_1',
            name: 'AI Team',
            summary: 'Core AI team',
            entityCount: 5,
          },
          role: 'hub',
        },
      ] as any);

      mockPrisma.knowledgeEntity.findMany.mockResolvedValue([
        { id: 'ent_2', name: 'Project Alpha', type: 'PROJECT' },
        { id: 'ent_4', name: 'Bob Manager', type: 'PERSON' },
      ] as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities/ent_1');
      const res = await parseResponse(
        await getEntityDetail(req, { params: Promise.resolve({ id: 'ent_1' }) })
      );

      expect(res.status).toBe(200);

      // Entity
      expect(res.body.entity.name).toBe('Alice Johnson');
      expect(res.body.entity.type).toBe('PERSON');

      // Facts
      expect(res.body.facts).toHaveLength(2);
      expect(res.body.facts[0].direction).toBe('outgoing');
      expect(res.body.facts[1].direction).toBe('incoming');

      // Communities
      expect(res.body.communities).toHaveLength(1);
      expect(res.body.communities[0].name).toBe('AI Team');
      expect(res.body.communities[0].role).toBe('hub');

      // Related entities
      expect(res.body.relatedEntities).toHaveLength(2);
    });

    it('returns 404 for non-existent entity', async () => {
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue(null);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities/nonexistent');
      const res = await parseResponse(
        await getEntityDetail(req, { params: Promise.resolve({ id: 'nonexistent' }) })
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('scopes entity lookup to authenticated user', async () => {
      mockPrisma.knowledgeEntity.findFirst.mockResolvedValue(null);

      const req = makeRequest('http://localhost:3000/api/knowledge/entities/ent_1');
      await getEntityDetail(req, { params: Promise.resolve({ id: 'ent_1' }) });

      expect(mockPrisma.knowledgeEntity.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ent_1', userId: TEST_USER_ID },
        })
      );
    });
  });

  // ── /api/knowledge/communities ──

  describe('GET /api/knowledge/communities', () => {
    it('returns communities with member previews', async () => {
      mockPrisma.knowledgeCommunity.findMany.mockResolvedValue(mockCommunities as any);

      const res = await parseResponse(await getCommunities());

      expect(res.status).toBe(200);
      expect(res.body.communities).toHaveLength(1);

      const community = res.body.communities[0];
      expect(community).toHaveProperty('id');
      expect(community).toHaveProperty('name');
      expect(community).toHaveProperty('summary');
      expect(community).toHaveProperty('level');
      expect(community).toHaveProperty('entityCount');
      expect(community).toHaveProperty('factCount');
      expect(community).toHaveProperty('activityScore');
      expect(community).toHaveProperty('memberPreview');
      expect(community).toHaveProperty('lastAnalyzedAt');

      expect(community.memberPreview).toHaveLength(2);
      expect(community.memberPreview[0]).toEqual({
        name: 'Alice Johnson',
        type: 'PERSON',
        role: 'hub',
      });
    });

    it('returns empty array when no communities exist', async () => {
      mockPrisma.knowledgeCommunity.findMany.mockResolvedValue([]);

      const res = await parseResponse(await getCommunities());

      expect(res.status).toBe(200);
      expect(res.body.communities).toHaveLength(0);
    });
  });

  // ── /api/knowledge/facts/[id] PATCH ──

  describe('PATCH /api/knowledge/facts/[id]', () => {
    it('confirms a fact when verified=true', async () => {
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_1',
        userId: TEST_USER_ID,
        userVerified: null,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_1',
        userVerified: true,
      } as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.fact.userVerified).toBe(true);
    });

    it('denies a fact when verified=false', async () => {
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_1',
        userId: TEST_USER_ID,
        userVerified: null,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_1',
        userVerified: false,
      } as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({ verified: false }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) })
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.fact.userVerified).toBe(false);
    });

    it('returns 400 for invalid verified value', async () => {
      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({ verified: 'yes' }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) })
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('verified must be a boolean');
    });

    it('returns 404 when fact does not belong to user', async () => {
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue(null);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_999', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      const res = await parseResponse(
        await patchFact(req, { params: Promise.resolve({ id: 'fact_999' }) })
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Fact not found');
    });

    it('calls update with correct params', async () => {
      mockPrisma.knowledgeFact.findFirst.mockResolvedValue({
        id: 'fact_1',
        userId: TEST_USER_ID,
      } as any);
      mockPrisma.knowledgeFact.update.mockResolvedValue({
        id: 'fact_1',
        userVerified: true,
      } as any);

      const req = makeRequest('http://localhost:3000/api/knowledge/facts/fact_1', {
        method: 'PATCH',
        body: JSON.stringify({ verified: true }),
      });
      await patchFact(req, { params: Promise.resolve({ id: 'fact_1' }) });

      expect(mockPrisma.knowledgeFact.update).toHaveBeenCalledWith({
        where: { id: 'fact_1' },
        data: { userVerified: true },
        select: { id: true, userVerified: true },
      });
    });
  });
});
