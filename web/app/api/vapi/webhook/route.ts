import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserLLMConfig } from '@/lib/llm/user-config';
import { createProvider } from '@/lib/llm/factory';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vapi/webhook
 * Receives Vapi webhook events: end-of-call-report, status-update, etc.
 * Configure this URL in Vapi dashboard under Server URL.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message } = body;

        if (!message?.type) {
            return NextResponse.json({ ok: true });
        }

        console.log(`[Vapi Webhook] Received: ${message.type}`);

        switch (message.type) {
            case 'end-of-call-report':
                await handleEndOfCallReport(message);
                break;

            case 'status-update':
                await handleStatusUpdate(message);
                break;

            case 'function-call':
            case 'tool-calls':
                return await handleToolCalls(message);

            default:
                console.log(`[Vapi Webhook] Unhandled type: ${message.type}`);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[Vapi Webhook] Error:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}

/**
 * Handle call status changes — create/update VoiceCall record
 */
async function handleStatusUpdate(message: {
    call?: {
        id?: string;
        metadata?: { userId?: string; callType?: string; meetingId?: string };
    };
    status?: string;
}) {
    const userId = message.call?.metadata?.userId;
    const vapiCallId = message.call?.id;
    if (!userId || !vapiCallId) return;

    const callType = message.call?.metadata?.callType || 'general';
    const meetingId = message.call?.metadata?.meetingId || null;

    // Upsert: create on first status, update on subsequent
    await prisma.voiceCall.upsert({
        where: { vapiCallId },
        create: {
            userId,
            vapiCallId,
            callType,
            meetingId,
            status: message.status || 'queued',
        },
        update: {
            status: message.status || 'in-progress',
        },
    });
}

/**
 * Process end-of-call report — save transcript, summary, extract insights,
 * and update relationship tracking (PersonalContext).
 */
async function handleEndOfCallReport(message: {
    call?: {
        id?: string;
        metadata?: { userId?: string; callType?: string; meetingId?: string; promptVersion?: string };
    };
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    messages?: { role: string; message: string; time: number }[];
    endedReason?: string;
}) {
    const userId = message.call?.metadata?.userId;
    if (!userId) {
        console.warn('[Vapi Webhook] No userId in call metadata');
        return;
    }

    const vapiCallId = message.call?.id;
    const callType = message.call?.metadata?.callType || 'general';
    const meetingId = message.call?.metadata?.meetingId || null;
    const rawTranscript = message.transcript || '';
    const rawSummary = message.summary || '';
    const durationSeconds = message.durationSeconds || 0;

    // Post-transcription correction: fix mangled proper nouns
    const glossary = await buildProperNounGlossary(userId);
    const transcript = applyGlossaryCorrections(rawTranscript, glossary);
    const summary = applyGlossaryCorrections(rawSummary, glossary);

    // Upsert the VoiceCall record with full call data
    await prisma.voiceCall.upsert({
        where: { vapiCallId: vapiCallId || `manual-${Date.now()}` },
        create: {
            userId,
            vapiCallId,
            callType,
            meetingId,
            status: 'ended',
            durationSeconds: durationSeconds || null,
            transcript: transcript || null,
            summary: summary || null,
            recordingUrl: message.recordingUrl || null,
            endedAt: new Date(),
        },
        update: {
            status: 'ended',
            durationSeconds: durationSeconds || null,
            transcript: transcript || null,
            summary: summary || null,
            recordingUrl: message.recordingUrl || null,
            endedAt: new Date(),
        },
    });

    // Update relationship tracking (PersonalContext)
    await updateRelationshipTracking(userId, callType, durationSeconds);

    // Save summary as a ConversationInsight for the knowledge graph
    if (summary) {
        await prisma.conversationInsight.create({
            data: {
                userId,
                conversationDate: new Date(),
                insight: `Voice call summary (${callType}): ${summary}`,
                conversationType: 'GENERAL',
                senderType: 'AI',
                contextType: 'PAST_LEARNING',
                explicit: false,
                confidence: 0.8,
            },
        });
    }

    // Extract user-stated context from transcript
    const userMessages = (message.messages || [])
        .filter(m => m.role === 'user')
        .map(m => m.message)
        .join('\n');

    if (userMessages.length > 50) {
        await prisma.conversationInsight.create({
            data: {
                userId,
                conversationDate: new Date(),
                insight: `Voice call context (${callType}): ${userMessages.substring(0, 2000)}`,
                conversationType: 'GENERAL',
                senderType: 'USER',
                contextType: 'PAST_LEARNING',
                explicit: true,
                confidence: 0.9,
            },
        });
    }

    // If this was a pre-meeting prep call and user stated an outcome, save it to the meeting
    if (callType === 'pre_meeting_prep' && meetingId && userMessages) {
        const outcomeMatch = userMessages.match(/(?:want to|need to|goal is|outcome is|walk out with)\s+(.{10,200})/i);
        if (outcomeMatch) {
            await prisma.meetingSyncRecord.update({
                where: { id: meetingId },
                data: {
                    desiredOutcome: outcomeMatch[1].trim(),
                    lifecycleStage: 'OUTCOME_SET',
                },
            });
        }
    }

    // Push summary to chat so user sees it in-app
    if (summary) {
        await prisma.message.create({
            data: {
                userId,
                role: 'assistant',
                content: `**Call Summary** (${formatCallType(callType)}, ${formatDuration(durationSeconds)})\n\n${summary}`,
                type: 'PROACTIVE_NUDGE',
            },
        });
    }

    // Trigger knowledge graph extraction from voice call transcript
    if (transcript.length > 50) {
        try {
            await prisma.message.create({
                data: {
                    userId,
                    role: 'system',
                    content: JSON.stringify({ type: 'EXTRACT_VOICE_FACTS', voiceCallId: vapiCallId }),
                    type: 'SYSTEM',
                },
            });
        } catch (triggerErr) {
            console.error('[Vapi Webhook] Failed to queue voice fact extraction:', triggerErr);
        }
    }

    // Queue call evaluation for the Coaching Intelligence System
    if (transcript.length > 50 && durationSeconds > 30) {
        const voiceCallRecord = vapiCallId
            ? await prisma.voiceCall.findUnique({ where: { vapiCallId }, select: { id: true } })
            : null;
        if (voiceCallRecord) {
            try {
                await prisma.message.create({
                    data: {
                        userId,
                        role: 'system',
                        content: JSON.stringify({ type: 'CALL_EVALUATION', voiceCallId: voiceCallRecord.id }),
                        type: 'SYSTEM',
                    },
                });
            } catch (triggerErr) {
                console.error('[Vapi Webhook] Failed to queue call evaluation:', triggerErr);
            }
        }
    }

    // Queue post-call analysis jobs to the worker via system messages.
    // These were previously fire-and-forget LLM calls in the webhook (Vercel),
    // which silently failed due to timeouts. Now they run reliably in the worker.
    if (transcript.length > 100) {
        // Thread extraction
        try {
            await prisma.message.create({
                data: {
                    userId,
                    role: 'system',
                    content: JSON.stringify({
                        type: 'POST_CALL_ANALYSIS',
                        tasks: ['thread_extraction', 'onboarding_detection'],
                        voiceCallId: vapiCallId,
                        durationSeconds,
                    }),
                    type: 'SYSTEM',
                },
            });
        } catch (triggerErr) {
            console.error('[Vapi Webhook] Failed to queue post-call analysis:', triggerErr);
        }

        // Adaptation signals (early calls only)
        const personalCtxForSignals = await prisma.personalContext.findUnique({
            where: { userId },
            select: { callCount: true },
        }).catch(() => null);
        const currentCallCount = personalCtxForSignals?.callCount || 0;
        if (currentCallCount <= 5) {
            try {
                await prisma.message.create({
                    data: {
                        userId,
                        role: 'system',
                        content: JSON.stringify({
                            type: 'ADAPTATION_SIGNALS',
                            voiceCallId: vapiCallId,
                            durationSeconds,
                            callCount: currentCallCount,
                        }),
                        type: 'SYSTEM',
                    },
                });
            } catch (triggerErr) {
                console.error('[Vapi Webhook] Failed to queue adaptation signals:', triggerErr);
            }
        }
    }

    // --- "Call me later" / callback detection ---
    await detectCallbackRequest(userId, userMessages, vapiCallId);

    // --- No-answer / unanswered detection ---
    await detectNoAnswer(userId, durationSeconds, message.endedReason, vapiCallId);

    // --- Auto-detected feedback signals ---
    await createAutoFeedback(userId, callType, durationSeconds, message.messages, vapiCallId, message.call?.metadata?.promptVersion);

    console.log(`[Vapi Webhook] Saved call report: ${callType}, ${durationSeconds}s, user ${userId}`);
}

