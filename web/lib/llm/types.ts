/**
 * LLM Provider Types - BYOLLM Architecture
 */

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  apiKey?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
}

export type LLMProviderType = 'anthropic' | 'openai' | 'perplexity' | 'azure' | 'ollama' | 'gemini' | 'none';

export interface AnalysisConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface AnalysisResult {
  scores: {
    [dimension: string]: number; // 0-1
  };
  detectedMode?: string;
  observations: any[]; // Structured observations
  summary?: string;
  dominantCapacities?: string[];
  growthAreas?: string[];
  raw?: any; // Escape hatch for custom prompt responses
}

export interface CoachingConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface CoachingResult {
  dominantMode: string;
  specificMoments: string[];
  seniorApproach: string;
  behaviorPractice: string;
  coachingSummary: string;
  scores: {
    [dimension: string]: number;
  };
}

export interface LLMProvider {
  name: string;
  models: string[];
  requiresApiKey: boolean;

  analyze(
    prompt: string,
    config: AnalysisConfig
  ): Promise<AnalysisResult>;

  generateCoaching(
    prompt: string,
    config: CoachingConfig
  ): Promise<CoachingResult>;

  // For generic text generation (conversation prep, etc)
  generateText(prompt: string, model?: string): Promise<string>;
}

export interface ProviderMetadata {
  name: string;
  models: string[];
  requiresApiKey: boolean;
  endpoint?: string;
  estimatedCostPerCase: number;
  description: string;
}

export const PROVIDER_METADATA: Record<LLMProviderType, ProviderMetadata> = {
  anthropic: {
    name: 'Anthropic Claude',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229'
    ],
    requiresApiKey: true,
    estimatedCostPerCase: 0.75,
    description: 'Best for nuanced behavioral analysis. Recommended for serious use.'
  },
  openai: {
    name: 'OpenAI GPT',
    models: [
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-3.5-turbo'
    ],
    requiresApiKey: true,
    estimatedCostPerCase: 0.50,
    description: 'Good quality, widely available. Solid choice for most users.'
  },
  azure: {
    name: 'Azure OpenAI',
    models: ['gpt-4', 'gpt-35-turbo'],
    requiresApiKey: true,
    estimatedCostPerCase: 0.50,
    description: 'For enterprise deployments using Azure infrastructure.'
  },
  perplexity: {
    name: 'Perplexity AI',
    models: ['sonar-pro', 'sonar'],
    requiresApiKey: true,
    estimatedCostPerCase: 0.20,
    description: 'Real-time knowledge and fast inference. Good for fact-checking.'
  },
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    requiresApiKey: true,
    estimatedCostPerCase: 0.10,
    description: 'Fast, multimodal reasoning with large context window.'
  },
  ollama: {
    name: 'Ollama (Local)',
    models: ['llama2', 'mistral', 'mixtral'],
    requiresApiKey: false,
    estimatedCostPerCase: 0,
    description: 'Free, private, runs on your machine. Requires Ollama installed.'
  },
  none: {
    name: 'No LLM (Static Coaching)',
    models: ['static'],
    requiresApiKey: false,
    estimatedCostPerCase: 0,
    description: 'Uses pre-written feedback. Free but less personalized.'
  }
};
