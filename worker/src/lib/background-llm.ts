/**
 * Background LLM Client
 *
 * Separate API key + rate limiter for background jobs (extraction, synthesis, scoring).
 * Keeps chat pipeline responsive by not sharing quota.
 *
 * Rate limits (Gemini 2.0 Flash free tier per key):
 * - 15 RPM (requests per minute)
 * - 1,500 RPD (requests per day)
 * - 1,000,000 TPM (tokens per minute)
 *
 * We target 10 RPM to leave headroom. Retry indefinitely with backoff on 429s.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// ═══════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════

// Pay-as-you-go: 2000 RPM limit. We target 500 RPM for background to leave 1500 for chat.
// Free tier: 15 RPM. Auto-detect based on whether we hit 429s.
const TARGET_RPM = 500;
const MIN_INTERVAL_MS = (60 * 1000) / TARGET_RPM; // 120ms between requests
let lastRequestTime = 0;
let dailyRequestCount = 0;
let dailyResetTime = Date.now();
const DAILY_LIMIT = 50000; // Pay-as-you-go is unlimited RPD, but cap for cost safety

async function waitForSlot(): Promise<void> {
    // Reset daily counter if new day
    if (Date.now() - dailyResetTime > 24 * 60 * 60 * 1000) {
        dailyRequestCount = 0;
        dailyResetTime = Date.now();
    }

    // Check daily limit
    if (dailyRequestCount >= DAILY_LIMIT) {
        const hoursUntilReset = ((dailyResetTime + 24 * 60 * 60 * 1000) - Date.now()) / (60 * 60 * 1000);
        console.log(`[BackgroundLLM] Daily limit reached (${DAILY_LIMIT}). Resets in ${hoursUntilReset.toFixed(1)}h`);
        // Wait until reset
        const waitMs = (dailyResetTime + 24 * 60 * 60 * 1000) - Date.now();
        await new Promise(r => setTimeout(r, Math.min(waitMs, 60000))); // Wait max 1 min, then recheck
        return waitForSlot(); // Recursive check
    }

    // Enforce minimum interval between requests
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
}

function recordRequest(): void {
    lastRequestTime = Date.now();
    dailyRequestCount++;
}

// ═══════════════════════════════════════════════════════
// LLM CLIENT
// ═══════════════════════════════════════════════════════

function getBackgroundApiKey(): string {
    const bgKey = process.env.GEMINI_API_KEY_BACKGROUND;
    if (bgKey) return bgKey;
    console.log('[BackgroundLLM] No GEMINI_API_KEY_BACKGROUND set — falling back to primary GEMINI_API_KEY');
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('No Gemini API key available (checked GEMINI_API_KEY_BACKGROUND and GEMINI_API_KEY)');
    return key;
}

/**
 * Generate text using the background API key with rate limiting and infinite retry.
 * Unlike the chat pipeline, this NEVER skips — it retries until success.
 */
export async function backgroundGenerateText(
    prompt: string,
    opts?: {
        temperature?: number;
        maxOutputTokens?: number;
        model?: string;
    }
): Promise<string> {
    const apiKey = getBackgroundApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: opts?.model || 'gemini-2.5-flash',
        generationConfig: {
            temperature: opts?.temperature ?? 0.2,
            maxOutputTokens: opts?.maxOutputTokens ?? 500,
        },
    });

    let attempt = 0;
    const MAX_ATTEMPTS = 10;

    while (attempt < MAX_ATTEMPTS) {
        await waitForSlot();

        try {
            recordRequest();
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (err: any) {
            attempt++;
            const isRateLimit = err.message?.includes('429') || err.message?.includes('Resource exhausted');
            const isQuota = err.message?.includes('quota') || err.message?.includes('RATE_LIMIT');

            if (isRateLimit || isQuota) {
                // Exponential backoff: 10s, 20s, 40s, 60s, 60s...
                const backoffMs = Math.min(10000 * Math.pow(2, attempt - 1), 60000);
                console.log(`[BackgroundLLM] Rate limited (attempt ${attempt}/${MAX_ATTEMPTS}). Waiting ${backoffMs / 1000}s...`);
                await new Promise(r => setTimeout(r, backoffMs));
            } else {
                // Non-rate-limit error — retry with shorter backoff
                const backoffMs = Math.min(2000 * attempt, 10000);
                console.log(`[BackgroundLLM] Error (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}. Retrying in ${backoffMs / 1000}s...`);
                await new Promise(r => setTimeout(r, backoffMs));
            }
        }
    }

    throw new Error(`[BackgroundLLM] Failed after ${MAX_ATTEMPTS} attempts`);
}

/**
 * Get current rate limiter stats (for monitoring)
 */
export function getBackgroundLLMStats(): { dailyCount: number; dailyLimit: number; targetRPM: number } {
    return { dailyCount: dailyRequestCount, dailyLimit: DAILY_LIMIT, targetRPM: TARGET_RPM };
}
