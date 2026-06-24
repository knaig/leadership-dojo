/**
 * Proactive Agent (Mira) - AI-Initiated Engagement
 *
 * Mira proactively reaches out when she spots something worth mentioning:
 * 1. Pre-meeting prep (1 hour before meetings)
 * 2. Morning briefing (daily summary)
 * 3. Post-document activity (when user edits Google Docs)
 *
 * Think Della Street stopping by: "You'll want to see this."
 */

import { prisma } from '../lib/prisma';
import { publishMessage, publishSystemEvent } from '../lib/pusher';
import { sendPushToUser } from '../lib/web-push';
import { maybeSendEmailBrief } from '../lib/email-sender';
import { shouldDeliverViaVoice, triggerVoiceCall } from '../lib/vapi-voice';
import { canDeliverNow, shouldBatchNudge, savePendingNudge, getPendingNudges, markNudgesDelivered } from '../lib/delivery-guard';
import { ContextService } from '../services/context-service';
import { FunctionCallingMode } from '@google/generative-ai';
import { getMiraProactivePrompt, MIRA_NOTIFICATIONS } from './multi-agent/mira-persona';
import { createTrackedGeminiModel } from '../lib/gemini-tracked';
import {
    getAttendeeIntelligence,
    getMorningBriefContext,
    analyzeKnowledgeGaps as graphAnalyzeKnowledgeGaps,
} from './knowledge/graph-query-service';
import { buildOnboardingMessage } from './knowledge/onboarding';
import { fetchGeminiMeetingNotes } from '../services/meeting-notes-service';
import { getUserLLMConfig, generateText } from '../lib/user-llm';

// Trigger types for proactive engagement
export type ProactiveTrigger =
    | 'PRE_MEETING_PREP'
    | 'MORNING_BRIEF'
    | 'POST_DOCUMENT_ACTIVITY'
    | 'EXECUTION_NUDGE'
    | 'GOAL_CHECK_IN'
    | 'ONBOARDING'
    | 'CONTEXT_DEEPENING'
    | 'POST_MEETING_REVIEW';

interface ProactiveInput {
    userId: string;
    trigger: ProactiveTrigger;
    context?: {
        meetingId?: string;
        documentId?: string;
        documentName?: string;
        goalId?: string;
    };
}

/**
 * Main proactive agent entry point
 */
export async function proactiveAgent(input: ProactiveInput): Promise<void> {
    const { userId, trigger, context } = input;

    console.log(`[Proactive Agent] 🚀 Starting ${trigger} for user ${userId.substring(0, 8)}...`);

    try {
        // Check user preferences - respect quiet hours and opt-out
        // Meeting prep and post-meeting review bypass quiet hours — no exceptions
        const skipQuietHours = trigger === 'PRE_MEETING_PREP' || trigger === 'POST_MEETING_REVIEW';
        const canEngage = await checkEngagementAllowed(userId, skipQuietHours);
        if (!canEngage) {
            console.log(`[Proactive Agent] ⏸️ User has quiet hours or disabled proactive prompts`);
            return;
        }

        // Check delivery guard — respect DND, quiet weekends, max calls
        // Meeting prep and post-meeting review are high-priority but still respect DND
        const deliveryCheck = await canDeliverNow(userId);
        if (!deliveryCheck.allowed) {
            console.log(`[Proactive Agent] 🚫 Delivery blocked: ${deliveryCheck.reason}`);
            // For urgent triggers, generate and batch the message instead of dropping it
            const urgentTriggers: ProactiveTrigger[] = ['PRE_MEETING_PREP', 'MORNING_BRIEF', 'POST_MEETING_REVIEW'];
            if (urgentTriggers.includes(trigger)) {
                const message = await generateProactiveMessage(userId, trigger, context);
                if (message) {
                    await savePendingNudge({
                        userId,
                        trigger,
                        content: message,
                        priority: 'urgent',
                        context: context as Record<string, unknown> | undefined,
                    });
                    console.log(`[Proactive Agent] 📦 Saved urgent nudge for later delivery`);
                }
            }
            return;
        }

        // Generate the proactive message based on trigger type
        const message = await generateProactiveMessage(userId, trigger, context);

        if (!message) {
            console.log(`[Proactive Agent] 📭 No meaningful message to send`);
            return;
        }

        // Check if this nudge should be batched for morning brief
        const nonBatchableTriggers: ProactiveTrigger[] = ['MORNING_BRIEF', 'PRE_MEETING_PREP'];
        if (!nonBatchableTriggers.includes(trigger)) {
            const batch = await shouldBatchNudge(userId);
            if (batch) {
                await savePendingNudge({
                    userId,
                    trigger,
                    content: message,
                    priority: trigger === 'POST_MEETING_REVIEW' ? 'urgent' : 'normal',
                    context: context as Record<string, unknown> | undefined,
                });
                console.log(`[Proactive Agent] 📦 Batched ${trigger} nudge for morning brief`);
                return;
            }
        }

        // Ensure user exists before writing foreign keys
        const userExists = await prisma.user.findUnique({ where: { id: userId } });

        if (userExists) {
            // Save to database as a proactive message
            const savedMessage = await prisma.message.create({
                data: {
                    userId,
                    role: 'assistant',
                    content: message,
                    type: 'PROACTIVE_NUDGE'
                }
            });

            // For PRE_MEETING_PREP, look up the meeting's externalId for reliable dedup
            let meetingExternalId: string | null = null;
            if (trigger === 'PRE_MEETING_PREP' && context?.meetingId) {
                const meeting = await prisma.meetingSyncRecord.findFirst({
                    where: { id: context.meetingId },
                    select: { externalId: true }
                });
                meetingExternalId = meeting?.externalId || null;
            }

            // Also save to ProactivePrompt for analytics tracking
            // stakeholderId stores meeting externalId for PRE_MEETING_PREP dedup
            await prisma.proactivePrompt.create({
                data: {
                    userId,
                    type: mapTriggerToPromptType(trigger),
                    content: message,
                    goalId: context?.goalId || null,
                    stakeholderId: meetingExternalId,
                    deliveredVia: 'pusher'
                }
            });

            // Push to user via Pusher - this will appear in their chat
            await publishMessage(userId, {
                id: savedMessage.id,
                role: 'assistant',
                content: message,
                createdAt: savedMessage.createdAt
            });

            // Also send a system event so UI knows this is proactive
            await publishSystemEvent(userId, {
                type: 'proactive_nudge' as any,
                message: `Mira spotted something`,
                data: { trigger, messageId: savedMessage.id }
            });

            // Send browser push notification (works even when tab is closed)
            await sendPushToUser(userId, {
                title: MIRA_NOTIFICATIONS.insight.title,
                body: MIRA_NOTIFICATIONS.insight.bodyTemplate(message),
                url: '/dashboard'
            });

            // Send email brief for pre-meeting prep
            if (trigger === 'PRE_MEETING_PREP' && context?.meetingId) {
                try {
                    const emailMeeting = await prisma.meetingSyncRecord.findFirst({
                        where: { id: context.meetingId }
                    });
                    if (emailMeeting) {
                        const attendees = (emailMeeting.attendees as any[]) || [];
                        const attendeeNames = attendees
                            .map((a: any) => a.displayName || a.name || a.email?.split('@')[0] || '')
                            .filter(Boolean);
                        const timeStr = emailMeeting.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        await maybeSendEmailBrief(userId, {
                            meetingTitle: emailMeeting.title,
                            startTime: timeStr,
                            brief: message,
                            edge: null,
                            attendeeNames,
                            desiredOutcome: emailMeeting.desiredOutcome || null,
                            userGrowthTip: null,
                            attendeeIntel: [],
                        });
                    }
                } catch (emailErr: any) {
                    console.error(`[Proactive Agent] Email brief failed: ${emailErr.message}`);
                }
            }

            // Voice call delivery — if user prefers voice, also trigger an outbound call
            const voiceCallTypes: Record<string, string> = {
                PRE_MEETING_PREP: 'pre_meeting_prep',
                MORNING_BRIEF: 'morning_brief',
                POST_MEETING_REVIEW: 'post_meeting_debrief',
            };
            const vapiCallType = voiceCallTypes[trigger];
            if (vapiCallType) {
                try {
                    const wantsVoice = await shouldDeliverViaVoice(userId);
                    if (wantsVoice) {
                        console.log(`[Proactive Agent] User prefers voice — triggering ${vapiCallType} call`);
                        await triggerVoiceCall({
                            userId,
                            callType: vapiCallType as any,
                            meetingId: context?.meetingId,
                        });
                    }
                } catch (voiceErr: any) {
                    console.error(`[Proactive Agent] Voice call failed: ${voiceErr.message}`);
                }
            }
        } else {
            console.warn(`[Proactive Agent] User ${userId} not in DB yet. Skipping proactive message.`);
        }

        console.log(`[Proactive Agent] ✅ Sent ${trigger} message to user`);

    } catch (error: any) {
        console.error(`[Proactive Agent] ❌ Error:`, error.message);
    }
}