/**
 * Update PersonalContext relationship tracking after each call.
 * Tracks call count, total minutes, first/last call dates, and favorite call types.
 */
async function updateRelationshipTracking(userId: string, callType: string, durationSeconds: number) {
    const durationMinutes = Math.ceil(durationSeconds / 60);

    const existing = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true, totalCallMinutes: true, favoriteCallTypes: true },
    });

    if (existing) {
        // Update existing
        const types = existing.favoriteCallTypes || [];
        if (!types.includes(callType)) types.push(callType);

        await prisma.personalContext.update({
            where: { userId },
            data: {
                callCount: { increment: 1 },
                totalCallMinutes: { increment: durationMinutes },
                lastCallDate: new Date(),
                favoriteCallTypes: types,
            },
        });
    } else {
        // Create new PersonalContext on first call
        await prisma.personalContext.create({
            data: {
                userId,
                callCount: 1,
                totalCallMinutes: durationMinutes,
                firstCallDate: new Date(),
                lastCallDate: new Date(),
                favoriteCallTypes: [callType],
            },
        });
    }
}

/**
 * Handle tool calls from Mira during the call.
 * Vapi sends tool-calls when Mira decides she needs live data.
 * Each handler returns a string that gets injected back into the conversation.
 */
async function handleToolCalls(message: {
    call?: { id?: string; metadata?: { userId?: string } };
    toolCalls?: { id: string; function: { name: string; arguments: string } }[];
    toolCallList?: { id: string; function: { name: string; arguments: string } }[];
}) {
    const toolCalls = message.toolCalls || message.toolCallList || [];
    const userId = message.call?.metadata?.userId;
    const vapiCallId = message.call?.id;
    const results = [];

    // Resolve VoiceCall record for tool use tracking
    let voiceCallId: string | undefined;
    if (userId && vapiCallId) {
        try {
            const vc = await prisma.voiceCall.findUnique({ where: { vapiCallId }, select: { id: true } });
            voiceCallId = vc?.id;
        } catch { /* non-critical */ }
    }

    for (const tc of toolCalls) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* empty */ }

        let result: string;
        let success = true;
        const startTime = Date.now();

        try {
            // Semantic router — resolve intent to capability
            result = await routeIntent(userId, args.intent || '', args.covered_so_far || '');
        } catch (error) {
            console.error('[Vapi Semantic Router] Error:', error);
            result = "I wasn't able to look that up right now. Let me get back to you on that.";
            success = false;
        }

        // Record tool use (fire-and-forget)
        if (userId) {
            prisma.toolUseRecord.create({
                data: {
                    userId,
                    source: 'VOICE_CALL',
                    voiceCallId,
                    toolName: args.intent ? detectToolName(args.intent) : 'unknown',
                    intent: args.intent || undefined,
                    inputData: { intent: args.intent, covered_so_far: args.covered_so_far },
                    outputData: { result: result.substring(0, 500) },
                    success,
                    durationMs: Date.now() - startTime,
                },
            }).catch(err => console.error('[Vapi Webhook] Failed to record tool use:', err.message));
        }

        results.push({ toolCallId: tc.id, result });
    }

    return NextResponse.json({ results });
}

/**
 * Detect the tool name from an intent string for analytics grouping.
 */
function detectToolName(intent: string): string {
    const lower = intent.toLowerCase();
    if (/\b(what\s+else|tell\s+me\s+more|keep\s+going)\b/.test(lower)) return 'extend_conversation';
    if (/\b(save|commit|track|i\s+will)\b/.test(lower)) return 'save_commitment';
    if (/\b(birthday|anniversary|important\s+date)\b/.test(lower)) return 'important_dates';
    if (/\b(look\s*up|who\s+is|tell\s+me\s+about)\b/.test(lower)) return 'person_lookup';
    if (/\b(calendar|schedule|meetings?|agenda)\b/.test(lower)) return 'schedule_check';
    if (/\b(feedback|rate\s+call)\b/.test(lower)) return 'call_feedback';
    if (/\b(search|google|news|joke)\b/.test(lower)) return 'web_lookup';
    return 'unknown';
}

// ============================================================================
// SEMANTIC ROUTER — maps natural-language intent to capabilities
// ============================================================================

/**
 * Route a natural-language intent to the right capability.
 * Pattern-match first (fast, no LLM cost), then fall back to LLM classification.
 * Supports compound intents — one request can trigger multiple lookups.
 */
