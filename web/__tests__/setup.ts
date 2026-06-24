import { vi } from 'vitest';

// Mock Clerk auth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Mock Clerk direct import (used by stakeholders route)
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeEntity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    knowledgeFact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    knowledgeCommunity: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    communityMember: {
      findMany: vi.fn(),
    },
    stakeholderProfile: {
      findMany: vi.fn(),
    },
    workArtifact: {
      findMany: vi.fn(),
    },
  },
}));

// Also mock @/lib/db since stakeholders route uses it
vi.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntity: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    knowledgeFact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    knowledgeCommunity: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    communityMember: {
      findMany: vi.fn(),
    },
    stakeholderProfile: {
      findMany: vi.fn(),
    },
    workArtifact: {
      findMany: vi.fn(),
    },
  },
}));
