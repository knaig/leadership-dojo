import { LLMProvider, LLMConfig, LLMProviderType } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { PerplexityProvider } from './providers/perplexity';
import { GeminiProvider } from './providers/gemini';
import { StaticProvider } from './providers/static';

export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      if (!config.apiKey) {
        throw new Error('Anthropic API key required');
      }
      return new AnthropicProvider(config.apiKey);

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI API key required');
      }
      return new OpenAIProvider(config.apiKey);

    case 'perplexity':
      if (!config.apiKey) {
        throw new Error('Perplexity API key required');
      }
      return new PerplexityProvider(config.apiKey);

    case 'gemini':
      if (!config.apiKey) {
        throw new Error('Gemini API key required');
      }
      return new GeminiProvider(config.apiKey);

    case 'azure':
      // TODO: Implement Azure provider
      throw new Error('Azure provider not yet implemented');

    case 'ollama':
      // TODO: Implement Ollama provider
      throw new Error('Ollama provider not yet implemented');

    case 'none':
      return new StaticProvider();

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function getDefaultConfig(): LLMConfig {
  return {
    provider: 'none',
    model: 'static',
    temperature: 0.7,
    maxTokens: 3000
  };
}

export function validateConfig(config: LLMConfig): boolean {
  if (!config.provider || !config.model) {
    return false;
  }

  if (config.provider !== 'none' && config.provider !== 'ollama') {
    if (!config.apiKey) {
      return false;
    }
  }

  return true;
}