async function routeIntent(userId: string | undefined, intent: string, coveredSoFar: string): Promise<string> {
    if (!intent) return 'I need to know what you\'re looking for. Try again with more detail.';

    const lower = intent.toLowerCase();

    // --- Pattern-based routing (fast path) ---
    // Order matters: meta-intents first, then specific intents, then fallbacks.

    // 1. Extend conversation (check FIRST — these intents often mention other topics as covered context)
    if (/\b(what\s+else|tell\s+me\s+more|more\s+(?:topics|conversation|to\s+talk)|keep\s+going|keep\s+talking|make\s+(?:this|it)\s+(?:more\s+)?interesting|anything\s+else|run\s+out|want\s+to\s+(?:keep|continue)|ran\s+out\s+of)\b/.test(lower)) {
        if (!userId) return 'No user context available.';
        let mood: string | undefined;
        if (/\b(deeper|deep\s+dive|dig\s+in)\b/.test(lower)) mood = 'deeper';
        else if (/\b(light|fun|casual|interesting)\b/.test(lower)) mood = 'lighter';
        else if (/\b(challeng|push|hard|honest|blunt)\b/.test(lower)) mood = 'challenging';
        else if (/\b(personal|life|family|hobby)\b/.test(lower)) mood = 'personal';
        return toolExtendConversation(userId, coveredSoFar, mood);
    }

    // 2. Save commitment (check before schedule — "I will talk to X" shouldn't become a calendar lookup)
    if (/\b(save|commit|track|note|remember\s+that|action\s+item|i\s+(?:will|need\s+to|should|promised))\b/.test(lower)) {
        if (!userId) return 'No user context available.';
        const commitMatch = intent.match(/(?:save|track|note|commitment|action item|remember that)[:\s]+(.+)/i)
            || intent.match(/(?:I (?:will|need to|should|promised))\s+(.+)/i);
        const commitment = commitMatch ? commitMatch[1].trim() : intent;
        const personMatch2 = commitment.match(/(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        return toolSaveCommitment(userId, commitment, personMatch2?.[1]);
    }

    // 3. Important dates (before person lookup — "when is Prachi's birthday" shouldn't become a person lookup)
    if (/\b(birthday|anniversary|important\s+date|milestone|when\s+is)\b/.test(lower)) {
        if (!userId) return 'No user context available.';
        const nameMatch2 = lower.match(/(?:birthday|anniversary|date|milestone)\s+(?:of|for)\s+(.+?)(?:\s*[?.!]|$)/)
            || lower.match(/when\s+is\s+(.+?)(?:'s|s)?\s+birthday/);
        return toolLookupImportantDates(userId, nameMatch2?.[1]?.trim());
    }

    // 4. Person lookup: "look up X", "who is X", "tell me about X"
    const personMatch = lower.match(/(?:look\s*up|who\s+is|tell\s+me\s+about|what\s+(?:do\s+(?:I|we)\s+know\s+about|about)|info\s+on|find)\s+(.+?)(?:\s*[?.!]|$)/);
    if (personMatch && userId) {
        const name = personMatch[1].replace(/['"]/g, '').trim();
        if (name && (/^[A-Z]/.test(name.charAt(0)) || lower.includes('person') || lower.includes('stakeholder'))) {
            return toolLookupPerson(userId, name);
        }
    }

    // 5. Schedule/calendar
    if (/\b(calendar|schedule|meetings?|what.s on|what.s happening|agenda|tomorrow.s?\s)/i.test(lower)) {
        if (!userId) return 'No user context available.';
        const dateMatch = lower.match(/(\d{4}-\d{2}-\d{2})/);
        const tomorrowMatch = /\btomorrow\b/.test(lower);
        const date = dateMatch ? dateMatch[1]
            : tomorrowMatch ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
            : undefined;
        const queryMatch = lower.match(/(?:with|about|for|involving)\s+(.+?)(?:\s*[?.!]|$)/);
        return toolCheckSchedule(userId, date, queryMatch?.[1]);
    }

    // 6. Call feedback: "save feedback", "user says call was helpful/not helpful"
    if (/\b(save\s+feedback|feedback[:\s]|rate\s+call|call\s+(?:was|is)\s+(?:helpful|not|great|good|bad|waste|too\s+(?:long|short))|should\s+(?:skip|do\s+differently|change|improve)|(?:more|less)\s+(?:of|about))\b/.test(lower)) {
        if (!userId) return 'No user context available.';
        return toolSaveCallFeedback(userId, intent);
    }

    // 7. Web lookup: "search", "google", "news", "joke", "trend"
    if (/\b(search|google|news|joke|trend|industry|current\s+event|what.s\s+happening\s+in)\b/.test(lower)) {
        return toolWebLookup(intent);
    }

    // --- Fuzzy fallback: try compound routing ---

    // If intent mentions a person name AND schedule → compound
    if (userId) {
        const hasPersonName = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/.test(intent);
        const hasSchedule = /\b(meeting|calendar|tomorrow|schedule)\b/.test(lower);

        if (hasPersonName && hasSchedule) {
            const nameFromIntent = intent.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1];
            const [personResult, scheduleResult] = await Promise.all([
                nameFromIntent ? toolLookupPerson(userId, nameFromIntent) : Promise.resolve(''),
                toolCheckSchedule(userId, undefined, nameFromIntent),
            ]);
            const parts = [personResult, scheduleResult].filter(Boolean);
            return parts.join('\n\n') || 'No information found.';
        }
    }

    // --- Last resort: treat as web lookup ---
    // If nothing matched, the intent is probably a general knowledge question
    return toolWebLookup(intent);
}

// ============================================================================
// CAPABILITIES — individual tool implementations
// ============================================================================

/**
 * Look up a person by name — stakeholder profile + knowledge graph facts.
 * Importance-aware: boss/manager gets rich detail, distant contacts get basics.
 */
async function toolLookupPerson(userId: string, name: string): Promise<string> {
    if (!name) return 'I need a name to look up. Who are you asking about?';

    // Find stakeholder profile by fuzzy name match
    const profiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            name: { contains: name, mode: 'insensitive' },
        },
        include: {
            intelligence: { select: {
                profileSummary: true,
                successPatterns: true,
                objectionPatterns: true,
                recentTopics: true,
            }},
        },
        take: 3,
    });

    if (profiles.length === 0) {
        // Try knowledge graph entities
        const entities = await prisma.knowledgeEntity.findMany({
            where: {
                userId,
                name: { contains: name, mode: 'insensitive' },
                type: 'PERSON',
            },
            take: 1,
        });

        if (entities.length === 0) {
            return `I don't have any information about "${name}" yet. Tell me about them and I'll remember.`;
        }

        // Get facts about this entity
        const facts = await prisma.knowledgeFact.findMany({
            where: {
                userId,
                subjectId: entities[0].id,
                validTo: null,
            },
            select: { predicate: true, objectValue: true, objectEntity: { select: { name: true } } },
            take: 10,
        });

        const factLines = facts.map(f =>
            `${f.predicate}: ${f.objectValue || f.objectEntity?.name || 'unknown'}`
        ).join('. ');

        return `Here's what I know about ${entities[0].name}: ${factLines || 'Very little so far.'}`;
    }

    const p = profiles[0];
    const isHighImportance = p.powerLevel === 'HIGH' || p.powerLevel === 'CRITICAL'
        || p.influenceRole === 'CHAMPION' || p.influenceRole === 'BLOCKER'
        || (p.interactionCount && p.interactionCount >= 10);

    const parts: string[] = [];
    parts.push(`${p.name}${p.role ? `, ${p.role}` : ''}${p.organization ? ` at ${p.organization}` : ''}`);

    if (p.interactionCount) {
        parts.push(`You've had ${p.interactionCount} interactions with them`);
    }

    if (p.intelligence?.profileSummary) {
        parts.push(p.intelligence.profileSummary);
    }

    // Rich detail for important stakeholders
    if (isHighImportance) {
        if (p.communicationStyle) parts.push(`Communication style: ${p.communicationStyle}`);
        if (p.intelligence?.successPatterns?.length) {
            parts.push(`What works with them: ${p.intelligence.successPatterns.slice(0, 2).join('. ')}`);
        }
        if (p.intelligence?.objectionPatterns?.length) {
            parts.push(`Watch out for: ${p.intelligence.objectionPatterns.slice(0, 2).join('. ')}`);
        }
    }

    if (p.intelligence?.recentTopics?.length) {
        parts.push(`Recent topics: ${p.intelligence.recentTopics.slice(0, 3).join(', ')}`);
    }

    return parts.join('. ') + '.';
}

/**
 * Check schedule for a specific date or query.
 */
async function toolCheckSchedule(userId: string, date?: string, query?: string): Promise<string> {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: startOfDay, lte: endOfDay },
            status: { not: 'cancelled' },
            ...(query ? {
                OR: [
                    { title: { contains: query, mode: 'insensitive' as const } },
                    { participants: { has: query } },
                ],
            } : {}),
        },
        select: {
            title: true,
            startTime: true,
            endTime: true,
            participants: true,
            meetingCategory: true,
            description: true,
        },
        orderBy: { startTime: 'asc' },
        take: 10,
    });

    if (meetings.length === 0) {
        const dateStr = date ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'today';
        return query ? `No meetings matching "${query}" on ${dateStr}.` : `Calendar is clear on ${dateStr}.`;
    }

    return meetings.map(m => {
        const time = m.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const participants = Array.isArray(m.participants) ? (m.participants as string[]).length : 0;
        return `${time}: ${m.title}${participants ? ` (${participants} people)` : ''}`;
    }).join('. ');
}

/**
 * Save a commitment the user makes during the call.
 */
/**
 * Save voice-based call feedback from the user during the call.
 * Mira asks for feedback at the end, then calls mira_action with intent "save feedback: ..."
 */
