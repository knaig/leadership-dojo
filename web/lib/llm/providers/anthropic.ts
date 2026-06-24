import { LLMProvider, AnalysisConfig, AnalysisResult, CoachingConfig, CoachingResult } from '../types';

export class AnthropicProvider implements LLMProvider {
  name = 'Anthropic Claude';
  models = ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'];
  requiresApiKey = true;

  constructor(private apiKey: string) { }

  async analyze(prompt: string, config: AnalysisConfig): Promise<AnalysisResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return this.parseAnalysis(data.content[0].text);
  }

  async generateCoaching(prompt: string, config: CoachingConfig): Promise<CoachingResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return this.parseCoaching(data.content[0].text);
  }

  async generateText(prompt: string, model?: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || this.models[0],
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${await response.text()}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  private parseAnalysis(text: string): AnalysisResult {
    // Extract JSON from LLM response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse LLM response - no JSON found');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        scores: parsed.scores || {},
        detectedMode: parsed.detected_mode || parsed.detectedMode,
        observations: parsed.observations || []
      };
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e}`);
    }
  }

  private parseCoaching(text: string): CoachingResult {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse coaching response - no JSON found');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        dominantMode: parsed.dominant_mode || parsed.dominantMode || 'unknown',
        specificMoments: parsed.specific_moments || parsed.specificMoments || [],
        seniorApproach: parsed.senior_advisor_approach || parsed.seniorApproach || '',
        behaviorPractice: parsed.behavior_practice || parsed.behaviorPractice || '',
        coachingSummary: parsed.coaching_summary || parsed.coachingSummary || '',
        scores: parsed.scores || {}
      };
    } catch (e) {
      throw new Error(`Failed to parse coaching JSON: ${e}`);
    }
  }
}
