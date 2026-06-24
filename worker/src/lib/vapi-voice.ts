/**
 * Vapi Voice Call — Worker-side integration
 *
 * Uses persistent Vapi Assistants (created via dashboard/API) instead of
 * inline prompts. Dynamic context (user name, meetings, people intel) is
 * injected per call via assistantOverrides.variableValues.
 *
 * Prompt management lives in Langfuse (versioning, A/B testing, analytics).
 * Vapi handles conversation flow, memory within a call, and tool calling.
 */

import { prisma } from './prisma';
import { canDeliverNow } from './delivery-guard';
import { createTrace } from './langfuse';
import { getActivePromptTemplate, assemblePrompt, pickFirstMessage } from './prompt-service';
import { buildCallDirective } from '../agents/call-planning-agent';
import { selectThreadAction } from './thread-manager';
import { computeMaturityLevel } from './confidence-engine';
import { selectPosture, buildPostureConversationPlan, buildPostureOpener, PostureContext, PostureSelection } from './posture-engine';

const VAPI_API_BASE = 'https://api.vapi.ai';
// These are read at call time via getVoiceConfig() so env var changes take effect
const VOICERA_SERVER_URL = '';  // legacy — use getVoiceConfig()
const VOICERA_API_KEY = '';
const VOICERA_SDK_PATH = '';
const VOICE_PROVIDER = '';

/**
 * Resolve which call channel to use based on user category:
 * - internal     → web only (free WebRTC calls)
 * - premium_lead → vapi phone call (outbound, higher engagement)
 * - customer     → prefer web, fallback to phone if needed
 */
function resolveCallChannel(
    userCategory: string,
    phoneNumber: string | null | undefined,
): 'web_only' | 'phone_vapi' | 'phone_voicera' {
    switch (userCategory) {
        case 'internal':
            return 'web_only';
        case 'premium_lead':
            return 'phone_vapi';
        case 'customer':
        default:
            // Customers prefer web calls — phone only if explicitly needed
            // For now, use voicera for phone + web prompt as default
            if (phoneNumber) return 'phone_voicera';
            return 'web_only';
    }
}

function getVoiceConfig() {
    const provider = process.env.VOICE_PROVIDER || 'voicera';
    const serverUrl = process.env.VOICERA_SERVER_URL || 'https://voicera-voice.onrender.com';
    console.log(`[VoiceConfig] raw env VOICE_PROVIDER=${process.env.VOICE_PROVIDER} resolved=${provider} VOICERA_SERVER_URL=${process.env.VOICERA_SERVER_URL}`);
    return {
        serverUrl,
        apiKey: process.env.VOICERA_API_KEY || '',
        sdkPath: process.env.VOICERA_SDK_PATH || '',
        provider,
    };
}

type VoiceCallType =
    | 'pre_meeting_prep'
    | 'post_meeting_debrief'
    | 'morning_brief'
    | 'weekly_reflection'
    | 'commitment_reminder'
    | 'friday_ritual'
    | 'proactive_nudge'
    | 'onboarding'
    | 'daily_checkin'
    | 'general';

interface VoiceCallRequest {
    userId: string;
    callType: VoiceCallType;
    meetingId?: string;
    posture?: { primary: string; secondary?: string };
}

/**
 * Map call types to Vapi Assistant IDs (from env vars).
 * Each assistant is a persistent Vapi resource with its own prompt template,
 * voice config, and tool definitions. Created via Vapi dashboard or setup script.
 */
function getAssistantId(callType: VoiceCallType): string | null {
    // Primary assistants — most call types share the main Mira assistant
    // with different variableValues for context
    const assistantMap: Record<string, string | undefined> = {
        onboarding: process.env.VAPI_ASSISTANT_ONBOARDING,
        daily_checkin: process.env.VAPI_ASSISTANT_DAILY,
        morning_brief: process.env.VAPI_ASSISTANT_DAILY,
        pre_meeting_prep: process.env.VAPI_ASSISTANT_MEETING,
        post_meeting_debrief: process.env.VAPI_ASSISTANT_MEETING,
        friday_ritual: process.env.VAPI_ASSISTANT_DAILY,
        weekly_reflection: process.env.VAPI_ASSISTANT_DAILY,
        commitment_reminder: process.env.VAPI_ASSISTANT_DAILY,
        proactive_nudge: process.env.VAPI_ASSISTANT_DAILY,
        general: process.env.VAPI_ASSISTANT_DAILY,
    };

    return assistantMap[callType] || process.env.VAPI_ASSISTANT_DEFAULT || null;
}

/**
 * Check if a user prefers voice delivery and has a phone number configured.
 */
export async function shouldDeliverViaVoice(userId: string): Promise<boolean> {
    const [user, prefs] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { phoneNumber: true },
        }),
        prisma.userPreferences.findUnique({
            where: { userId },
            select: { preferredChannel: true },
        }),
    ]);

    return prefs?.preferredChannel === 'voice' && !!user?.phoneNumber;
}

/**
 * Trigger an outbound voice call via Vapi using a persistent Assistant.
 * Dynamic context is injected via variableValues.
 */
