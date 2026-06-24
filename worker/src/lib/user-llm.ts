/**
 * Worker-side LLM abstraction
 *
 * Mirrors web/lib/llm/user-config.ts — reads the user's preferred LLM
 * from UserApiKey table, decrypts the key, falls back to env vars.
 *
 * Provides generateText() that works with Gemini, OpenAI, and Anthropic.
 * Includes token budget checking and usage recording for platform LLM users.
 */

import { prisma } from './prisma';
import { createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { checkTokenBudget, recordTokenUsage, TokenLimitExceededError } from './token-tracking';
import { createTrace } from './langfuse';

// ============================================================================
// CONFIG
// ============================================================================

export interface WorkerLLMConfig {
    provider: 'gemini' | 'openai' | 'anthropic' | 'none';
    model: string;
    apiKey?: string;
    temperature?: number;
    maxOutputTokens?: number;
    isUserProvidedKey: boolean; // true = BYOLLM, false = platform env var
}

const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function decryptApiKey(encryptedData: string): string {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) throw new Error('ENCRYPTION_SECRET is not defined');

    const key = scryptSync(secret, 'salt', KEY_LENGTH);
    const combined = Buffer.from(encryptedData, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Get LLM config for a user. Priority:
 * 1. User's own API key (BYOLLM) → isUserProvidedKey = true
 * 2. Platform LLM for "platform" llmSource users → isUserProvidedKey = false
 * 3. BYOLLM user with no key → provider: 'none'
 */
export async function getUserLLMConfig(userId: string): Promise<WorkerLLMConfig> {
    // 1. Check for user's own API key
    try {
        const apiKey = await prisma.userApiKey.findFirst({
            where: { userId, isActive: true },
            orderBy: [{ lastUsed: 'desc' }, { createdAt: 'desc' }],
        });

        if (apiKey) {
            const decryptedKey = decryptApiKey(apiKey.encryptedKey);
            const provider = apiKey.provider as WorkerLLMConfig['provider'];

            switch (provider) {
                case 'gemini':
                    return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', apiKey: decryptedKey, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: true };
                case 'openai':
                    return { provider: 'openai', model: 'gpt-4-turbo-preview', apiKey: decryptedKey, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: true };
                case 'anthropic':
                    return { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: decryptedKey, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: true };
            }
        }
    } catch (err: any) {
        console.warn(`[UserLLM] Failed to load user key: ${err.message}`);
    }

    // 2. Check subscription llmSource — platform users get env var key
    try {
        const sub = await prisma.subscription.findUnique({
            where: { userId },
            select: { llmSource: true },
        });

        if (sub?.llmSource === 'platform') {
            // Platform LLM — use env var
            if (process.env.GEMINI_API_KEY) {
                return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: false };
            }
            if (process.env.OPENAI_API_KEY) {
                return { provider: 'openai', model: 'gpt-4-turbo-preview', apiKey: process.env.OPENAI_API_KEY, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: false };
            }
            if (process.env.ANTHROPIC_API_KEY) {
                return { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', apiKey: process.env.ANTHROPIC_API_KEY, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: false };
            }
        }
    } catch (err: any) {
        console.warn(`[UserLLM] Failed to check subscription: ${err.message}`);
    }

    // 3. No subscription yet — auto-provision platform LLM for first 50 users
    if (process.env.GEMINI_API_KEY) {
        try {
            const platformUserCount = await prisma.subscription.count({
                where: { llmSource: 'platform' },
            });

            if (platformUserCount < 50) {
                // Auto-create subscription with platform LLM access
                const PLATFORM_MONTHLY_TOKEN_LIMIT = 10_000_000; // 10M tokens/month
                await prisma.subscription.upsert({
                    where: { userId },
                    create: {
                        userId,
                        tier: 'FREE',
                        status: 'ACTIVE',
                        llmSource: 'platform',
                        monthlyTokenLimit: PLATFORM_MONTHLY_TOKEN_LIMIT,
                        tokenResetDate: new Date(),
                    },
                    update: {
                        llmSource: 'platform',
                        monthlyTokenLimit: PLATFORM_MONTHLY_TOKEN_LIMIT,
                    },
                });
                console.log(`[UserLLM] Auto-provisioned platform LLM for user ${userId} (${platformUserCount + 1}/50)`);
                return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', apiKey: process.env.GEMINI_API_KEY, temperature: 0.3, maxOutputTokens: 2000, isUserProvidedKey: false };
            }
        } catch (err: any) {
            console.warn(`[UserLLM] Failed to auto-provision platform LLM: ${err.message}`);
        }
    }

    // Beyond 50 users or no env key — user must provide their own
    return { provider: 'none', model: 'none', isUserProvidedKey: false };
}

// ============================================================================
// TEXT GENERATION (with token tracking)
// ============================================================================

/**
 * Generate text using the user's preferred LLM.
 * Handles Gemini, OpenAI, and Anthropic.
 * Checks token budget for platform LLM users before calling.
 * Records token usage after successful calls.
 */
export async function generateText(
    config: WorkerLLMConfig,
    prompt: string,
    opts?: { temperature?: number; maxOutputTokens?: number; userId?: string; traceName?: string }
): Promise<string> {
    const temperature = opts?.temperature ?? config.temperature ?? 0.3;
    const maxTokens = opts?.maxOutputTokens ?? config.maxOutputTokens ?? 2000;
    const userId = opts?.userId;

    if (!config.apiKey || config.provider === 'none') {
        throw new Error('No LLM configured — set an API key in settings or environment');
    }

    // Check token budget for platform LLM users
    if (!config.isUserProvidedKey && userId) {
        const budget = await checkTokenBudget(userId);
        if (!budget.allowed) {
            throw new TokenLimitExceededError(budget.limit, budget.used);
        }
    }

    // Langfuse tracing — track model, input, output, duration
    const trace = createTrace({
        name: opts?.traceName || 'generateText',
        userId,
        metadata: { provider: config.provider, model: config.model },
        input: prompt.substring(0, 500), // Truncate for storage
    });

    const generation = trace?.generation({
        name: 'llm-call',
        model: config.model,
        input: prompt,
        modelParameters: { temperature, maxTokens },
    });

    try {
        let result: string;
        switch (config.provider) {
            case 'gemini':
                result = await generateWithGemini(config.apiKey, config.model, prompt, temperature, maxTokens, userId, config.isUserProvidedKey);
                break;
            case 'openai':
                result = await generateWithOpenAI(config.apiKey, config.model, prompt, temperature, maxTokens, userId, config.isUserProvidedKey);
                break;
            case 'anthropic':
                result = await generateWithAnthropic(config.apiKey, config.model, prompt, temperature, maxTokens, userId, config.isUserProvidedKey);
                break;
            default:
                throw new Error(`Unsupported provider: ${config.provider}`);
        }

        generation?.end({ output: result });
        trace?.update({ output: result.substring(0, 500) });
        return result;
    } catch (err) {
        generation?.end({
            output: null,
            level: 'ERROR',
            statusMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}

async function generateWithGemini(
    apiKey: string, model: string, prompt: string, temperature: number, maxOutputTokens: number,
    userId?: string, isUserProvidedKey?: boolean
): Promise<string> {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const m = genAI.getGenerativeModel({ model, generationConfig: { temperature, maxOutputTokens } });
    const result = await m.generateContent(prompt);

    // Record token usage for platform users
    if (!isUserProvidedKey && userId) {
        const totalTokens = result.response?.usageMetadata?.totalTokenCount;
        if (totalTokens) {
            await recordTokenUsage(userId, totalTokens);
        }
    }

    return result.response.text();
}

async function generateWithOpenAI(
    apiKey: string, model: string, prompt: string, temperature: number, maxTokens: number,
    userId?: string, isUserProvidedKey?: boolean
): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }
    const data = await response.json() as any;

    // Record token usage for platform users
    if (!isUserProvidedKey && userId) {
        const totalTokens = data.usage?.total_tokens;
        if (totalTokens) {
            await recordTokenUsage(userId, totalTokens);
        }
    }

    return data.choices[0]?.message?.content || '';
}

async function generateWithAnthropic(
    apiKey: string, model: string, prompt: string, temperature: number, maxTokens: number,
    userId?: string, isUserProvidedKey?: boolean
): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }
    const data = await response.json() as any;

    // Record token usage for platform users
    if (!isUserProvidedKey && userId) {
        const inputTokens = data.usage?.input_tokens || 0;
        const outputTokens = data.usage?.output_tokens || 0;
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens > 0) {
            await recordTokenUsage(userId, totalTokens);
        }
    }

    return data.content?.[0]?.text || '';
}

