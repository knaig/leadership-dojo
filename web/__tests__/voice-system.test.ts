/**
 * Voice System E2E Tests
 *
 * Tests the call feedback APIs, call scheduling API,
 * and the chat-to-call flow ("call me" intent).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@clerk/nextjs/server', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        voiceCall: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        callFeedback: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        scheduledCall: {
            create: vi.fn(),
            findFirst: vi.fn(),
        },
        onboardingProgress: {
            upsert: vi.fn(),
        },
        userPreferences: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
    },
}));

import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);

const TEST_USER_ID = 'user_test123';
const TEST_CALL_ID = 'call_test456';

function makeRequest(url: string, opts?: RequestInit): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), opts);
}

async function parseResponse(response: Response) {
    return {
        status: response.status,
        body: await response.json(),
    };
}

// ============================================================================
// /api/calls/[id]/feedback
// ============================================================================

describe('POST /api/calls/[id]/feedback', () => {
    let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('@/app/api/calls/[id]/feedback/route');
        POST = mod.POST;
    });

    it('returns 401 when not authenticated', async () => {
        mockAuth.mockResolvedValue({ userId: null } as any);

        const req = makeRequest('http://localhost:3000/api/calls/test/feedback', {
            method: 'POST',
            body: JSON.stringify({ rating: 4 }),
        });

        const res = await POST(req, { params: Promise.resolve({ id: TEST_CALL_ID }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(401);
    });

    it('returns 404 when call not found', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.voiceCall.findFirst.mockResolvedValue(null);

        const req = makeRequest('http://localhost:3000/api/calls/nonexistent/feedback', {
            method: 'POST',
            body: JSON.stringify({ rating: 4 }),
        });

        const res = await POST(req, { params: Promise.resolve({ id: 'nonexistent' }) });
        const { status } = await parseResponse(res);
        expect(status).toBe(404);
    });

    it('creates feedback for a valid call', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.voiceCall.findFirst.mockResolvedValue({
            id: TEST_CALL_ID,
            callType: 'daily_checkin',
        } as any);
        mockPrisma.callFeedback.findFirst.mockResolvedValue(null);
        mockPrisma.callFeedback.create.mockResolvedValue({
            id: 'fb_1',
            userId: TEST_USER_ID,
            voiceCallId: TEST_CALL_ID,
            rating: 4,
            tooLong: false,
            tooShort: false,
            wasRelevant: true,
            wasActionable: null,
            verbatimFeedback: null,
            feedbackSource: 'in_app',
        } as any);

        const req = makeRequest('http://localhost:3000/api/calls/test/feedback', {
            method: 'POST',
            body: JSON.stringify({
                rating: 4,
                tooLong: false,
                tooShort: false,
                wasRelevant: true,
            }),
        });

        const res = await POST(req, { params: Promise.resolve({ id: TEST_CALL_ID }) });
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.feedback).toBeDefined();
        expect(mockPrisma.callFeedback.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: TEST_USER_ID,
                    voiceCallId: TEST_CALL_ID,
                    feedbackSource: 'in_app',
                    rating: 4,
                }),
            })
        );
    });

    it('updates existing feedback instead of creating duplicate', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.voiceCall.findFirst.mockResolvedValue({
            id: TEST_CALL_ID,
            callType: 'daily_checkin',
        } as any);
        mockPrisma.callFeedback.findFirst.mockResolvedValue({
            id: 'fb_existing',
        } as any);
        mockPrisma.callFeedback.update.mockResolvedValue({
            id: 'fb_existing',
            rating: 5,
        } as any);

        const req = makeRequest('http://localhost:3000/api/calls/test/feedback', {
            method: 'POST',
            body: JSON.stringify({ rating: 5 }),
        });

        const res = await POST(req, { params: Promise.resolve({ id: TEST_CALL_ID }) });
        const { status } = await parseResponse(res);

        expect(status).toBe(200);
        expect(mockPrisma.callFeedback.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'fb_existing' },
                data: expect.objectContaining({ rating: 5 }),
            })
        );
        expect(mockPrisma.callFeedback.create).not.toHaveBeenCalled();
    });
});

// ============================================================================
// /api/calls/recent-unfeedback
// ============================================================================

describe('GET /api/calls/recent-unfeedback', () => {
    let GET: () => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('@/app/api/calls/recent-unfeedback/route');
        GET = mod.GET;
    });

    it('returns 401 when not authenticated', async () => {
        mockAuth.mockResolvedValue({ userId: null } as any);

        const res = await GET();
        const { status } = await parseResponse(res);
        expect(status).toBe(401);
    });

    it('returns null when no recent calls', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.voiceCall.findMany.mockResolvedValue([]);

        const res = await GET();
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.call).toBeNull();
    });

    it('returns the most recent call without feedback', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);

        const recentCalls = [
            { id: 'call_1', callType: 'daily_checkin', durationSeconds: 120, startedAt: new Date(), summary: 'test' },
            { id: 'call_2', callType: 'morning_brief', durationSeconds: 90, startedAt: new Date(), summary: null },
        ];

        mockPrisma.voiceCall.findMany.mockResolvedValue(recentCalls as any);
        // call_1 already has feedback, call_2 doesn't
        mockPrisma.callFeedback.findMany.mockResolvedValue([
            { voiceCallId: 'call_1' },
        ] as any);

        const res = await GET();
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.call).toBeDefined();
        expect(body.call.id).toBe('call_2');
    });

    it('filters out short calls (< 30 seconds)', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.voiceCall.findMany.mockResolvedValue([]);

        const res = await GET();
        const { body } = await parseResponse(res);

        // Verify the query filtered by durationSeconds > 30
        expect(mockPrisma.voiceCall.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    durationSeconds: { gt: 30 },
                }),
            })
        );
        expect(body.call).toBeNull();
    });
});

// ============================================================================
// /api/calls/schedule
// ============================================================================

describe('POST /api/calls/schedule', () => {
    let POST: (req: NextRequest) => Promise<Response>;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('@/app/api/calls/schedule/route');
        POST = mod.POST;
    });

    it('returns 401 when not authenticated', async () => {
        mockAuth.mockResolvedValue({ userId: null } as any);

        const req = makeRequest('http://localhost:3000/api/calls/schedule', {
            method: 'POST',
            body: JSON.stringify({ trigger: 'first_login' }),
        });

        const res = await POST(req);
        const { status } = await parseResponse(res);
        expect(status).toBe(401);
    });

    it('creates onboarding call for first_login trigger', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        mockPrisma.scheduledCall.create.mockResolvedValue({
            id: 'sc_1',
            userId: TEST_USER_ID,
            callType: 'onboarding',
            status: 'pending',
        } as any);
        mockPrisma.onboardingProgress.upsert.mockResolvedValue({} as any);
        mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

        const req = makeRequest('http://localhost:3000/api/calls/schedule', {
            method: 'POST',
            body: JSON.stringify({ trigger: 'first_login' }),
        });

        const res = await POST(req);
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.scheduledCallId).toBeDefined();
        expect(mockPrisma.scheduledCall.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: TEST_USER_ID,
                    callType: 'onboarding',
                    status: 'pending',
                }),
            })
        );
    });

    it('creates callback call with specified time', async () => {
        mockAuth.mockResolvedValue({ userId: TEST_USER_ID } as any);
        const callbackTime = new Date(Date.now() + 3600000).toISOString();
        mockPrisma.scheduledCall.create.mockResolvedValue({
            id: 'sc_2',
            userId: TEST_USER_ID,
            callType: 'callback',
            status: 'pending',
            scheduledFor: new Date(callbackTime),
        } as any);

        const req = makeRequest('http://localhost:3000/api/calls/schedule', {
            method: 'POST',
            body: JSON.stringify({ trigger: 'callback', callbackTime }),
        });

        const res = await POST(req);
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.scheduledCallId).toBeDefined();
        expect(mockPrisma.scheduledCall.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    callType: 'callback',
                }),
            })
        );
    });
});
