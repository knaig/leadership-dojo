/**
 * Router Agent
 *
 * The "brain" of the multi-agent system. Responsible for:
 * 1. Understanding user intent
 * 2. Extracting relevant entities (projects, people, topics)
 * 3. Deciding which specialist agents to invoke
 * 4. Orchestrating the overall flow
 */

import {
    AgentContext,
    RouterDecision,
    UserIntent,
    ExtractedEntities,
    AgentType
} from './types';
import { withGeminiRetry } from './gemini-retry';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';

export class RouterAgent {
    /**
     * Analyze user message and decide what to do
     */
    async route(context: AgentContext): Promise<RouterDecision> {
        console.log(`[RouterAgent] Analyzing: "${context.message}"`);

        const model = await createTrackedGeminiModel(context.userId, {
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.1, // Low temp for consistent classification
                maxOutputTokens: 500
            }
        });

        const now = new Date();
        const prompt = `You are a routing agent that analyzes user messages to determine intent and extract entities.

TODAY'S DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

USER: ${context.userName} (${context.userJobTitle})
MESSAGE: "${context.message}"

CONVERSATION HISTORY (last 3):
${context.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

TASK: Analyze this message and extract:

1. INTENT - What does the user want? Choose ONE:
   - SET_GOALS: User wants to create, set, or track goals
   - GET_INFO: User wants information about something (project, person, schedule)
   - TAKE_ACTION: User wants to do something (sync, send, schedule, create)
   - ANALYZE: User wants analysis or insights
   - PREPARE: User wants to prepare for something (meeting, presentation)
   - FOLLOW_UP: User is continuing/following up on previous topic
   - MEETING_OUTCOME: User is responding with what they want to achieve in an upcoming meeting (often replying to Mira's "what outcome do you want?" prompt)
   - MEETING_REVIEW: User is providing feedback about how a meeting went (often replying to Mira's "how did it go?" prompt)
   - CALL_ME: User wants Mira to call them right now (e.g., "call me", "give me a call", "can you call me?", "let's talk on the phone")
   - STAKEHOLDER_FEEDBACK: User is correcting, confirming, or providing info about a person's importance, role, or relationship (e.g., "Prof is my advisor", "Manmeet is just a vendor", "yes that's right about Srikanth", "no, Riya is the decision-maker")
   - IDENTITY_CONFIRMATION: User is confirming or denying that two people are the same person (e.g., "yes they are the same person", "no those are different people", "yes that's Prof Rajagopalan", "no, raj@coss is someone else")
   - CHAT: General conversation, greeting, or unclear intent

2. ENTITIES - Extract any mentioned:
   - projects: Project or initiative names (e.g., "AI4Inclusion", "Bhashini", "Q1 launch")
   - people: Person names (e.g., "Amul", "Pranab", "John")
   - timeframe: Time references (e.g., "this week", "tomorrow", "Q1")
   - topics: Subject areas (e.g., "architecture", "billing", "roadmap")
   - actionType: If TAKE_ACTION, what action (e.g., "sync", "create", "schedule")

3. REQUIRED_AGENTS - Which specialist agents are needed:
   - "context": Need to retrieve user's work context (meetings, docs, people)
   - "action": Need to take an action (create goal, sync data, etc.)
   - "response": Always needed - formulates the final response

4. CHANNEL - What conversational mode fits best? Choose ONE:
   - OUTCOMES: User is thinking about goals, success criteria, what to achieve ("what should success look like?", "what's the goal?", "what am I trying to accomplish?")
   - DEVILS_ADVOCATE: User wants pushback, stress-testing, opposite perspectives ("poke holes in this", "play devil's advocate", "what could go wrong?", "argue against this")
   - SKILL_BUILDING: User wants to practice conversations or get coaching ("help me prepare for telling X", "how should I handle this conversation?", "practice with me")
   - PERSONAL: User is sharing personal feelings, venting, or needs emotional support ("I'm tired", "I need to talk", "I'm stressed about")
   - GENERAL: Default — information requests, actions, greetings, unclear intent

Respond in JSON format ONLY:
{
  "intent": "SET_GOALS",
  "channel": "OUTCOMES",
  "entities": {
    "projects": ["AI4Inclusion"],
    "people": ["Amul"],
    "timeframe": "this week",
    "topics": ["architecture"],
    "actionType": null
  },
  "requiredAgents": ["context", "action", "response"],
  "confidence": 0.9
}`;