export async function triggerVoiceCall(request: VoiceCallRequest, boss?: unknown): Promise<boolean> {
    const { userId, callType, meetingId } = request;

    // Check delivery guard — respect DND, quiet weekends, max calls
    const deliveryCheck = await canDeliverNow(userId);
    if (!deliveryCheck.allowed) {
        console.log(`[Voice] Delivery blocked: ${deliveryCheck.reason}`);

        // If pg-boss instance provided and we have a next window, schedule for later
        if (boss && deliveryCheck.nextWindow) {
            const sendAfter = deliveryCheck.nextWindow;
            console.log(`[Voice] Deferring ${callType} call to ${sendAfter.toISOString()}`);
            const bossInstance = boss as { send: (queue: string, data: object, opts?: object) => Promise<void> };
            await bossInstance.send('proactive-agent', {
                userId,
                trigger: callType === 'morning_brief' ? 'MORNING_BRIEF' :
                    callType === 'pre_meeting_prep' ? 'PRE_MEETING_PREP' :
                    callType === 'post_meeting_debrief' ? 'POST_MEETING_REVIEW' :
                    'EXECUTION_NUDGE',
                context: meetingId ? { meetingId } : undefined,
            }, { sendAfter });
        }

        return false;
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phoneNumber: true, countryCode: true, jobTitle: true, company: true, subscription: { select: { userCategory: true } } },
    });

    // ── Call channel routing based on user category ──
    // internal team     → web calls only (push notification to open app)
    // premium leads     → Vapi phone call (outbound)
    // customers         → prefer web, phone if user has no recent web activity
    const userCategory = (user?.subscription as any)?.userCategory || 'customer';
    const callChannel = resolveCallChannel(userCategory, user?.phoneNumber);

    if (callChannel === 'web_only') {
        // Send push notification prompting user to open app for a web call
        console.log(`[Voice] ${userCategory} user — web call only, sending push notification`);
        try {
            const { publishMessage } = require('./pusher');
            await publishMessage(userId, {
                type: 'VOICE_CALL_PROMPT',
                callType,
                meetingId,
                message: callType === 'pre_meeting_prep'
                    ? 'Mira has prep notes for your upcoming meeting. Tap to talk.'
                    : callType === 'morning_brief'
                    ? 'Good morning! Mira has your daily brief ready. Tap to talk.'
                    : 'Mira wants to chat. Tap to talk.',
            });
        } catch (pushErr: any) {
            console.error(`[Voice] Push notification failed: ${pushErr.message}`);
        }
        return true; // "call" handled via push → web
    }

    if (!user?.phoneNumber) {
        console.warn(`[Voice] User ${userId} has no phone number and channel=${callChannel}, sending web prompt instead`);
        try {
            const { publishMessage } = require('./pusher');
            await publishMessage(userId, {
                type: 'VOICE_CALL_PROMPT',
                callType,
                meetingId,
                message: 'Mira wants to talk. Tap to start a call.',
            });
        } catch {}
        return true;
    }

    // Ensure E.164 format for Vapi (e.g., +918130024145)
    const defaultCode = user.countryCode || '+91';
    let phoneNumber = user.phoneNumber.replace(/[\s\-()]/g, '');
    if (!phoneNumber.startsWith('+')) {
        // Use user's country code (defaults to +91 India)
        if (phoneNumber.length === 10) {
            phoneNumber = defaultCode + phoneNumber;
        } else if (phoneNumber.startsWith('91') && phoneNumber.length === 12) {
            phoneNumber = '+' + phoneNumber;
        } else {
            phoneNumber = defaultCode + phoneNumber;
        }
    }

    const userName = user.name || 'there';

    // Read voice config at call time (not module load)
    const voiceConfig = getVoiceConfig();
    console.log(`[Voice] Provider: ${voiceConfig.provider}, Server: ${voiceConfig.serverUrl || 'none'}`);

    // Build dynamic context for variableValues
    const variableValues = await buildVariableValues(userId, userName, user.jobTitle, callType, meetingId);

    // Trace the call in Langfuse
    const trace = createTrace({
        name: `voice-call-${callType}`,
        userId,
        metadata: { callType, meetingId, provider: voiceConfig.provider },
    });

    try {
        // ================================================================
        // VOICERA SDK PATH — in-process Python, tool calling, zero latency
        // ================================================================
        if (voiceConfig.provider === 'voicera-sdk') {
            // Build full system prompt
            const templateName = callType === 'onboarding' ? 'voice-onboarding'
                : callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief' ? 'voice-meeting'
                : 'voice-general';

            const [template, sharedRules] = await Promise.all([
                getActivePromptTemplate(templateName, userId).catch(() => null),
                getActivePromptTemplate('shared-voice-rules', userId).catch(() => null),
            ]);

            let systemPrompt: string;
            if (template) {
                const vars = { ...variableValues, voiceRules: sharedRules ? assemblePrompt(sharedRules.content, variableValues) : '' };
                systemPrompt = assemblePrompt(template.content, vars);
            } else {
                systemPrompt = `You are Mira, an AI executive coach calling ${userName}.
Call type: ${callType}. Keep it conversational, 2-3 sentences max.
${variableValues.conversationPlan ? `\nConversation plan:\n${variableValues.conversationPlan}` : ''}
${variableValues.callDirective ? `\nCall directive:\n${variableValues.callDirective}` : ''}
${variableValues.meetingsSummary ? `\nToday's meetings:\n${variableValues.meetingsSummary}` : ''}
${variableValues.overdueCommitments ? `\nOverdue follow-ups:\n${variableValues.overdueCommitments}` : ''}
${variableValues.personalContext ? `\nPersonal context:\n${variableValues.personalContext}` : ''}
${variableValues.peopleIntel ? `\nPeople intelligence:\n${variableValues.peopleIntel}` : ''}`;
            }

            const callConfig = {
                userId,
                phone: phoneNumber,
                systemPrompt,
                variables: variableValues,
                greeting: variableValues.firstMessage || `Hey ${userName.split(' ')[0]}! It's Mira.`,
                maxDurationSeconds: 600,
                llm: {
                    provider: process.env.VOICERA_LLM_PROVIDER || 'gemini',
                    model: process.env.VOICERA_LLM_MODEL || 'gemini-2.5-flash',
                },
                stt: { provider: process.env.VOICERA_STT_PROVIDER || 'deepgram', language: 'English' },
                tts: {
                    provider: process.env.VOICERA_TTS_PROVIDER || 'openai',
                    args: process.env.VOICERA_TTS_PROVIDER === 'cartesia'
                        ? { voice_id: process.env.VOICERA_TTS_VOICE_ID || '95d51f79-c397-46f9-b49a-23763d3eaa2d' }
                        : { voice: process.env.VOICERA_TTS_VOICE || 'nova' },
                },
            };

            console.log(`[Voice] Using VoicERA SDK for ${callType} (posture=${variableValues.primaryPosture || 'none'})`);

            // Spawn Python process with voicera SDK
            const { spawn } = await import('child_process');
            const path = await import('path');

            const scriptPath = path.resolve(__dirname, '../../voice/make_call.py');
            const sdkPath = voiceConfig.sdkPath || '/Users/karthiknaig/Projects/karthikVoicEra';

            const result = await new Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>((resolve) => {
                const child = spawn('python3', [scriptPath], {
                    env: {
                        ...process.env,
                        CALL_CONFIG: JSON.stringify(callConfig),
                        VOICERA_SDK_PATH: sdkPath,
                    },
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: (callConfig.maxDurationSeconds + 60) * 1000,
                });

                let stdout = '';
                let stderr = '';

                child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
                child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

                child.on('close', (code: number | null) => {
                    // Extract result from stdout
                    const resultLine = stdout.split('\n').find(l => l.startsWith('VOICERA_RESULT:'));
                    if (resultLine) {
                        try {
                            const data = JSON.parse(resultLine.replace('VOICERA_RESULT:', ''));
                            resolve({ success: true, data });
                        } catch {
                            resolve({ success: false, error: `Failed to parse result: ${resultLine}` });
                        }
                    } else if (code !== 0) {
                        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
                    } else {
                        resolve({ success: false, error: 'No result from voice script' });
                    }
                });

                child.on('error', (err: Error) => {
                    resolve({ success: false, error: err.message });
                });
            });

            if (!result.success) {
                console.error(`[Voice] VoicERA SDK call failed: ${result.error}`);
                trace?.update({ output: { error: result.error, provider: 'voicera-sdk' } });
                return false;
            }

            const callResult = result.data!;
            console.log(`[Voice] ${callType} call completed via SDK: ${callResult.callId} (${callResult.durationSeconds}s)`);
            trace?.update({ output: { callId: callResult.callId, provider: 'voicera-sdk', duration: callResult.durationSeconds } });

            // Save VoiceCall record with transcript and sentVariables
            await prisma.voiceCall.create({
                data: {
                    userId,
                    vapiCallId: String(callResult.callId),
                    callType,
                    meetingId: meetingId || null,
                    status: 'ended',
                    durationSeconds: Number(callResult.durationSeconds) || null,
                    transcript: String(callResult.transcript || ''),
                    sentVariables: variableValues as object,
                    confidenceMode: variableValues.confidenceMode || null,
                    startedAt: callResult.startedAt ? new Date(String(callResult.startedAt)) : new Date(),
                    endedAt: callResult.endedAt ? new Date(String(callResult.endedAt)) : new Date(),
                },
            }).catch((err: Error) => {
                console.warn(`[Voice] Failed to save VoiceCall: ${err.message}`);
            });

            // Update relationship tracking
            await prisma.personalContext.upsert({
                where: { userId },
                create: { userId, callCount: 1, firstCallDate: new Date(), lastCallDate: new Date(), favoriteCallTypes: [callType] },
                update: { callCount: { increment: 1 }, lastCallDate: new Date() },
            }).catch(() => {});

            // Queue post-call analysis
            await prisma.$queryRaw`
                INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
                VALUES ('post-call-analysis', ${JSON.stringify({ voiceCallId: String(callResult.callId) })}::jsonb, 'created', 2, 0, 30, 300, now() + interval '30 seconds', now() + interval '1 day')
            `.catch(() => {});

            return true;
        }

        // ================================================================
        // VOICERA SERVER PATH — self-hosted Pipecat API, no Vapi
        // ================================================================
        if (voiceConfig.provider === 'voicera' && voiceConfig.serverUrl) {
            // Build full system prompt (same as inline assistant path)
            const templateName = callType === 'onboarding' ? 'voice-onboarding'
                : callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief' ? 'voice-meeting'
                : 'voice-general';

            const [template, sharedRules] = await Promise.all([
                getActivePromptTemplate(templateName, userId).catch(() => null),
                getActivePromptTemplate('shared-voice-rules', userId).catch(() => null),
            ]);

            let systemPrompt: string;
            if (template) {
                const vars = { ...variableValues, voiceRules: sharedRules ? assemblePrompt(sharedRules.content, variableValues) : '' };
                systemPrompt = assemblePrompt(template.content, vars);
            } else {
                // Hardcoded fallback
                systemPrompt = `You are Mira, an AI executive coach calling ${userName}.
Call type: ${callType}. Keep it conversational, 2-3 sentences max.
${variableValues.meetingsSummary ? `\nToday's meetings:\n${variableValues.meetingsSummary}` : ''}
${variableValues.overdueCommitments ? `\nOverdue follow-ups:\n${variableValues.overdueCommitments}` : ''}
${variableValues.conversationPlan ? `\nConversation plan:\n${variableValues.conversationPlan}` : ''}
${variableValues.callDirective ? `\nCall directive:\n${variableValues.callDirective}` : ''}
${variableValues.personalContext ? `\nPersonal context:\n${variableValues.personalContext}` : ''}
${variableValues.peopleIntel ? `\nPeople intelligence:\n${variableValues.peopleIntel}` : ''}`;
            }

            // Build transcriber keywords for Deepgram
            const transcriberKeywords = await buildTranscriberKeywords(userId, userName);

            const userPrefs = await prisma.userPreferences.findUnique({
                where: { userId },
                select: { testCallMaxDuration: true },
            }).catch(() => null);

            const voiceraPayload = {
                phone: phoneNumber,
                systemPrompt,
                variables: variableValues,
                greeting: variableValues.firstMessage || `Hey ${userName.split(' ')[0]}! It's Mira.`,
                webhookUrl: 'https://miracos.vercel.app/api/voicera/webhook',
                maxDurationSeconds: userPrefs?.testCallMaxDuration || 600,
                llm: {
                    provider: process.env.VOICERA_LLM_PROVIDER || 'openai',
                    model: process.env.VOICERA_LLM_MODEL || 'gpt-4o-mini',
                },
                stt: {
                    provider: 'deepgram',
                    language: 'English',
                    args: {
                        model: 'nova-2',
                        keywords: transcriberKeywords,
                    },
                },
                tts: {
                    provider: process.env.VOICERA_TTS_PROVIDER || 'openai',
                    args: process.env.VOICERA_TTS_PROVIDER === 'cartesia'
                        ? { voice_id: '95d51f79-c397-46f9-b49a-23763d3eaa2d' }
                        : { voice: process.env.VOICERA_TTS_VOICE || 'nova' },
                },
                metadata: { userId, callType, meetingId: meetingId || undefined },
            };

            console.log(`[Voice] Using VoicERA server at ${voiceConfig.serverUrl} for ${callType}`);

            const response = await fetch(`${voiceConfig.serverUrl}/call/outbound`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${voiceConfig.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(voiceraPayload),
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`[Voice] VoicERA API error: ${error}`);
                trace?.update({ output: { error } });
                return false;
            }

            const result = await response.json() as { callId?: string; success?: boolean };
            console.log(`[Voice] ${callType} call initiated via VoicERA: ${result.callId}`);
            trace?.update({ output: { callId: result.callId, provider: 'voicera' } });

            // Persist sentVariables so we can audit what Mira was told
            if (result.callId) {
                await prisma.voiceCall.create({
                    data: {
                        userId,
                        vapiCallId: result.callId,
                        callType,
                        meetingId: meetingId || null,
                        status: 'queued',
                        sentVariables: variableValues as object,
                        confidenceMode: variableValues.confidenceMode || null,
                    },
                }).catch((err: Error) => {
                    console.warn(`[Voice] Failed to persist sentVariables: ${err.message}`);
                });
            }

            // Update relationship tracking
            await prisma.personalContext.upsert({
                where: { userId },
                create: { userId, callCount: 1, firstCallDate: new Date(), lastCallDate: new Date(), favoriteCallTypes: [callType] },
                update: { callCount: { increment: 1 }, lastCallDate: new Date() },
            }).catch(() => { /* non-critical */ });

            return true;
        }

        // ================================================================
        // VAPI PATH — managed voice platform
        // ================================================================
        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey) {
            console.warn('[Voice] VAPI_API_KEY not configured, skipping voice call');
            return false;
        }

        const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
        if (!phoneNumberId) {
            console.warn('[Voice] VAPI_PHONE_NUMBER_ID not configured');
            return false;
        }

        const assistantId = getAssistantId(callType);
        let callPayload: Record<string, unknown>;

        if (assistantId) {
            // Build transcriber keywords for proper noun accuracy
            const transcriberKeywords = await buildTranscriberKeywords(userId, userName);

            // Check for per-user max duration override (e.g., 5-min test calls)
            const userPrefs = await prisma.userPreferences.findUnique({
                where: { userId },
                select: { testCallMaxDuration: true },
            }).catch(() => null);

            // Use persistent Vapi Assistant with dynamic context override
            callPayload = {
                assistantId,
                phoneNumberId,
                customer: { number: phoneNumber, name: userName },
                assistantOverrides: {
                    variableValues,
                    firstMessage: variableValues.firstMessage || `Hey ${userName.split(' ')[0]}! It's Mira.`,
                    serverUrl: 'https://miracos.vercel.app/api/vapi/webhook',
                    ...(userPrefs?.testCallMaxDuration ? {
                        maxDurationSeconds: userPrefs.testCallMaxDuration,
                    } : {}),
                    ...(transcriberKeywords.length > 0 ? {
                        transcriber: {
                            provider: 'deepgram',
                            model: 'nova-2',
                            language: 'en',
                            keywords: transcriberKeywords,
                        },
                    } : {}),
                },
                metadata: { userId, callType, meetingId: meetingId || undefined },
            };
            console.log(`[Voice] Using Vapi Assistant ${assistantId} for ${callType} (${transcriberKeywords.length} keywords${userPrefs?.testCallMaxDuration ? `, ${userPrefs.testCallMaxDuration}s max` : ''})`);
        } else {
            // Fallback: inline assistant (for dev/testing when Assistants aren't set up)
            console.warn(`[Voice] No Assistant ID for ${callType}, using inline fallback`);
            callPayload = await buildInlineAssistantPayload(
                phoneNumberId, { ...user, phoneNumber: phoneNumber }, userName, callType, variableValues, userId, meetingId,
            );
        }

        const response = await fetch(`${VAPI_API_BASE}/call/phone`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(callPayload),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[Voice] Vapi API error: ${error}`);
            trace?.update({ output: { error } });
            return false;
        }

        const call = await response.json() as { id?: string };
        console.log(`[Voice] ${callType} call initiated: ${call.id}`);
        trace?.update({ output: { callId: call.id } });

        // Persist sentVariables to VoiceCall so we can see what Mira was told
        if (call.id) {
            await prisma.voiceCall.upsert({
                where: { vapiCallId: call.id },
                create: {
                    userId,
                    vapiCallId: call.id,
                    callType,
                    meetingId: meetingId || null,
                    status: 'queued',
                    sentVariables: variableValues as object,
                    confidenceMode: variableValues.confidenceMode || null,
                },
                update: {
                    sentVariables: variableValues as object,
                    confidenceMode: variableValues.confidenceMode || null,
                },
            }).catch((err: Error) => {
                console.warn(`[Voice] Failed to persist sentVariables: ${err.message}`);
            });
        }

        // Update relationship tracking
        await prisma.personalContext.upsert({
            where: { userId },
            create: { userId, callCount: 1, firstCallDate: new Date(), lastCallDate: new Date(), favoriteCallTypes: [callType] },
            update: { callCount: { increment: 1 }, lastCallDate: new Date() },
        }).catch(() => { /* non-critical */ });

        return true;
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Voice] Call failed: ${errMsg}`);
        trace?.update({ output: { error: errMsg } });
        return false;
    }
}