// ============================================================================
// RETRY WRAPPER (provider-agnostic)
// ============================================================================

/**
 * Retry wrapper that handles rate limits for any provider.
 */
export async function withLLMRetry<T>(
    fn: () => Promise<T>,
    opts: { retries?: number; label?: string } = {}
): Promise<T> {
    const { retries = 3, label = 'LLM' } = opts;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            // Never retry token limit errors
            if (err instanceof TokenLimitExceededError) throw err;

            const status = err?.status ?? err?.code ?? err?.statusCode;
            const isRetryable = status == 429 || status == 503 || status == 529;

            if (!isRetryable || attempt === retries) throw err;

            let waitMs = Math.min(5000 * Math.pow(2, attempt), 30000);

            // Respect Google's RetryInfo if present
            if (err?.errorDetails) {
                const retryInfo = err.errorDetails.find((d: any) => d['@type']?.includes('RetryInfo'));
                if (retryInfo?.retryDelay) {
                    const seconds = parseInt(retryInfo.retryDelay.replace('s', ''), 10);
                    if (!isNaN(seconds)) waitMs = (seconds + 1) * 1000;
                }
            }

            console.warn(`[${label}] Rate limit (${status}). Waiting ${waitMs}ms — retry ${attempt + 1}/${retries}`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }
    throw new Error(`[${label}] All retries exhausted`);
}

// Re-export for convenience
export { TokenLimitExceededError } from './token-tracking';
