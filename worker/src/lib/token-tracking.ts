/**
 * Token tracking for platform LLM usage metering.
 *
 * BYOLLM users (llmSource = "byollm") are always allowed.
 * Platform users (llmSource = "platform") have a monthly token budget.
 * Lazy monthly reset when tokenResetDate has passed.
 *
 * Global platform budget: INR 5000 total across all platform users.
 * Gemini 2.0 Flash: ~₹15/1M blended tokens → ~333M tokens total cap.
 * When global budget is exhausted, platform users must add their own key.
 */

import { prisma } from './prisma';

// Global platform budget: INR 5000 ≈ 333M tokens at Gemini Flash rates
const GLOBAL_PLATFORM_TOKEN_BUDGET = 333_000_000;

// Cache global usage for 5 minutes to avoid hammering DB on every call
let globalUsageCache: { total: number; checkedAt: number } | null = null;
const GLOBAL_CACHE_TTL_MS = 5 * 60 * 1000;

export class TokenLimitExceededError extends Error {
    public remaining: number;
    public limit: number;

    constructor(limit: number, used: number) {
        super(`Monthly token limit reached (${used}/${limit}). Add your own API key or wait for reset.`);
        this.name = 'TokenLimitExceededError';
        this.remaining = 0;
        this.limit = limit;
    }
}

export interface TokenBudget {
    allowed: boolean;
    remaining: number;
    limit: number;
    used: number;
    resetDate: Date;
}

/**
 * Check total platform token usage across ALL platform users.
 * Cached for 5 minutes to avoid excessive DB queries.
 */
export async function getGlobalPlatformUsage(): Promise<{ total: number; budget: number; exhausted: boolean }> {
    const now = Date.now();
    if (globalUsageCache && (now - globalUsageCache.checkedAt) < GLOBAL_CACHE_TTL_MS) {
        return {
            total: globalUsageCache.total,
            budget: GLOBAL_PLATFORM_TOKEN_BUDGET,
            exhausted: globalUsageCache.total >= GLOBAL_PLATFORM_TOKEN_BUDGET,
        };
    }

    try {
        const result = await prisma.subscription.aggregate({
            where: { llmSource: 'platform' },
            _sum: { tokensUsedThisMonth: true },
        });
        const total = Number(result._sum.tokensUsedThisMonth || 0);
        globalUsageCache = { total, checkedAt: now };
        return { total, budget: GLOBAL_PLATFORM_TOKEN_BUDGET, exhausted: total >= GLOBAL_PLATFORM_TOKEN_BUDGET };
    } catch {
        // If aggregate fails, allow usage (don't block on tracking failure)
        return { total: 0, budget: GLOBAL_PLATFORM_TOKEN_BUDGET, exhausted: false };
    }
}

export class GlobalBudgetExhaustedError extends Error {
    constructor() {
        super('Platform LLM budget exhausted (INR 5000 cap). Please add your own API key in Settings to continue.');
        this.name = 'GlobalBudgetExhaustedError';
    }
}

/**
 * Check if user has remaining token budget.
 * Performs lazy monthly reset when tokenResetDate has passed.
 * Also checks the global platform budget (INR 5000 cap).
 * BYOLLM users always return allowed: true.
 */
export async function checkTokenBudget(userId: string): Promise<TokenBudget> {
    const sub = await prisma.subscription.findUnique({
        where: { userId },
        select: {
            llmSource: true,
            monthlyTokenLimit: true,
            tokensUsedThisMonth: true,
            tokenResetDate: true,
        },
    });

    // No subscription or BYOLLM → always allowed
    if (!sub || sub.llmSource === 'byollm') {
        return { allowed: true, remaining: Infinity, limit: 0, used: 0, resetDate: new Date() };
    }

    // Check global platform budget first
    const global = await getGlobalPlatformUsage();
    if (global.exhausted) {
        console.warn(`[TokenTracking] Global platform budget exhausted (${global.total}/${global.budget} tokens). User ${userId} must add own key.`);
        return { allowed: false, remaining: 0, limit: global.budget, used: global.total, resetDate: new Date() };
    }

    const now = new Date();

    // Lazy monthly reset: if tokenResetDate has passed, reset counter
    if (sub.tokenResetDate < now) {
        // Advance reset date by one month from the stored date
        const nextReset = new Date(sub.tokenResetDate);
        while (nextReset <= now) {
            nextReset.setMonth(nextReset.getMonth() + 1);
        }

        await prisma.subscription.update({
            where: { userId },
            data: {
                tokensUsedThisMonth: BigInt(0),
                tokenResetDate: nextReset,
            },
        });

        return {
            allowed: true,
            remaining: sub.monthlyTokenLimit,
            limit: sub.monthlyTokenLimit,
            used: 0,
            resetDate: nextReset,
        };
    }

    const used = Number(sub.tokensUsedThisMonth);
    const remaining = Math.max(0, sub.monthlyTokenLimit - used);
    const allowed = used < sub.monthlyTokenLimit;

    return {
        allowed,
        remaining,
        limit: sub.monthlyTokenLimit,
        used,
        resetDate: sub.tokenResetDate,
    };
}

/**
 * Atomically increment token usage for a user.
 */
export async function recordTokenUsage(userId: string, tokensUsed: number): Promise<void> {
    if (tokensUsed <= 0) return;

    try {
        await prisma.subscription.update({
            where: { userId },
            data: {
                tokensUsedThisMonth: { increment: tokensUsed },
            },
        });
    } catch (err: any) {
        // Don't fail the request if tracking fails — log and continue
        console.warn(`[TokenTracking] Failed to record ${tokensUsed} tokens for ${userId}: ${err.message}`);
    }
}
