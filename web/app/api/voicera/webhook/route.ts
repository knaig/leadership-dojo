import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/voicera/webhook
 * Receives post-call results from karthikVoicEra-server.
 *
 * Payload:
 * {
 *   callId: string,
 *   status: "completed" | "no_answer" | "error",
 *   endedReason: string,
 *   transcript: string,          // full transcript as text
 *   transcriptLines: string[],   // per-line transcript
 *   durationSeconds: number,
 *   startedAt: string,           // ISO datetime
 *   endedAt: string,             // ISO datetime
 *   metadata: { userId, callType, meetingId }
 * }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log(`[VoicERA Webhook] Received: status=${body.status} callId=${body.callId}`);

        const userId = body.metadata?.userId;
        if (!userId) {
            console.warn('[VoicERA Webhook] No userId in metadata');
            return NextResponse.json({ ok: true });
        }

        const callType = body.metadata?.callType || 'general';
        const meetingId = body.metadata?.meetingId || null;
        const transcript = body.transcript || '';
        const durationSeconds = body.durationSeconds || 0;

        if (body.status === 'no_answer' || body.status === 'error') {
            // Call didn't connect — update ScheduledCall via handleCallOutcome path
            console.log(`[VoicERA Webhook] Call ${body.callId} ${body.status}: ${body.endedReason}`);

            // Queue the outcome update for the worker
            const payload = JSON.stringify({
                userId,
                voiceCallId: body.callId,
                outcome: body.status === 'no_answer' ? 'no_answer' : 'error',
            });
            await prisma.$queryRaw`
                INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
                VALUES ('handle-call-outcome', ${payload}::jsonb, 'created', 2, 0, 30, 300, now(), now() + interval '1 day')
            `.catch(() => {});

            return NextResponse.json({ ok: true });
        }

        // Generate a summary from transcript using LLM (if transcript is long enough)
        let summary = '';
        if (transcript.length > 100) {
            try {
                const { getUserLLMConfig } = await import('@/lib/llm/user-config');
                const { createProvider } = await import('@/lib/llm/factory');
                const config = await getUserLLMConfig(userId);
                const provider = createProvider(config);
                const summaryResult = await provider.generateText(
                    `Summarize this voice coaching call in 2-3 sentences. Focus on key topics discussed, decisions made, and action items:\n\n${transcript.substring(0, 3000)}`,
                    { temperature: 0.3, maxTokens: 300 },
                );
                summary = summaryResult || '';
            } catch (err) {
                console.warn('[VoicERA Webhook] Summary generation failed:', err);
            }
        }

        // Create VoiceCall record
        const voiceCall = await prisma.voiceCall.create({
            data: {
                userId,
                vapiCallId: body.callId, // reuse field for voicera call ID
                callType,
                meetingId,
                status: 'ended',
                durationSeconds: durationSeconds || null,
                transcript: transcript || null,
                summary: summary || null,
                sentVariables: body.metadata || null,
                endedAt: body.endedAt ? new Date(body.endedAt) : new Date(),
                startedAt: body.startedAt ? new Date(body.startedAt) : new Date(),
            },
        });

        // Update PersonalContext
        await prisma.personalContext.upsert({
            where: { userId },
            create: {
                userId,
                callCount: 1,
                totalCallMinutes: Math.round(durationSeconds / 60),
                firstCallDate: new Date(),
                lastCallDate: new Date(),
            },
            update: {
                callCount: { increment: 1 },
                totalCallMinutes: { increment: Math.round(durationSeconds / 60) },
                lastCallDate: new Date(),
            },
        }).catch(() => {});

        // Save summary to chat
        if (summary) {
            const formatType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const formatDur = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
            await prisma.message.create({
                data: {
                    userId,
                    role: 'assistant',
                    content: `**Call Summary** (${formatType(callType)}, ${formatDur(durationSeconds)})\n\n${summary}`,
                    type: 'PROACTIVE_NUDGE',
                },
            });
        }

        // Queue post-call analysis (evaluation, onboarding detection, thread extraction)
        const payload = JSON.stringify({ voiceCallId: voiceCall.id });
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES ('post-call-analysis', ${payload}::jsonb, 'created', 2, 0, 30, 300, now() + interval '30 seconds', now() + interval '1 day')
        `.catch(() => {});

        // Queue call evaluation
        await prisma.$queryRaw`
            INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
            VALUES ('call-evaluation', ${payload}::jsonb, 'created', 2, 0, 30, 300, now() + interval '1 minute', now() + interval '1 day')
        `.catch(() => {});

        // Handle meeting-specific outcomes
        if (callType === 'pre_meeting_prep' && meetingId && transcript) {
            const outcomeMatch = transcript.match(/(?:want to|need to|goal is|outcome is|walk out with)\s+(.{10,200})/i);
            if (outcomeMatch) {
                await prisma.meetingSyncRecord.update({
                    where: { id: meetingId },
                    data: {
                        desiredOutcome: outcomeMatch[1].trim(),
                        lifecycleStage: 'OUTCOME_SET',
                    },
                }).catch(() => {});
            }
        }

        console.log(`[VoicERA Webhook] Processed call ${body.callId}: ${durationSeconds}s, voiceCall=${voiceCall.id}`);
        return NextResponse.json({ ok: true, voiceCallId: voiceCall.id });

    } catch (error) {
        console.error('[VoicERA Webhook] Error:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
