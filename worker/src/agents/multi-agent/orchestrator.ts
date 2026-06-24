/**
 * Multi-Agent Orchestrator
 *
 * The main entry point that coordinates all specialist agents.
 * Flow:
 * 1. Router Agent analyzes intent and extracts entities
 * 2. Context Agent retrieves relevant information (if needed)
 * 3. Action Agent executes tools (if needed)
 * 4. Response Agent formulates the final response
 */

import { prisma } from '../../lib/prisma';
import { publishTypingIndicator } from '../../lib/pusher';
import { routerAgent } from './router-agent';
import { contextAgent } from './context-agent';
import { actionAgent } from './action-agent';
import { responseAgent } from './response-agent';
import {
    AgentContext,
    RouterDecision,
    ContextSynthesis,
    ActionResult,
    FinalResponse,
    ConversationMessage
} from './types';

export interface OrchestratorInput {
    userId: string;
    message: string;
    conversationId?: string;  // Optional: route to specific conversation
}

export interface OrchestratorOutput {
    success: boolean;
    response: string;
    decision?: RouterDecision;
    contextSynthesis?: ContextSynthesis;
    actionResult?: ActionResult;
    conversationId?: string;  // Which conversation this message belongs to
}

export class MultiAgentOrchestrator {
    /**
     * Main entry point - process a user message through the multi-agent system
     */
    async process(input: OrchestratorInput): Promise<OrchestratorOutput> {
        console.log(`[Orchestrator] Processing message for user ${input.userId}`);
        const startTime = Date.now();

        try {
            // Start typing indicator
            await publishTypingIndicator(input.userId, true);

            // 1. Build agent context
            const agentContext = await this.buildContext(input);
            console.log(`[Orchestrator] Built context for ${agentContext.userName}`);

            // 2. Route - determine intent, channel, and required agents
            const decision = await routerAgent.route(agentContext);
            console.log(`[Orchestrator] Router decision: ${decision.intent} channel=${decision.channel} (confidence: ${decision.confidence})`);

            // 2b. Resolve conversation — find or create the right channel thread
            const conversationId = await this.resolveConversation(input.userId, input.conversationId, decision.channel);

            // 3. Get context if needed
            let contextSynthesis: ContextSynthesis | null = null;
            if (decision.requiredAgents.includes('context')) {
                console.log(`[Orchestrator] Invoking Context Agent...`);
                contextSynthesis = await contextAgent.synthesizeContext(agentContext, decision.entities);
                console.log(`[Orchestrator] Context synthesized: ${contextSynthesis.projectSummaries.length} projects, ${contextSynthesis.relevantDocuments.length} docs`);
            }

            // 4. Execute action if needed
            let actionResult: ActionResult | null = null;
            if (decision.requiredAgents.includes('action')) {
                const actionType = routerAgent.determineActionType(
                    decision.intent,
                    input.message,
                    decision.entities
                );

                if (actionType) {
                    console.log(`[Orchestrator] Invoking Action Agent: ${actionType}`);
                    actionResult = await actionAgent.executeAction(
                        actionType,
                        agentContext,
                        decision.entities,
                        contextSynthesis || {
                            projectSummaries: [],
                            relevantPeople: [],
                            relevantDocuments: [],
                            relevantMeetings: [],
                            relevantEmails: [],
                            suggestedActions: [],
                            keyInsights: []
                        }
                    );
                    console.log(`[Orchestrator] Action result: ${actionResult.success ? 'success' : 'failed'}`);
                }
            }

            // 5. Generate response
            console.log(`[Orchestrator] Invoking Response Agent...`);
            const finalResponse = await responseAgent.generateResponse(
                agentContext,
                decision,
                contextSynthesis,
                actionResult
            );

            // Stop typing indicator
            await publishTypingIndicator(input.userId, false);

            const duration = Date.now() - startTime;
            console.log(`[Orchestrator] Complete in ${duration}ms`);

            return {
                success: true,
                response: finalResponse.message,
                decision,
                contextSynthesis: contextSynthesis || undefined,
                actionResult: actionResult || undefined,
                conversationId,
            };

        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            console.error(`[Orchestrator] Error:`, errorMsg);
            await publishTypingIndicator(input.userId, false);

            // Surface specific, actionable errors
            if (errorMsg.includes('API key') || errorMsg.includes('api key') || errorMsg.includes('No Gemini')) {
                console.error(`[Orchestrator] API key error for user ${input.userId}: ${errorMsg}`);
                return {
                    success: false,
                    response: "Mira is temporarily unable to respond — the AI service isn't configured. This is a system issue, not something you need to fix. Please try again in a few minutes."
                };
            }
            if (errorMsg.includes('TokenLimitExceeded') || errorMsg.includes('budget')) {
                return {
                    success: false,
                    response: "You've hit your usage limit for this period. Check Settings → Usage to review your plan."
                };
            }
            return {
                success: false,
                response: "I encountered an issue processing your request. Could you try again?"
            };
        }
    }

    /**
     * Resolve or create a conversation for this message.
     * If conversationId is provided, use it. Otherwise, find the most recent
     * active conversation in the detected channel, or create a new one.
     */
    private async resolveConversation(
        userId: string,
        explicitConversationId: string | undefined,
        channel: string,
    ): Promise<string | undefined> {
        try {
            // If explicit conversation ID provided, verify and use it
            if (explicitConversationId) {
                const existing = await prisma.conversation.findFirst({
                    where: { id: explicitConversationId, userId },
                    select: { id: true },
                });
                if (existing) return existing.id;
            }

            // For GENERAL channel, don't auto-create conversations (backward compatible)
            if (channel === 'GENERAL') return undefined;

            // Find the most recent active conversation in this channel
            const recent = await prisma.conversation.findFirst({
                where: {
                    userId,
                    channel: channel as any,
                    isActive: true,
                    // Only reuse if last message was within 2 hours (same session)
                    updatedAt: { gt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
                },
                orderBy: { updatedAt: 'desc' },
                select: { id: true },
            });

            if (recent) return recent.id;

            // Create a new conversation in this channel
            const newConvo = await prisma.conversation.create({
                data: { userId, channel: channel as any },
            });
            console.log(`[Orchestrator] Created new ${channel} conversation: ${newConvo.id}`);
            return newConvo.id;
        } catch (e) {
            // Non-critical — messages still work without conversation grouping
            return undefined;
        }
    }

    /**
     * Build the agent context from database
     */
    private async buildContext(input: OrchestratorInput): Promise<AgentContext> {
        // Get user info
        const user = await prisma.user.findUnique({
            where: { id: input.userId },
            select: { name: true, jobTitle: true }
        });

        // Get conversation history
        const recentMessages = await prisma.message.findMany({
            where: { userId: input.userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                role: true,
                content: true,
                createdAt: true
            }
        });

        const conversationHistory: ConversationMessage[] = recentMessages
            .reverse()
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: m.createdAt
            }));

        return {
            userId: input.userId,
            userName: user?.name || 'User',
            userJobTitle: user?.jobTitle || 'Professional',
            message: input.message,
            conversationHistory
        };
    }
}

export const orchestrator = new MultiAgentOrchestrator();