/**
 * Check if we're allowed to engage with the user right now
 * @param skipQuietHours - If true, bypass quiet hours check (used for critical triggers like PRE_MEETING_PREP)
 */
async function checkEngagementAllowed(userId: string, skipQuietHours = false): Promise<boolean> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId }
    });

    // If no preferences, default to allowed
    if (!prefs) return true;

    // Check if proactive prompts are enabled
    if (!prefs.enableProactivePrompts) return false;

    // Skip quiet hours for critical triggers (e.g., meeting prep — no exceptions)
    if (skipQuietHours) return true;

    // Check quiet hours using user's timezone if available, fallback to UTC
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const quietStart = prefs.quietHoursStart; // e.g., "21:00"
    const quietEnd = prefs.quietHoursEnd;     // e.g., "08:00"

    // Simple quiet hours check (handles overnight quiet hours)
    if (quietStart < quietEnd) {
        // Same day range (e.g., 09:00 - 17:00)
        if (currentTime >= quietStart && currentTime <= quietEnd) {
            return false;
        }
    } else {
        // Overnight range (e.g., 21:00 - 08:00)
        if (currentTime >= quietStart || currentTime <= quietEnd) {
            return false;
        }
    }

    return true;
}

/**
 * Generate contextual proactive message using LLM
 */
async function generateProactiveMessage(
    userId: string,
    trigger: ProactiveTrigger,
    context?: ProactiveInput['context']
): Promise<string | null> {

    // Get user info
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true }
    });

    // Get rich context about the user (format as string for prompt injection)
    const contextData = await ContextService.getRecentContext(userId, 'proactive engagement');
    const userContext = ContextService.formatContextForPrompt(contextData);

    // Get user's goals
    const goals = await prisma.goal.findMany({
        where: { userId, status: 'ACTIVE' },
        include: { stakeholders: true },
        take: 3
    });

    // Build trigger-specific context
    let triggerContext = '';

    switch (trigger) {
        case 'PRE_MEETING_PREP':
            triggerContext = await buildPreMeetingCoachingContext(userId, context?.meetingId);
            break;

        case 'MORNING_BRIEF':
            // Get today's meetings
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));

            const [todayMeetings, graphBriefContext] = await Promise.all([
                prisma.meetingSyncRecord.findMany({
                    where: {
                        userId,
                        startTime: { gte: startOfDay, lte: endOfDay }
                    },
                    orderBy: { startTime: 'asc' }
                }),
                getMorningBriefContext(userId),
            ]);

            triggerContext = `
TODAY'S SCHEDULE:
${todayMeetings.length > 0
                    ? todayMeetings.map(m => `- ${m.startTime.toLocaleTimeString()}: ${m.title}`).join('\n')
                    : '- No meetings scheduled today'
                }

USER'S ACTIVE GOALS:
${goals.length > 0
                    ? goals.map(g => `- ${g.description} (Priority: ${g.magnitude || 'Not set'})`).join('\n')
                    : '- No active goals set'
                }
${graphBriefContext.activeCommunities.length > 0
                    ? `
ACTIVE WORK AREAS (from knowledge graph):
${graphBriefContext.activeCommunities.slice(0, 3).map(c => `- ${c.name}${c.summary ? ': ' + c.summary : ''} (activity: ${c.activityScore})`).join('\n')}`
                    : ''
                }
${graphBriefContext.recentFacts.length > 0
                    ? `
RECENT INTELLIGENCE (new facts learned):
${graphBriefContext.recentFacts.slice(0, 5).map(f => `- ${f.subjectName} ${f.predicate} ${f.objectName || f.objectValue || ''} (source: ${f.source})`).join('\n')}`
                    : ''
                }
${graphBriefContext.knowledgeGaps.length > 0
                    ? `
