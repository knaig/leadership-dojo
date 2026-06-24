/**
 * Tracked Gemini wrapper for direct SDK calls.
 *
 * Many agent files use GoogleGenerativeAI directly (chat, function calling, etc.)
 * rather than the simpler generateText() abstraction. This wrapper intercepts
 * generateContent() and sendMessage() calls to check token budget and record usage.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkTokenBudget, recordTokenUsage, TokenLimitExceededError } from './token-tracking';
import { getUserLLMConfig } from './user-llm';
import { prisma } from './prisma';

/**
 * Get a Gemini API key for a user — respects their subscription/key preference.
 * Returns { apiKey, isUserProvidedKey }.
 */
export async function getGeminiKeyForUser(userId: string): Promise<{ apiKey: string; isUserProvidedKey: boolean }> {
    const config = await getUserLLMConfig(userId);

    // User has their own key configured (any provider that returned gemini)
    if (config.provider === 'gemini' && config.apiKey) {
        return { apiKey: config.apiKey, isUserProvidedKey: config.isUserProvidedKey };
    }

    // Check if user has a platform subscription or can be auto-provisioned
    const sub = await prisma.subscription.findUnique({
        where: { userId },
        select: { llmSource: true },
    });

    const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (sub?.llmSource === 'platform' && envKey) {
        return { apiKey: envKey, isUserProvidedKey: false };
    }

    // Auto-provision platform LLM for first 50 users using env key
    // Handles both new users (no sub) and existing users (sub without llmSource set)
    if (envKey && sub?.llmSource !== 'platform') {
        try {
            const platformUserCount = await prisma.subscription.count({
                where: { llmSource: 'platform' },
            });
            if (platformUserCount < 50) {
                await prisma.subscription.upsert({
                    where: { userId },
                    create: {
                        userId,
                        tier: 'FREE',
                        status: 'ACTIVE',
                        llmSource: 'platform',
                        monthlyTokenLimit: 10_000_000,
                        tokenResetDate: new Date(),
                    },
                    update: {
                        llmSource: 'platform',
                        monthlyTokenLimit: 10_000_000,
                    },
                });
                console.log(`[GeminiTracked] Auto-provisioned platform LLM for user ${userId}`);
                return { apiKey: envKey, isUserProvidedKey: false };
            }
        } catch (err: any) {
            console.warn(`[GeminiTracked] Auto-provision failed: ${err.message}`);
        }
    }

    // Last resort: use env key directly (e.g., BYOLLM user with non-Gemini key,
    // but agents need Gemini for structured tasks like routing)
    if (envKey) {
        return { apiKey: envKey, isUserProvidedKey: false };
    }

    throw new Error('No API key available. Please add your API key in Settings → AI Provider.');
}

/**
 * Create a tracked Gemini model that checks budget before calls
 * and records token usage after calls.
 *
 * Usage:
 *   const model = await createTrackedGeminiModel(userId, { model: 'gemini-2.5-flash', ... });
 *   const result = await model.generateContent(prompt);
 */
export async function createTrackedGeminiModel(
    userId: string,
    modelConfig: {
        model?: string;
        systemInstruction?: string;
        tools?: any[];
        generationConfig?: any;
    } = {}
) {
    const { apiKey, isUserProvidedKey } = await getGeminiKeyForUser(userId);
    const genAI = new GoogleGenerativeAI(apiKey);

    const { GEMINI_MODEL, GEMINI_MODEL_FALLBACKS, isModelUnavailableError } = require('./gemini-models');
    const requestedModel = modelConfig.model || GEMINI_MODEL;

    const model = genAI.getGenerativeModel({
        model: requestedModel,
        ...(modelConfig.systemInstruction && { systemInstruction: modelConfig.systemInstruction }),
        ...(modelConfig.tools && { tools: modelConfig.tools }),
        ...(modelConfig.generationConfig && { generationConfig: modelConfig.generationConfig }),
    });

    // Wrap generateContent with model fallback
    const originalGenerateContent = model.generateContent.bind(model);
    model.generateContent = async (...args: any[]) => {
        if (!isUserProvidedKey) {
            const budget = await checkTokenBudget(userId);
            if (!budget.allowed) {
                throw new TokenLimitExceededError(budget.limit, budget.used);
            }
        }

        try {
            const result = await originalGenerateContent(...args);

            if (!isUserProvidedKey) {
                const totalTokens = result.response?.usageMetadata?.totalTokenCount;
                if (totalTokens) {
                    await recordTokenUsage(userId, totalTokens);
                }
            }

            return result;
        } catch (err: any) {
            // Auto-fallback: if model is deprecated/unavailable, try fallback models
            if (isModelUnavailableError(err)) {
                for (const fallbackModel of GEMINI_MODEL_FALLBACKS) {
                    if (fallbackModel === requestedModel) continue;
                    try {
                        console.log(`[GeminiTracked] Model "${requestedModel}" unavailable, trying "${fallbackModel}"...`);
                        const fallback = genAI.getGenerativeModel({
                            model: fallbackModel,
                            ...(modelConfig.systemInstruction && { systemInstruction: modelConfig.systemInstruction }),
                            ...(modelConfig.generationConfig && { generationConfig: modelConfig.generationConfig }),
                        });
                        const result = await fallback.generateContent(...args);

                        if (!isUserProvidedKey) {
                            const totalTokens = result.response?.usageMetadata?.totalTokenCount;
                            if (totalTokens) await recordTokenUsage(userId, totalTokens);
                        }

                        console.log(`[GeminiTracked] Fallback to "${fallbackModel}" succeeded`);
                        return result;
                    } catch (fallbackErr: any) {
                        if (isModelUnavailableError(fallbackErr)) continue;
                        throw fallbackErr; // Non-model error, rethrow
                    }
                }
            }
            throw err; // No fallback worked
        }
    };

    // Wrap startChat to track sendMessage calls
    const originalStartChat = model.startChat.bind(model);
    model.startChat = (...chatArgs: any[]) => {
        const chat = originalStartChat(...chatArgs);
        const originalSendMessage = chat.sendMessage.bind(chat);

        chat.sendMessage = async (...msgArgs: any[]) => {
            if (!isUserProvidedKey) {
                const budget = await checkTokenBudget(userId);
                if (!budget.allowed) {
                    throw new TokenLimitExceededError(budget.limit, budget.used);
                }
            }

            const result = await originalSendMessage(...msgArgs);

            if (!isUserProvidedKey) {
                const totalTokens = result.response?.usageMetadata?.totalTokenCount;
                if (totalTokens) {
                    await recordTokenUsage(userId, totalTokens);
                }
            }

            return result;
        };

        return chat;
    };

    return model;
}
