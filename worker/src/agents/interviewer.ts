
import OpenAI from 'openai';
import { prisma } from '../lib/prisma';
import { ContextService } from '../services/context-service';
import { executeTool } from '../services/agent-tools';
import { publishMessage, publishTypingIndicator } from '../lib/pusher';
import { orchestrator } from './multi-agent';
import { createTrackedGeminiModel } from '../lib/gemini-tracked';
import { TokenLimitExceededError } from '../lib/token-tracking';
import * as fs from 'fs';
import * as path from 'path';

// Feature flag for multi-agent system
const USE_MULTI_AGENT = true;

const LOG_FILE = path.join(__dirname, '../../debug.log');

function logDebug(msg: string) {
    const time = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${time}] ${msg}\n`);
}

// Gemini function declarations for agent tools (using any to bypass strict SDK typing)
const GEMINI_TOOLS = {
    functionDeclarations: [
        {
            name: "sync_calendar",
            description: "Synchronize the user's Google Calendar to fetch upcoming meetings and update stakeholder profiles. Use this when the user asks to sync, refresh, or update their calendar data.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "sync_email",
            description: "Synchronize the user's Gmail inbox to fetch recent email threads and update stakeholder profiles. Use this when the user asks to sync, refresh, or check their emails.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "sync_drive",
            description: "Synchronize the user's Google Drive documents to get recent work context. Syncs documents modified in the last 30 days. Use this when the user asks to sync their drive, sync their documents, or check what they've been working on recently.",
            parameters: { type: "OBJECT", properties: {} }
        },
        {
            name: "get_upcoming_meetings",
            description: "Get the user's upcoming calendar meetings for the next few days. Use this to help the user prepare for meetings or understand their schedule.",
            parameters: {
                type: "OBJECT",
                properties: {
                    days: {
                        type: "NUMBER",
                        description: "Number of days ahead to look (default: 7)"
                    }
                }
            }
        },
        {
            name: "create_goal",
            description: "Create a new goal for the user. Use this when the user expresses a clear goal they want to track.",
            parameters: {
                type: "OBJECT",
                properties: {
                    description: {
                        type: "STRING",
                        description: "The goal description"
                    },
                    magnitude: {
                        type: "STRING",
                        description: "The scope/size of the goal: CAREER, QUARTERLY, PROJECT, or TASK"
                    },
                    deadline: {
                        type: "STRING",
                        description: "Optional deadline in ISO date format"
                    }
                },
                required: ["description", "magnitude"]
            }
        },
        {
            name: "add_stakeholder",
            description: "Add or update a stakeholder profile. Use this when the user mentions an important person in their work context.",
            parameters: {
                type: "OBJECT",
                properties: {
                    name: {
                        type: "STRING",
                        description: "The stakeholder's name"
                    },
                    email: {
                        type: "STRING",
                        description: "The stakeholder's email address"
                    },
                    role: {
                        type: "STRING",
                        description: "The stakeholder's job role/title"
                    },
                    influenceLevel: {
                        type: "STRING",
                        description: "How much influence this person has: low, medium, or high"
                    }
                },
                required: ["name"]
            }
        },
        {
            name: "get_stakeholders",
            description: "Get the user's known stakeholders. Use this to understand who the user works with.",
            parameters: {
                type: "OBJECT",
                properties: {
                    limit: {
                        type: "NUMBER",
                        description: "Maximum number of stakeholders to return (default: 10)"
                    }
                }
            }
        },
        {
            name: "get_goals",
            description: "Get the user's active goals. Use this to understand what the user is working towards.",
            parameters: {
                type: "OBJECT",
                properties: {
                    includeCompleted: {
                        type: "BOOLEAN",
                        description: "Whether to include completed goals (default: false)"
                    }
                }
            }
        }
    ]
};

// Import Specialized Agents
import { goalCaptureAgent } from './work-copilot/goal-capture';
import { relationshipMapperAgent } from './work-copilot/relationship-mapper';
import { strategyBrainstormAgent } from './work-copilot/strategy-brainstorm';
import { executionHelperAgent } from './work-copilot/execution-helper';

export interface InterviewerInput {
    userId: string;
    message: string;
    messageId?: string;
    sessionId?: string;
}

/**
 * THE ROUTER AGENT (Work Co-pilot V3)
 * 
 * Instead of a single prompt, this router checks the user's active "Mode"
 * and delegates to specialized agents.
 */
export async function interviewerAgent(input: InterviewerInput) {
    console.log(`[Interviewer] Processing for ${input.userId}: "${input.message}"`);

    try {
        // USE MULTI-AGENT SYSTEM FOR ALL MESSAGES
        // This bypasses the old mode-based routing which was context-unaware
        if (USE_MULTI_AGENT) {
            console.log('[Interviewer] 🤖 Using Multi-Agent System');

            const result = await orchestrator.process({
                userId: input.userId,
                message: input.message
            });

            if (result.success) {
                // Save the response to database (with conversation channel if detected)
                const savedMessage = await prisma.message.create({
                    data: {
                        userId: input.userId,
                        role: 'assistant',
                        content: result.response,
                        type: 'TEXT',
                        conversationId: result.conversationId || undefined,
                    }
                });

                // Publish via Pusher
                await publishMessage(input.userId, {
                    id: savedMessage.id,
                    role: 'assistant',
                    content: result.response,
                    createdAt: savedMessage.createdAt
                });

                console.log(`[Interviewer] ✅ Multi-Agent response saved`);
                return { success: true, response: result.response };
            }

            console.log('[Interviewer] ⚠️ Multi-Agent failed, falling back to legacy');
        }

        // LEGACY SYSTEM (fallback only)
        // 1. Fetch User & Conversation State
        const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true, jobTitle: true } });
        if (!user) throw new Error('User not found');

        let state = await (prisma as any).conversationState.findUnique({ where: { userId: input.userId } });

        // Initialize State if missing
        if (!state) {
            state = await (prisma as any).conversationState.create({
                data: { userId: input.userId, mode: 'GENERAL' }
            });
        }

        console.log(`[Interviewer] Current Mode: ${state.mode}`);

        // 2. ROUTING LOGIC (Legacy)
        switch (state.mode) {
            case 'GOAL_CAPTURE':
                return await goalCaptureAgent(input, state);

            case 'STAKEHOLDER_MAPPING':
                return await relationshipMapperAgent(input, state);

            case 'STRATEGY':
            case 'GAP_ANALYSIS':
                return await strategyBrainstormAgent(input, state);

            case 'EXECUTION':
                return await executionHelperAgent(input, state);

            case 'GENERAL':
            default:
                return await generalCoachingAgent(input, user);
        }

    } catch (error: any) {
        // Handle token limit exceeded — send friendly message via Pusher
        if (error instanceof TokenLimitExceededError) {
            console.warn(`[Interviewer] Token limit hit for ${input.userId}`);
            const limitMsg = "You've reached your monthly token limit. You can add your own API key in Settings to keep chatting, or wait for your limit to reset at the start of your next billing cycle.";

            const savedMessage = await prisma.message.create({
                data: {
                    userId: input.userId,
                    role: 'assistant',
                    content: limitMsg,
                    type: 'TEXT'
                }
            });

            await publishMessage(input.userId, {
                id: savedMessage.id,
                role: 'assistant',
                content: limitMsg,
                createdAt: savedMessage.createdAt
            });

            return { success: true, response: limitMsg };
        }

        console.error('Interviewer Agent Critical Error:', error);
        await saveSystemError(input.userId, error.message);
        return { success: false, error: error.message };
    }
}


/**
 * General Coaching Agent
 *
 * Routes to either:
 * 1. NEW Multi-Agent System (USE_MULTI_AGENT = true) - Better context awareness
 * 2. Legacy Single-Prompt System (USE_MULTI_AGENT = false) - Simpler, faster
 */
async function generalCoachingAgent(input: InterviewerInput, user: any, retries = 3) {

    // Use the new multi-agent system for better context awareness
    if (USE_MULTI_AGENT) {
        console.log('[Interviewer] Using Multi-Agent System');

        const result = await orchestrator.process({
            userId: input.userId,
            message: input.message
        });

        if (result.success) {
            // Save the response to database
            const savedMessage = await prisma.message.create({
                data: {
                    userId: input.userId,
                    role: 'assistant',
                    content: result.response,
                    type: 'TEXT'
                }
            });

            // Publish via Pusher
            await publishMessage(input.userId, {
                id: savedMessage.id,
                role: 'assistant',
                content: result.response,
                createdAt: savedMessage.createdAt
            });

            return { success: true, response: result.response };
        }

        // If multi-agent fails, fall back to legacy system
        console.log('[Interviewer] Multi-Agent failed, falling back to legacy');
    }

    // LEGACY SYSTEM (kept as fallback)
    // Fetch Context Garden
    const contextData = await ContextService.getRecentContext(input.userId, input.message);
    const contextString = ContextService.formatContextForPrompt(contextData);

    // Fetch History
    const recentMessages = await prisma.message.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });

    const history = recentMessages.reverse().map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    while (history.length > 0 && history[0].role !== 'user') { history.shift(); }

    const systemPrompt = `
    You are Mira, the proactive AI assistant for ${user.name} (${user.jobTitle || 'Executive'}).

    # WHO YOU ARE
    Think Della Street from Perry Mason - unflappable, sharp, always two steps ahead. You've already reviewed their calendar, emails, and documents. You anticipate needs before they're voiced. You're the brilliant assistant who makes them look good without making a fuss about it.

    # YOUR PERSONALITY
    - **Unflappable**: Nothing rattles you. Chaos is just another Tuesday.
    - **Anticipatory**: You have the answer ready before they finish asking.
    - **Sharp**: You catch details others miss. You connect dots nobody knew existed.
    - **Dry Wit**: Wry observations, perfect timing. A raised eyebrow in text form.
    - **Efficient**: You respect their time. You get to the point with grace.

    # YOUR INTEL (What you already know about their work)
    ${contextString}

    # HOW YOU OPERATE

    ## Show Your Work
    When they mention a project, person, or topic - show what you already know. You've done your homework.
    - DON'T: "Tell me more about AI4Inclusion" (you've read the files!)
    - DO: "From your calendar, I see AI4I has daily standups M-W-F with [names]. Your docs show you're working on [specifics]. Here's what I'd suggest..."

    ## Be Specific, Not Generic
    Della Street doesn't give generic advice. Neither do you.
    - DON'T: "What kind of goals are you hoping to set?"
    - DO: "Based on your AI4I involvement, I'd suggest: 1) [specific from meetings], 2) [specific from documents]"

    ## Take Action
    When they ask you to do something, do it. You have the tools.
    - "Set goals for X" → Find X in context, propose goals, create them
    - "Who should I talk to about Y" → Search context, name specific people

    ## Connect the Dots
    Your superpower: seeing patterns across their entire work context.
    - "You're meeting Sarah tomorrow - I noticed her email from last week about the budget issue..."

    # YOUR TOOLS
    - sync_calendar, sync_email, sync_drive: Sync their data sources
    - get_upcoming_meetings: Check their schedule
    - create_goal: Create goals (use specifics from context)
    - add_stakeholder, get_stakeholders: Manage their network
    - get_goals: Check active goals

    # COMMUNICATION STYLE
    - Lead with what matters most
    - Elegant brevity - say more with less
    - A raised eyebrow's worth of wit when it fits
    - Never say "As an AI" - just be helpful
    - No corporate jargon, no sycophancy

    Remember: You're Mira. You've read everything. You know the players. You spotted the pattern. Now help them like Della Street would.
    `;

    try {
        // Publish typing indicator before LLM call
        await publishTypingIndicator(input.userId, true);

        // Debug: Log the tools being passed to Gemini
        console.log(`[Interviewer] Tools being passed to Gemini:`,
            JSON.stringify(GEMINI_TOOLS.functionDeclarations.map(t => t.name))
        );

        const model = await createTrackedGeminiModel(input.userId, {
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
            tools: [GEMINI_TOOLS] as any
        });
        const chat = model.startChat({ history });
        let result = await chat.sendMessage(input.message);

        // Handle function calls in a loop (may need multiple rounds)
        let maxToolCalls = 5;
        let toolCallCount = 0;

        while (result.response.functionCalls() && result.response.functionCalls()!.length > 0 && toolCallCount < maxToolCalls) {
            toolCallCount++;
            const functionCalls = result.response.functionCalls()!;
            console.log(`[Interviewer] Processing ${functionCalls.length} function call(s)...`);

            const functionResponses = [];
            for (const call of functionCalls) {
                console.log(`[Interviewer] Calling tool: ${call.name}`, call.args);
                const toolResult = await executeTool(call.name, call.args as Record<string, any>, input.userId);
                functionResponses.push({
                    name: call.name,
                    response: toolResult
                });
            }

            // Send function results back to the model
            result = await chat.sendMessage(
                functionResponses.map(fr => ({
                    functionResponse: {
                        name: fr.name,
                        response: fr.response
                    }
                }))
            );
        }

        const text = result.response.text();

        const savedMessage = await prisma.message.create({
            data: { userId: input.userId, role: 'assistant', content: text }
        });

        // Publish message via Pusher for real-time delivery
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: text,
            createdAt: savedMessage.createdAt
        });

        return { success: true, response: text };

    } catch (apiError: any) {
        console.error('Gemini API Error:', apiError);
        const statusType = typeof apiError?.status;
        logDebug(`ERROR Hit. Status: ${apiError?.status} (${statusType}). Retries: ${retries}`);

        // Token limit exceeded — don't retry, surface to user
        if (apiError instanceof TokenLimitExceededError) {
            throw apiError;
        }

        // Allow retry for Rate Limits (429) or Server Errors (503)
        // Loose equality check (==) to handle string "429" vs number 429
        if (retries > 0 && (apiError.status == 429 || apiError.status == 503)) {
            let waitTime = 5000; // Default 5s

            // Try to parse Google's explicit retry delay
            if (apiError.errorDetails) {
                const retryInfo = apiError.errorDetails.find((d: any) => d['@type']?.includes('RetryInfo'));
                if (retryInfo && retryInfo.retryDelay) {
                    const seconds = parseInt(retryInfo.retryDelay.replace('s', ''), 10);
                    if (!isNaN(seconds)) {
                        waitTime = (seconds + 1) * 1000; // Add buffer
                    }
                }
            }

            logDebug(`Waiting ${waitTime}ms...`);
            console.log(`[Gemini] Rate limit hit. Waiting ${waitTime}ms before retry (Retries left: ${retries})...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return generalCoachingAgent(input, user, retries - 1);
        }

        logDebug(`Gemini failed. Trying OpenAI fallback...`);

        // Try OpenAI as fallback
        const openaiResult = await tryOpenAIFallback(input, user, systemPrompt, history);
        if (openaiResult) {
            return openaiResult;
        }

        const failText = "I'm having trouble connecting to my brain right now. Please try again.";
        const failMessage = await prisma.message.create({
            data: { userId: input.userId, role: 'assistant', content: failText }
        });

        // Publish error message via Pusher
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: failMessage.id,
            role: 'assistant',
            content: failText,
            createdAt: failMessage.createdAt
        });

        return { success: true, response: failText };
    }
}