KNOWLEDGE GAPS (people/topics to learn more about):
${graphBriefContext.knowledgeGaps.slice(0, 3).map(g => `- ${g.entityName}: ${g.reason}`).join('\n')}`
                    : ''
                }

`;
            // Add Ground Game context to morning brief
            const [staleStakeholders, needleMoverCount] = await Promise.all([
                prisma.stakeholderProfile.findMany({
                    where: {
                        userId,
                        OR: [
                            { powerLevel: 'HIGH' },
                            { influenceRole: { in: ['DECISION_MAKER', 'KEY_INFLUENCER'] } },
                            { isImportant: true },
                        ],
                        lastInteraction: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
                    },
                    select: { name: true, role: true, politicalStance: true, lastInteraction: true },
                    take: 3,
                    orderBy: { lastInteraction: 'asc' },
                }),
                prisma.meetingSyncRecord.count({
                    where: {
                        userId,
                        startTime: { gte: startOfDay, lte: endOfDay },
                        meetingCategory: 'NEEDLE_MOVER',
                    },
                }),
            ]);

            if (staleStakeholders.length > 0 || needleMoverCount > 0) {
                triggerContext += `\nGROUND GAME:\n`;
                if (needleMoverCount > 0) {
                    triggerContext += `- ${needleMoverCount} high-stakes meeting${needleMoverCount > 1 ? 's' : ''} today. Mira should highlight preparation advice.\n`;
                }
                if (staleStakeholders.length > 0) {
                    triggerContext += `- Stale relationships to mention:\n`;
                    for (const s of staleStakeholders) {
                        const daysSince = s.lastInteraction
                            ? Math.floor((Date.now() - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
                            : null;
                        triggerContext += `  • ${s.name}${s.role ? ` (${s.role})` : ''}: ${daysSince}d since last contact${s.politicalStance === 'SKEPTIC' ? ' — was skeptical last time' : ''}\n`;
                    }
                }
            }

            // Include any pending batched nudges in the morning brief
            const pendingNudges = await getPendingNudges(userId);
            if (pendingNudges.length > 0) {
                triggerContext += `\nBATCHED UPDATES (nudges saved from yesterday/overnight — weave naturally into the brief):\n`;
                for (const nudge of pendingNudges) {
                    triggerContext += `- [${nudge.trigger}] ${nudge.content.substring(0, 200)}\n`;
                }
                // Mark them as delivered (will be included in this brief)
                await markNudgesDelivered(pendingNudges.map(n => n.id));
            }

            triggerContext += `\nProvide a personalized morning brief that helps the user focus their day.`;
            break;

        case 'ONBOARDING':
            // Use graph-based structured onboarding if available
            const onboardingMessage = await buildOnboardingMessage(userId);
            if (onboardingMessage) {
                // Bypass LLM generation — we already have a complete message
                return onboardingMessage;
            }
            triggerContext = `
NEW USER ONBOARDING:
The user has just logged in for the first time and has no chat history.
Your goal is to build their profile context.

Introduce yourself briefly as Mira (their proactive observer) and ask exactly one highly-leveraged question to understand their current role, biggest immediate challenge, or top priority.
Keep it sharp, conversational, and Della Street style. Don't overwhelm them with questions.
`;
            break;

        case 'POST_DOCUMENT_ACTIVITY':
            triggerContext = `
RECENT DOCUMENT ACTIVITY:
${context?.documentName
                    ? `The user just finished working on: "${context.documentName}"`
                    : 'The user has been actively working on documents'
                }

This is a good moment to check in and see if they need help with anything related to their work.`;
            break;

        case 'EXECUTION_NUDGE':
            // Check for overdue actions
            const overdueActions = await prisma.relationshipAction.findMany({
                where: {
                    goal: { userId },
                    status: 'IN_PROGRESS',
                    dueDate: { lt: new Date() }
                },
                include: { goal: true },
                take: 3
            });

            if (overdueActions.length > 0) {
                triggerContext = `
OVERDUE ACTIONS:
${overdueActions.map(a => `- "${a.description}" for goal "${a.goal.description}" (was due ${a.dueDate?.toLocaleDateString()})`).join('\n')}

Help the user get back on track with these actions.`;
            }
            break;

        case 'GOAL_CHECK_IN':
            if (goals.length > 0) {
                const goal = goals[0];
                triggerContext = `
GOAL CHECK-IN:
Goal: "${goal.description}"
${goal.deadline ? `Deadline: ${goal.deadline.toLocaleDateString()}` : 'No deadline set'}
Stakeholders involved: ${goal.stakeholders.length}

Check in on progress and offer help.`;
            }
            break;

        case 'POST_MEETING_REVIEW':
            // This trigger context is built by checkPostMeetingReview and passed via context
            if (context?.meetingId) {
                const reviewMeeting = await prisma.meetingSyncRecord.findFirst({
                    where: { id: context.meetingId }
                });
                if (reviewMeeting) {
                    const reviewAttendees = (reviewMeeting.attendees as any[]) || [];
                    const reviewNames = reviewAttendees
                        .map((a: any) => a.displayName || a.name || a.email?.split('@')[0] || '')
                        .filter(Boolean);

                    triggerContext = `
POST-MEETING REVIEW:
Meeting: "${reviewMeeting.title}"
Ended: ${reviewMeeting.endTime.toLocaleTimeString()}
Attendees: ${reviewNames.join(', ')}
${reviewMeeting.desiredOutcome ? `Their stated outcome goal: "${reviewMeeting.desiredOutcome}"` : 'No outcome goal was set beforehand.'}
${reviewMeeting.notes ? `Meeting notes (from Gemini):\n${reviewMeeting.notes.substring(0, 1500)}` : 'No meeting notes available.'}

Ask how the meeting went. Be specific:
- If they had a desired outcome, ask directly if they achieved it
- Reference attendee names
- Keep it to one focused question`;
                }
            }
            break;

        case 'CONTEXT_DEEPENING':
            const gapAnalysis = await analyzeKnowledgeGaps(userId);
            if (gapAnalysis) {
                triggerContext = `
CONTEXT DEEPENING:
You are building a deeper understanding of this user over time. Below is an analysis of what you know vs. what you don't.

${gapAnalysis}

Ask exactly ONE specific, data-driven question that references real meeting titles, people names, or document titles from the data above. The question should fill a meaningful gap in your understanding of the user's work, priorities, stakeholders, or decision-making patterns.

Do NOT ask generic questions. Reference specific data points. Examples of good questions:
- "You've had 4 meetings with Pranab this week about VoicERA — is he the key decision-maker on the API redesign, or is someone else driving that?"
- "I noticed the 'Q1 Planning' doc was edited right after your call with Amul — did that meeting change the roadmap?"
`;
            }
            break;
    }

    // If no meaningful context, skip
    if (!triggerContext && trigger !== 'MORNING_BRIEF') {
        return null;
    }

    // Build the system prompt for proactive messaging (Mira's voice)
    const isPresentation = triggerContext.includes('USER IS PRESENTING');

    const whatToSay = trigger === 'PRE_MEETING_PREP'
        ? `## WHAT TO SAY
You are delivering a PRE-MEETING COACHING BRIEF. This is the core value of this tool.

FORMAT (use this exact structure):
1. **Opening line** — Reference the meeting by name and time. One sentence max.
2. **About the people** — For each key attendee, mention what you know about them (role, communication style, what works with them, what to watch for). Be specific — use data from stakeholder intelligence.
3. **Your edge** — Based on the user's intelligence profile, tell them what strength to lean into AND what growth area to watch for in this specific meeting context.
4. **One tactical tip** — A concrete thing to do or say, based on the meeting type and attendees.
${isPresentation ? `
5. **Narrative check** — This is a PRESENTATION meeting. The user needs to be the presentation, not the slides. Coach them:
   - Ask: "What's the ONE thing you need this room to leave believing?"
   - Challenge them to say their core message in 3 sentences: what's at stake, what they're proposing, what they need
   - Give them a concrete opening line they can say out loud (not read from a slide)
   - Remind them: slides are evidence, not the story. If they can't make the case without slides, the slides won't save them.
   - Flag who in the room matters most and what that person cares about — tailor the narrative to land with THAT person
   - Tone: direct and practical, not lecturing about presentation skills
` : ''}
RULES:
- ${isPresentation ? '200-300' : '150-250'} words (this is the one message type that can be longer)
- Reference real names, roles, and past interactions
- If you have stakeholder intelligence, use it. If not, acknowledge you're still learning about them.
- If the user has a relevant growth area (e.g., "follow-through" or "active listening"), weave in a specific tip for THIS meeting
- Do NOT be generic. "Prepare talking points" is useless. "Lead with the Q1 revenue data since Pranab responds well to numbers" is useful.
- End with a specific question or suggestion, not a generic offer`
        : `## WHAT TO SAY
- One message, under 100 words
- Lead with the point - no preamble
- Be specific: names, dates, document titles
- If morning brief, a quick "Here's what's on deck" energy
- End with one clear action or offer`;

    const now = new Date();
    const systemPrompt = `${getMiraProactivePrompt(user?.name || 'there')}

---

TODAY'S DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}

## THE TRIGGER
Type: ${trigger}

${triggerContext}

## YOUR INTEL
${userContext}

${whatToSay}

DO NOT:
- Start with "Good morning" unless it's actually a morning brief
- Sound like a notification bot
- Overexplain or hedge`;

    try {
        const model = await createTrackedGeminiModel(userId, {
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: trigger === 'PRE_MEETING_PREP' ? 800 : 300
            }
        });

        const result = await model.generateContent(systemPrompt);
        const response = result.response.text();

        return response.trim();

    } catch (error: any) {
        console.error(`[Proactive Agent] LLM error:`, error.message);

        // Fallback to simple messages if LLM fails
        return getFallbackMessage(trigger, goals);
    }
}

/**
 * Fallback messages if LLM is unavailable (Mira's voice)
 */
function getFallbackMessage(trigger: ProactiveTrigger, goals: any[]): string {
    switch (trigger) {
        case 'MORNING_BRIEF':
            if (goals.length > 0) {
                return `Here's your top priority today: "${goals[0].description}". One thing to move it forward?`;
            }
            return `Morning. No active goals on file - want to set one?`;

        case 'PRE_MEETING_PREP':
            return `Meeting coming up. I've got context if you want talking points.`;

        case 'POST_DOCUMENT_ACTIVITY':
            return `Noticed you've been in the docs. Anything I can help with?`;

        case 'EXECUTION_NUDGE':
            return `Quick check on your goals - how are things moving?`;

        case 'GOAL_CHECK_IN':
            if (goals.length > 0) {
                return `Checking in on "${goals[0].description}" - progress update?`;
            }
            return `No active goals tracked. Want to set some priorities?`;

        case 'ONBOARDING':
            return `I'm Mira. I'm here to watch your back and help you execute. To get started, what's the biggest fire on your desk right now?`;

        case 'CONTEXT_DEEPENING':
            return `I've been looking at your recent activity and want to make sure I'm tracking your priorities right. What's the most important thing on your plate this week?`;

        case 'POST_MEETING_REVIEW':
            return `How did that meeting go? Anything worth noting?`;

        default:
            return `I'm around if you need anything.`;
    }
}

/**
 * Map trigger type to ProactivePrompt type
 */
function mapTriggerToPromptType(trigger: ProactiveTrigger): any {
    switch (trigger) {
        case 'PRE_MEETING_PREP':
            return 'OPPORTUNITY';
        case 'MORNING_BRIEF':
            return 'MORNING_BRIEF';
        case 'POST_DOCUMENT_ACTIVITY':
            return 'OPPORTUNITY';
        case 'EXECUTION_NUDGE':
            return 'EXECUTION_NUDGE';
        case 'GOAL_CHECK_IN':
            return 'REFLECTION';
        case 'ONBOARDING':
            return 'REFLECTION';
        case 'CONTEXT_DEEPENING':
            return 'CONTEXT_DEEPENING';
        case 'POST_MEETING_REVIEW':
            return 'REFLECTION';
        default:
            return 'MORNING_BRIEF';
    }
}

/**
 * Pre-Meeting Prep Checker — Two-Stage Flow
 * Called by cron every 15 minutes to check for upcoming meetings.
 *
 * Stage 1 — Outcome Ask (1.5–2.5 hours before):
 *   Mira asks "What's the one outcome you want?" for meetings without a desiredOutcome.
 *   Deduped via lifecycleStage — only asks once per meeting.
 *
 * Stage 2 — Targeted Brief (15 min ago to 45 min ahead):
 *   Sends coaching brief with outcome injection if user responded.
 *   Falls back to standard brief if user didn't respond — no meeting goes unprepped.
 *
 * Stage 3 — IN_PROGRESS transition:
 *   Marks meetings that have started as IN_PROGRESS.
 *
 * CRITICAL: Every meeting MUST get a prep brief. No exceptions.
 */
export async function checkPreMeetingPrep(userId: string): Promise<void> {
    const now = new Date();

    // ── Stage 1: Outcome Ask (1.5h to 2.5h before) ──
    await sendOutcomeAsks(userId, now);

    // ── Stage 2: Targeted Brief (15 min ago to 45 min ahead) ──
    await sendCoachingBriefs(userId, now);

    // ── Stage 3: IN_PROGRESS transition ──
    await transitionToInProgress(userId, now);
}

