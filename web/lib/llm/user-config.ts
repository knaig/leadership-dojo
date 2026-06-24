import { prisma } from '@/lib/prisma';
import { LLMConfig, LLMProviderType } from './types';
import { decryptApiKey } from '@/lib/encryption';

/**
 * Get LLM configuration for a user
 * Prioritizes: User's API key > Environment default
 */
export async function getUserLLMConfig(userId: string): Promise<LLMConfig> {
  // Check for user's API keys
  const apiKeys = await prisma.userApiKey.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: [
      { lastUsed: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  // Use the most recently used or created key
  const activeKey = apiKeys[0];

  if (activeKey) {
    let decryptedKey: string;
    try {
      decryptedKey = decryptApiKey(activeKey.encryptedKey);
    } catch (e) {
      console.error(`[LLM Config] Failed to decrypt API key for user ${userId}, skipping to env fallback:`, (e as Error).message);
      // Fall through to env var defaults below
      return getEnvFallbackConfig();
    }

    switch (activeKey.provider) {
      case 'anthropic':
        return {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          apiKey: decryptedKey,
          temperature: 0.7,
          maxTokens: 3000,
        };
      case 'openai':
        return {
          provider: 'openai',
          model: 'gpt-4-turbo-preview',
          apiKey: decryptedKey,
          temperature: 0.7,
          maxTokens: 3000,
        };
      case 'perplexity':
        return {
          provider: 'perplexity',
          model: 'sonar-pro',
          apiKey: decryptedKey,
          temperature: 0.7,
          maxTokens: 3000,
        };
      case 'gemini':
        return {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          apiKey: decryptedKey,
          temperature: 0.7,
          maxTokens: 8192,
        };
    }
  }

  return getEnvFallbackConfig();
}

function getEnvFallbackConfig(): LLMConfig {
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.7,
      maxTokens: 8192,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: 'gpt-4-turbo-preview',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0.7,
      maxTokens: 3000,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
      temperature: 0.7,
      maxTokens: 3000,
    };
  }

  return {
    provider: 'none' as LLMProviderType,
    model: 'static',
    temperature: 0.7,
    maxTokens: 3000,
  };
}
