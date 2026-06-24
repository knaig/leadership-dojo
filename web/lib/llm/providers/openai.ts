import { LLMProvider, AnalysisConfig, AnalysisResult, CoachingConfig, CoachingResult } from '../types';

export class OpenAIProvider implements LLMProvider {
  name = 'OpenAI GPT';
  models = ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'];
  requiresApiKey = true;

  constructor(private apiKey: string) { }

  async analyze(prompt: string, config: AnalysisConfig): Promise<AnalysisResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: config.systemPrompt || 'You are analyzing case study responses. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      scores: parsed.scores || {},
      detectedMode: parsed.detected_mode || parsed.detectedMode,
      observations: parsed.observations || []
    };
  }

  async generateCoaching(prompt: string, config: CoachingConfig): Promise<CoachingResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a senior advisor providing coaching. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return {
      dominantMode: parsed.dominant_mode || parsed.dominantMode || 'unknown',
      specificMoments: parsed.specific_moments || parsed.specificMoments || [],
      seniorApproach: parsed.senior_advisor_approach || parsed.seniorApproach || '',
      behaviorPractice: parsed.behavior_practice || parsed.behaviorPractice || '',
      coachingSummary: parsed.coaching_summary || parsed.coachingSummary || '',
      scores: parsed.scores || {}
    };
  }

  async generateText(prompt: string, model?: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || this.models[0],
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