async function toolSaveCallFeedback(userId: string, rawFeedback: string): Promise<string> {
    // Extract the actual feedback text
    const feedbackText = rawFeedback
        .replace(/^save\s+feedback[:\s]*/i, '')
        .replace(/^feedback[:\s]*/i, '')
        .replace(/^user\s+(says|said|thinks|feels)[:\s]*/i, '')
        .trim();

    if (!feedbackText) return 'Got it, thanks for the feedback.';

    // Find the current in-progress voice call for this user
    const currentCall = await prisma.voiceCall.findFirst({
        where: { userId, status: { in: ['in-progress', 'ringing', 'forwarding'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, callType: true },
    });

    // Parse sentiment signals from the feedback
    const lower = feedbackText.toLowerCase();
    const isPositive = /\b(helpful|great|good|love|useful|valuable|exactly|perfect|keep\s+doing)\b/.test(lower);
    const isNegative = /\b(not\s+helpful|waste|bad|boring|stop|don't|skip|less|too\s+(?:long|short|generic|vague))\b/.test(lower);
    const tooLong = /\b(too\s+long|shorter|less\s+time|briefer)\b/.test(lower);
    const tooShort = /\b(too\s+short|longer|more\s+time|more\s+depth)\b/.test(lower);
    const wasRelevant = isPositive && !isNegative ? true : isNegative ? false : null;

    // Infer rating: positive = 4-5, negative = 1-2, neutral = 3
    const rating = isPositive ? (lower.includes('great') || lower.includes('love') || lower.includes('perfect') ? 5 : 4)
        : isNegative ? (lower.includes('waste') || lower.includes('bad') ? 1 : 2)
        : 3;

    // Don't overwrite manual in-app feedback
    if (currentCall?.id) {
        const existingManual = await prisma.callFeedback.findFirst({
            where: { voiceCallId: currentCall.id, userId, feedbackSource: 'in_app' },
            select: { id: true },
        });
        if (existingManual) {
            return 'Got it, thanks for the feedback. I\'ll keep that in mind.';
        }
    }

    // Find or create voice feedback record
    const existingVoice = currentCall?.id ? await prisma.callFeedback.findFirst({
        where: { voiceCallId: currentCall.id, userId, feedbackSource: 'voice' },
        select: { id: true },
    }) : null;

    if (existingVoice) {
        await prisma.callFeedback.update({
            where: { id: existingVoice.id },
            data: { rating, tooLong: tooLong || null, tooShort: tooShort || null, wasRelevant, verbatimFeedback: feedbackText },
        });
    } else {
        await prisma.callFeedback.create({
            data: {
                userId,
                voiceCallId: currentCall?.id || null,
                callType: currentCall?.callType || 'unknown',
                feedbackSource: 'voice',
                rating,
                tooLong: tooLong || null,
                tooShort: tooShort || null,
                wasRelevant,
                verbatimFeedback: feedbackText,
            },
        });
    }

    console.log(`[Voice Feedback] User ${userId.substring(0, 8)}: rating=${rating}, feedback="${feedbackText.substring(0, 100)}"`);

    return 'Got it, thanks for the feedback. I\'ll keep that in mind.';
}

async function toolSaveCommitment(userId: string, commitment: string, person?: string): Promise<string> {
    if (!commitment) return 'What commitment should I track?';

    // Save to CoachingRelationshipPlan.commitments
    const plan = await prisma.coachingRelationshipPlan.findUnique({
        where: { userId },
    });

    const newCommitment = {
        commitment,
        person: person || null,
        madeAt: new Date().toISOString(),
        status: 'open',
        source: 'mid_call',
    };

    if (plan) {
        const existing = (plan.commitments as unknown[] || []) as Record<string, unknown>[];
        existing.push(newCommitment);
        await prisma.coachingRelationshipPlan.update({
            where: { userId },
            data: { commitments: existing as unknown as string },
        });
    } else {
        await prisma.coachingRelationshipPlan.create({
            data: {
                userId,
                phase: 'discovery',
                commitments: [newCommitment] as unknown as string,
            },
        });
    }

    return person
        ? `Got it — I'll track "${commitment}" with ${person} and follow up.`
        : `Got it — I'll track "${commitment}" and follow up.`;
}

/**
 * Look up important dates (birthdays, anniversaries, milestones) for a person.
 * Importance-aware: prioritizes boss/manager/high-power stakeholders.
 */
async function toolLookupImportantDates(userId: string, name?: string): Promise<string> {
    // Search knowledge graph for date-related facts
    const datePredicates = ['birthday', 'anniversary', 'important_date', 'milestone', 'has_birthday', 'born_on'];

    const whereClause: Record<string, unknown> = {
        userId,
        predicate: { in: datePredicates },
        validTo: null,
    };

    if (name) {
        // Find entity first
        const entities = await prisma.knowledgeEntity.findMany({
            where: {
                userId,
                name: { contains: name, mode: 'insensitive' },
                type: 'PERSON',
            },
            take: 3,
        });

        if (entities.length === 0) {
            return `I don't have any important dates for "${name}" yet. If you tell me, I'll remember.`;
        }

        whereClause.subjectId = { in: entities.map(e => e.id) };
    }

    const facts = await prisma.knowledgeFact.findMany({
        where: whereClause,
        include: {
            subject: { select: { name: true } },
        },
        take: 10,
    });

    if (facts.length === 0) {
        return name
            ? `I don't have any important dates for "${name}" yet. Tell me and I'll keep track.`
            : "I don't have any important dates recorded yet. Share them with me and I'll remember.";
    }

    // Check importance — cross-reference with stakeholder profiles
    const enriched = await Promise.all(facts.map(async (f) => {
        const profile = await prisma.stakeholderProfile.findFirst({
            where: { userId, name: { contains: f.subject.name, mode: 'insensitive' } },
            select: { powerLevel: true, influenceRole: true, interactionCount: true },
        });
        const importance = (profile?.powerLevel === 'HIGH' || profile?.powerLevel === 'CRITICAL')
            ? 'high'
            : (profile?.interactionCount && profile.interactionCount >= 5) ? 'medium' : 'low';
        return { name: f.subject.name, date: f.objectValue, predicate: f.predicate, importance };
    }));

    // Sort by importance
    const sorted = enriched.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.importance] || 2) - (order[b.importance] || 2);
    });

    return sorted.map(d =>
        `${d.name}: ${d.predicate.replace(/_/g, ' ')} — ${d.date || 'date not recorded'}${d.importance === 'high' ? ' (important)' : ''}`
    ).join('. ');
}

/**
 * Extend the conversation when the user wants more.
 * Pulls from: unfinished onboarding topics, personal threads, coaching themes,
 * stakeholder dynamics, upcoming meetings, and observations not yet surfaced.
 */
