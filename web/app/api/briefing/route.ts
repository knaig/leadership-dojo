import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { generateBriefingScript } from '@/lib/briefing/generate-script';

export const dynamic = 'force-dynamic';

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
    try { return await promise; } catch (e) { console.error('[briefing] query failed:', e); return fallback; }
}

/**
 * GET /api/briefing
 *
 * Returns:
 *   - script: The text briefing script
 *   - audioUrl: Base64 data URL of TTS audio (if tier allows and OpenAI key available)
 *   - tier: User's subscription tier
 *
 * Query params:
 *   - tz: timezone offset in minutes
 *   - audio: "1" to request audio generation (default: text only)
 */
export async function GET(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const tzOffset = parseInt(searchParams.get('tz') || '0', 10);
        const wantAudio = searchParams.get('audio') === '1';
        const wantVideo = searchParams.get('video') === '1';

        const now = new Date();
        const userNow = new Date(now.getTime() - tzOffset * 60 * 1000);
        const startOfDay = new Date(userNow); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(userNow); endOfDay.setUTCHours(23, 59, 59, 999);
        const startOfDayUTC = new Date(startOfDay.getTime() + tzOffset * 60 * 1000);
        const endOfDayUTC = new Date(endOfDay.getTime() + tzOffset * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const endOfWeekUTC = new Date(endOfDayUTC.getTime() + 6 * 86400000);

        // Parallel fetch
        const [user, sub, meetings, weekMeetings, commitmentsDueToday, commitmentsDueSoon, recentSnapshots, kpis, stakeholders, recentInsights] = await Promise.all([
            safe(prisma.user.findUnique({ where: { id: userId }, select: { name: true, jobTitle: true, company: true } }), null),
            safe(prisma.subscription.findUnique({ where: { userId }, select: { tier: true } }), null),
            safe(prisma.meetingSyncRecord.findMany({
                where: { userId, startTime: { gte: startOfDayUTC, lte: endOfDayUTC }, status: { not: 'cancelled' } },
                orderBy: { startTime: 'asc' }, take: 20,
                select: { id: true, title: true, startTime: true, endTime: true, meetingCategory: true, isPresentation: true, outcomeResult: true, desiredOutcome: true }
            }), []),
            safe(prisma.meetingSyncRecord.findMany({
                where: { userId, startTime: { gt: endOfDayUTC, lte: endOfWeekUTC }, status: { not: 'cancelled' } },
                select: { id: true, startTime: true, meetingCategory: true, isPresentation: true }
            }), []),
            safe(prisma.meetingCommitment.findMany({
                where: { userId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: endOfDayUTC } },
                select: { id: true }
            }), []),
            safe(prisma.meetingCommitment.findMany({
                where: { userId, status: 'PENDING', dueDate: { gt: endOfDayUTC, lte: new Date(endOfDayUTC.getTime() + 5 * 86400000) } },
                select: { id: true }
            }), []),
            safe(prisma.meetingPatternSnapshot.findMany({
                where: { userId }, orderBy: { weekStart: 'desc' }, take: 2,
                select: { outcomesSet: true, outcomesLanded: true, commitmentsMade: true, commitmentsFulfilled: true, insights: true }
            }), []),
            safe(prisma.userKPI.findMany({
                where: { userId }, take: 5,
                select: { name: true, status: true }
            }), []),
            safe(prisma.stakeholderProfile.findMany({
                where: { userId, powerLevel: { in: ['HIGH', 'CRITICAL'] } },
                select: { name: true, relationshipStrength: true, lastInteractionDate: true },
                orderBy: { relationshipStrength: 'asc' }, take: 5
            }), []),
            safe(prisma.conversationInsight.findMany({
                where: { userId, senderType: 'ASSISTANT', confidence: { gte: 0.7 } },
                orderBy: { createdAt: 'desc' }, take: 1,
                select: { insight: true }
            }), []),
        ]);

        const tier = sub?.tier || 'FREE';

        // Computed stats
        const latest = recentSnapshots[0];
        const previous = recentSnapshots[1];
        const outcomeHitRate = latest?.outcomesSet > 0 ? Math.round((latest.outcomesLanded / latest.outcomesSet) * 100) : null;
        const previousHitRate = previous?.outcomesSet > 0 ? Math.round((previous.outcomesLanded / previous.outcomesSet) * 100) : null;
        const hitRateDelta = outcomeHitRate !== null && previousHitRate !== null ? outcomeHitRate - previousHitRate : null;
        const followThroughPct = latest?.commitmentsMade > 0 ? Math.round((latest.commitmentsFulfilled / latest.commitmentsMade) * 100) : null;

        const needsReview = meetings.filter(m => new Date(m.endTime) < now && !m.outcomeResult).length;
        const upcomingWithoutGoals = meetings.filter(m => new Date(m.startTime) > now && !m.desiredOutcome && m.meetingCategory !== 'OPERATIONAL').length;

        // Pattern insight
        let patternInsight: string | null = null;
        if (latest?.insights) {
            try {
                const ins = latest.insights as any;
                if (Array.isArray(ins) && ins.length > 0) {
                    const first = ins[0];
                    patternInsight = typeof first === 'string' ? first : first.text || first.insight || null;
                }
            } catch {}
        }

        // Stakeholder alerts
        const stakeholderAlerts = stakeholders
            .filter(s => s.relationshipStrength < 0.4 || !s.lastInteractionDate || new Date(s.lastInteractionDate) < twoWeeksAgo)
            .slice(0, 2)
            .map(s => ({
                name: s.name,
                issue: !s.lastInteractionDate || new Date(s.lastInteractionDate) < twoWeeksAgo
                    ? 'hasn\'t been engaged recently'
                    : 'has a weakening relationship'
            }));

        // Tomorrow count
        const tomorrowStart = new Date(endOfDayUTC.getTime() + 1);
        const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000);
        const meetingsTomorrow = weekMeetings.filter(m => {
            const t = new Date(m.startTime).getTime();
            return t >= tomorrowStart.getTime() && t <= tomorrowEnd.getTime();
        }).length;

        const script = generateBriefingScript({
            userName: user?.name || 'there',
            jobTitle: user?.jobTitle || null,
            company: user?.company || null,
            meetingsToday: meetings.length,
            meetingsTomorrow,
            totalWeekMeetings: meetings.length + weekMeetings.length,
            needleMovers: meetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER').length + weekMeetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER').length,
            presentations: meetings.filter(m => m.isPresentation).length,
            topMeetings: meetings.map(m => ({ title: m.title, startTime: m.startTime.toISOString(), meetingCategory: m.meetingCategory, isPresentation: m.isPresentation })),
            outcomeHitRate,
            hitRateDelta,
            followThroughPct,
            commitmentsDueToday: commitmentsDueToday.length,
            commitmentsDueSoon: commitmentsDueSoon.length,
            needsReview,
            upcomingWithoutGoals,
            stakeholderAlerts,
            patternInsight,
            recentInsight: recentInsights[0]?.insight || null,
            kpiAlerts: kpis.map(k => ({ name: k.name, status: k.status })),
            orgContext: null,
        });

        // Audio generation (PRO/ENTERPRISE only)
        let audioUrl: string | null = null;
        if (wantAudio && tier !== 'FREE') {
            const openaiKey = process.env.OPENAI_API_KEY;
            if (openaiKey) {
                try {
                    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${openaiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: 'tts-1',
                            input: script,
                            voice: 'onyx', // Deep, authoritative — fits exec briefing
                            response_format: 'mp3',
                            speed: 1.05,
                        }),
                    });

                    if (ttsResponse.ok) {
                        const audioBuffer = await ttsResponse.arrayBuffer();
                        const base64 = Buffer.from(audioBuffer).toString('base64');
                        audioUrl = `data:audio/mp3;base64,${base64}`;
                    } else {
                        console.error('[briefing] TTS failed:', ttsResponse.status, await ttsResponse.text());
                    }
                } catch (e) {
                    console.error('[briefing] TTS error:', e);
                }
            }
        }

        // Video generation (PRO/ENTERPRISE only, on demand)
        let videoUrl: string | null = null;
        if (wantVideo && tier !== 'FREE') {
            try {
                // Generate topic from user context
                const topicParts: string[] = ['Executive morning briefing'];
                if (user?.jobTitle) topicParts.push(`for a ${user.jobTitle}`);
                if (user?.company) topicParts.push(`at ${user.company}`);

                const invideoRes = await fetch('https://ai.invideo.io/api/v1/generate-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        script,
                        topic: topicParts.join(' '),
                        vibe: 'professional, authoritative, sleek, executive-grade',
                        targetAudience: 'Senior executives and business leaders',
                        platform: 'youtube',
                    }),
                });

                if (invideoRes.ok) {
                    const videoData = await invideoRes.json();
                    videoUrl = videoData.url || videoData.videoUrl || null;
                } else {
                    console.error('[briefing] Video generation failed:', invideoRes.status);
                }
            } catch (e) {
                console.error('[briefing] Video generation error:', e);
            }
        }

        return NextResponse.json({
            success: true,
            script,
            audioUrl,
            videoUrl,
            tier,
            canPlayAudio: tier !== 'FREE',
            canPlayVideo: tier !== 'FREE',
        });
    } catch (error) {
        console.error('[briefing] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate briefing' }, { status: 500 });
    }
}
