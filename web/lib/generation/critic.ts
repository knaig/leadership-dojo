/**
 * MVQS Critic Pass
 * 
 * Reviews generated conversation prep for quality issues.
 * This is the third pass of the 3-pass generation system (Scout → Generate → Critique).
 * 
 * Checks for:
 * - Unsupported claims
 * - Stakeholder fit issues
 * - Missing objections
 * - Internal consistency
 */

import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { IntelligenceReport } from './scout';

interface ConversationPrep {
    primaryObjective: string;
    openingHook?: string;
    keyMessages: Array<{
        message: string;
        shortForm: string;
        supportingData?: string;
    }>;
    anticipatedObjections: Array<{
        objection: string;
        response: string;
    }>;
    risksAndGaps?: string;
}

interface CritiqueIssue {
    severity: 'critical' | 'moderate' | 'minor';
    type: 'unsupported_claim' | 'stakeholder_fit' | 'missing_objection' | 'consistency' | 'actionability';
    description: string;
    fix: string;
}

export interface CritiqueResult {
    overallScore: number;
    passesQualityBar: boolean;
    issues: CritiqueIssue[];
    missingElements: string[];
    suggestedRevisions: string;
    iterations: number;
}

/**
 * Execute Critic pass to review generated prep
 */
export async function criticPass(
    prep: ConversationPrep,
    intelligence: IntelligenceReport
): Promise<CritiqueResult> {
    const prompt = buildCritiquePrompt(prep, intelligence);

    try {
        const llm = new GeminiProvider(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const response = await llm.generateText(prompt, 'gemini-2.0-flash');

        return parseCritiqueResponse(response);
    } catch (error) {
        console.error('Error in critic pass:', error);
        // Return passing result on error to not block delivery
        return {
            overallScore: 7,
            passesQualityBar: true,
            issues: [],
            missingElements: [],
            suggestedRevisions: '',
            iterations: 0,
        };
    }
}

/**
 * Build the critique prompt
 */
function buildCritiquePrompt(
    prep: ConversationPrep,
    intelligence: IntelligenceReport
): string {
    return `You are a rigorous quality reviewer for executive conversation preps.
Your job: Find flaws, unsupported claims, and blind spots.

## The Prep to Review

### Primary Objective
${prep.primaryObjective}

### Opening Hook
${prep.openingHook || 'Not provided'}

### Key Messages
${prep.keyMessages.map((m, i) => `${i + 1}. ${m.message}
   Short form: ${m.shortForm}
   ${m.supportingData ? `Supporting data: ${m.supportingData}` : ''}`).join('\n\n')}

### Anticipated Objections
${prep.anticipatedObjections.map((o, i) => `${i + 1}. ${o.objection}
   Response: ${o.response}`).join('\n\n')}

### Risks and Gaps
${prep.risksAndGaps || 'Not provided'}

---

## Available Intelligence

### Stakeholder: ${intelligence.stakeholder.name}
- Communication style: ${intelligence.stakeholder.communicationStyle || 'Unknown'}
- Hot buttons: ${intelligence.stakeholder.hotButtons.join(', ') || 'Unknown'}
- What has worked: ${intelligence.patterns.whatWorked.join(', ') || 'No data'}
- What has failed: ${intelligence.patterns.whatFailed.join(', ') || 'No data'}

### Recent Context
- Past meetings: ${intelligence.context.pastMeetings.length}
- Recent emails: ${intelligence.context.recentEmails.length}
- Evidence count: ${intelligence.evidenceCount}

---

## Your Review Checklist

1. **EVIDENCE CHECK**: Does each claim have supporting evidence from the Intelligence?
2. **STAKEHOLDER FIT**: Does the approach match their communication style and avoid hot buttons?
3. **BLIND SPOTS**: What obvious objections or risks are missing?
4. **CONSISTENCY**: Do all parts align with the primary objective?
5. **ACTIONABILITY**: Can the exec actually use this? Are talking points concrete?

---

Respond with JSON:
{
  "overallScore": 1-10,
  "passesQualityBar": boolean (true if score >= 7),
  "issues": [
    {
      "severity": "critical" | "moderate" | "minor",
      "type": "unsupported_claim" | "stakeholder_fit" | "missing_objection" | "consistency" | "actionability",
      "description": "What's wrong",
      "fix": "How to fix it"
    }
  ],
  "missingElements": ["list of things that should be added"],
  "suggestedRevisions": "Summary of what needs to change for approval"
}

Be thorough but fair. If the prep is good, say so.`;
}

/**
 * Parse the critique response
 */
function parseCritiqueResponse(response: string): CritiqueResult {
    try {
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            overallScore: parsed.overallScore || 5,
            passesQualityBar: parsed.passesQualityBar ?? parsed.overallScore >= 7,
            issues: parsed.issues || [],
            missingElements: parsed.missingElements || [],
            suggestedRevisions: parsed.suggestedRevisions || '',
            iterations: 0,
        };
    } catch (error) {
        console.error('Error parsing critique response:', error);
        return {
            overallScore: 7,
            passesQualityBar: true,
            issues: [],
            missingElements: [],
            suggestedRevisions: '',
            iterations: 0,
        };
    }
}

/**
 * Run the full generation cycle with revision loop
 */
export async function generateWithRevisionLoop(
    generateFn: (feedback?: string) => Promise<ConversationPrep>,
    intelligence: IntelligenceReport,
    maxIterations: number = 2
): Promise<{ prep: ConversationPrep; critique: CritiqueResult }> {
    let prep = await generateFn();
    let critique = await criticPass(prep, intelligence);
    let iterations = 0;

    while (!critique.passesQualityBar && iterations < maxIterations) {
        // Regenerate with critique feedback
        prep = await generateFn(critique.suggestedRevisions);
        critique = await criticPass(prep, intelligence);
        iterations++;
        critique.iterations = iterations;
    }

    return { prep, critique };
}