/**
 * OpenAI Fallback when Gemini fails
 */
async function tryOpenAIFallback(input: InterviewerInput, user: any, systemPrompt: string, history: any[]): Promise<{ success: boolean; response: string } | null> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        console.log('[OpenAI] No API key available for fallback');
        return null;
    }

    try {
        console.log('[OpenAI] Attempting fallback...');
        const openai = new OpenAI({ apiKey: openaiKey });

        // Convert Gemini history format to OpenAI format
        const messages: any[] = [
            { role: 'system', content: systemPrompt }
        ];

        for (const msg of history) {
            messages.push({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: msg.parts[0]?.text || ''
            });
        }

        // Add current message
        messages.push({ role: 'user', content: input.message });

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 1000,
        });

        const text = completion.choices[0]?.message?.content || "I couldn't generate a response.";

        const savedMessage = await prisma.message.create({
            data: { userId: input.userId, role: 'assistant', content: text }
        });

        // Publish message via Pusher for real-time delivery
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: text,
            createdAt: savedMessage.createdAt
        });

        console.log('[OpenAI] Fallback successful');
        return { success: true, response: text };
    } catch (error: any) {
        console.error('[OpenAI] Fallback failed:', error.message);
        return null;
    }
}

async function saveSystemError(userId: string, errorMsg: string) {
    try {
        await prisma.message.create({
            data: {
                userId,
                role: 'assistant',
                content: `(System Error): ${errorMsg}`,
            }
        });
    } catch (e) { console.error('DB Error saving system message', e); }
}