/**
 * Stage 1: Ask for desired outcome — 1.5 to 2.5 hours before meeting.
 * Only for meetings that haven't been asked yet (lifecycleStage IS NULL).
 */
async function sendOutcomeAsks(userId: string, now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() + 90 * 60 * 1000);  // 1.5h ahead
    const windowEnd = new Date(now.getTime() + 150 * 60 * 1000);   // 2.5h ahead

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: windowStart, lte: windowEnd },
            status: { not: 'cancelled' },
            lifecycleStage: null,
            desiredOutcome: null
        },
        orderBy: { startTime: 'asc' }
    });

    if (meetings.length === 0) return;

    // Smart filtering: skip trivial meetings
    const qualifiedMeetings = meetings.filter(m => {
        const attendees = (m.attendees as any[]) || [];
        // Skip: only 1 attendee (blocked time / focus time)
        if (attendees.length < 2) return false;
        // Skip: cancelled or tentative
        if (m.status === 'cancelled' || m.status === 'tentative') return false;
        return true;
    });

    // Density cap: max 3 outcome asks per day
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const todayAsks = await prisma.proactivePrompt.count({
        where: {
            userId,
            type: 'REFLECTION',
            deliveredAt: { gte: startOfDay },
            // Only count outcome asks (not review dedup keys)
            stakeholderId: { not: { startsWith: 'review-' } }
        }
    });
    const remainingBudget = Math.max(0, 3 - todayAsks);
    if (remainingBudget === 0) return;

    // Prioritize: needle-movers and presentations first, then by time
    const prioritized = qualifiedMeetings
        .sort((a, b) => {
            const categoryPriority = (m: typeof a) => {
                if (m.isPresentation) return 0;
                if (m.meetingCategory === 'NEEDLE_MOVER') return 1;
                if (m.meetingCategory === 'GROWTH') return 2;
                return 3;
            };
            return categoryPriority(a) - categoryPriority(b);
        })
        .slice(0, remainingBudget);

    if (prioritized.length === 0) return;

    // Dedup: check existing REFLECTION prompts for these meetings
    const existingPrompts = await prisma.proactivePrompt.findMany({
        where: {
            userId,
            type: 'REFLECTION',
            stakeholderId: { in: prioritized.map(m => m.externalId) },
            deliveredAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        },
        select: { stakeholderId: true }
    });
    const alreadyAsked = new Set(existingPrompts.map(p => p.stakeholderId));

    for (const meeting of prioritized) {
        if (alreadyAsked.has(meeting.externalId)) continue;

        const attendees = (meeting.attendees as any[]) || [];
        const attendeeNames = attendees
            .map((a: any) => a.displayName || a.name || a.email?.split('@')[0] || '')
            .filter(Boolean)
            .slice(0, 4);

        const timeStr = meeting.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        console.log(`[Proactive Agent] Sending outcome ask for: ${meeting.title}`);

        await sendOutcomeAsk(userId, meeting, attendeeNames, timeStr);

        // Mark lifecycle stage
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: { lifecycleStage: 'OUTCOME_ASKED', outcomeAskedAt: now }
        });
    }
}

/**
 * Send the outcome ask message for a specific meeting.
 */