async function toolExtendConversation(
    userId: string,
    coveredContext?: string,
    mood?: string,
): Promise<string> {
    const suggestions: { priority: number; text: string }[] = [];
    const covered = (coveredContext || '').toLowerCase();

    // 1. Coaching themes / relationship plan insights
    const plan = await prisma.coachingRelationshipPlan.findUnique({
        where: { userId },
    });

    if (plan) {
        const themes = (plan.coachingThemes as { theme: string; status: string }[] || [])
            .filter(t => t.status === 'active');
        for (const t of themes) {
            if (!covered.includes(t.theme.toLowerCase())) {
                suggestions.push({
                    priority: mood === 'deeper' ? 1 : 3,
                    text: `Coaching theme to explore: "${t.theme}" — this has come up across multiple calls.`,
                });
            }
        }

        // Commitments not yet discussed
        const commitments = (plan.commitments as { commitment: string; status: string; person?: string }[] || [])
            .filter(c => c.status === 'open' && !covered.includes(c.commitment.toLowerCase()));
        if (commitments.length > 0) {
            const c = commitments[0];
            suggestions.push({
                priority: 2,
                text: `Open commitment: "${c.commitment}"${c.person ? ` with ${c.person}` : ''}. Check in on progress.`,
            });
        }
    }

    // 2. Personal threads (for 'personal' or 'lighter' mood)
    if (mood === 'personal' || mood === 'lighter' || !mood) {
        const threads = await prisma.personalThread.findMany({
            where: { userId, offLimits: false },
            orderBy: { lastTouched: 'asc' },
            take: 3,
        });

        for (const t of threads) {
            if (!covered.includes(t.topic.toLowerCase())) {
                suggestions.push({
                    priority: mood === 'personal' ? 1 : 4,
                    text: `Personal topic: "${t.topic}" (${t.category.toLowerCase()}) — last touched ${t.lastTouched ? formatDaysAgo(t.lastTouched) : 'a while ago'}. Ask a warm follow-up.`,
                });
            }
        }
    }

    // 3. Onboarding topics still uncovered
    const onboarding = await prisma.onboardingProgress.findUnique({
        where: { userId },
    });
    if (onboarding && !onboarding.onboardingComplete) {
        const topicMap: Record<string, boolean> = {
            'their personal story and journey': onboarding.coveredStory,
            'drives, values, and what motivates them': onboarding.coveredDrivesAndValues,
            'life outside work — family, interests, what recharges them': onboarding.coveredLife,
            'role, scope, and responsibilities': onboarding.coveredRole,
            'key stakeholders and relationships': onboarding.coveredStakeholders,
            'leadership and decision-making style': onboarding.coveredLeadershipStyle,
            'goals and what success looks like': onboarding.coveredGoals,
            'challenges and frustrations': onboarding.coveredChallenges,
            'growth edges and what they want to improve': onboarding.coveredGrowth,
        };
        const uncovered = Object.entries(topicMap)
            .filter(([, done]) => !done)
            .map(([topic]) => topic)
            .filter(t => !covered.includes(t.toLowerCase()));
        if (uncovered.length > 0) {
            suggestions.push({
                priority: 3,
                text: `Onboarding topic not yet covered: "${uncovered[0]}". Weave it in naturally.`,
            });
        }
    }

    // 4. Stakeholder dynamics worth exploring
    if (mood === 'deeper' || mood === 'challenging') {
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId, interactionCount: { gte: 5 } },
            orderBy: { interactionCount: 'desc' },
            select: { name: true, influenceRole: true, powerLevel: true },
            take: 5,
        });

        const unexplored = stakeholders.filter(s => !covered.includes(s.name.toLowerCase()));
        if (unexplored.length > 0) {
            const s = unexplored[0];
            suggestions.push({
                priority: mood === 'challenging' ? 1 : 3,
                text: `Stakeholder dynamic worth exploring: ${s.name} (${s.powerLevel?.toLowerCase() || 'unknown'} power, ${s.influenceRole?.toLowerCase() || 'unknown'} influence). Ask about how that relationship is evolving.`,
            });
        }
    }

    // 5. Tomorrow's schedule preview
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const tomorrowMeetings = await prisma.meetingSyncRecord.count({
        where: { userId, startTime: { gte: tomorrow, lte: tomorrowEnd }, status: { not: 'cancelled' } },
    });

    if (tomorrowMeetings > 0 && !covered.includes('tomorrow')) {
        suggestions.push({
            priority: 4,
            text: `Tomorrow has ${tomorrowMeetings} meeting${tomorrowMeetings > 1 ? 's' : ''}. Offer a quick preview: "Want a heads-up on tomorrow?"`,
        });
    }

    // 6. Pattern observation from recent evaluations
    if (mood === 'challenging' || mood === 'deeper') {
        const recentEvals = await prisma.callEvaluation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { whatToImprove: true, recommendedTopics: true },
        });

        const improvements = recentEvals
            .flatMap(e => e.whatToImprove || [])
            .filter(i => !covered.includes(i.toLowerCase()));
        if (improvements.length > 0) {
            suggestions.push({
                priority: mood === 'challenging' ? 1 : 3,
                text: `Pattern to surface: "${improvements[0]}". Frame as an observation, not criticism.`,
            });
        }
    }

    if (suggestions.length === 0) {
        return 'No additional topics available. You can ask the user what\'s on their mind, or share a genuine observation about their growth trajectory.';
    }

    // Sort by priority, return top 3
    suggestions.sort((a, b) => a.priority - b.priority);
    return suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s.text}`).join('\n');
}

function formatDaysAgo(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
}

/**
 * Web lookup — searches the web for current information.
 * Uses Gemini (platform key) which has built-in Google Search grounding.
 * Falls back to OpenAI for general knowledge if Gemini unavailable.
 */
async function toolWebLookup(query: string): Promise<string> {
    if (!query) return 'What would you like me to look up?';

    // Try Gemini with Google Search grounding first
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Answer this briefly (2-3 sentences max, conversational tone, as if telling a friend): ${query}` }] }],
                        tools: [{ googleSearch: {} }],
                    }),
                },
            );

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            }
        } catch (error) {
            console.error('[Web Lookup] Gemini error:', error);
        }
    }

    // Fallback to OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant. Give brief, conversational answers (2-3 sentences max). You are providing information for a voice call, so keep it natural and spoken-friendly.' },
                        { role: 'user', content: query },
                    ],
                    max_tokens: 200,
                    temperature: 0.7,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                return data.choices?.[0]?.message?.content || 'I couldn\'t find anything on that right now.';
            }
        } catch (error) {
            console.error('[Web Lookup] OpenAI error:', error);
        }
    }

    return 'I\'m not able to look that up right now. Ask me again later and I\'ll have it.';
}

/**
 * Detect "call me later" patterns in user messages and schedule a callback.
 */
async function detectCallbackRequest(userId: string, userMessages: string, vapiCallId?: string) {
    if (!userMessages) return;

    const callLaterPatterns = [
        /call me later/i,
        /call me back/i,
        /call back/i,
        /not a good time/i,
        /i'm busy/i,
        /im busy/i,
        /try me at/i,
        /ring me at/i,
        /call me at/i,
    ];

    const isCallbackRequest = callLaterPatterns.some(p => p.test(userMessages));
    if (!isCallbackRequest) return;

    // Try to extract a time from the request
    const callbackTime = parseCallbackTime(userMessages, userId);

    try {
        const scheduledFor = callbackTime || new Date(Date.now() + 60 * 60 * 1000); // Default: +1 hour

        await prisma.scheduledCall.create({
            data: {
                userId,
                callType: 'callback',
                scheduledFor,
                status: 'pending',
                agenda: { userRequest: 'User asked to be called back' },
                callbackTime: scheduledFor,
            },
        });

        // Update the original ScheduledCall's outcome if we can find it
        if (vapiCallId) {
            const voiceCall = await prisma.voiceCall.findUnique({
                where: { vapiCallId },
                select: { id: true },
            });
            if (voiceCall) {
                await prisma.scheduledCall.updateMany({
                    where: { userId, voiceCallId: voiceCall.id },
                    data: { outcome: 'call_later', callbackTime: scheduledFor },
                });
            }
        }

        console.log(`[Vapi Webhook] Scheduled callback for user ${userId} at ${scheduledFor.toISOString()}`);
    } catch (err) {
        console.error('[Vapi Webhook] Failed to schedule callback:', err);
    }
}

/**
 * Parse natural language time references into a Date.
 * Handles: "at 3", "at 4:30", "at 2pm", "in an hour", "in 30 minutes", "after lunch"
 */