// ============================================================================
// TRANSCRIBER KEYWORDS — boost proper noun recognition
// ============================================================================

/**
 * Build Deepgram keyword list for accurate transcription of proper nouns.
 * Deepgram keywords format: "word:boost" where boost is 0-10 (higher = stronger).
 *
 * Sources (all TYPED, not transcribed — ground truth):
 * - User profile (name, company)
 * - Calendar attendee names & email-derived names
 * - Email sender names
 * - Stakeholder profiles
 * - Knowledge entities (person/organization)
 */
async function buildTranscriberKeywords(userId: string, userName: string): Promise<string[]> {
    const keywords: string[] = [];

    // 1. User's own name — highest boost
    if (userName && userName !== 'there') {
        for (const part of userName.split(' ').filter(Boolean)) {
            keywords.push(`${part}:5`);
        }
    }

    // 2. Company name
    const userProfile = await prisma.user.findUnique({
        where: { id: userId },
        select: { company: true },
    }).catch(() => null);

    if (userProfile?.company) {
        keywords.push(`${userProfile.company}:4`);
        // Also boost individual words (e.g., "COSS" from "COSS Foundation")
        for (const part of userProfile.company.split(/\s+/).filter(p => p.length > 2)) {
            keywords.push(`${part}:4`);
        }
    }

    // 3. Calendar attendee names — these are TYPED in Google Calendar, ground truth
    const recentMeetings = await prisma.meetingSyncRecord.findMany({
        where: { userId },
        orderBy: { startTime: 'desc' },
        take: 30,
        select: { attendees: true },
    }).catch(() => []);

    const attendeeNames = new Set<string>();
    for (const m of recentMeetings) {
        const attendees = Array.isArray(m.attendees) ? m.attendees as Record<string, string>[] : [];
        for (const a of attendees) {
            if (a.name && a.name.length > 1) attendeeNames.add(a.name);
            // Extract name from email: karthik.naig@x.com → Karthik Naig
            if (a.email) {
                const local = a.email.split('@')[0];
                const parts = local.split(/[._-]/).filter(p => p.length > 1);
                if (parts.length >= 2) {
                    for (const p of parts) {
                        const capitalized = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
                        attendeeNames.add(capitalized);
                    }
                }
            }
        }
    }
    for (const name of attendeeNames) {
        keywords.push(`${name}:3`);
    }

    // 4. Stakeholder names — from profile, already resolved
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        select: { name: true },
        take: 20,
    }).catch(() => []);

    for (const s of stakeholders) {
        if (s.name) {
            keywords.push(`${s.name}:3`);
            for (const part of s.name.split(' ').filter(p => p.length > 2)) {
                keywords.push(`${part}:3`);
            }
        }
    }

    // 5. Knowledge entities (people, organizations)
    const entities = await prisma.knowledgeEntity.findMany({
        where: { userId, type: { in: ['PERSON', 'ORGANIZATION'] } },
        select: { name: true },
        take: 30,
    }).catch(() => []);

    for (const e of entities) {
        if (e.name) {
            keywords.push(`${e.name}:2`);
            for (const part of e.name.split(' ').filter(p => p.length > 2)) {
                keywords.push(`${part}:2`);
            }
        }
    }

    // Sanitize: split multi-word keywords into individual words
    // Vapi requires format "word" or "word:number" — no spaces allowed
    const sanitized: string[] = [];
    for (const kw of keywords) {
        const colonIdx = kw.lastIndexOf(':');
        const word = kw.substring(0, colonIdx);
        const boost = kw.substring(colonIdx + 1);
        if (word.includes(' ')) {
            for (const part of word.split(/\s+/).filter(p => p.length > 1)) {
                sanitized.push(`${part.replace(/[^a-zA-Z0-9]/g, '')}:${boost}`);
            }
        } else {
            sanitized.push(`${word.replace(/[^a-zA-Z0-9]/g, '')}:${boost}`);
        }
    }

    // Deduplicate (keep highest boost for each word)
    const seen = new Map<string, string>();
    for (const kw of sanitized) {
        const colonIdx = kw.lastIndexOf(':');
        const word = kw.substring(0, colonIdx);
        const boost = kw.substring(colonIdx + 1);
        if (!word || word.length < 2) continue;
        const existing = seen.get(word.toLowerCase());
        if (!existing || parseInt(boost) > parseInt(existing.split(':').pop() || '0')) {
            seen.set(word.toLowerCase(), kw);
        }
    }

    return Array.from(seen.values());
}