async function sendOutcomeAsk(
    userId: string,
    meeting: { id: string; externalId: string; title: string; startTime: Date },
    attendeeNames: string[],
    timeStr: string
): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const firstName = user?.name?.split(' ')[0] || 'there';

    const peopleStr = attendeeNames.length > 0
        ? ` with ${attendeeNames.join(', ')}`
        : '';

    // Look up meeting details for presentation detection
    const fullMeeting = await prisma.meetingSyncRecord.findFirst({
        where: { id: meeting.id },
        select: { isPresentation: true, meetingCategory: true }
    });

    // Generate outcome suggestions via LLM
    let suggestions: string[] = [];
    try {
        const model = await createTrackedGeminiModel(userId, {
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        });
        const suggestionPrompt = `Meeting: "${meeting.title}"
Attendees: ${attendeeNames.join(', ') || 'unknown'}
Category: ${fullMeeting?.meetingCategory || 'unknown'}
Is presentation: ${fullMeeting?.isPresentation ? 'yes' : 'no'}

Generate exactly 3 concise, specific desired outcomes for this meeting. Each should be:
- Action-oriented (starts with a verb)
- Specific to this meeting's likely purpose
- 8-15 words max

Respond as a JSON array of 3 strings, nothing else. Example: ["Align on Q2 roadmap priorities","Get budget approval for hiring plan","Clarify ownership of the analytics migration"]`;

        const result = await model.generateContent(suggestionPrompt);
        const text = result.response.text().trim();
        const parsed = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, ''));
        if (Array.isArray(parsed) && parsed.length > 0) {
            suggestions = parsed.slice(0, 3).map((s: any) => String(s).trim());
        }
    } catch (err: any) {
        console.warn(`[ProactiveAgent] Failed to generate outcome suggestions: ${err.message}`);
    }

    // Store suggestions on meeting record
    if (suggestions.length > 0) {
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: { outcomeSuggestions: suggestions },
        });
    }

    const suggestionsText = suggestions.length > 0
        ? `\n\nHere are some ideas:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '';

    const message = fullMeeting?.isPresentation
        ? `You're presenting in **${meeting.title}**${peopleStr} at ${timeStr}. Before you open your slides — what's the ONE thing you need this room to leave believing?${suggestionsText}`
        : `You've got **${meeting.title}**${peopleStr} at ${timeStr}. What's the one outcome you want to walk away with?${suggestionsText}`;

    // Save message
    const savedMessage = await prisma.message.create({
        data: { userId, role: 'assistant', content: message, type: 'PROACTIVE_NUDGE' }
    });

    // Track as REFLECTION prompt with meeting externalId for dedup
    await prisma.proactivePrompt.create({
        data: {
            userId,
            type: 'REFLECTION',
            content: message,
            stakeholderId: meeting.externalId,
            deliveredVia: 'pusher'
        }
    });

    // Push to user
    await publishMessage(userId, {
        id: savedMessage.id,
        role: 'assistant',
        content: message,
        createdAt: savedMessage.createdAt
    });

    await publishSystemEvent(userId, {
        type: 'proactive_nudge' as any,
        message: 'Mira spotted something',
        data: { trigger: 'PRE_MEETING_PREP', messageId: savedMessage.id }
    });

    await sendPushToUser(userId, {
        title: MIRA_NOTIFICATIONS.insight.title,
        body: MIRA_NOTIFICATIONS.insight.bodyTemplate(message),
        url: '/dashboard'
    });
}

/**
 * Stage 2: Send targeted coaching brief — 15 min ago to 45 min ahead.
 * Includes user's desired outcome if they responded.
 * Falls back to standard brief if no outcome was provided.
 */
async function sendCoachingBriefs(userId: string, now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);  // 15 min ago
    const windowEnd = new Date(now.getTime() + 45 * 60 * 1000);    // 45 min ahead

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: windowStart, lte: windowEnd },
            status: { not: 'cancelled' },
            // Send brief for OUTCOME_ASKED or OUTCOME_SET (but not already briefed)
            lifecycleStage: { in: ['OUTCOME_ASKED', 'OUTCOME_SET'] },
            briefSentAt: null
        },
        orderBy: { startTime: 'asc' }
    });

    // Also catch meetings with no lifecycle stage at all (first-time in brief window)
    const unbriefedMeetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: windowStart, lte: windowEnd },
            status: { not: 'cancelled' },
            lifecycleStage: null,
            briefSentAt: null
        },
        orderBy: { startTime: 'asc' }
    });

    const allMeetings = [...meetings, ...unbriefedMeetings];
    if (allMeetings.length === 0) return;

    // Dedup: check existing OPPORTUNITY prompts
    const existingBriefs = await prisma.proactivePrompt.findMany({
        where: {
            userId,
            type: 'OPPORTUNITY',
            stakeholderId: { in: allMeetings.map(m => m.externalId) },
            deliveredAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        },
        select: { stakeholderId: true }
    });
    const alreadyBriefed = new Set(existingBriefs.map(p => p.stakeholderId));

    for (const meeting of allMeetings) {
        if (alreadyBriefed.has(meeting.externalId)) continue;

        console.log(`[Proactive Agent] Sending coaching brief for: ${meeting.title} (outcome: ${meeting.desiredOutcome ? 'SET' : 'none'})`);

        await proactiveAgent({
            userId,
            trigger: 'PRE_MEETING_PREP',
            context: { meetingId: meeting.id }
        });

        // Update lifecycle
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: { lifecycleStage: 'BRIEF_SENT', briefSentAt: now }
        });
    }
}

/**
 * Stage 3: Transition meetings that have started to IN_PROGRESS.
 */
async function transitionToInProgress(userId: string, now: Date): Promise<void> {
    await prisma.meetingSyncRecord.updateMany({
        where: {
            userId,
            startTime: { lte: now },
            endTime: { gt: now },
            lifecycleStage: { in: ['BRIEF_SENT', 'OUTCOME_ASKED', 'OUTCOME_SET'] },
            status: { not: 'cancelled' }
        },
        data: { lifecycleStage: 'IN_PROGRESS' }
    });
}

/**
 * Morning Brief Generator
 * Called by cron at user's morning time
 */
export async function generateMorningBrief(userId: string, force?: boolean): Promise<void> {
    // Check if we already sent a morning brief today (bypass with force)
    if (!force) {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));

        const existingBrief = await prisma.proactivePrompt.findFirst({
            where: {
                userId,
                type: 'MORNING_BRIEF',
                deliveredAt: { gte: startOfDay }
            }
        });

        if (existingBrief) {
            console.log(`[Proactive Agent] Already sent morning brief today`);
            return;
        }
    }

    await proactiveAgent({
        userId,
        trigger: 'MORNING_BRIEF'
    });
}

/**
 * Post-Document Activity Handler
 * Called when a Drive webhook indicates document activity
 */
export async function handleDocumentActivity(userId: string, documentId: string, documentName: string): Promise<void> {
    // Don't spam - only send once per document per day
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const existingPrompt = await prisma.proactivePrompt.findFirst({
        where: {
            userId,
            content: { contains: documentName },
            deliveredAt: { gte: startOfDay }
        }
    });

    if (existingPrompt) {
        console.log(`[Proactive Agent] Already sent prompt for document: ${documentName}`);
        return;
    }

    await proactiveAgent({
        userId,
        trigger: 'POST_DOCUMENT_ACTIVITY',
        context: { documentId, documentName }
    });
}

/**
 * Build rich pre-meeting coaching context using knowledge graph + intelligence profiles
 */
async function buildPreMeetingCoachingContext(userId: string, meetingId?: string): Promise<string> {
    // Find the meeting
    let meeting;
    if (meetingId) {
        meeting = await prisma.meetingSyncRecord.findFirst({
            where: { id: meetingId }
        });
    } else {
        meeting = await prisma.meetingSyncRecord.findFirst({
            where: {
                userId,
                startTime: { gte: new Date() }
            },
            orderBy: { startTime: 'asc' }
        });
    }

    if (!meeting) return '';

    const attendees = (meeting.attendees as any[]) || [];
    const attendeeNames = attendees.map((a: any) => a.displayName || a.name || a.email || '').filter(Boolean);
    const attendeeEmails = attendees.map((a: any) => (a.email || '').toLowerCase()).filter(Boolean);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Fetch graph intelligence + fallback data in parallel
    const [graphIntel, userIntelligence, pastMeetingsWithAttendees, relatedEmails, relationshipFacts, stakeholderRelationships] = await Promise.all([
        // Knowledge graph: rich facts about each attendee
        getAttendeeIntelligence(userId, attendeeNames),
        // User's intelligence profile
        prisma.userIntelligence.findUnique({ where: { userId } }),
        // Past meetings with these attendees
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: thirtyDaysAgo, lt: new Date() },
                id: { not: meeting.id }
            },
            orderBy: { startTime: 'desc' },
            take: 50
        }).then(meetings => meetings.filter(m => {
            const mAttendees = (m.attendees as any[]) || [];
            const mEmails = mAttendees.map((a: any) => (a.email || '').toLowerCase());
            return mEmails.some(e => attendeeEmails.includes(e));
        }).slice(0, 10)),
        // Recent emails with attendees
        prisma.emailSummary.findMany({
            where: {
                userId,
                lastMessageAt: { gte: thirtyDaysAgo },
                participants: { hasSome: attendeeEmails }
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 5
        }),
        // Relationship facts: manages/reports_to between user and attendees
        prisma.knowledgeFact.findMany({
            where: {
                userId,
                predicate: { in: ['manages', 'reports_to', 'mentors', 'collaborates_with', 'works_with'] },
                confidence: { gte: 0.3 },
            },
            include: { subject: true, objectEntity: true }
        }).then(facts => facts.filter(f => {
            const subjectName = (f.subject?.name || '').toLowerCase();
            const objectName = (f.objectEntity?.name || '').toLowerCase();
            const lowerAttendees = attendeeNames.map(n => n.toLowerCase());
            return lowerAttendees.includes(subjectName) || lowerAttendees.includes(objectName);
        })),
        // Stakeholder profiles with influenceLevel for attendees
        prisma.stakeholderProfile.findMany({
            where: {
                userId,
                OR: [
                    { name: { in: attendeeNames, mode: 'insensitive' as any } },
                    { email: { in: attendeeEmails } }
                ]
            },
            select: { name: true, email: true, influenceLevel: true, role: true }
        })
    ]);

    // Calculate time until meeting for context
    const minutesUntil = Math.round((meeting.startTime.getTime() - Date.now()) / (60 * 1000));
    const timeLabel = minutesUntil <= 0
        ? 'starting NOW'
        : minutesUntil < 60
            ? `in ${minutesUntil} minutes`
            : `in about ${Math.round(minutesUntil / 60)} hour${minutesUntil >= 90 ? 's' : ''}`;

    // Build the rich context
    let ctx = `
UPCOMING MEETING (${timeLabel}):
- Title: ${meeting.title}
- Time: ${meeting.startTime.toLocaleTimeString()}
- Type: ${meeting.meetingType || 'Unknown'}
- Category: ${meeting.meetingCategory || 'UNCLASSIFIED'}
- Attendees: ${attendees.map((a: any) => a.name || a.email || a).join(', ')}
${meeting.isPresentation ? '- FORMAT: USER IS PRESENTING — activate narrative coaching mode' : ''}
${meeting.description ? `- Description: ${meeting.description.substring(0, 200)}` : ''}
`;

    // Build relationship map for attendees
    const relationshipMap = new Map<string, string>();
    // From knowledge graph facts
    // First, find the user's own entity to distinguish user-as-subject vs attendee-as-subject
    const userEntity = await prisma.knowledgeEntity.findFirst({
        where: { userId, type: 'PERSON', nameNormalized: { contains: '' } },
        orderBy: { createdAt: 'asc' }
    });
    const userEntityId = userEntity?.id;

    for (const fact of relationshipFacts) {
        const subjectName = fact.subject?.name || '';
        const objectName = fact.objectEntity?.name || '';
        const isUserSubject = userEntityId && fact.subjectId === userEntityId;
        const isUserObject = userEntityId && fact.objectEntityId === userEntityId;

        if (fact.predicate === 'manages') {
            if (isUserSubject) {
                // User manages objectName
                relationshipMap.set(objectName.toLowerCase(), `Your direct report`);
            } else if (isUserObject) {
                // subjectName manages the user
                relationshipMap.set(subjectName.toLowerCase(), `Your manager`);
            } else {
                relationshipMap.set(objectName.toLowerCase(), `${objectName} is managed by ${subjectName}`);
            }
        } else if (fact.predicate === 'reports_to') {
            if (isUserSubject) {
                // User reports to objectName
                relationshipMap.set(objectName.toLowerCase(), `You report to them`);
            } else if (isUserObject) {
                // subjectName reports to the user
                relationshipMap.set(subjectName.toLowerCase(), `Your direct report`);
            } else {
                relationshipMap.set(subjectName.toLowerCase(), `${subjectName} reports to ${objectName}`);
            }
        } else if (fact.predicate === 'mentors') {
            if (isUserSubject) {
                relationshipMap.set(objectName.toLowerCase(), `You mentor them`);
            } else if (isUserObject) {
                relationshipMap.set(subjectName.toLowerCase(), `Your mentor`);
            }
        }
    }
    // From stakeholder profiles (onboarding data)
    const influenceLabelMap: Record<string, string> = {
        'MANAGES': 'Your direct report',
        'REPORTS_TO': 'You report to them',
        'PEER': 'Your peer',
        'CROSS_FUNCTIONAL': 'Cross-functional partner',
        'EXTERNAL': 'External stakeholder',
    };
    for (const sp of stakeholderRelationships) {
        const key = sp.name.toLowerCase();
        if (!relationshipMap.has(key) && sp.influenceLevel && influenceLabelMap[sp.influenceLevel]) {
            relationshipMap.set(key, influenceLabelMap[sp.influenceLevel]);
        }
    }

    if (relationshipMap.size > 0) {
        ctx += `\nRELATIONSHIP MAP (how these people relate to the user):\n`;
        for (const [name, relationship] of relationshipMap) {
            const displayName = attendeeNames.find(n => n.toLowerCase() === name) || name;
            ctx += `- ${displayName}: ${relationship}\n`;
        }
        ctx += `\nIMPORTANT: Use the relationship map above to tailor your coaching. For direct reports, focus on delegation, feedback, and development. For managers, focus on managing up and visibility. For peers, focus on influence and collaboration.\n`;
    }

    // Outcome history with these attendees — helps Mira coach based on track record
    const pastOutcomes = pastMeetingsWithAttendees.filter(m => m.outcomeResult);
    if (pastOutcomes.length > 0) {
        const landed = pastOutcomes.filter(m => m.outcomeResult === 'LANDED').length;
        const partial = pastOutcomes.filter(m => m.outcomeResult === 'PARTIAL').length;
        const missed = pastOutcomes.filter(m => m.outcomeResult === 'MISSED').length;
        const total = landed + partial + missed;
        const hitRate = total > 0 ? Math.round((landed / total) * 100) : 0;

        ctx += `\nOUTCOME HISTORY WITH THESE ATTENDEES:
- Track record: ${landed} landed, ${partial} partial, ${missed} missed out of ${total} tracked (${hitRate}% hit rate)
`;
        if (hitRate >= 70) {
            ctx += `- COACHING NOTE: Strong track record with this group. Build on what works.\n`;
        } else if (hitRate < 40 && total >= 3) {
            ctx += `- COACHING NOTE: Historically challenging meetings with this group. Focus on preparation and clear objectives.\n`;
        }

        // Check if user prepped for past meetings that landed vs missed
        const preppedMeetings = pastOutcomes.filter(m => m.desiredOutcome);
        const preppedLanded = preppedMeetings.filter(m => m.outcomeResult === 'LANDED').length;
        const unpreppedMeetings = pastOutcomes.filter(m => !m.desiredOutcome);
        const unpreppedLanded = unpreppedMeetings.filter(m => m.outcomeResult === 'LANDED').length;

        if (preppedMeetings.length >= 2 && unpreppedMeetings.length >= 2) {
            const preppedRate = Math.round((preppedLanded / preppedMeetings.length) * 100);
            const unpreppedRate = Math.round((unpreppedLanded / unpreppedMeetings.length) * 100);
            if (preppedRate > unpreppedRate + 20) {
                ctx += `- INSIGHT: When you set a desired outcome beforehand, you land ${preppedRate}% vs ${unpreppedRate}% without. Prep matters with this group.\n`;
            }
        }
    }

    // User intelligence profile
    if (userIntelligence) {
        const profile = userIntelligence.profile as any;
        ctx += `
USER'S INTELLIGENCE PROFILE (v${userIntelligence.version}, confidence ${userIntelligence.overallConfidence.toFixed(2)}):
- Role: ${profile.role || 'Unknown'}
- Communication Style: ${profile.communicationStyle || 'Unknown'}
- Decision Pattern: ${profile.decisionPattern || 'Unknown'}
`;
        if (profile.strengths?.length > 0) {
            ctx += `- Strengths: ${profile.strengths.map((s: any) => `${s.area} (confidence: ${s.confidence})`).join(', ')}\n`;
        }
        if (profile.growthAreas?.length > 0) {
            ctx += `- Growth Areas: ${profile.growthAreas.map((g: any) => `${g.area} (confidence: ${g.confidence})`).join(', ')}\n`;
        }
    } else {
        ctx += `\nUSER INTELLIGENCE: Not yet synthesized.\n`;
    }

    // Graph-based attendee intelligence (richer than old stakeholder profiles)
    if (graphIntel.length > 0) {
        ctx += `\nATTENDEE INTELLIGENCE (from knowledge graph):\n`;
        for (const attendee of graphIntel) {
            ctx += `\n**${attendee.name}**:\n`;

            // Key facts about this person
            const importantFacts = attendee.facts.slice(0, 8);
            if (importantFacts.length > 0) {
                for (const fact of importantFacts) {
                    ctx += `  - ${fact.predicate}: ${fact.objectName || fact.objectValue || '?'} (confidence: ${fact.confidence.toFixed(2)})\n`;
                }
            }

            // Shared communities (what connects you)
            if (attendee.sharedCommunities.length > 0) {
                ctx += `  - Shared contexts: ${attendee.sharedCommunities.map(c => c.communityName).join(', ')}\n`;
            }

            // Shared connections (what you both work on)
            if (attendee.sharedFacts.length > 0) {
                ctx += `  - Common ground: ${attendee.sharedFacts.map(f => `${f.predicate} ${f.objectName || f.objectValue}`).join(', ')}\n`;
            }
        }
    }

    // Ground Game: Political stances, stale relationships, tactical tips
    const groundGameProfiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            email: { in: attendeeEmails, mode: 'insensitive' },
        },
        select: {
            name: true,
            email: true,
            role: true,
            politicalStance: true,
            influenceRole: true,
            powerLevel: true,
            personaArchetype: true,
            relationshipStrength: true,
            lastInteraction: true,
            interactionCount: true,
            primaryMotivation: true,
            fears: true,
            linkedinHeadline: true,
            intelligence: {
                select: {
                    profileSummary: true,
                    successPatterns: true,
                    objectionPatterns: true,
                    currentMood: true,
                },
            },
        },
    });

    if (groundGameProfiles.length > 0) {
        const now = Date.now();
        const archetipeTips: Record<string, string> = {
            DRIVER: 'Lead with outcomes, not process. Be direct.',
            ANALYST: 'Lead with data. Give them time to process.',
            COLLABORATOR: 'Seek their input early. Frame as "together."',
            VISIONARY: 'Connect to the big picture first.',
            GUARDIAN: 'Address risks upfront.',
            POLITICIAN: 'Build alignment privately before the group.',
            CHAMPION: 'Brief them so they can advocate for you.',
            PRAGMATIST: 'Show it works. Use precedents.',
            SKEPTIC: 'Acknowledge concerns first, then present evidence.',
            CONSERVATIVE: 'Frame change as evolution, not revolution.',
            OPERATOR: 'Focus on execution and feasibility.',
        };

        ctx += `\nGROUND GAME — ROOM DYNAMICS:\n`;

        const skeptics: string[] = [];
        const champions: string[] = [];
        const stale: string[] = [];

        for (const p of groundGameProfiles) {
            const daysSince = p.lastInteraction
                ? Math.floor((now - p.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
                : null;
            const isStale = daysSince !== null && daysSince > 14;

            ctx += `\n  ${p.name}${p.role ? ` (${p.role})` : ''}:\n`;
            ctx += `    Stance: ${p.politicalStance || 'UNKNOWN'} | Power: ${p.powerLevel} | Influence: ${p.influenceRole}\n`;
            ctx += `    Relationship: ${Math.round(p.relationshipStrength * 100)}% | Last contact: ${daysSince !== null ? `${daysSince}d ago` : 'never'}${isStale ? ' ⚠️ STALE' : ''}\n`;

            if (p.personaArchetype && archetipeTips[p.personaArchetype]) {
                ctx += `    Tip: ${archetipeTips[p.personaArchetype]}\n`;
            }
            if (p.intelligence?.objectionPatterns?.length) {
                ctx += `    Watch for: "${p.intelligence.objectionPatterns[0]}"\n`;
            }
            if (p.intelligence?.successPatterns?.length) {
                ctx += `    What works: "${p.intelligence.successPatterns[0]}"\n`;
            }
            if (p.linkedinHeadline) {
                ctx += `    External: ${p.linkedinHeadline}\n`;
            }

            if (p.politicalStance === 'SKEPTIC' || p.politicalStance === 'HOSTILE') skeptics.push(p.name);
            if (p.politicalStance === 'CHAMPION') champions.push(p.name);
            if (isStale && (p.powerLevel === 'HIGH' || p.influenceRole === 'DECISION_MAKER')) stale.push(p.name);
        }

        // Tactical summary
        const parts: string[] = [];
        if (stale.length > 0) parts.push(`You haven't spoken to ${stale.join(' or ')} recently — unclear where they stand.`);
        if (skeptics.length > 0 && champions.length > 0) parts.push(`${champions[0]} is your ally — brief them to speak early. Address ${skeptics[0]}'s concerns head-on.`);
        else if (skeptics.length > 0) parts.push(`${skeptics[0]} has concerns. Address their objections directly or meet them beforehand.`);

        if (parts.length > 0) {
            ctx += `\n  TACTICAL ADVICE: ${parts.join(' ')}\n`;
        }
    }

    // Fallback: if graph had no data for some attendees, try stakeholder profiles
    const graphAttendeeNames = new Set(graphIntel.map(a => a.name.toLowerCase()));
    const groundGameNames = new Set(groundGameProfiles.map(p => p.name.toLowerCase()));
    const ungraphedAttendees = attendeeEmails.filter(email => {
        const name = attendees.find((a: any) => (a.email || '').toLowerCase() === email)?.name || '';
        return !graphAttendeeNames.has(name.toLowerCase()) && !groundGameNames.has(name.toLowerCase());
    });

    if (ungraphedAttendees.length > 0) {
        const fallbackProfiles = await prisma.stakeholderProfile.findMany({
            where: { userId, email: { in: ungraphedAttendees } },
            include: { intelligence: true }
        });

        if (fallbackProfiles.length > 0) {
            ctx += `\nADDITIONAL ATTENDEE PROFILES (from stakeholder data):\n`;
            for (const sp of fallbackProfiles) {
                ctx += `- ${sp.name}${sp.role ? ` (${sp.role})` : ''}: ${sp.interactionCount} interactions\n`;
                if (sp.intelligence?.profileSummary) {
                    ctx += `  Profile: ${sp.intelligence.profileSummary.substring(0, 200)}\n`;
                }
            }
        }
    }

    // Past meetings with these people
    if (pastMeetingsWithAttendees.length > 0) {
        ctx += `\nMEETING HISTORY WITH THESE PEOPLE (last 30 days):\n`;
        for (const pm of pastMeetingsWithAttendees.slice(0, 5)) {
            ctx += `- "${pm.title}" on ${pm.startTime.toLocaleDateString()}${pm.outcome ? ` → Outcome: ${pm.outcome.substring(0, 100)}` : ' [no outcome recorded]'}\n`;
        }
    }

    // Related email threads
    if (relatedEmails.length > 0) {
        ctx += `\nRECENT EMAIL THREADS WITH ATTENDEES:\n`;
        for (const email of relatedEmails) {
            ctx += `- "${email.subject}" (${email.messageCount} messages, last: ${email.lastMessageAt.toLocaleDateString()})${email.requiresAction ? ' [ACTION NEEDED]' : ''}${email.isImportant ? ' [IMPORTANT]' : ''}\n`;
        }
    }

    // Inject user's desired outcome if they set one
    if (meeting.desiredOutcome) {
        ctx += `
🎯 USER'S DESIRED OUTCOME (they told you this):
"${meeting.desiredOutcome}"

This is what they most care about. Frame your entire coaching brief around helping them achieve this specific outcome. Reference it directly. Suggest how to steer the conversation toward it.
`;
    }

    ctx += `\nDeliver a coaching brief that helps the user walk into this meeting prepared, confident, and aware of their own patterns.`;

    return ctx;
}

