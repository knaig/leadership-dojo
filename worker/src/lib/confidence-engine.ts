import { prisma } from './prisma';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConfidenceTier = 'SILENT' | 'PROBE' | 'SUGGEST' | 'ASSERT';

export interface StakeholderConfidence {
  stakeholderId: string;
  name: string;
  score: number;
  tier: ConfidenceTier;
}

export type MaturityLevel = 'LEARNING' | 'OBSERVING' | 'COACHING';

type ArchetypeOverride = 'skeptic' | 'navigator';

interface TierThresholds {
  PROBE: number;
  SUGGEST: number;
  ASSERT: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: TierThresholds = {
  PROBE: 0.3,
  SUGGEST: 0.6,
  ASSERT: 0.8,
};

const ARCHETYPE_THRESHOLDS: Record<ArchetypeOverride, TierThresholds> = {
  skeptic: { PROBE: 0.4, SUGGEST: 0.7, ASSERT: 0.9 },
  navigator: { PROBE: 0.2, SUGGEST: 0.5, ASSERT: 0.7 },
};

// ─── Score Helpers ───────────────────────────────────────────────────────────

/**
 * Source score based on how the stakeholder was discovered / enriched.
 *
 * - userStated facts exist → 0.7
 * - calendar + email enrichment → 0.5
 * - calendar only → 0.3
 * - everything else → 0.1
 */
function computeSourceScore(
  enrichmentSource: string | null,
  hasUserStatedFacts: boolean,
): number {
  if (hasUserStatedFacts) return 0.7;

  if (enrichmentSource) {
    const src = enrichmentSource.toLowerCase();
    // If enrichment came from both calendar and email (or manual), score higher
    if (src.includes('email') || src === 'manual' || src === 'web_search') {
      return 0.5;
    }
    if (src.includes('calendar')) return 0.3;
  }

  return 0.1;
}

/**
 * Density score based on interaction count.
 */
function computeDensityScore(interactionCount: number): number {
  if (interactionCount >= 15) return 1.0;
  if (interactionCount >= 7) return 0.9;
  if (interactionCount >= 3) return 0.7;
  return 0.5;
}

/**
 * Recency score based on days since last interaction.
 */
function computeRecencyScore(lastInteraction: Date | null): number {
  if (!lastInteraction) return 0.4;

  const daysSince = Math.floor(
    (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince < 7) return 1.0;
  if (daysSince < 30) return 0.8;
  if (daysSince < 90) return 0.6;
  return 0.4;
}

/**
 * Map a raw confidence score to a tier using the given thresholds.
 */
function scoreToTier(score: number, thresholds: TierThresholds): ConfidenceTier {
  if (score >= thresholds.ASSERT) return 'ASSERT';
  if (score >= thresholds.SUGGEST) return 'SUGGEST';
  if (score >= thresholds.PROBE) return 'PROBE';
  return 'SILENT';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute per-stakeholder confidence scores for a user.
 *
 * Confidence = sourceScore × densityScore × recencyScore (capped at 1.0)
 *
 * The optional `archetype` parameter adjusts tier thresholds:
 * - 'skeptic'   → more conservative (higher thresholds)
 * - 'navigator' → wants intel faster (lower thresholds)
 */
export async function computeStakeholderConfidence(
  userId: string,
  archetype?: ArchetypeOverride,
): Promise<StakeholderConfidence[]> {
  const thresholds = archetype
    ? ARCHETYPE_THRESHOLDS[archetype]
    : DEFAULT_THRESHOLDS;

  // Fetch all stakeholder profiles for this user (exclude merged duplicates)
  const stakeholders = await prisma.stakeholderProfile.findMany({
    where: { userId, mergedIntoId: null },
    select: {
      id: true,
      name: true,
      interactionCount: true,
      lastInteraction: true,
      enrichmentSource: true,
      intelligence: { select: { evidenceCount: true } },
    },
  });

  if (stakeholders.length === 0) return [];

  // Batch-fetch user-stated fact counts grouped by subjectId
  const userStatedFacts = await prisma.knowledgeFact.groupBy({
    by: ['subjectId'],
    where: {
      userId,
      source: 'USER_STATED',
      subjectId: { in: stakeholders.map((s) => s.id) },
    },
    _count: { id: true },
  });

  const userStatedBySubject = new Map<string, number>();
  for (const row of userStatedFacts) {
    userStatedBySubject.set(row.subjectId, row._count.id);
  }

  return stakeholders.map((s) => {
    const hasUserStated = (userStatedBySubject.get(s.id) ?? 0) > 0;

    const sourceScore = computeSourceScore(s.enrichmentSource, hasUserStated);
    const densityScore = computeDensityScore(s.interactionCount);
    const recencyScore = computeRecencyScore(s.lastInteraction);

    const score = Math.min(1.0, sourceScore * densityScore * recencyScore);
    const tier = scoreToTier(score, thresholds);

    return {
      stakeholderId: s.id,
      name: s.name,
      score: Math.round(score * 1000) / 1000, // 3 decimal places
      tier,
    };
  });
}

/**
 * Data-driven maturity level for a user's relationship with Mira.
 *
 * - COACHING:  15+ calls AND 5+ stakeholders at SUGGEST+ AND ≤2 corrections in last 2 weeks
 * - OBSERVING: 5+ calls AND 3+ stakeholders above SILENT
 * - LEARNING:  default
 */
export async function computeMaturityLevel(
  userId: string,
): Promise<MaturityLevel> {
  // Fetch call count from PersonalContext
  const personalContext = await prisma.personalContext.findUnique({
    where: { userId },
    select: { callCount: true },
  });

  const callCount = personalContext?.callCount ?? 0;

  // Early exit: can't be above LEARNING without 5+ calls
  if (callCount < 5) return 'LEARNING';

  // Get stakeholder confidence scores (use default thresholds)
  const confidences = await computeStakeholderConfidence(userId);

  const aboveSilent = confidences.filter((c) => c.tier !== 'SILENT').length;

  // Check OBSERVING threshold: 3+ stakeholders above SILENT
  if (aboveSilent < 3) return 'LEARNING';

  // At this point we have 5+ calls and 3+ stakeholders above SILENT → at least OBSERVING
  if (callCount < 15) return 'OBSERVING';

  // Check COACHING: need 5+ at SUGGEST+ and ≤2 corrections in last 2 weeks
  const atSuggestOrAbove = confidences.filter(
    (c) => c.tier === 'SUGGEST' || c.tier === 'ASSERT',
  ).length;

  if (atSuggestOrAbove < 5) return 'OBSERVING';

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const recentCorrections = await prisma.userCorrection.count({
    where: {
      userId,
      createdAt: { gte: twoWeeksAgo },
    },
  });

  if (recentCorrections > 2) return 'OBSERVING';

  return 'COACHING';
}