// ============================================================================
// VARIABLE VALUES — Dynamic context injected per call
// ============================================================================

/**
 * Build the variableValues object that gets injected into the Vapi Assistant's
 * prompt template. The Assistant prompt uses {{variable}} placeholders.
 */
async function buildVariableValues(
    userId: string,
    userName: string,
    jobTitle: string | null,
    callType: VoiceCallType,
    meetingId?: string,
): Promise<Record<string, string>> {
    const todayFormatted = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const vars: Record<string, string> = {
        userName,
        jobTitle: jobTitle || '',
        callType,
        today: todayFormatted,
        guardrails: `## CRITICAL RULES
- Today's date is ${todayFormatted}. NEVER guess or invent dates.
- NEVER fabricate meetings, people, events, or facts. Only reference what is in your context variables.
- If you don't know something, say so. Do not make things up.
- If the user challenges a fact, acknowledge your uncertainty immediately.`,
    };

    // Relationship context
    const personalCtx = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true, firstCallDate: true },
    }).catch(() => null);

    const callCount = personalCtx?.callCount || 0;
    vars.callCount = String(callCount);
    vars.relationshipStage = callCount < 5 ? 'new'
        : callCount < 15 ? 'building'
        : 'established';

    // Inject call feedback learnings so Mira adapts
    const recentFeedback = await prisma.callFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { tooLong: true, tooShort: true, wasRelevant: true, wasActionable: true, rating: true },
    }).catch(() => []);

    if (recentFeedback.length >= 3) {
        const tooLongCount = recentFeedback.filter(f => f.tooLong).length;
        const tooShortCount = recentFeedback.filter(f => f.tooShort).length;
        const irrelevantCount = recentFeedback.filter(f => f.wasRelevant === false).length;
        const notActionableCount = recentFeedback.filter(f => f.wasActionable === false).length;
        const avgRating = recentFeedback.filter(f => f.rating).reduce((s, f) => s + (f.rating || 0), 0) / (recentFeedback.filter(f => f.rating).length || 1);

        const hints: string[] = [];
        if (tooLongCount >= 2) hints.push('User has said calls are too long — keep it concise, under 3 minutes.');
        if (tooShortCount >= 2) hints.push('User wants more depth — take time to explain and give context.');
        if (irrelevantCount >= 2) hints.push('User found recent calls not relevant — focus only on actionable, timely info.');
        if (notActionableCount >= 2) hints.push('User wants more actionable advice — give specific next steps, not general observations.');
        if (avgRating < 3 && recentFeedback.filter(f => f.rating).length >= 3) hints.push('Recent call ratings are low — be extra focused and valuable.');

        if (hints.length > 0) {
            vars.feedbackHints = `## LEARNED FROM USER FEEDBACK\n${hints.join('\n')}`;
        }
    }

    // Today's meetings (for daily/morning calls)
    if (['daily_checkin', 'morning_brief', 'onboarding'].includes(callType)) {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        const meetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                startTime: { gte: now, lte: endOfDay },
                status: { not: 'cancelled' },
            },
            select: { title: true, startTime: true, meetingCategory: true, participants: true },
            orderBy: { startTime: 'asc' },
            take: 8,
        });

        if (meetings.length > 0) {
            vars.meetingsSummary = meetings.map(m => {
                const time = m.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                const cat = m.meetingCategory ? ` [${m.meetingCategory}]` : '';
                return `${time} — ${m.title}${cat}`;
            }).join('\n');
            vars.meetingCount = String(meetings.length);
        } else {
            vars.meetingsSummary = 'No meetings today';
            vars.meetingCount = '0';
        }
    }

    // Specific meeting context (for prep/debrief)
    if (meetingId && ['pre_meeting_prep', 'post_meeting_debrief'].includes(callType)) {
        const meeting = await prisma.meetingSyncRecord.findUnique({
            where: { id: meetingId },
            select: {
                title: true,
                startTime: true,
                participants: true,
                meetingCategory: true,
                desiredOutcome: true,
                description: true,
            },
        });

        if (meeting) {
            vars.meetingTitle = meeting.title;
            vars.meetingTime = meeting.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            vars.meetingParticipants = Array.isArray(meeting.participants)
                ? (meeting.participants as string[]).join(', ')
                : '';
            vars.meetingCategory = meeting.meetingCategory || '';
            vars.meetingDesiredOutcome = meeting.desiredOutcome || '';
        }
    }

    // Rich context for onboarding — pull from diverse sources to show breadth
    if (callType === 'onboarding') {
        // Calendar patterns — meeting density, recurring meetings, organizer ratio
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekMeetings = await prisma.meetingSyncRecord.findMany({
            where: { userId, startTime: { gte: weekStart, lt: weekEnd }, status: { not: 'cancelled' } },
            select: { title: true, startTime: true, endTime: true, meetingCategory: true, attendees: true, isRecurring: true, participants: true },
            orderBy: { startTime: 'asc' },
        }).catch(() => []);

        if (weekMeetings.length > 0) {
            let totalHours = 0;
            for (const m of weekMeetings) {
                totalHours += (m.endTime.getTime() - m.startTime.getTime()) / (1000 * 60 * 60);
            }
            const recurringCount = weekMeetings.filter(m => m.isRecurring).length;
            const categories: Record<string, number> = {};
            for (const m of weekMeetings) {
                const cat = String(m.meetingCategory || 'UNCLASSIFIED');
                categories[cat] = (categories[cat] || 0) + 1;
            }

            // Find who they meet with most
            const personCounts: Record<string, number> = {};
            for (const m of weekMeetings) {
                const attendees = Array.isArray(m.attendees) ? m.attendees as any[] : [];
                for (const a of attendees) {
                    const name = a.name || a.email?.split('@')[0] || '';
                    if (name && name.toLowerCase() !== userName.toLowerCase()) {
                        personCounts[name] = (personCounts[name] || 0) + 1;
                    }
                }
            }
            const topPeople = Object.entries(personCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => `${name} (${count} meetings)`);

            // Find interesting meeting titles (needle movers, big groups)
            const interestingMeetings = weekMeetings
                .filter(m => m.meetingCategory === 'NEEDLE_MOVER' || (Array.isArray(m.attendees) && (m.attendees as any[]).length > 5))
                .slice(0, 3)
                .map(m => m.title);

            // Find empty days/gaps
            const dayLoad: Record<string, number> = {};
            for (const m of weekMeetings) {
                const day = m.startTime.toLocaleDateString('en-US', { weekday: 'long' });
                dayLoad[day] = (dayLoad[day] || 0) + 1;
            }
            const busiestDay = Object.entries(dayLoad).sort((a, b) => b[1] - a[1])[0];
            const lightestDay = Object.entries(dayLoad).sort((a, b) => a[1] - b[1])[0];

            vars.busiestDay = busiestDay ? busiestDay[0] : '';
            vars.lightestDay = lightestDay ? lightestDay[0] : '';

            vars.calendarInsights = [
                `${weekMeetings.length} meetings this week, ~${totalHours.toFixed(1)} hours of face time`,
                recurringCount > 0 ? `${recurringCount} are recurring` : '',
                Object.entries(categories).map(([k, v]) => `${v} ${k.toLowerCase().replace('_', ' ')}`).join(', '),
                topPeople.length > 0 ? `Most time with: ${topPeople.join(', ')}` : '',
                interestingMeetings.length > 0 ? `Key meetings: ${interestingMeetings.join(', ')}` : '',
                busiestDay ? `Busiest day: ${busiestDay[0]} (${busiestDay[1]} meetings)` : '',
                lightestDay && busiestDay && lightestDay[0] !== busiestDay[0] ? `Lightest day: ${lightestDay[0]} (${lightestDay[1]} meetings)` : '',
            ].filter(Boolean).join('\n');
        } else {
            vars.calendarInsights = 'Calendar not yet synced or no meetings this week';
        }

        // Recent emails — topics, key threads, who's emailing them
        const recentEmails = await prisma.emailSummary.findMany({
            where: { userId },
            orderBy: { lastMessageAt: 'desc' },
            take: 10,
            select: { subject: true, from: true, summary: true, keyTopics: true, isImportant: true, requiresAction: true },
        }).catch(() => []);

        if (recentEmails.length > 0) {
            const importantThreads = recentEmails
                .filter(e => e.isImportant || e.requiresAction)
                .slice(0, 3)
                .map(e => `"${e.subject}" from ${e.from}`);

            const allTopics = recentEmails.flatMap(e => e.keyTopics || []);
            const topicCounts: Record<string, number> = {};
            for (const t of allTopics) {
                topicCounts[t] = (topicCounts[t] || 0) + 1;
            }
            const topTopics = Object.entries(topicCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([t]) => t);

            vars.emailInsights = [
                importantThreads.length > 0 ? `Important threads: ${importantThreads.join('; ')}` : '',
                topTopics.length > 0 ? `Hot topics in inbox: ${topTopics.join(', ')}` : '',
            ].filter(Boolean).join('\n');
        } else {
            vars.emailInsights = '';
        }

        // Key stakeholders already identified
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId },
            orderBy: { powerLevel: 'asc' }, // HIGH first (enum ordering)
            take: 8,
            select: { name: true, role: true, powerLevel: true, influenceRole: true, personaArchetype: true, relationshipStrength: true },
        }).catch(() => []);

        if (stakeholders.length > 0) {
            vars.knownStakeholders = stakeholders.map(s => {
                const parts = [s.name];
                if (s.role) parts.push(`(${s.role})`);
                if (s.influenceRole) parts.push(`— ${s.influenceRole.toLowerCase().replace('_', ' ')}`);
                return parts.join(' ');
            }).join('\n');
        } else {
            vars.knownStakeholders = '';
        }

        // Recent documents — what they're working on
        const recentDocs = await prisma.workArtifact.findMany({
            where: { userId, type: 'DOCUMENT_AUTHORED' },
            orderBy: { occurredAt: 'desc' },
            take: 5,
            select: { title: true, occurredAt: true },
        }).catch(() => []);

        if (recentDocs.length > 0) {
            vars.recentDocuments = recentDocs.map(d => d.title).join(', ');
        } else {
            vars.recentDocuments = '';
        }

        // Company info from user profile
        const userProfile = await prisma.user.findUnique({
            where: { id: userId },
            select: { company: true, industry: true, companyStage: true },
        }).catch(() => null);

        vars.companyContext = [
            userProfile?.company ? `Company: ${userProfile.company}` : '',
            userProfile?.industry ? `Industry: ${userProfile.industry}` : '',
            userProfile?.companyStage ? `Stage: ${userProfile.companyStage}` : '',
        ].filter(Boolean).join(', ');
    }

    // Pending nudges / overdue commitments (for daily/checkin)
    if (['daily_checkin', 'morning_brief'].includes(callType)) {
        const overdueActions = await prisma.relationshipAction.findMany({
            where: {
                goal: { userId },
                status: 'IN_PROGRESS',
                dueDate: { lt: new Date() },
            },
            select: { description: true },
            take: 3,
        });

        if (overdueActions.length > 0) {
            vars.overdueCommitments = overdueActions.map(a => a.description).join('\n');
        }
    }

    // Cross-call memory — recent call summaries so Mira remembers past conversations
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCalls = await prisma.voiceCall.findMany({
        where: { userId, status: 'ended', summary: { not: null }, durationSeconds: { gt: 30 } },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: { summary: true, callType: true, endedAt: true },
    }).catch(() => []);

    if (recentCalls.length > 0) {
        const today = new Date().toLocaleDateString();

        // Same-day calls — don't repeat
        const todayCalls = recentCalls.filter(c => c.endedAt?.toLocaleDateString() === today);
        if (todayCalls.length > 0) {
            vars.lastCallSummary = todayCalls
                .map(c => `Earlier today (${c.callType}): ${(c.summary || '').substring(0, 300)}`)
                .join('\n');
        } else {
            vars.lastCallSummary = '';
        }

        // Previous days — rolling memory of what was discussed
        const previousCalls = recentCalls.filter(c => c.endedAt?.toLocaleDateString() !== today);
        if (previousCalls.length > 0) {
            vars.recentCallHistory = previousCalls.map(c => {
                const daysAgo = c.endedAt
                    ? Math.round((Date.now() - c.endedAt.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                const when = daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
                return `${when} (${c.callType}): ${(c.summary || '').substring(0, 300)}`;
            }).join('\n');
        } else {
            vars.recentCallHistory = '';
        }
    } else {
        vars.lastCallSummary = '';
        vars.recentCallHistory = '';
    }

    // Voice-extracted learnings — what Mira has learned about this person from calls
    const voiceInsights = await prisma.conversationInsight.findMany({
        where: {
            userId,
            conversationDate: { gte: sevenDaysAgo },
            contextType: 'PAST_LEARNING',
        },
        orderBy: { conversationDate: 'desc' },
        take: 10,
        select: { insight: true },
    }).catch(() => []);

    if (voiceInsights.length > 0) {
        vars.learnedFromCalls = voiceInsights
            .map(i => (i.insight || '').substring(0, 200))
            .join('\n');
    } else {
        vars.learnedFromCalls = '';
    }

    // PersonalContext — what we know about them as a person
    const personalDetails = await prisma.personalContext.findUnique({
        where: { userId },
        select: {
            energyPatterns: true, interests: true, stressSignals: true,
            values: true, personalWins: true, preferredCallStyle: true,
            knownTopics: true, gapTopics: true,
        },
    }).catch(() => null);

    if (personalDetails) {
        const personalParts: string[] = [];
        if (personalDetails.interests) personalParts.push(`Interests: ${personalDetails.interests}`);
        if (personalDetails.values) personalParts.push(`Values: ${personalDetails.values}`);
        if (personalDetails.stressSignals) personalParts.push(`Stress signals: ${personalDetails.stressSignals}`);
        if (personalDetails.energyPatterns) personalParts.push(`Energy patterns: ${personalDetails.energyPatterns}`);
        if (personalDetails.preferredCallStyle) personalParts.push(`Prefers: ${personalDetails.preferredCallStyle}`);
        if (personalDetails.personalWins) personalParts.push(`Recent wins: ${personalDetails.personalWins}`);
        const known = personalDetails.knownTopics as string[] | null;
        const gaps = personalDetails.gapTopics as string[] | null;
        if (known && known.length > 0) personalParts.push(`Topics discussed: ${known.join(', ')}`);
        if (gaps && gaps.length > 0) personalParts.push(`Topics to explore: ${gaps.join(', ')}`);
        vars.personalContext = personalParts.join('\n') || '';
    } else {
        vars.personalContext = '';
    }

    // --- Coaching Intelligence System variables ---

    // KPI-gated coaching stage (replaces old LEARNING/OBSERVING/COACHING)
    let coachingStage: string = 'listener';
    let confidenceMode: string = 'LEARNING';
    try {
        const { evaluateStage, stageToMaturityLevel, getStageGuardrails, getStageTransparencyPhrase, getStageConfidenceOverrides } = require('../lib/stage-gate-engine');
        const stageResult = await evaluateStage(userId);
        coachingStage = stageResult.stage;
        confidenceMode = stageToMaturityLevel(stageResult.stage);
        vars.coachingStage = coachingStage;
        vars.stageGuardrails = getStageGuardrails(stageResult.stage);
        vars.stageTransparency = getStageTransparencyPhrase(stageResult.stage);
        const overrides = getStageConfidenceOverrides(stageResult.stage);
        vars.assertEnabled = String(overrides.assertEnabled);
        vars.suggestEnabled = String(overrides.suggestEnabled);
    } catch (err: any) {
        console.warn(`[Voice] Stage gate evaluation failed, using fallback: ${err.message}`);
        coachingStage = callCount < 3 ? 'listener' : callCount < 8 ? 'mirror' : callCount < 15 ? 'thought_partner' : 'coach';
        confidenceMode = callCount < 5 ? 'LEARNING' : callCount < 15 ? 'OBSERVING' : 'COACHING';
        vars.coachingStage = coachingStage;
    }
    vars.confidenceMode = confidenceMode;

    // Connection surfacing — suggest missing data sources naturally
    try {
        const { getConnectionSuggestion, markSuggestionShown } = require('./connection-surfacing');
        const suggestion = await getConnectionSuggestion(userId);
        if (suggestion) {
            vars.connectionSuggestion = suggestion.message;
            vars.connectionSuggestionProvider = suggestion.provider;
            // Mark as shown so we don't repeat
            await markSuggestionShown(userId, suggestion.provider);
        }
    } catch {}

    // --- Coaching Posture Selection ---
    // Query signals for posture context
    const [recentOutcomes, overdueCountResult, recentEvals] = await Promise.all([
        prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                outcomeResult: { in: ['LANDED', 'MISSED'] },
                endTime: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            },
            select: { outcomeResult: true },
            take: 5,
        }).catch(() => []),
        prisma.relationshipAction.count({
            where: {
                goal: { userId },
                status: 'IN_PROGRESS',
                dueDate: { lt: new Date() },
            },
        }).catch(() => 0),
        prisma.callEvaluation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { depthOfSharingScore: true, engagementScore: true },
        }).catch(() => []),
    ]);

    const hasRecentLanded = recentOutcomes.some((o: { outcomeResult: string | null }) => o.outcomeResult === 'LANDED');
    const hasRecentMissed = recentOutcomes.some((o: { outcomeResult: string | null }) => o.outcomeResult === 'MISSED');

    // Depth trending up: last 3 calls average > prior 2
    const depthTrendingUp = recentEvals.length >= 4 &&
        recentEvals.slice(0, 3).reduce((s: number, e: { depthOfSharingScore: number | null }) => s + (e.depthOfSharingScore ?? 0), 0) / 3 >
        recentEvals.slice(3).reduce((s: number, e: { depthOfSharingScore: number | null }) => s + (e.depthOfSharingScore ?? 0), 0) / Math.max(recentEvals.length - 3, 1);

    // Engagement trending down: last 3 average < 5
    const engagementTrendingDown = recentEvals.length >= 3 &&
        recentEvals.slice(0, 3).reduce((s: number, e: { engagementScore: number | null }) => s + (e.engagementScore ?? 5), 0) / 3 < 5;

    const meetingCount = parseInt(vars.meetingCount || '0', 10);

    const postureCtx: PostureContext = {
        callType,
        callCount,
        maturityLevel: confidenceMode as PostureContext['maturityLevel'],
        archetype: null, // will be set below after prefs query
        hasRecentLanded,
        hasRecentMissed,
        overdueCommitmentCount: overdueCountResult,
        meetingCount,
        isLightDay: meetingCount <= 2,
        depthTrendingUp,
        engagementTrendingDown,
    };

    // If posture was pre-selected (from signal-driven scheduling), use it
    // Otherwise compute from heuristics
    let postureSelection: PostureSelection;
    // archetype will be set after prefs are loaded — deferred posture computation below

    // Pre-call directive from evaluation + relationship plan + experiments
    const callPlan = await buildCallDirective(userId, callType).catch(() => ({ directive: '', experimentAssignments: [] }));
    vars.callDirective = callPlan.directive;
    if (callPlan.experimentAssignments?.length > 0) {
        vars.experimentAssignments = JSON.stringify(callPlan.experimentAssignments);
    }

    // Personal thread instruction
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: {
            preferredCallDuration: true,
            callPacingStyle: true,
            conversationMode: true,
            primaryArchetype: true,
            adaptationSignals: true,
        },
    }).catch(() => null);

    const threadAction = await selectThreadAction(
        userId, callType, callCount, prefs?.conversationMode
    ).catch(() => ({ type: 'NONE' as const, instruction: '' }));
    vars.personalThreadInstruction = threadAction.instruction;

    // Target duration
    const defaultDuration = coachingStage === 'listener' ? 3
        : coachingStage === 'mirror' ? 5
        : coachingStage === 'thought_partner' ? 7
        : 10;
    vars.targetDuration = String(defaultDuration);

    // Conversation plan (call-specific for 1-3, maturity-based for 4+)
    const adaptationSignals = prefs?.adaptationSignals as AdaptationSignals | null;
    vars.conversationPlan = buildConversationPlan(callType as VoiceCallType, confidenceMode, vars, callCount, adaptationSignals);

    // --- Compute posture (after prefs loaded for archetype) ---
    postureCtx.archetype = prefs?.primaryArchetype || null;
    postureCtx.personalThreadReady = threadAction.type === 'WATER';

    postureSelection = selectPosture(postureCtx);
    vars.primaryPosture = postureSelection.primary;
    vars.secondaryPosture = postureSelection.secondary || '';
    vars.postureReason = postureSelection.reason;
    vars.postureRules = postureSelection.rules.join(' | ');
    vars.postureTone = postureSelection.tone;

    // For calls 4+, augment conversation plan with posture-driven arc
    if (callCount >= 4) {
        const posturePlan = buildPostureConversationPlan(postureSelection, vars, callCount);
        vars.conversationPlan = posturePlan + '\n\n--- MATURITY-BASED ARC (reference) ---\n' + vars.conversationPlan;
    }

    // Posture-specific target duration override
    if (postureSelection.primary === 'challenge') {
        vars.targetDuration = String(Math.max(parseInt(vars.targetDuration || '10'), 10));
    } else if (['celebrate', 'uplift', 'nudge'].includes(postureSelection.primary)) {
        vars.targetDuration = String(Math.min(parseInt(vars.targetDuration || '10'), 5));
    }

    console.log(`[Posture] user=${userId} primary=${postureSelection.primary} secondary=${postureSelection.secondary || 'none'} reason="${postureSelection.reason}"`);

    // Hypotheses to test during this call
    const { getHypothesesForCall } = await import('../agents/hypothesis-engine');
    vars.hypotheses = await getHypothesesForCall(userId, 2).catch(() => '');

    // People intel (confidence-tier-gated stakeholder intelligence)
    vars.peopleIntel = await buildPeopleIntel(userId, confidenceMode).catch(() => '');

    // Domain context — inject org/domain knowledge
    const [domainCtx, kgProjects, kgProjectFacts] = await Promise.all([
        prisma.domainContext.findUnique({
            where: { userId },
            select: { organization: true, landscape: true, history: true },
        }).catch(() => null),
        prisma.knowledgeEntity.findMany({
            where: { userId, type: 'PROJECT' },
            select: { id: true, name: true, properties: true },
            take: 15,
        }).catch(() => []),
        prisma.knowledgeFact.findMany({
            where: { userId, subject: { type: 'PROJECT' } },
            select: {
                predicate: true, objectValue: true,
                subject: { select: { name: true } },
                objectEntity: { select: { name: true, type: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 40,
        }).catch(() => []),
    ]);

    if (domainCtx) {
        const parts: string[] = [];
        const org = domainCtx.organization as Record<string, string> | null;
        const landscape = domainCtx.landscape as Record<string, string> | null;
        if (org && typeof org === 'object') {
            for (const [k, v] of Object.entries(org)) {
                if (v) parts.push(`${k}: ${String(v).substring(0, 200)}`);
            }
        }
        if (landscape && typeof landscape === 'object') {
            for (const [k, v] of Object.entries(landscape)) {
                if (v) parts.push(`${k}: ${String(v).substring(0, 200)}`);
            }
        }
        vars.domainContext = parts.join('\n') || '';
    } else {
        vars.domainContext = '';
    }

    // Enrich companyContext with knowledge graph project intelligence
    if (kgProjects.length > 0) {
        const factsByProject: Record<string, string[]> = {};
        for (const f of kgProjectFacts) {
            const proj = f.subject?.name || 'Unknown';
            if (!factsByProject[proj]) factsByProject[proj] = [];
            const obj = f.objectEntity ? f.objectEntity.name : (f.objectValue || '');
            if (obj) factsByProject[proj].push(`${f.predicate}: ${obj}`);
        }
        const summaries: string[] = [];
        for (const proj of kgProjects.slice(0, 10)) {
            const facts = [...new Set(factsByProject[proj.name] || [])].slice(0, 5);
            summaries.push(facts.length > 0
                ? `${proj.name}: ${facts.join('; ')}`
                : proj.name);
        }
        const existing = vars.companyContext || '';
        vars.companyContext = [existing, `Active projects:\n${summaries.join('\n')}`].filter(Boolean).join('\n\n');
    }

    // Onboarding progress — loaded for ALL call types so any call can
    // weave in onboarding questions until onboarding is complete.
    const progress = await prisma.onboardingProgress.findUnique({
        where: { userId },
    }).catch(() => null);

    if (progress) {
        const covered: string[] = [];
        const uncovered: string[] = [];
        // Layer 1: The Person
        if (progress.coveredStory) covered.push('their story'); else uncovered.push('their story — how they got here, what shaped them');
        if (progress.coveredDrivesAndValues) covered.push('drives & values'); else uncovered.push('drives & values — what motivates them, what they care about');
        if (progress.coveredLife) covered.push('life outside work'); else uncovered.push('life outside work — family, interests, energy sources');
        // Layer 2: The Leader
        if (progress.coveredRole) covered.push('role & scope'); else uncovered.push('role & scope — what they own, responsibilities');
        if (progress.coveredStakeholders) covered.push('key people'); else uncovered.push('key people — relationships, dynamics, allies');
        if (progress.coveredLeadershipStyle) covered.push('leadership style'); else uncovered.push('leadership style — how they decide, communicate, handle conflict');
        // Layer 3: The Ambition
        if (progress.coveredGoals) covered.push('goals'); else uncovered.push('goals — what success looks like, aspirations');
        if (progress.coveredChallenges) covered.push('challenges'); else uncovered.push('challenges — blockers, frustrations');
        if (progress.coveredGrowth) covered.push('growth edges'); else uncovered.push('growth edges — what they want to get better at');

        vars.onboardingCovered = covered.join(', ') || 'none yet';
        vars.onboardingUncovered = uncovered.join(', ') || 'all covered!';
        vars.onboardingComplete = uncovered.length === 0 ? 'true' : 'false';
        vars.totalOnboardingCalls = String(progress.totalOnboardingCalls);
    } else {
        vars.onboardingCovered = 'none yet';
        vars.onboardingUncovered = 'their story, drives & values, life outside work, role & scope, key people, leadership style, goals, challenges, growth edges';
        vars.onboardingComplete = 'false';
        vars.totalOnboardingCalls = '0';
    }

    // Dynamic first message for onboarding — evolves across calls
    // Principle: LEAD WITH VALUE. Never open with a cold open-ended question.
    // Demonstrate context → share an insight → invite a response.
    if (callType === 'onboarding') {
        const callNum = parseInt(vars.totalOnboardingCalls || '0', 10);
        const firstName = userName.split(' ')[0];

        if (callNum === 0) {
            // First ever call — introduce, but lead with something specific from their data
            const meetingCount = parseInt(vars.meetingCount || '0', 10);
            const hasCalendar = vars.calendarInsights && !vars.calendarInsights.includes('not yet synced');
            const hasStakeholders = vars.knownStakeholders && vars.knownStakeholders.length > 5;

            if (hasCalendar && meetingCount > 0) {
                vars.firstMessage = `Hey ${firstName}! I'm Mira. I've been looking through your week and I already have thoughts — you've got ${meetingCount} meetings today alone. This is going to be a short call, just five minutes. I want to tell you what I see and learn a bit about the person behind all those meetings.`;
            } else if (hasStakeholders) {
                vars.firstMessage = `Hey ${firstName}! I'm Mira. I've already been doing my homework — I can see the people in your orbit and I'm curious about the dynamics. This'll be a short call, just five minutes. I want to share what I've noticed and learn about you.`;
            } else {
                vars.firstMessage = `Hey ${firstName}! I'm Mira. I'm really glad you're here. This is going to be a short call — just five minutes — and I promise by the end you'll know exactly what to expect from me. I'd love to start with your story — how'd you end up where you are?`;
            }
        } else if (callNum <= 5) {
            // Calls 2-5: Lead with something specific from past calls or data
            vars.firstMessage = buildOnboardingValueOpener(firstName, callNum, vars);
        } else {
            // Calls 6+: Lead with progress + specific insight
            const coveredCount = (vars.onboardingCovered || '').split(',').filter(Boolean).length;
            vars.firstMessage = buildOnboardingValueOpener(firstName, callNum, vars);
        }
    }

    // Dynamic first message for daily/other calls — evolves with relationship
    if (!vars.firstMessage) {
        // For calls 4+, try posture-specific opener first
        if (callCount >= 4) {
            const firstName = userName.split(' ')[0];
            const postureOpener = buildPostureOpener(firstName, postureSelection, vars);
            if (postureOpener) {
                vars.firstMessage = postureOpener;
            }
        }
        // Fall back to relationship-evolved opener
        if (!vars.firstMessage) {
            vars.firstMessage = buildFirstMessage(userName, callCount, callType, vars);
        }
    }

    // Prompt Insights — auto-learned coaching strategies (self-activating)
    try {
        const { getActiveInsights } = await import('../agents/prompt-insight-agent');
        const insights = await getActiveInsights(userId);
        vars.promptInsights = insights || '';
    } catch {
        vars.promptInsights = '';
    }

    return vars;
}

// ============================================================================
// DYNAMIC FIRST MESSAGE — what Mira says when you pick up
// ============================================================================

/**
 * Build a value-led onboarding opener for calls 2+.
 * Never opens with a generic question. Always leads with something specific.
 */
function buildOnboardingValueOpener(
    firstName: string,
    callNum: number,
    vars: Record<string, string>,
): string {
    // Try to lead with something from recent calls
    if (vars.recentCallHistory && vars.recentCallHistory.length > 20) {
        // Extract first meaningful fragment from recent call
        const firstCall = vars.recentCallHistory.split('\n')[0] || '';
        const summary = firstCall.replace(/^(Yesterday|[0-9]+ days ago)\s*\([^)]+\):\s*/, '').substring(0, 100);
        if (summary.length > 10) {
            return `Hey ${firstName}. I've been thinking about something from last time — ${summary.split('.')[0].toLowerCase()}. I want to pick that up.`;
        }
    }

    // Try to lead with a calendar observation
    const meetingCount = parseInt(vars.meetingCount || '0', 10);
    if (meetingCount > 3) {
        return `Hey ${firstName}. You've got ${meetingCount} meetings today — I looked through them and I have a couple observations. But first, there's something from our last conversation I want to follow up on.`;
    }

    // Try to lead with what we've learned so far
    if (vars.learnedFromCalls && vars.learnedFromCalls.length > 20) {
        const learned = vars.learnedFromCalls.split('\n')[0].substring(0, 80);
        return `Hey ${firstName}. I've been reflecting on what I'm learning about you — ${learned.split('.')[0].toLowerCase()}. I want to go deeper on that.`;
    }

    // Try to lead with email/stakeholder data
    if (vars.knownStakeholders && vars.knownStakeholders.length > 10) {
        const firstPerson = vars.knownStakeholders.split('\n')[0].split(' (')[0];
        return `Hey ${firstName}. I noticed ${firstPerson} shows up a lot in your world. I'm curious about that dynamic — but first, wanted to check in on how things are landing since we last spoke.`;
    }

    // Fallback — still lead with value (progress awareness)
    const coveredCount = (vars.onboardingCovered || '').split(',').filter(s => s.trim()).length;
    if (coveredCount > 0) {
        return `Hey ${firstName}. We've covered a lot of ground in ${callNum} conversations — I feel like I'm starting to see the full picture. There are a few things I want to explore today.`;
    }

    return `Hey ${firstName}. Good to connect again. I've been looking through your calendar and I have some thoughts.`;
}

/**
 * Build a relationship-appropriate opening line.
 * PRINCIPLE: Lead with value. Never open cold. Every opener demonstrates context.
 */
function buildFirstMessage(
    userName: string,
    callCount: number,
    callType: string,
    vars: Record<string, string>,
): string {
    const name = userName.split(' ')[0]; // First name only

    // Meeting calls — always context-specific
    if (callType === 'pre_meeting_prep') {
        return `Hey ${name}. Quick prep before your ${vars.meetingTitle || 'meeting'}.`;
    }
    if (callType === 'post_meeting_debrief') {
        return `Hey ${name}. How'd ${vars.meetingTitle || 'it'} go?`;
    }

    // Daily calls — always lead with value, never cold open-ended questions

    // Call 1: Show you've done homework
    if (callCount <= 1) {
        return `Hey ${name}, it's Mira. I've been looking at your day — I think I can be useful.`;
    }

    // Calls 2-3: Show memory — reference something specific
    if (callCount <= 3) {
        if (vars.recentCallHistory && vars.recentCallHistory.length > 10) {
            return `Hey ${name}. Been thinking about what we talked about yesterday. I want to pick that up.`;
        }
        if (vars.overdueCommitments && vars.overdueCommitments.length > 5) {
            return `Morning, ${name}. There's something from last time I want to check in on.`;
        }
        return `Morning, ${name}. I've been looking at your day and I have a couple thoughts.`;
    }

    // Calls 4-10: Building trust, getting specific — always lead with an observation
    if (callCount <= 10) {
        if (vars.overdueCommitments && vars.overdueCommitments.length > 5) {
            return `Morning, ${name}. I've been tracking something — want to check in on it.`;
        }
        const meetingCount = parseInt(vars.meetingCount || '0', 10);
        if (meetingCount >= 5) {
            return `Hey ${name}. Full day ahead — I looked through it and want to flag a couple things.`;
        }
        if (meetingCount === 0) {
            return `Morning, ${name}. Light calendar today — I want to use the breathing room well.`;
        }
        if (vars.recentCallHistory && vars.recentCallHistory.length > 10) {
            return `Morning, ${name}. Something from yesterday's conversation has been on my mind.`;
        }
        return `Hey ${name}. I've been looking at your week and I have an observation.`;
    }

    // Calls 11-20: Trusted advisor — direct, value-first
    if (callCount <= 20) {
        const openers = [
            `Morning, ${name}. I have thoughts.`,
            `Hey ${name}. I noticed something in your calendar I want to flag.`,
            `${name}. Couple things I want to get into today.`,
            `Morning. I've been looking at your week — I see a pattern.`,
            `Hey ${name}. Something came up that I think matters.`,
        ];
        return openers[callCount % openers.length];
    }

    // Calls 20+: Old friend — still value-led but brief
    const openers = [
        `Morning, ${name}. I've got something for you.`,
        `Hey ${name}. I noticed something interesting.`,
        `${name}. Let's dig in — I have thoughts.`,
        `Morning. Something I want to flag before your day starts.`,
        `Hey ${name}. I've been connecting some dots.`,
        `Good morning. I want to share an observation.`,
    ];
    return openers[callCount % openers.length];
}

// ============================================================================
// INLINE FALLBACK — Used only when no Vapi Assistant ID is configured
// ============================================================================

/**
 * Build an inline assistant payload for Vapi. This is the fallback for
 * development/testing when Vapi Assistants haven't been created yet.
 * In production, all calls should use assistantId.
 *
 * Reads prompt templates from DB (same as web side) before falling back to hardcoded.
 */
async function buildInlineAssistantPayload(
    phoneNumberId: string,
    user: { phoneNumber: string | null },
    userName: string,
    callType: VoiceCallType,
    variableValues: Record<string, string>,
    userId?: string,
    meetingId?: string | null,
): Promise<Record<string, unknown>> {
    // No hard duration caps — let user talk as long as they want
    // 30 min max is a safety net, not a conversation limit
    const maxDuration = 1800;

    // Try DB template first (same system as web side)
    const templateName = callType === 'onboarding' ? 'voice-onboarding'
        : callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief' ? 'voice-meeting'
        : 'voice-general';

    const [template, sharedRules] = await Promise.all([
        getActivePromptTemplate(templateName, userId || undefined).catch(() => null),
        getActivePromptTemplate('shared-voice-rules', userId || undefined).catch(() => null),
    ]);

    let system: string;
    let firstMessage: string;

    if (template) {
        // Inject shared rules into variables
        const vars = { ...variableValues, voiceRules: sharedRules ? assemblePrompt(sharedRules.content, variableValues) : '' };
        system = assemblePrompt(template.content, vars);
        firstMessage = pickFirstMessage(template.firstMessageOptions, vars);
    } else {
        // Hardcoded fallback — minimal prompt
        system = `You are Mira, an AI executive coach calling ${userName}.
Call type: ${callType}. Keep it conversational, 2-3 sentences max.
${variableValues.meetingsSummary ? `\nToday's meetings:\n${variableValues.meetingsSummary}` : ''}
${variableValues.overdueCommitments ? `\nOverdue follow-ups:\n${variableValues.overdueCommitments}` : ''}`;

        firstMessage = callType === 'onboarding'
            ? `Hey ${userName}! I'm Mira — your AI executive coach. I wanted to call you personally. Let me tell you what I do, and then I want to hear about your world.`
            : `Hey ${userName}. It's Mira. How much time do you have?`;
    }

    return {
        phoneNumberId,
        customer: { number: user.phoneNumber, name: userName },
        metadata: { userId, callType, meetingId: meetingId || undefined },
        assistant: {
            name: 'Mira',
            firstMessage,
            model: {
                provider: 'openai',
                model: 'gpt-4o',
                messages: [{ role: 'system', content: system }],
                temperature: 0.7,
                maxTokens: 300,
            },
            voice: { provider: 'cartesia', voiceId: '95d51f79-c397-46f9-b49a-23763d3eaa2d', model: 'sonic-3' },
            transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
            silenceTimeoutSeconds: 120,
            maxDurationSeconds: maxDuration,
            endCallMessage: "That's a wrap. I'll have notes ready for you in the app.",
            serverUrl: 'https://miracos.vercel.app/api/vapi/webhook',
        },
    };
}

// ============================================================================
// CONVERSATION ENGINE — Plan builders + adaptation signals
// ============================================================================

interface AdaptationSignals {
    modeLean: 'work_first' | 'relationship_first' | 'balanced';
    precision: boolean;
    peopleHungry: boolean;
    personalOpen: boolean;
    frameworkSeeker: boolean;
    followMode: boolean;
    integratedLife: boolean;
}

function buildConversationPlan(
    callType: VoiceCallType,
    confidenceMode: string,
    vars: Record<string, string>,
    callCount: number,
    adaptationSignals?: AdaptationSignals | null,
): string {
    if (callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief') {
        return callType === 'pre_meeting_prep'
            ? 'Quick prep: What is the desired outcome? Who to watch in the room? One tactical tip. Under 3 minutes.'
            : 'Quick debrief: What happened? Did the outcome land? Any commitments made? Under 3 minutes.';
    }

    const hasOverdue = vars.overdueCommitments && vars.overdueCommitments !== '';
    const meetingCount = parseInt(vars.meetingCount || '0');

    if (callCount === 1) {
        return `This is your FIRST call with this user. Goal: demonstrate context, deliver pure value, ask almost nothing.
Target: 3-5 minutes. Tone: crisp, warm, slightly playful.
1. OPEN (30s): Greeting + day shape. Meeting count + one calendar observation.
2. TRIAGE (60-90s): Name the highest-stakes meeting. Say why.
3. AWARENESS (30s): One operational observation.
4. ONE QUESTION (30-60s): One specific question about the top meeting.
5. CLOSE (15s): Warm, brief. "Go get it. I'll check back tomorrow."
RULES: No personal questions. No stakeholder intelligence. No advice. Pure information + one question.`;
    }

    if (callCount === 2) {
        const adaptInstructions = buildCall2Adaptations(adaptationSignals);
        return `This is your SECOND call. Goal: prove memory. Introduce commitment tracking.
Target: 4-7 minutes.
1. OPEN (30s): Day shape + callback to yesterday.
2. MEMORY (60-90s): Show you remembered something from yesterday.
${vars.lastCallSummary ? '   Reference something from yesterday\'s call.' : ''}
${hasOverdue ? '   Check on a commitment.' : ''}
3. TRIAGE (60s): Today's headline meeting.
${adaptInstructions ? `4. ADAPTATION: ${adaptInstructions}` : ''}
5. ONE QUESTION (30-60s): Different question TYPE than call 1.
6. CLOSE (15s): "Talk tomorrow."`;
    }

    if (callCount === 3) {
        const modeLean = adaptationSignals?.modeLean || 'balanced';
        return `This is call 3. Goal: first stakeholder probe. Transition point.
Target: 5-10 minutes. Mode: ${modeLean}.
1. OPEN (30s): Day shape + yesterday callback.
2. MEMORY (60s): Best callback from calls 1-2.
3. TRIAGE (60s): Headline meeting + attendee cross-reference.
4. PEOPLE PROBE (90s): ${vars.topStakeholderProbe || 'Ask about the most frequent attendee.'} Frame as learning.
${hasOverdue ? '5. ACCOUNTABILITY: Check commitments.' : ''}
6. CLOSE (15s): If flowing, add a soft personal question.`;
    }

    // Calls 4+: maturity-based
    const signalModifiers = buildSignalModifiers(adaptationSignals);

    if (confidenceMode === 'LEARNING') {
        return `Follow this arc:
1. OPEN: Give the headline — how many meetings, which one matters most.
2. BRIEF: Cover the top meeting. Ask what they need from it.
${hasOverdue ? '3. ACCOUNTABILITY: Check overdue commitments.' : ''}
${meetingCount === 0 ? '3. Calendar is light — use for onboarding or learning.' : ''}
4. CLOSE: Short, confident send-off.
You are in LEARNING mode. Mirror and ask, don't advise.${signalModifiers}`;
    }

    if (confidenceMode === 'OBSERVING') {
        return `Follow this arc:
1. OPEN: Lead with something specific and useful about today.
2. BRIEF: Cover top 1-2 meetings. Include hedged observations about people if available.
3. COACHING: Surface an observation or pattern as a question.
${hasOverdue ? '4. ACCOUNTABILITY: Check overdue commitments.' : ''}
5. CLOSE: Callback hook for tomorrow + warm send-off.
You are in OBSERVING mode. Start surfacing what you notice, but always hedge.${signalModifiers}`;
    }

    return `Follow this arc:
1. OPEN: Lead with your opinion about today. Be direct.
2. BRIEF: Cover the top meeting with assertive intelligence.
3. COACHING: Surface a pattern, challenge an assumption, or go deeper.
${hasOverdue ? '4. ACCOUNTABILITY: Check commitments. Be direct.' : ''}
5. CLOSE: Specific action to take + callback hook.
You are in COACHING mode. Be direct with high-confidence intelligence.${signalModifiers}`;
}

function buildCall2Adaptations(signals?: AdaptationSignals | null): string {
    if (!signals) return '';

    if (signals.modeLean === 'relationship_first' || signals.personalOpen) {
        return 'User showed openness to personal conversation. Add a brief personal check-in.';
    }
    if (signals.peopleHungry) {
        return 'User asked about stakeholders. Open with a probe about that person.';
    }
    if (signals.modeLean === 'work_first') {
        return 'User prefers brevity. Add deeper operational analysis instead of personal.';
    }
    return '';
}

function buildSignalModifiers(signals?: AdaptationSignals | null): string {
    if (!signals) return '';

    const modifiers: string[] = [];
    if (signals.precision) {
        modifiers.push('\nPRECISION: This user tests accuracy. Only state calendar facts. Frame inferences as questions.');
    }
    if (signals.peopleHungry) {
        modifiers.push('\nPEOPLE DATA: This user wants stakeholder intelligence. Share frequency counts, co-occurrence.');
    }
    if (signals.frameworkSeeker) {
        modifiers.push('\nFRAMEWORK: This user wants actionable templates. Provide specific questions or phrases.');
    }
    if (signals.followMode) {
        modifiers.push('\nFOLLOW: This user leads the conversation. Reduce structure. Listen and reflect patterns.');
    }
    if (signals.integratedLife) {
        modifiers.push('\nINTEGRATED: This user\'s personal and work life overlap. Treat as one conversation.');
    }
    return modifiers.join('');
}

async function buildPeopleIntel(userId: string, confidenceMode: string): Promise<string> {
    if (confidenceMode === 'LEARNING') {
        return '';
    }

    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: now, lte: endOfDay },
            status: { not: 'cancelled' },
        },
        select: { title: true, participants: true },
        take: 5,
    });

    const allParticipantEmails = meetings.flatMap(m =>
        Array.isArray(m.participants) ? m.participants as string[] : []
    );

    if (allParticipantEmails.length === 0) return '';

    const profiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            email: { in: allParticipantEmails },
            interactionCount: { gte: confidenceMode === 'OBSERVING' ? 3 : 7 },
        },
        select: {
            name: true,
            personaArchetype: true,
            communicationStyle: true,
            powerLevel: true,
            interactionCount: true,
            intelligence: { select: { objectionPatterns: true, successPatterns: true } },
        },
        take: 5,
    });

    if (profiles.length === 0) return '';

    const tier = confidenceMode === 'OBSERVING' ? 'PROBE' : 'SUGGEST/ASSERT';

    return profiles.map(p => {
        const parts = [`${p.name} (${p.interactionCount} interactions, tier: ${tier})`];
        if (p.personaArchetype) parts.push(`  Style: ${p.personaArchetype}`);
        if (p.communicationStyle) parts.push(`  Communication: ${p.communicationStyle}`);
        if (p.powerLevel) parts.push(`  Power: ${p.powerLevel}`);
        if (p.intelligence?.successPatterns) parts.push(`  What works: ${p.intelligence.successPatterns}`);
        if (p.intelligence?.objectionPatterns) parts.push(`  Watch for: ${p.intelligence.objectionPatterns}`);
        return parts.join('\n');
    }).join('\n\n');
}
