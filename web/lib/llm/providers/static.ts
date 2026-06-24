import { LLMProvider, AnalysisConfig, AnalysisResult, CoachingConfig, CoachingResult } from '../types';

export class StaticProvider implements LLMProvider {
  name = 'Static Coaching';
  models = ['static'];
  requiresApiKey = false;

  async analyze(prompt: string, config: AnalysisConfig, fallbackData?: any): Promise<AnalysisResult> {
    // Return default scores
    return {
      scores: fallbackData?.defaultScores || {
        solution_jumping: 0.5,
        stakeholder_awareness: 0.5,
        timing_sensitivity: 0.5,
        legitimacy_awareness: 0.5
      },
      detectedMode: 'unknown',
      observations: [
        'Analysis unavailable without LLM configuration.',
        'Consider setting up an LLM provider for personalized coaching.'
      ]
    };
  }

  async generateCoaching(prompt: string, config: CoachingConfig, fallbackData?: any): Promise<CoachingResult> {
    // Return pre-written coaching from case data
    return {
      dominantMode: 'unknown',
      specificMoments: [],
      seniorApproach: fallbackData?.seniorApproach || 'Configure an LLM provider to receive personalized coaching based on your specific responses.',
      behaviorPractice: fallbackData?.behaviorPractice || 'Reflect on this case before your next meeting.',
      coachingSummary: fallbackData?.coachingSummary || 'To receive personalized coaching, please configure an LLM provider in settings. This will analyze your specific responses and provide targeted behavioral feedback.',
      scores: fallbackData?.scores || {
        solution_jumping: 0.5,
        stakeholder_awareness: 0.5,
        timing_sensitivity: 0.5,
        legitimacy_awareness: 0.5
      }
    };
  }

  async generateText(prompt: string, model?: string): Promise<string> {
    return 'LLM configuration required for text generation.';
  }
}