function parseCallbackTime(text: string, _userId: string): Date | null {
    const now = new Date();

    // "in X hour(s)" / "in X minute(s)"
    const inDurationMatch = text.match(/in\s+(\d+)\s*(hour|minute|min|hr)s?/i);
    if (inDurationMatch) {
        const amount = parseInt(inDurationMatch[1], 10);
        const unit = inDurationMatch[2].toLowerCase();
        const ms = unit.startsWith('h') ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
        return new Date(now.getTime() + ms);
    }

    // "in half an hour" / "in half hour"
    if (/in\s+half\s+(an?\s+)?hour/i.test(text)) {
        return new Date(now.getTime() + 30 * 60 * 1000);
    }

    // "at 3", "at 3:30", "at 3pm", "at 3:30 pm"
    const atTimeMatch = text.match(/(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (atTimeMatch) {
        let hour = parseInt(atTimeMatch[1], 10);
        const minute = atTimeMatch[2] ? parseInt(atTimeMatch[2], 10) : 0;
        const meridiem = atTimeMatch[3]?.toLowerCase();

        if (meridiem === 'pm' && hour < 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;

        // If no am/pm specified, assume the next occurrence of that hour
        if (!meridiem && hour < 12) {
            // If hour has passed in the morning, assume PM
            const currentHour = now.getHours();
            if (hour <= currentHour) hour += 12;
        }

        const result = new Date(now);
        result.setHours(hour, minute, 0, 0);
        // If the time is in the past, push to next day
        if (result.getTime() < now.getTime()) {
            result.setDate(result.getDate() + 1);
        }
        return result;
    }

    // "after lunch" → ~13:00
    if (/after lunch/i.test(text)) {
        const result = new Date(now);
        result.setHours(13, 0, 0, 0);
        if (result.getTime() < now.getTime()) {
            result.setDate(result.getDate() + 1);
        }
        return result;
    }

    // "this evening" / "tonight" → ~18:00
    if (/this evening|tonight/i.test(text)) {
        const result = new Date(now);
        result.setHours(18, 0, 0, 0);
        if (result.getTime() < now.getTime()) {
            result.setDate(result.getDate() + 1);
        }
        return result;
    }

    // "tomorrow" → same time tomorrow, or 9am if before 9
    if (/tomorrow/i.test(text)) {
        const result = new Date(now);
        result.setDate(result.getDate() + 1);
        // Check if there's a time after "tomorrow"
        const tomorrowTimeMatch = text.match(/tomorrow\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (tomorrowTimeMatch) {
            let h = parseInt(tomorrowTimeMatch[1], 10);
            const m = tomorrowTimeMatch[2] ? parseInt(tomorrowTimeMatch[2], 10) : 0;
            const mer = tomorrowTimeMatch[3]?.toLowerCase();
            if (mer === 'pm' && h < 12) h += 12;
            if (mer === 'am' && h === 12) h = 0;
            result.setHours(h, m, 0, 0);
        } else {
            result.setHours(9, 0, 0, 0);
        }
        return result;
    }

    return null; // Couldn't parse — caller will default to +1 hour
}

/**
 * Detect no-answer / unanswered calls and schedule retries.
 */
async function detectNoAnswer(
    userId: string,
    durationSeconds: number,
    endedReason?: string,
    vapiCallId?: string,
) {
    const isNoAnswer =
        durationSeconds < 10 ||
        endedReason === 'no-answer' ||
        endedReason === 'busy' ||
        endedReason === 'machine-detected';

    if (!isNoAnswer) return;

    try {
        // Find the ScheduledCall that triggered this call
        let originalScheduledCall = null;
        if (vapiCallId) {
            const voiceCall = await prisma.voiceCall.findUnique({
                where: { vapiCallId },
                select: { id: true },
            });
            if (voiceCall) {
                originalScheduledCall = await prisma.scheduledCall.findFirst({
                    where: { userId, voiceCallId: voiceCall.id },
                });
            }
        }

        // If we couldn't find by voiceCallId, find the most recent pending/calling ScheduledCall
        if (!originalScheduledCall) {
            originalScheduledCall = await prisma.scheduledCall.findFirst({
                where: { userId, status: { in: ['pending', 'calling'] } },
                orderBy: { scheduledFor: 'desc' },
            });
        }

        if (originalScheduledCall) {
            // Update the original call's outcome
            await prisma.scheduledCall.update({
                where: { id: originalScheduledCall.id },
                data: { outcome: 'no_answer', status: 'completed' },
            });

            // Check if retries are available
            const prefs = await prisma.userPreferences.findUnique({
                where: { userId },
                select: { dailyCallMaxRetries: true, dailyCallRetryAfterMin: true },
            });

            const maxRetries = prefs?.dailyCallMaxRetries ?? 1;
            const retryAfterMin = prefs?.dailyCallRetryAfterMin ?? 60;

            if (originalScheduledCall.retryCount < maxRetries) {
                await prisma.scheduledCall.create({
                    data: {
                        userId,
                        callType: originalScheduledCall.callType,
                        scheduledFor: new Date(Date.now() + retryAfterMin * 60 * 1000),
                        status: 'pending',
                        retryOf: originalScheduledCall.id,
                        retryCount: originalScheduledCall.retryCount + 1,
                        agenda: originalScheduledCall.agenda as object || undefined,
                    },
                });
                console.log(`[Vapi Webhook] Scheduled retry ${originalScheduledCall.retryCount + 1}/${maxRetries} for user ${userId}`);
            } else {
                console.log(`[Vapi Webhook] Max retries reached for user ${userId}, not scheduling retry`);
            }
        }
    } catch (err) {
        console.error('[Vapi Webhook] Failed to handle no-answer:', err);
    }
}

/**
 * Detect onboarding topics covered using LLM analysis of transcript.
 * Updates the OnboardingProgress model with which topics were discussed.
 */
async function detectOnboardingTopics(userId: string, userMessages: string, durationSeconds: number) {
    if (!userMessages || durationSeconds < 30) return;

    // Skip if onboarding already complete
    const existing = await prisma.onboardingProgress.findUnique({ where: { userId } });
    if (existing?.onboardingComplete) return;

    try {
        const config = await getUserLLMConfig(userId);
        const provider = createProvider(config);

        const prompt = `Analyze this voice call transcript from a user talking to their AI executive coach.
Determine which onboarding topics the USER meaningfully discussed (not just mentioned in passing — they shared real, personal information).

LAYER 1 — THE PERSON:
- story: Did they share how they got to where they are, their career journey, what shaped them as a leader?
- drives_and_values: Did they reveal what motivates them, what they care about deeply, personal values or beliefs?
- life: Did they share anything about family, personal interests, hobbies, what they do outside work, what gives them energy?

LAYER 2 — THE LEADER:
- role: Did they discuss their responsibilities, scope, what they own, their job title?
- stakeholders: Did they mention key people they work with, reporting lines, team members, allies, or blockers?
- leadership_style: Did they reveal how they make decisions, communicate, handle conflict, or their work preferences?

LAYER 3 — THE AMBITION:
- goals: Did they discuss what success looks like, KPIs, objectives, aspirations?
- challenges: Did they discuss current difficulties, blockers, frustrations, what keeps them up at night?
- growth: Did they share what they want to get better at, skills they're developing, learning edges?

USER'S WORDS:
${userMessages}

Respond ONLY with a JSON object mapping topic keys to boolean values.
Example: {"story": false, "drives_and_values": true, "life": false, "role": true, "stakeholders": true, "leadership_style": false, "goals": false, "challenges": false, "growth": false}`;

        const result = await provider.generateText(prompt);

        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) {
            console.error('[Vapi Webhook] Onboarding LLM returned no JSON:', result.substring(0, 200));
            return;
        }

        const covered = JSON.parse(jsonMatch[0]) as Record<string, boolean>;

        // Only update fields that are newly detected (don't set false on already-true fields)
        const updates: Record<string, boolean> = {};
        // Layer 1: The Person
        if (covered.story) updates.coveredStory = true;
        if (covered.drives_and_values) updates.coveredDrivesAndValues = true;
        if (covered.life) updates.coveredLife = true;
        // Layer 2: The Leader
        if (covered.role) updates.coveredRole = true;
        if (covered.stakeholders) updates.coveredStakeholders = true;
        if (covered.leadership_style) updates.coveredLeadershipStyle = true;
        // Layer 3: The Ambition
        if (covered.goals) updates.coveredGoals = true;
        if (covered.challenges) updates.coveredChallenges = true;
        if (covered.growth) updates.coveredGrowth = true;

        if (Object.keys(updates).length === 0) return;

        const progress = await prisma.onboardingProgress.upsert({
            where: { userId },
            create: {
                userId,
                ...updates,
                totalOnboardingCalls: 1,
                lastOnboardingCallAt: new Date(),
            },
            update: {
                ...updates,
                totalOnboardingCalls: { increment: 1 },
                lastOnboardingCallAt: new Date(),
            },
        });

        // Check if all 9 topics are now covered
        const allCovered =
            progress.coveredStory && progress.coveredDrivesAndValues && progress.coveredLife &&
            progress.coveredRole && progress.coveredStakeholders && progress.coveredLeadershipStyle &&
            progress.coveredGoals && progress.coveredChallenges && progress.coveredGrowth;

        if (allCovered && !progress.onboardingComplete) {
            await prisma.onboardingProgress.update({
                where: { userId },
                data: { onboardingComplete: true },
            });
            console.log(`[Vapi Webhook] Onboarding complete for user ${userId} — all 9 topics covered`);
        }

        console.log(`[Vapi Webhook] Onboarding topics detected for ${userId}: ${Object.keys(updates).join(', ')}`);
    } catch (err) {
        console.error('[Vapi Webhook] Failed to detect onboarding topics:', err);
    }
}

function formatCallType(type: string): string {
    const labels: Record<string, string> = {
        pre_meeting_prep: 'Pre-meeting prep',
        post_meeting_debrief: 'Post-meeting debrief',
        morning_brief: 'Morning brief',
        weekly_reflection: 'Weekly reflection',
        commitment_reminder: 'Follow-up check',
        friday_ritual: 'Friday wind-down',
        the_walk: 'Thinking session',
        voice_memo: 'Voice memo',
        onboarding: 'Onboarding',
        general: 'Coaching call',
    };
    return labels[type] || type;
}

function formatDuration(seconds: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Extract personal thread topics from transcript and create/advance PersonalThread records.
 */
async function extractAndUpdateThreadsFromWebhook(userId: string, transcript: string, voiceCallId: string) {
    if (!transcript || transcript.length < 100) return;

    try {
        const config = await getUserLLMConfig(userId);
        const provider = createProvider(config);

        const result = await provider.generateText(
            `Given this voice call transcript, extract any PERSONAL topics discussed (family, health, hobbies, career history, aspirations, emotions). Do NOT include work/meeting content.

For each personal topic found, return:
- category: FAMILY | HEALTH | HOBBY | ORIGIN | ASPIRATION | EMOTIONAL | INTEGRATED
- topic: short description (e.g., "tennis", "daughter's recital")
- newDetails: any new information learned
- userEngagement: LOW (one-word answer) | MEDIUM (a sentence or two) | HIGH (told a story or elaborated)
- isIntegrated: true if the personal topic was intertwined with work context

If no personal topics were discussed, return an empty array.
Return JSON array only.

TRANSCRIPT:
${transcript.substring(0, 4000)}`
        );

        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return;

        const topics = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(topics)) return;

        for (const topic of topics) {
            const existing = await prisma.personalThread.findFirst({
                where: { userId, topic: { contains: topic.topic?.substring(0, 20) || '' }, offLimits: false },
            });

            if (existing) {
                const progression: Record<string, string> = {
                    PLANTED: 'WATERED', WATERED: 'GROWING', GROWING: 'HARVESTED',
                    HARVESTED: 'MAINTAINED', MAINTAINED: 'MAINTAINED',
                };
                const mergedDetails = {
                    ...(existing.details as Record<string, unknown> || {}),
                    ...(topic.newDetails ? { [`call_${voiceCallId}`]: topic.newDetails } : {}),
                };
                await prisma.personalThread.update({
                    where: { id: existing.id },
                    data: {
                        stage: progression[existing.stage] || existing.stage,
                        lastTouched: new Date(),
                        touchCount: { increment: 1 },
                        userEngagement: topic.userEngagement || existing.userEngagement,
                        details: mergedDetails,
                        isIntegrated: topic.isIntegrated || existing.isIntegrated,
                    },
                });
            } else if (topic.userEngagement !== 'LOW' && topic.topic) {
                await prisma.personalThread.create({
                    data: {
                        userId,
                        category: topic.category || 'HOBBY',
                        topic: topic.topic,
                        stage: 'PLANTED',
                        userEngagement: topic.userEngagement || 'MEDIUM',
                        details: topic.newDetails ? { initial: topic.newDetails } : undefined,
                        isIntegrated: topic.isIntegrated || false,
                    },
                });
            }
        }
        console.log(`[Vapi Webhook] Thread extraction: ${topics.length} topics for ${userId}`);
    } catch (err) {
        console.error('[Vapi Webhook] Thread extraction error:', err);
    }
}

/**
 * Extract adaptation signals from early calls (1-5) to detect user behavioral patterns.
 */
async function extractAndUpdateAdaptationSignals(
    userId: string, transcript: string, durationSeconds: number, callCount: number,
) {
    if (callCount > 5) return;

    try {
        const prefs = await prisma.userPreferences.findUnique({
            where: { userId },
            select: { adaptationSignals: true },
        });

        const current = (prefs?.adaptationSignals as Record<string, unknown> | null) || {
            modeLean: 'balanced', precision: false, peopleHungry: false,
            personalOpen: false, frameworkSeeker: false, followMode: false, integratedLife: false,
        };

        // Duration-based mode lean
        if (durationSeconds < 180) {
            current.modeLean = 'work_first';
        } else if (durationSeconds > 420) {
            current.modeLean = 'relationship_first';
        }

        const config = await getUserLLMConfig(userId);
        const provider = createProvider(config);

        const result = await provider.generateText(
            `Analyze this voice call transcript between Mira (AI coach) and the user. Detect these behavioral signals:

1. precision: Did the user correct Mira or test accuracy? (true/false)
2. peopleHungry: Did the user ask about stakeholder dynamics proactively? (true/false)
3. personalOpen: Did the user share personal context unprompted? (true/false)
4. frameworkSeeker: Did the user ask for specific scripts or templates? (true/false)
5. followMode: Did the user lead the conversation or go on tangents? (true/false)
6. integratedLife: Did the user mention family/personal in work context? (true/false)

Return JSON only: { precision: bool, peopleHungry: bool, personalOpen: bool, frameworkSeeker: bool, followMode: bool, integratedLife: bool }

TRANSCRIPT:
${transcript.substring(0, 3000)}`
        );

        const jsonMatch = result.match(/\{[^}]+\}/);
        if (!jsonMatch) return;

        const signals = JSON.parse(jsonMatch[0]);
        // Signals are additive — once true, stay true
        if (signals.precision) current.precision = true;
        if (signals.peopleHungry) current.peopleHungry = true;
        if (signals.personalOpen) current.personalOpen = true;
        if (signals.frameworkSeeker) current.frameworkSeeker = true;
        if (signals.followMode) current.followMode = true;
        if (signals.integratedLife) current.integratedLife = true;

        if (current.personalOpen || current.integratedLife) {
            current.modeLean = 'relationship_first';
        }

        await prisma.userPreferences.upsert({
            where: { userId },
            create: { userId, adaptationSignals: current as Record<string, unknown> },
            update: { adaptationSignals: current as Record<string, unknown> },
        });

        console.log(`[Vapi Webhook] Adaptation signals updated for ${userId}`);
    } catch (err) {
        console.error('[Vapi Webhook] Adaptation signal extraction error:', err);
    }
}

/**
 * Create auto-detected feedback signals from call data.
 * Does not overwrite manual (in_app) feedback if it already exists.
 */
async function createAutoFeedback(
    userId: string,
    callType: string,
    durationSeconds: number,
    messages?: { role: string; message: string; time: number }[],
    vapiCallId?: string,
    promptVersion?: string,
) {
    try {
        // Find the VoiceCall ID
        let voiceCallId: string | null = null;
        if (vapiCallId) {
            const vc = await prisma.voiceCall.findUnique({
                where: { vapiCallId },
                select: { id: true },
            });
            voiceCallId = vc?.id || null;
        }

        // Don't overwrite manual feedback
        if (voiceCallId) {
            const manualFeedback = await prisma.callFeedback.findFirst({
                where: { voiceCallId, userId, feedbackSource: 'in_app' },
                select: { id: true },
            });
            if (manualFeedback) return;
        }

        // Compute signals
        const userMessages = (messages || []).filter(m => m.role === 'user');
        const userMessageCount = userMessages.length;

        const userEngagement: string =
            userMessageCount <= 2 ? 'low' :
            userMessageCount <= 5 ? 'medium' : 'high';

        const callCompleted = durationSeconds > 30;

        const userInitiated = userMessages.some(m => m.message.includes('?'));

        // Upsert auto feedback (don't create duplicates)
        const existingAuto = voiceCallId ? await prisma.callFeedback.findFirst({
            where: { voiceCallId, userId, feedbackSource: 'auto' },
            select: { id: true },
        }) : null;

        if (existingAuto) {
            await prisma.callFeedback.update({
                where: { id: existingAuto.id },
                data: { userEngagement, callCompleted, userInitiated },
            });
        } else {
            await prisma.callFeedback.create({
                data: {
                    userId,
                    voiceCallId,
                    callType,
                    promptVersion: promptVersion || null,
                    feedbackSource: 'auto',
                    userEngagement,
                    callCompleted,
                    userInitiated,
                },
            });
        }
    } catch (err) {
        console.error('[Vapi Webhook] Failed to create auto feedback:', err);
    }
}

// ============================================================================
// PROPER NOUN CORRECTION — data-driven fuzzy matching against typed sources
// ============================================================================

/**
 * Build a dictionary of correctly-spelled proper nouns from TYPED sources
 * (email addresses, calendar attendees, Google contacts, stakeholder profiles).
 * These are ground truth — typed text, not speech recognition output.
 */
async function buildProperNounGlossary(userId: string): Promise<string[]> {
    const names = new Set<string>();

    // 1. User's own name & company (from Clerk / profile — typed)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, company: true },
    }).catch(() => null);

    if (user?.name) names.add(user.name);
    if (user?.company) names.add(user.company);

    // 2. Stakeholder profiles (names extracted from calendar/email — typed)
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        select: { name: true },
        take: 50,
    }).catch(() => []);
    for (const s of stakeholders) {
        if (s.name) names.add(s.name);
    }

    // 3. Knowledge entities (person/org — resolved from typed sources)
    const entities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: { in: ['person', 'organization'] } },
        select: { canonicalName: true, aliases: true },
        take: 50,
    }).catch(() => []);
    for (const e of entities) {
        if (e.canonicalName) names.add(e.canonicalName);
        const aliases = Array.isArray(e.aliases) ? e.aliases as string[] : [];
        for (const a of aliases) names.add(a);
    }

    // 4. Calendar attendee names (from Google Calendar API — typed)
    const recentMeetings = await prisma.meetingSyncRecord.findMany({
        where: { userId },
        orderBy: { startTime: 'desc' },
        take: 50,
        select: { attendees: true, participants: true },
    }).catch(() => []);
    for (const m of recentMeetings) {
        const attendees = Array.isArray(m.attendees) ? m.attendees as Record<string, string>[] : [];
        for (const a of attendees) {
            if (a.name && a.name.length > 1) names.add(a.name);
            // Extract name from email (john.smith@x.com → John Smith)
            if (a.email) {
                const emailName = extractNameFromEmail(a.email);
                if (emailName) names.add(emailName);
            }
        }
        const participants = Array.isArray(m.participants) ? m.participants as string[] : [];
        for (const p of participants) {
            if (p && p.length > 1 && !p.includes('@')) names.add(p);
        }
    }

    // 5. Email sender/recipient names (from email summaries — typed)
    const emails = await prisma.emailSummary.findMany({
        where: { userId },
        orderBy: { lastMessageAt: 'desc' },
        take: 30,
        select: { from: true },
    }).catch(() => []);
    for (const e of emails) {
        if (e.from) {
            // Parse "Name <email>" or just "email"
            const nameMatch = e.from.match(/^(.+?)\s*<.+>$/);
            if (nameMatch && nameMatch[1].trim().length > 1) {
                names.add(nameMatch[1].trim().replace(/["']/g, ''));
            } else if (!e.from.includes('@')) {
                names.add(e.from.trim());
            }
        }
    }

    // Filter out garbage and very short names
    return Array.from(names).filter(n => n.length > 1 && !/^\d+$/.test(n));
}

/**
 * Extract a likely name from an email address.
 * "karthik.naig@company.com" → "Karthik Naig"
 * "jsmith@x.com" → null (too ambiguous)
 */
function extractNameFromEmail(email: string): string | null {
    const local = email.split('@')[0];
    if (!local) return null;

    // Split on dots, hyphens, underscores
    const parts = local.split(/[._-]/).filter(p => p.length > 1);
    if (parts.length < 2) return null; // Need at least first.last

    // Capitalize each part
    return parts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Apply fuzzy corrections to a transcript using the name dictionary.
 *
 * For each capitalized word in the transcript that looks like a name
 * but doesn't match any known name exactly, we fuzzy-match against
 * the dictionary. If a close match is found (edit distance ≤ 2 and
 * phonetic similarity), we replace it.
 *
 * This catches: "Karthik Nigh" → "Karthik Naig" because "Naig" is
 * in the dictionary (from email karthik.naig@...) and "Nigh" is
 * edit distance 2 away.
 */
function applyGlossaryCorrections(text: string, knownNames: string[]): string {
    if (!text || knownNames.length === 0) return text;

    // Build a lookup of individual name parts → full name
    // e.g., "Naig" → "Naig", "Karthik" → "Karthik"
    const knownParts = new Map<string, string>(); // lowercase → correct casing
    for (const name of knownNames) {
        for (const part of name.split(/\s+/)) {
            if (part.length > 1) {
                knownParts.set(part.toLowerCase(), part);
            }
        }
    }

    // Find capitalized words in transcript that might be names
    // (starts with uppercase, or is part of a name-like sequence)
    let corrected = text;
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = [...text.matchAll(namePattern)];

    // Process in reverse order so replacements don't shift indices
    for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const phrase = match[0];
        const parts = phrase.split(/\s+/);

        let replaced = false;
        const correctedParts: string[] = [];

        for (const part of parts) {
            const lower = part.toLowerCase();

            // Already a known name — keep as is
            if (knownParts.has(lower)) {
                correctedParts.push(knownParts.get(lower)!);
                continue;
            }

            // Try fuzzy match against all known name parts
            let bestMatch: string | null = null;
            let bestDistance = Infinity;

            for (const [knownLower, knownCorrect] of knownParts) {
                // Only compare words of similar length (±2 chars)
                if (Math.abs(knownLower.length - lower.length) > 2) continue;

                const dist = levenshteinDistance(lower, knownLower);
                const maxLen = Math.max(lower.length, knownLower.length);
                const similarity = 1 - dist / maxLen;

                // Require edit distance ≤ 2 AND similarity > 0.6
                // Also check phonetic similarity (same first letter or similar consonant structure)
                if (dist <= 2 && similarity > 0.6 && dist < bestDistance) {
                    // Additional check: first letter should be same or phonetically close
                    if (arePhoneticallySimilarStart(lower, knownLower)) {
                        bestMatch = knownCorrect;
                        bestDistance = dist;
                    }
                }
            }

            if (bestMatch && bestDistance > 0) {
                correctedParts.push(bestMatch);
                replaced = true;
            } else {
                correctedParts.push(part);
            }
        }

        if (replaced) {
            const correctedPhrase = correctedParts.join(' ');
            const start = match.index!;
            corrected = corrected.substring(0, start) + correctedPhrase + corrected.substring(start + phrase.length);
        }
    }

    return corrected;
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }

    return dp[m][n];
}

/**
 * Check if two words start with phonetically similar sounds.
 * "Nigh" and "Naig" both start with 'n' — match.
 * "Kartik" and "Naig" — no match.
 *
 * Groups consonants that are commonly confused in speech recognition:
 * (b,p), (d,t), (g,k), (v,w,f), (s,z,sh), (j,ch,g)
 */
function arePhoneticallySimilarStart(a: string, b: string): boolean {
    if (!a || !b) return false;
    const fa = a[0].toLowerCase();
    const fb = b[0].toLowerCase();
    if (fa === fb) return true;

    const groups = [
        new Set(['b', 'p']),
        new Set(['d', 't']),
        new Set(['g', 'k']),
        new Set(['v', 'w', 'f']),
        new Set(['s', 'z']),
        new Set(['j', 'g']),
    ];

    return groups.some(g => g.has(fa) && g.has(fb));
}