        try {
            const result = await withGeminiRetry(
                () => model.generateContent(prompt),
                { label: 'RouterAgent' }
            );
            const text = result.response.text();

            // Parse JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);

                // Validate and normalize the response
                const intent = this.normalizeIntent(parsed.intent);
                const decision: RouterDecision = {
                    intent,
                    channel: this.normalizeChannel(parsed.channel),
                    entities: this.normalizeEntities(parsed.entities || {}),
                    requiredAgents: this.normalizeAgents(parsed.requiredAgents || [], intent),
                    confidence: parsed.confidence || 0.5
                };

                console.log(`[RouterAgent] Decision:`, decision);
                return decision;
            }
        } catch (error) {
            console.error('[RouterAgent] Error parsing response:', error);
        }

        // Fallback decision
        return {
            intent: 'CHAT',
            channel: 'GENERAL',
            entities: {},
            requiredAgents: ['context', 'response'],
            confidence: 0.3
        };
    }

    /**
     * Normalize channel to valid ConversationChannel value
     */
    private normalizeChannel(channel: string | undefined): string {
        const validChannels = ['OUTCOMES', 'DEVILS_ADVOCATE', 'SKILL_BUILDING', 'PERSONAL', 'GENERAL'];
        const normalized = channel?.toUpperCase().replace(/['\s-]/g, '_');
        return validChannels.includes(normalized as string) ? normalized as string : 'GENERAL';
    }

    /**
     * Normalize intent to valid enum value
     */
    private normalizeIntent(intent: string): UserIntent {
        const validIntents: UserIntent[] = [
            'SET_GOALS', 'GET_INFO', 'TAKE_ACTION', 'ANALYZE',
            'CHAT', 'PREPARE', 'FOLLOW_UP', 'MEETING_OUTCOME', 'MEETING_REVIEW', 'CALL_ME',
            'STAKEHOLDER_FEEDBACK', 'IDENTITY_CONFIRMATION'
        ];

        const normalized = intent?.toUpperCase().replace(/-/g, '_');
        if (validIntents.includes(normalized as UserIntent)) {
            return normalized as UserIntent;
        }
        return 'CHAT';
    }

    /**
     * Normalize entities
     */
    private normalizeEntities(entities: any): ExtractedEntities {
        return {
            projects: Array.isArray(entities.projects) ? entities.projects : [],
            people: Array.isArray(entities.people) ? entities.people : [],
            timeframe: typeof entities.timeframe === 'string' ? entities.timeframe : undefined,
            topics: Array.isArray(entities.topics) ? entities.topics : [],
            actionType: typeof entities.actionType === 'string' ? entities.actionType : undefined
        };
    }

    /**
     * Normalize agent list based on intent
     * Some intents ALWAYS need context, even if LLM didn't specify it
     */
    private normalizeAgents(agents: any[], intent?: UserIntent): AgentType[] {
        const validAgents: AgentType[] = ['context', 'action', 'response'];
        const normalized = agents
            .filter(a => validAgents.includes(a as AgentType))
            .map(a => a as AgentType);

        // Intents that ALWAYS need context to be useful
        const contextRequiredIntents: UserIntent[] = [
            'SET_GOALS',        // Need to know about projects to set relevant goals
            'GET_INFO',         // Need to search for information
            'ANALYZE',          // Need data to analyze
            'PREPARE',          // Need meeting/doc context to prepare
            'MEETING_OUTCOME',  // Need meeting context to store outcome
            'MEETING_REVIEW'    // Need meeting context for review
        ];

        // Always include context for these intents
        if (intent && contextRequiredIntents.includes(intent) && !normalized.includes('context')) {
            normalized.unshift('context'); // Add at beginning
        }

        // Intents that ALWAYS need the action agent
        const actionRequiredIntents: UserIntent[] = [
            'SET_GOALS', 'TAKE_ACTION', 'CALL_ME',
            'MEETING_OUTCOME', 'MEETING_REVIEW', 'STAKEHOLDER_FEEDBACK', 'IDENTITY_CONFIRMATION',
        ];
        if (intent && actionRequiredIntents.includes(intent) && !normalized.includes('action')) {
            normalized.push('action');
        }

        // Always include response agent
        if (!normalized.includes('response')) {
            normalized.push('response');
        }

        return normalized;
    }

    /**
     * Determine the action type based on intent and message
     */
    determineActionType(intent: UserIntent, message: string, entities: ExtractedEntities): string | null {
        // If explicitly set
        if (entities.actionType) {
            return entities.actionType;
        }

        // Infer from intent
        switch (intent) {
            case 'SET_GOALS':
                return 'create_goals';

            case 'TAKE_ACTION':
                // Check message for action keywords
                const lowerMsg = message.toLowerCase();
                if (lowerMsg.includes('sync calendar')) return 'sync_calendar';
                if (lowerMsg.includes('sync email')) return 'sync_email';
                if (lowerMsg.includes('sync drive') || lowerMsg.includes('sync document')) return 'sync_drive';
                if (lowerMsg.includes('add') && entities.people?.length) return 'add_stakeholder';
                return null;

            case 'PREPARE':
                return 'prepare_for_meeting';

            case 'MEETING_OUTCOME':
                return 'capture_meeting_outcome';

            case 'MEETING_REVIEW':
                return 'capture_meeting_review';

            case 'CALL_ME':
                return 'trigger_voice_call';

            case 'STAKEHOLDER_FEEDBACK':
                return 'update_stakeholder_from_feedback';

            case 'IDENTITY_CONFIRMATION':
                return 'resolve_identity';

            default:
                return null;
        }
    }
}

export const routerAgent = new RouterAgent();
