/**
 * Feature Flag System
 *
 * All tiers now get ALL features (2-tier SaaS model).
 * The only difference between tiers is LLM source (BYOLLM vs platform).
 */

// ── Temporary flags (grep FF_TEMP_ to find all usage when removing) ──

/** TEMPORARY: Announce call number at start of each voice call for QA/debugging. */
export const FF_TEMP_ANNOUNCE_CALL_NUMBER = false;

import { SubscriptionTier } from '@prisma/client';

export const FEATURES = {
    // Data Collection
    CONNECTORS: 'connectors',
    MANUAL_UPLOAD: 'manual_upload',

    // Analysis
    AI_ANALYSIS: 'ai_analysis',
    CAPACITY_TRACKING: 'capacity_tracking',

    // Feedback Loop
    RECOMMENDATIONS: 'recommendations',
    PRACTICE_MISSIONS: 'practice_missions',

    // Outcomes
    OUTCOME_DASHBOARD: 'outcome_dashboard',
    ROI_TRACKING: 'roi_tracking',

    // Team Features
    TEAM_DASHBOARD: 'team_dashboard',
    MANAGER_INSIGHTS: 'manager_insights',
    ORG_ANALYTICS: 'org_analytics',

    // Advanced
    CUSTOM_INTEGRATIONS: 'custom_integrations',
    SSO: 'sso',
    API_ACCESS: 'api_access',
} as const;

export type Feature = typeof FEATURES[keyof typeof FEATURES];

const ALL_FEATURES: Feature[] = Object.values(FEATURES);

/**
 * Feature matrix by subscription tier — all tiers get all features
 */
const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
    FREE: ALL_FEATURES,
    PRO: ALL_FEATURES,
    ENTERPRISE: ALL_FEATURES,
};

/**
 * Usage limits by tier — unlimited for all
 */
export const TIER_LIMITS = {
    FREE: {
        manualUploadsPerMonth: -1,
        artifactsAnalyzed: -1,
        connectors: -1,
    },
    PRO: {
        manualUploadsPerMonth: -1,
        artifactsAnalyzed: -1,
        connectors: -1,
    },
    ENTERPRISE: {
        manualUploadsPerMonth: -1,
        artifactsAnalyzed: -1,
        connectors: -1,
    },
};

/**
 * Check if a user has access to a feature
 */
export function hasFeature(
    tier: SubscriptionTier,
    feature: Feature,
    enabledFeatures?: string[],
    disabledFeatures?: string[]
): boolean {
    // Check explicit overrides first
    if (disabledFeatures?.includes(feature)) return false;
    if (enabledFeatures?.includes(feature)) return true;

    // All tiers get all features
    return TIER_FEATURES[tier].includes(feature);
}

/**
 * Get all features for a tier
 */
export function getFeaturesForTier(tier: SubscriptionTier): Feature[] {
    return TIER_FEATURES[tier];
}

/**
 * Check if user is within usage limits
 */
export function isWithinLimit(
    tier: SubscriptionTier,
    limitType: keyof typeof TIER_LIMITS.FREE,
    currentUsage: number
): boolean {
    const limit = TIER_LIMITS[tier][limitType];
    if (limit === -1) return true; // unlimited
    return currentUsage < limit;
}

/**
 * Get upgrade message for a feature
 */
export function getUpgradeMessage(feature: Feature): string {
    // All features are now available on all plans
    return 'This feature is available on all plans. Sign up to get started!';
}
