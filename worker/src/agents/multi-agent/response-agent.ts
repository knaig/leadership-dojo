/**
 * Response Agent (Mira)
 *
 * Responsible for formulating the final user-facing response.
 * Takes the outputs from Context and Action agents and crafts
 * a helpful, context-aware response with Mira's personality.
 *
 * Personality: Della Street from Perry Mason
 * - Unflappable, sharp, always two steps ahead
 * - Dry wit, warmly professional
 * - Anticipates needs, has answers ready
 */

import {
    AgentContext,
    RouterDecision,
    ContextSynthesis,
    ActionResult,
    FinalResponse
} from './types';
import { getMiraSystemPrompt } from './mira-persona';
import { withGeminiRetry } from './gemini-retry';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';
import { prisma } from '../../lib/prisma';

export class ResponseAgent {
    /**
     * Generate the final response to the user
     */
    async generateResponse(
        context: AgentContext,
        decision: RouterDecision,
        contextSynthesis: ContextSynthesis | null,
        actionResult: ActionResult | null
    ): Promise<FinalResponse> {
        console.log(`[ResponseAgent] Generating response for intent: ${decision.intent}`);

        try {
            const model = await createTrackedGeminiModel(context.userId, {
                model: 'gemini-2.5-flash',
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2500
                }
            });

            const prompt = await this.buildPrompt(context, decision, contextSynthesis, actionResult);

            const result = await withGeminiRetry(
                () => model.generateContent(prompt),
                { label: 'ResponseAgent' }
            );
            const message = result.response.text();

            // Extract suggested follow-ups if any
            const suggestedFollowUps = this.extractFollowUps(message);

            return {
                message: this.cleanMessage(message),
                suggestedFollowUps,
                actionsPerformed: actionResult?.success ? [actionResult.actionTaken] : undefined
            };
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            console.error('[ResponseAgent] Error generating response:', errorMsg);

            // Surface actionable error messages instead of generic fallback
            if (errorMsg.includes('API key') || errorMsg.includes('api key')) {
                return {
                    message: "Mira is temporarily unable to respond — the AI service isn't configured. This is a system issue, not something you need to fix. Please try again in a few minutes.",
                    suggestedFollowUps: []
                };
            }
            if (errorMsg.includes('TokenLimitExceeded') || errorMsg.includes('token') || errorMsg.includes('budget')) {
                return {
                    message: "You've hit your usage limit for this period. Check Settings → Usage to review your plan.",
                    suggestedFollowUps: []
                };
            }
            if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
                return {
                    message: "The AI service is temporarily busy. Please try again in a moment.",
                    suggestedFollowUps: []
                };
            }
            return {
                message: "I wasn't able to process that request. Please try again, and if it persists, check your AI provider settings.",
                suggestedFollowUps: []
            };
        }
    }

    /**
     * Build the prompt for response generation
     */
    private async buildPrompt(
        context: AgentContext,
        decision: RouterDecision,
        contextSynthesis: ContextSynthesis | null,
        actionResult: ActionResult | null
    ): Promise<string> {
        // Start with Mira's personality
        let prompt = getMiraSystemPrompt(context.userName, context.userJobTitle);

        // Inject learned preferences from call feedback
        const feedbackHints = await this.getStyleHints(context.userId);
        if (feedbackHints) {
            prompt += `\n\n${feedbackHints}`;
        }

        const now = new Date();
        prompt += `

---

## CURRENT SITUATION

TODAY'S DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}

USER'S MESSAGE: "${context.message}"
DETECTED INTENT: ${decision.intent}
ENTITIES: ${JSON.stringify(decision.entities)}

`;

        // Add context synthesis if available
        if (contextSynthesis) {
            prompt += `
## YOUR INTEL (You've already reviewed all of this)

### Projects:
${contextSynthesis.projectSummaries.map(p => `
**${p.name}**
- ${p.meetingCount} meetings, ${p.documentCount} documents
- Key people: ${p.keyPeople.join(', ') || 'None identified'}
- Recent activity: ${p.recentActivity}
`).join('\n')}

### Key People:
${contextSynthesis.relevantPeople.map(p => {
    let line = `- **${p.name}** (${p.role || 'Unknown role'}) - ${p.relationship}`;
    if (p.archetype) line += `\n  Archetype: ${p.archetype}`;
    if (p.archetypePlaybook) line += `\n  Playbook: ${p.archetypePlaybook}`;
    if (p.commStyle) line += ` | Communication: ${p.commStyle}`;
    if (p.motivation) line += ` | Driven by: ${p.motivation}`;
    if (p.outcomeHistory && p.outcomeHistory.total > 0) {
        const oh = p.outcomeHistory;
        line += `\n  Track record: ${oh.landed}/${oh.total} landed`;
        if (oh.patterns.length > 0) line += `\n  ${oh.patterns.join('. ')}`;
    }
    return line;
}).join('\n')}

### Relevant Documents:
${contextSynthesis.relevantDocuments.slice(0, 5).map(d => `- "${d.title}" - ${d.summary.substring(0, 300)}`).join('\n')}

### Relevant Meetings:
${contextSynthesis.relevantMeetings.slice(0, 5).map(m => {
    let line = `**"${m.title}"** on ${m.date.toLocaleDateString()} with ${m.participants.slice(0, 5).join(', ')}`;
    if (m.notes) line += `\n  MEETING NOTES:\n  ${m.notes.substring(0, 1500)}`;
    if (m.outcome) line += `\n  OUTCOME: ${m.outcome}`;
    if (m.relatedEmails && m.relatedEmails.length > 0) {
        line += `\n  RELATED EMAILS:`;
        for (const e of m.relatedEmails.slice(0, 3)) {
            line += `\n  - "${e.subject}" from ${e.from} (${e.date.toLocaleDateString()}): ${e.summary}`;
        }
    }
    if (m.relatedDocuments && m.relatedDocuments.length > 0) {
        line += `\n  RELATED DOCS:`;
        for (const d of m.relatedDocuments.slice(0, 3)) {
            line += `\n  - "${d.title}": ${d.summary}`;
        }
    }
    return line;
}).join('\n\n')}

### Patterns & Insights:
${contextSynthesis.keyInsights.map(i => `- ${i}`).join('\n')}

### Actions You Could Suggest:
${contextSynthesis.suggestedActions.map(a => `- ${a}`).join('\n')}
`;
        }

        // Add action results if available
        if (actionResult) {
            prompt += `
## ACTIONS YOU JUST TOOK
Action: ${actionResult.actionTaken}
Success: ${actionResult.success}
Result: ${JSON.stringify(actionResult.result)}
`;
        }

        // Intent-specific Mira guidance
        switch (decision.intent) {
            case 'SET_GOALS':
                prompt += `
## MIRA'S APPROACH FOR GOAL SETTING
- If you created goals, confirm what you did with quiet confidence
- If not, PROPOSE specific goals based on your intel - don't ask "what kind of goals"
- Be like Della handing Perry the file he was about to ask for
- Tie goals to actual project context you've observed
`;
                break;

            case 'GET_INFO':
                prompt += `
## MIRA'S APPROACH FOR INFO REQUESTS
- Answer directly using ONLY data from YOUR INTEL section above.
- If you have meeting notes, emails, or document content in your intel — INCLUDE THE ACTUAL CONTENT in your response. Don't just say "I have notes" and ask permission. The user asked for it, so deliver it.
- If you have partial info, share what you have and clearly flag what's missing: "I have notes from the March 13 call but not the March 16 one."
- Connect dots across documents, meetings, people - that's your superpower
- NEVER fill gaps with plausible-sounding but fabricated content. If you don't have notes from a meeting, say so.
- NEVER give unsolicited productivity advice like "you should start using templates" or "you might want to capture notes better." Just deliver what was asked for.
`;
                break;

            case 'PREPARE':
                prompt += `
## MIRA'S APPROACH FOR MEETING PREP
- Meeting details, participants, their history with ${context.userName}
- For each KEY person: their archetype, what works with them, and the user's track record with them
- If outcome history exists, reference it: "You've landed 3/4 with Pranab — your data-first approach works. Do that again."
- Relevant docs they should review
- Suggested talking points based on recent context + personality dynamics
- Frame everything as building on strengths, not fixing weaknesses
- NEVER say "you failed" or "you missed" — say "you're strongest when..." or "try leading with..."
`;
                break;

            case 'ANALYZE':
                prompt += `
## MIRA'S APPROACH FOR ANALYSIS
- Surface patterns you've noticed across their work
- Be specific with examples ("In 3 of 5 meetings with Finance...")
- One or two actionable recommendations
- If something looks concerning, say so with your characteristic directness
`;
                break;

            case 'CHAT':
                prompt += `
## MIRA'S APPROACH FOR GENERAL CHAT
- Be warm but efficient
- If they're just chatting, that's fine - be personable
- But always be ready to pivot to something useful
- A slight dry wit is welcome when natural
`;
                break;

            case 'MEETING_OUTCOME':
                prompt += `
## MIRA'S APPROACH FOR MEETING OUTCOME CAPTURE
- Acknowledge the outcome with confidence: "Locked in."
- Briefly restate what they want to achieve in your own words
- If there's time, give one quick tactical preview tip relevant to this specific outcome
- Keep it tight — they're in pre-meeting mode
- If the meeting is soon, mention you'll have a targeted brief coming
`;
                break;

            case 'MEETING_REVIEW':
                prompt += `
## MIRA'S APPROACH FOR POST-MEETING REVIEW
- Present findings clearly but conversationally
- If the objective was met: celebrate briefly, then connect to what they did right — "You led with data and Pranab engaged. That tracks with his Analyst pattern. Building your playbook."
- If partially met: frame as progress — "You moved the needle. Here's what worked, and one thing to try next time."
- If missed: frame as learning — "Now you know how ${context.userName.split(' ')[0]} responds to X. Next time, try Y — that's worked before."
- NEVER blame. ALWAYS connect outcomes to personality dynamics and what works.
- Reference specific people, their archetypes, and interaction patterns
- Close with one forward-looking, confidence-building suggestion
- If this is the first time meeting someone, note what was learned about them
`;
                break;

            case 'IDENTITY_CONFIRMATION':
                prompt += `
## MIRA'S APPROACH FOR IDENTITY CONFIRMATION
- If user confirmed merge: "Got it — merged their profiles. All their meetings, emails, and intel are now unified."
- If user denied: "Understood — I'll keep them as separate people."
- Keep it brief. One sentence.
`;
                break;

            case 'STAKEHOLDER_FEEDBACK':
                prompt += `
## MIRA'S APPROACH FOR STAKEHOLDER FEEDBACK
- Acknowledge the correction/confirmation briefly and naturally: "Got it — updated." or "Good to know, noted."
- If they confirmed your assessment: "Thanks for confirming. That helps me prioritize better."
- If they corrected something: Acknowledge the correction specifically: "Updated Prof. Rajagopalan as your advisor — that changes how I think about that relationship."
- Keep it SHORT. Don't over-explain. One sentence acknowledgment, then move on or offer something useful.
- If appropriate, offer a quick follow-up: "Now that I know Prof is your advisor, want me to re-prioritize your prep for the next meeting with him?"
`;
                break;
        }

        prompt += `
---

Now respond as Mira. Be helpful, specific, and show that you've done your homework.

CRITICAL: NEVER HALLUCINATE OR FABRICATE CONTENT.
- ONLY reference meetings, emails, documents, action items, and discussions that appear in YOUR INTEL above.
- If the intel section has no details about what was discussed in a meeting, say "I don't have the notes from that meeting" — do NOT invent discussion topics, action items, or quotes.
- When in doubt, state what you know (date, attendees, title) and be transparent about what you don't.

CRITICAL: DELIVER, DON'T ASK PERMISSION.
- When you have the data the user asked for, INCLUDE IT in your response. Don't say "I have it, would you like me to show you?" — just show it.
- Never give unsolicited process advice ("you should use a template", "consider capturing notes more consistently"). The user is an executive. Just do the job.

CRITICAL FRAMING RULES:
- Build confidence. Never discourage. Frame setbacks as learning, not failure.
- "You're strongest when..." not "You failed because..."
- "Try leading with..." not "Don't do..."
- "That's a pattern worth noting" not "You keep making this mistake"
- Connect personality intelligence naturally — don't dump archetype labels, weave them into tactical advice.
- When referencing track record, lead with wins: "3/4 landed with this group" not "you missed one."

ARTIFACT RENDERING:
When your response includes substantial structured content (meeting notes, meeting prep, stakeholder briefs,
action item lists, email summaries, reports, or dashboards), wrap that content in a special artifact fence
so the UI can render it in a dedicated side panel. Use this format:

\`\`\`artifact:<type>
<full markdown content>
\`\`\`

Available types: meeting-notes, prep, stakeholder-brief, email-summary, action-items, goals, weekly-snapshot, coaching, report

Rules for artifacts:
- Use artifacts for content that is 10+ lines, structured/scannable, or reference material the user may want to keep visible
- Start artifact content with a clear # heading (this becomes the panel title)
- Keep your conversational message OUTSIDE the fence — the fence content goes to the side panel, your chat message stays inline
- Example: "Here are the notes from your AI4I call:" followed by the artifact fence, then optionally a brief takeaway after

Do NOT use artifacts for:
- Short answers (under 10 lines)
- Conversational responses
- Simple yes/no or one-paragraph answers

Channel Della Street - competent, warm, with just a hint of wit.
`;

        return prompt;
    }

    /**
     * Extract suggested follow-ups from the message
     */
    private extractFollowUps(message: string): string[] {
        const followUps: string[] = [];

        // Look for bullet points at the end suggesting next steps
        const lines = message.split('\n');
        let inFollowUpSection = false;

        for (const line of lines) {
            if (line.toLowerCase().includes('next step') ||
                line.toLowerCase().includes('you might') ||
                line.toLowerCase().includes('would you like')) {
                inFollowUpSection = true;
            }

            if (inFollowUpSection && (line.startsWith('-') || line.startsWith('•') || line.match(/^\d\./))) {
                followUps.push(line.replace(/^[-•\d.]\s*/, '').trim());
            }
        }

        return followUps.slice(0, 3);
    }

    /**
     * Clean up the message for display
     */
    /**
     * Derive style hints from user's call feedback + preferences.
     * These adjust Mira's communication style based on real feedback.
     */
    private async getStyleHints(userId: string): Promise<string | null> {
        try {
            const feedback = await prisma.callFeedback.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 15,
                select: { tooLong: true, tooShort: true, wasRelevant: true, wasActionable: true, rating: true },
            });

            if (feedback.length < 3) return null;

            const hints: string[] = [];
            const tooLong = feedback.filter(f => f.tooLong).length;
            const tooShort = feedback.filter(f => f.tooShort).length;
            const irrelevant = feedback.filter(f => f.wasRelevant === false).length;
            const notActionable = feedback.filter(f => f.wasActionable === false).length;

            if (tooLong >= 2) hints.push('Keep responses concise — this user prefers brevity.');
            if (tooShort >= 2) hints.push('Give more detail and context — this user wants depth.');
            if (irrelevant >= 2) hints.push('Focus on immediately actionable, timely information. Skip general observations.');
            if (notActionable >= 2) hints.push('Always include specific next steps. This user values actionable advice over analysis.');

            if (hints.length === 0) return null;

            return `## STYLE PREFERENCES (learned from user feedback)\n${hints.join('\n')}`;
        } catch {
            return null;
        }
    }

    private cleanMessage(message: string): string {
        // Remove any JSON artifacts (but preserve artifact: fences for the UI)
        let cleaned = message.replace(/```json[\s\S]*?```/g, '');

        // Remove excessive newlines
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

        return cleaned.trim();
    }
}

export const responseAgent = new ResponseAgent();
