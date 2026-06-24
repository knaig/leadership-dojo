
import { LLMProvider, AnalysisConfig, AnalysisResult, CoachingConfig, CoachingResult } from '../types';

export class GeminiProvider implements LLMProvider {
    name = 'Google Gemini';
    models = ['gemini-2.0-flash', 'gemini-2.0-pro'];
    requiresApiKey = true;

    constructor(private apiKey: string) { }

    async analyze(prompt: string, config: AnalysisConfig): Promise<AnalysisResult> {
        // Use gemini-2.0-flash by default as it's faster and cheaper
        const model = config.model.includes('gemini') && !config.model.includes('1.5') ? config.model : 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

        let retries = 3;
        let lastError;

        while (retries >= 0) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: config.systemPrompt ? `${config.systemPrompt}\n\n${prompt}` : prompt }]
                        }],
                        generationConfig: {
                            temperature: config.temperature,
                            maxOutputTokens: config.maxTokens,
                            responseMimeType: "application/json"
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (!content) throw new Error('Gemini returned empty response');

                    const parsed = JSON.parse(content);
                    return {
                        scores: parsed.scores || {},
                        detectedMode: parsed.detected_mode || parsed.detectedMode,
                        observations: parsed.observations || [],
                        raw: parsed // Pass through full response
                    };
                }

                const errorText = await response.text();
                // Check specifically for 429
                if (response.status === 429) {
                    throw new Error(`Rate Limit Exceeded (429)`);
                }

                if (response.status === 400 && errorText.includes('API_KEY_INVALID')) {
                    throw new Error(`Gemini API Error: Invalid API Key`);
                }
                throw new Error(`Gemini API error ${response.status}: ${errorText}`);
            } catch (e: any) {
                lastError = e;
                if (e.message.includes('Rate Limit') || e.message.includes('429')) {
                    if (retries === 0) break;
                    const delay = (4 - retries) * 2000; // 2s, 4s, 6s
                    console.log(`[Gemini] Rate limit hit. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retries--;
                    continue;
                }
                throw e; // Throw other errors immediately
            }
        }
        throw lastError;
    }

    // Helper to parse JSON safely is embedded in loop above for simplicity context
    private async parseResponse(content: string) {
        // ... (not used, kept simple in loop)
    }

    async generateCoaching(prompt: string, config: CoachingConfig): Promise<CoachingResult> {
        const model = config.model.includes('gemini') && !config.model.includes('1.5') ? config.model : 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `You are a leadership coach. Respond in JSON.\n\n${prompt}` }]
                }],
                generationConfig: {
                    temperature: config.temperature,
                    maxOutputTokens: config.maxTokens,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        try {
            const parsed = JSON.parse(content);
            return {
                dominantMode: parsed.dominant_mode || parsed.dominantMode || 'unknown',
                specificMoments: parsed.specific_moments || parsed.specificMoments || [],
                seniorApproach: parsed.senior_advisor_approach || parsed.seniorApproach || '',
                behaviorPractice: parsed.behavior_practice || parsed.behaviorPractice || '',
                coachingSummary: parsed.coaching_summary || parsed.coachingSummary || '',
                scores: parsed.scores || {}
            };
        } catch (e) {
            throw new Error(`Failed to parse Gemini JSON response: ${content.substring(0, 100)}...`);
        }
    }

    async generateText(prompt: string, model?: string): Promise<string> {
        const targetModel = model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            throw new Error('Gemini returned empty response');
        }

        return content;
    }
}