/**
 * Analyze knowledge gaps for context deepening.
 * Uses graph-based gap analysis + raw data for meeting context.
 */
async function analyzeKnowledgeGaps(userId: string): Promise<string | null> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [graphGaps, recentMeetings, goals, pastDeepening] = await Promise.all([
        graphAnalyzeKnowledgeGaps(userId),
        prisma.meetingSyncRecord.findMany({
            where: { userId, startTime: { gte: thirtyDaysAgo } },
            orderBy: { startTime: 'desc' },
            take: 30
        }),
        prisma.goal.findMany({
            where: { userId, status: 'ACTIVE' },
            include: { stakeholders: true }
        }),
        prisma.proactivePrompt.findMany({
            where: { userId, type: 'CONTEXT_DEEPENING' },
            orderBy: { deliveredAt: 'desc' },
            take: 10,
            select: { content: true, deliveredAt: true }
        })
    ]);

    if (recentMeetings.length === 0 && graphGaps.length === 0) {
        return null;
    }

    const meetingsWithoutOutcome = recentMeetings.filter(m => !m.outcome && !m.notes && m.startTime < new Date());

    return `
KNOWLEDGE GRAPH GAPS (people and topics we know little about):
${graphGaps.length > 0
            ? graphGaps.slice(0, 10).map(g => `- ${g.entityName} (${g.entityType}): ${g.reason}`).join('\n')
            : '- No significant gaps detected'}

RECENT MEETINGS (last 30 days): ${recentMeetings.length}
${recentMeetings.slice(0, 10).map(m => {
        const attendees = (m.attendees as any[]) || [];
        return `- "${m.title}" on ${m.startTime.toLocaleDateString()} with ${attendees.map((a: any) => a.email || a.name || a).join(', ')}${m.outcome ? ' [has outcome]' : ' [no outcome recorded]'}`;
    }).join('\n')}

ACTIVE GOALS: ${goals.length}
${goals.map(g => `- "${g.description}"${g.deadline ? ` (due ${g.deadline.toLocaleDateString()})` : ''} — ${g.stakeholders.length} stakeholders`).join('\n')}

MEETINGS WITHOUT OUTCOMES: ${meetingsWithoutOutcome.length}

PREVIOUS CONTEXT-DEEPENING QUESTIONS (avoid repeating these):
${pastDeepening.length > 0
            ? pastDeepening.map(p => `- [${p.deliveredAt.toLocaleDateString()}] ${p.content.substring(0, 100)}...`).join('\n')
            : '- None yet (first time)'}
`;
}

/**
 * Context Deepening Generator
 * Called by cron daily at 11:00 UTC (~4:30 PM IST)
 * Includes daily dedup guard (same pattern as generateMorningBrief)
 */
export async function generateContextDeepening(userId: string, force?: boolean): Promise<void> {
    // Daily dedup guard — only one context deepening per user per day (bypass with force)
    if (!force) {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        const existingDeepening = await prisma.proactivePrompt.findFirst({
            where: {
                userId,
                type: 'CONTEXT_DEEPENING',
                deliveredAt: { gte: startOfDay }
            }
        });

        if (existingDeepening) {
            console.log(`[Proactive Agent] Already sent context deepening today for user ${userId.substring(0, 8)}`);
            return;
        }
    }

    await proactiveAgent({
        userId,
        trigger: 'CONTEXT_DEEPENING'
    });
}

/**
 * Post-Meeting Review Checker
 * Called by cron every 15 minutes.
 *
 * Finds meetings that ended 15 min to 2 hours ago,
 * fetches Gemini meeting notes if available,
 * sends a contextual review question.
 */
export async function checkPostMeetingReview(userId: string): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);  // 2 hours ago
    const windowEnd = new Date(now.getTime() - 15 * 60 * 1000);        // 15 min ago

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            endTime: { gte: windowStart, lte: windowEnd },
            status: { not: 'cancelled' },
            lifecycleStage: { notIn: ['ENDED', 'REVIEWED'] }
        },
        orderBy: { endTime: 'desc' }
    });

    // Filter to meetings with ≥2 attendees (skip solo blocks)
    const qualifiedMeetings = meetings.filter(m => {
        const attendees = (m.attendees as any[]) || [];
        return attendees.length >= 2;
    });

    if (qualifiedMeetings.length === 0) return;

    // Dedup: check existing REFLECTION prompts for post-meeting
    const existingPrompts = await prisma.proactivePrompt.findMany({
        where: {
            userId,
            type: 'REFLECTION',
            stakeholderId: { in: qualifiedMeetings.map(m => `review-${m.externalId}`) },
            deliveredAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        },
        select: { stakeholderId: true }
    });
    const alreadyReviewed = new Set(existingPrompts.map(p => p.stakeholderId));

    for (const meeting of qualifiedMeetings) {
        const dedupeKey = `review-${meeting.externalId}`;
        if (alreadyReviewed.has(dedupeKey)) continue;

        console.log(`[Proactive Agent] Sending post-meeting review for: ${meeting.title}`);

        // Try to fetch Gemini meeting notes
        let notes: string | null = null;
        try {
            notes = await fetchGeminiMeetingNotes(userId, meeting);
            if (notes) {
                // Store notes on the meeting record
                await prisma.meetingSyncRecord.update({
                    where: { id: meeting.id },
                    data: { notes }
                });
            }
        } catch (err: any) {
            console.error(`[Proactive Agent] Notes fetch failed: ${err.message}`);
        }

        // Send the review prompt via proactive agent
        await proactiveAgent({
            userId,
            trigger: 'POST_MEETING_REVIEW',
            context: { meetingId: meeting.id }
        });

        // Mark lifecycle stage as ENDED
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: { lifecycleStage: 'ENDED' }
        });

        // Track dedup
        await prisma.proactivePrompt.create({
            data: {
                userId,
                type: 'REFLECTION',
                content: `Post-meeting review for: ${meeting.title}`,
                stakeholderId: dedupeKey,
                deliveredVia: 'pusher'
            }
        });
    }
}

