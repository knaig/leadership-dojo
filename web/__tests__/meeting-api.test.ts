/**
 * Meeting API Tests
 *
 * Tests GET/PATCH /api/meetings/[id]
 * Bug: 500 error from using `conversationOutcomes` (plural) instead of `conversationOutcome` (singular)
 * Bug: invalid meetingCategory values not rejected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        meetingSyncRecord: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/correction-learning', () => ({
    recordCorrection: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);

const TEST_USER_ID = 'user_test_meetings';

function makeRequest(url: string, opts?: RequestInit): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), opts);
}

async function parseResponse(response: Response) {
    return {
        status: response.status,
        body: await response.json(),
    };
}

describe('GET /api/meetings/[id]', () => {
    let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('@/app/api/meetings/[id]/route');
        GET = mod.GET;
    });

    it('returns 401 when not authenticated', async () => {
        mockAuth.mockResolvedValue({ userId: null } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/test');
        const res = await GET(req, { params: Promise.resolve({ id: 'test' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(401);
    });

    it('returns 404 when meeting not found', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.meetingSyncRecord.findUnique.mockResolvedValue(null);

        const req = makeRequest('http://localhost:3000/api/meetings/nonexistent');
        const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(404);
    });

    it('returns meeting with conversationOutcome (singular relation)', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.meetingSyncRecord.findUnique.mockResolvedValue({
            id: 'mtg_1',
            externalId: 'google_123',
            title: 'Team Standup',
            description: 'Daily standup',
            startTime: new Date('2026-03-10T09:00:00Z'),
            endTime: new Date('2026-03-10T09:30:00Z'),
            attendees: [{ email: 'a@test.com' }],
            location: 'Zoom',
            meetingType: 'STANDUP',
            meetingCategory: 'OPERATIONAL',
            desiredOutcome: null,
            outcomeResult: null,
            outcome: null,
            followUps: null,
            lifecycleStage: 'completed',
            notes: null,
            conversationOutcome: {
                whatWorked: 'Good pacing',
                whatFailed: null,
                surprises: null,
                aiInsights: 'Kept it short',
                suggestedImprovements: null,
                userRating: 4,
                userNotes: null,
            },
            commitments: [],
        } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/mtg_1');
        const res = await GET(req, { params: Promise.resolve({ id: 'mtg_1' }) });
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.meeting.title).toBe('Team Standup');
        expect(body.meeting.review).toBeDefined();
        expect(body.meeting.review.whatWorked).toBe('Good pacing');
    });

    it('returns null review when no conversationOutcome', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.meetingSyncRecord.findUnique.mockResolvedValue({
            id: 'mtg_2',
            externalId: 'google_456',
            title: 'Planning',
            startTime: new Date(),
            endTime: new Date(),
            attendees: [],
            conversationOutcome: null,
            commitments: [],
        } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/mtg_2');
        const res = await GET(req, { params: Promise.resolve({ id: 'mtg_2' }) });
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.meeting.review).toBeNull();
    });
});

describe('PATCH /api/meetings/[id]', () => {
    let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('@/app/api/meetings/[id]/route');
        PATCH = mod.PATCH;
    });

    it('rejects invalid meetingCategory', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/mtg_1', {
            method: 'PATCH',
            body: JSON.stringify({ meetingCategory: 'INVALID_CATEGORY' }),
        });

        const res = await PATCH(req, { params: Promise.resolve({ id: 'mtg_1' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(400);
    });

    it('accepts valid meetingCategory values', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.meetingSyncRecord.findUnique.mockResolvedValue({
            id: 'mtg_1',
            meetingCategory: 'TACTICAL',
            title: 'Test',
            attendees: [],
        } as any);
        mockPrisma.meetingSyncRecord.update.mockResolvedValue({} as any);

        const validCategories = ['NEEDLE_MOVER', 'TACTICAL', 'OPERATIONAL', 'GROWTH', 'UNCLASSIFIED'];

        for (const category of validCategories) {
            vi.clearAllMocks();
            mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
            mockPrisma.meetingSyncRecord.findUnique.mockResolvedValue({
                id: 'mtg_1',
                meetingCategory: 'TACTICAL',
                title: 'Test',
                attendees: [],
            } as any);
            mockPrisma.meetingSyncRecord.update.mockResolvedValue({} as any);

            const req = makeRequest('http://localhost:3000/api/meetings/mtg_1', {
                method: 'PATCH',
                body: JSON.stringify({ meetingCategory: category }),
            });

            const res = await PATCH(req, { params: Promise.resolve({ id: 'mtg_1' }) });
            const { status } = await parseResponse(res);
            expect(status).toBe(200);
        }
    });

    it('rejects empty update body', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/mtg_1', {
            method: 'PATCH',
            body: JSON.stringify({}),
        });

        const res = await PATCH(req, { params: Promise.resolve({ id: 'mtg_1' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(400);
    });

    it('rejects invalid importance value', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);

        const req = makeRequest('http://localhost:3000/api/meetings/mtg_1', {
            method: 'PATCH',
            body: JSON.stringify({ userImportanceOverride: 'ultra' }),
        });

        const res = await PATCH(req, { params: Promise.resolve({ id: 'mtg_1' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(400);
    });
});
