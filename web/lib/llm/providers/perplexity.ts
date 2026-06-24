import { LLMProvider, AnalysisConfig, AnalysisResult, CoachingConfig, CoachingResult } from '../types';

export class PerplexityProvider implements LLMProvider {
    name = 'Perplexity AI';
    models = ['sonar-pro', 'sonar'];
    requiresApiKey = true;

    constructor(private apiKey: string) { }

    async analyze(prompt: string, config: AnalysisConfig): Promise<AnalysisResult> {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
                max_tokens: config.maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Perplexity API error: ${error}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;

        // Perplexity sometimes wraps JSON in markdown blocks
        if (content.startsWith('```json')) {
            content = content.replace(/^```json/, '').replace(/```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```/, '').replace(/```$/, '');
        }

        // Robust JSON parsing with fallback
        try {
            const parsed = JSON.parse(content);
            return {
                scores: parsed.scores || {},
                detectedMode: parsed.detected_mode || parsed.detectedMode,
                observations: parsed.observations || [],
                summary: parsed.summary,
                dominantCapacities: parsed.dominantCapacities,
                growthAreas: parsed.growthAreas
            };
        } catch (parseError) {
            console.error('Perplexity JSON parse error:', parseError);
            console.error('Content snippet:', content.substring(0, 500));

            // Return empty result instead of crashing
            return {
                scores: {},
                detectedMode: 'unknown',
                observations: []
            };
        }
    }

    async generateCoaching(prompt: string, config: CoachingConfig): Promise<CoachingResult> {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
                max_tokens: config.maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Perplexity API error: ${error}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;

        // Cleanup markdown
        if (content.startsWith('```json')) {
            content = content.replace(/^```json/, '').replace(/```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```/, '').replace(/```$/, '');
        }

        const parsed = JSON.parse(content);

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
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
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
            throw new Error(`Perplexity API error: ${await response.text()}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
}