// ─────────────────────────────────────────
// FRIDAY RITUAL
// ─────────────────────────────────────────

/**
 * Friday wind-down ritual. Queries the week's meetings, outcomes, and commitments,
 * then generates a light, celebratory message that asks for ONE win.
 * This is NOT a performance review — it's a moment of recognition.
 */
export async function generateFridayRitual(userId: string): Promise<string | null> {
    // Dedup: check if we already sent a Friday ritual this week
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const existingRitual = await prisma.proactivePrompt.findFirst({
        where: {
            userId,
            type: 'REFLECTION',
            stakeholderId: 'friday-ritual',
            deliveredAt: { gte: threeDaysAgo }
        }
    });
    if (existingRitual) {
        console.log(`[FridayRitual] Already sent this week for ${userId.substring(0, 8)}`);
        return null;
    }

    // Gather the week's data
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);

    const [meetings, commitments, user] = await Promise.all([
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: weekStart },
                status: { not: 'cancelled' }
            },
            orderBy: { startTime: 'asc' }
        }),
        prisma.meetingCommitment.findMany({
            where: {
                userId,
                createdAt: { gte: weekStart }
            }
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        })
    ]);

    const realMeetings = meetings.filter(m => {
        const attendees = (m.attendees as Array<Record<string, unknown>>) || [];
        return attendees.length >= 2;
    });

    const outcomesLanded = realMeetings.filter(m => m.outcomeResult === 'LANDED').length;
    const outcomesMissed = realMeetings.filter(m => m.outcomeResult === 'MISSED' || m.outcomeResult === 'PARTIAL').length;
    const commitmentsFulfilled = commitments.filter(c => c.status === 'FULFILLED').length;
    const commitmentsMissed = commitments.filter(c => c.status === 'OVERDUE' || c.status === 'DROPPED').length;

    // Needle movers this week
    const needleMovers = realMeetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER');
    const needleMoverWins = needleMovers.filter(m => m.outcomeResult === 'LANDED');

    const llmConfig = await getUserLLMConfig(userId);
    const userName = user?.name?.split(' ')[0] || 'there';

    const prompt = `You are Mira, an executive coach. It's Friday evening. Generate a short Friday wind-down message.

THIS WEEK'S NUMBERS:
- Total meetings: ${realMeetings.length}
- Outcomes landed: ${outcomesLanded}
- Outcomes missed/partial: ${outcomesMissed}
- Commitments made: ${commitments.length}, fulfilled: ${commitmentsFulfilled}, missed: ${commitmentsMissed}
- Needle movers: ${needleMovers.length}, wins: ${needleMoverWins.length}

${needleMoverWins.length > 0 ? `NEEDLE MOVER WINS:\n${needleMoverWins.map(m => `- "${m.title}": outcome landed`).join('\n')}` : ''}

RULES:
- This is NOT a performance review. It's a Friday high-five.
- Open with a warm one-liner referencing the week (e.g. "You had ${realMeetings.length} meetings this week and you're still standing.")
- Celebrate ONE specific win if there is one. Reference a real meeting name.
- If things were tough, empathize briefly ("Rough week. Those happen.")
- Ask the user: "What was YOUR win this week?" — frame it as a ritual.
- Under 80 words total. Conversational. No bullet points.
- End with something light — weekend energy.
- The user's name is ${userName}.`;

    try {
        const message = await generateText(llmConfig, prompt, { userId });
        if (!message || message.length < 20) return null;
        return message;
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[FridayRitual] LLM generation failed: ${errMsg}`);
        return null;
    }
}

// ─────────────────────────────────────────
// WEEKLY REFLECTION (Sunday)
// ─────────────────────────────────────────

/**
 * Sunday weekly reflection. Queries patterns from the knowledge graph,
 * meeting trends, stakeholder engagement, and commitment hit rate.
 * Surfaces: biggest win, biggest pattern, what's ahead next week.
 */
export async function generateWeeklyReflectionMessage(userId: string): Promise<string | null> {
    // Dedup: check if we already sent a reflection this week
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const existingReflection = await prisma.proactivePrompt.findFirst({
        where: {
            userId,
            type: 'REFLECTION',
            stakeholderId: 'weekly-reflection-sunday',
            deliveredAt: { gte: fourDaysAgo }
        }
    });
    if (existingReflection) {
        console.log(`[WeeklyReflection] Already sent this week for ${userId.substring(0, 8)}`);
        return null;
    }

    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    weekStart.setHours(0, 0, 0, 0);

    // Gather data in parallel
    const [
        snapshot,
        prevSnapshot,
        upcomingMeetings,
        commitments,
        briefContext,
        user,
    ] = await Promise.all([
        prisma.meetingPatternSnapshot.findFirst({
            where: { userId, weekStart: { gte: weekStart } },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.meetingPatternSnapshot.findFirst({
            where: { userId, weekStart: { lt: weekStart } },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
                status: { not: 'cancelled' }
            },
            orderBy: { startTime: 'asc' },
            take: 15
        }),
        prisma.meetingCommitment.findMany({
            where: { userId, createdAt: { gte: weekStart } }
        }),
        getMorningBriefContext(userId),
        prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
        })
    ]);

    // If no snapshot exists, we don't have enough data
    if (!snapshot) {
        console.log(`[WeeklyReflection] No pattern snapshot for ${userId.substring(0, 8)}, skipping`);
        return null;
    }

    const commitmentsFulfilled = commitments.filter(c => c.status === 'FULFILLED').length;
    const commitmentHitRate = commitments.length > 0
        ? Math.round((commitmentsFulfilled / commitments.length) * 100)
        : 0;
    const upcomingNeedleMovers = upcomingMeetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER' || m.isPresentation);
    const userName = user?.name?.split(' ')[0] || 'there';

    const llmConfig = await getUserLLMConfig(userId);

    const prompt = `You are Mira, an executive coach. It's Sunday. Generate a weekly reflection for ${userName}.

THIS WEEK'S DATA:
- Total meetings: ${snapshot.totalMeetings}
- Outcomes set: ${snapshot.outcomesSet}, landed: ${snapshot.outcomesLanded}, missed: ${snapshot.outcomesMissed}
- Meeting hours: ${snapshot.totalMeetingHours}
- Category breakdown: ${JSON.stringify(snapshot.categoryBreakdown)}
- Commitments: ${commitments.length} made, ${commitmentsFulfilled} fulfilled (${commitmentHitRate}% hit rate)

${prevSnapshot ? `PREVIOUS WEEK COMPARISON:
- Meetings: ${prevSnapshot.totalMeetings}, outcomes set: ${prevSnapshot.outcomesSet}, landed: ${prevSnapshot.outcomesLanded}
- Commitment hit rate then vs now: compare naturally
` : ''}

${briefContext.recentFacts.length > 0 ? `KNOWLEDGE GRAPH PATTERNS (what I learned this week):
${briefContext.recentFacts.slice(0, 5).map(f => `- ${f.subjectName} ${f.predicate} ${f.objectName || f.objectValue || ''}`).join('\n')}` : ''}

${(snapshot.stakeholderGaps as Array<{ name: string; lastMet: string | null; relationship: string | null }>).length > 0 ? `STAKEHOLDER GAPS:
${(snapshot.stakeholderGaps as Array<{ name: string; lastMet: string | null; relationship: string | null }>).map(g => `- ${g.name}: last met ${g.lastMet || 'unknown'}`).join('\n')}` : ''}

NEXT WEEK:
- ${upcomingMeetings.length} meetings ahead
- ${upcomingNeedleMovers.length} needle-movers / presentations

INSTRUCTIONS:
Structure the reflection as:
1. **Biggest win** — reference a specific meeting or outcome by name
2. **Biggest pattern** — something you noticed ("I noticed you're spending X% on operational meetings" or "Your commitment follow-through improved")
3. **What's ahead** — "Next week has ${upcomingMeetings.length} meetings. ${upcomingNeedleMovers.length > 0 ? 'A few look high-stakes.' : ''} Want me to prep you?"

RULES:
- Under 120 words total
- Specific, not generic. Reference real data.
- Tone: Sunday evening, reflective, forward-looking
- If comparing to last week, weave it in naturally ("You're landing more outcomes than last week")
- End with a question about next week
- No bullet points in the output — narrative style`;

    try {
        const message = await generateText(llmConfig, prompt, { userId });
        if (!message || message.length < 20) return null;
        return message;
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WeeklyReflection] LLM generation failed: ${errMsg}`);
        return null;
    }
}
