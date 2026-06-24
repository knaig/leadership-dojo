import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { createOutboundCall, createWebCallAssistant, type CallContext, type VoiceCallType, type PersonalCtx } from '@/lib/vapi';
import { ensureUserExists } from '@/lib/ensure-user';
import { FF_TEMP_ANNOUNCE_CALL_NUMBER } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

const VAPI_API_BASE = 'https://api.vapi.ai';
const WEBHOOK_URL = 'https://miracos.vercel.app/api/vapi/webhook';

/** Format a Date to IST time string (user is in IST) */
function fmtIST(date: Date): string {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

/** Map call types to persistent Vapi Assistant IDs */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function getAssistantId(callType: string): string | null {
    const map: Record<string, string | undefined> = {
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
    const id = map[callType] || process.env.VAPI_ASSISTANT_DAILY || null;
    // Only return if it's a valid UUID — otherwise fall back to inline assistant
    return id && UUID_RE.test(id) ? id : null;
}

/** Build variable values for persistent assistant — exact meeting data, no hallucination */
async function buildVariableValues(
    userId: string, userName: string, jobTitle: string | null,
    callType: string, meetingId?: string,
): Promise<Record<string, string>> {
    const todayFormatted = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });
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

    // Relationship stage
    const personalCtx = await prisma.personalContext.findUnique({
        where: { userId }, select: { callCount: true },
    }).catch(() => null);
    const callCount = personalCtx?.callCount || 0;
    vars.callCount = String(callCount);
    vars.relationshipStage = callCount < 5 ? 'new' : callCount < 15 ? 'building' : 'established';

    // Today's meetings
    const now = new Date();
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: now, lte: endOfDay }, status: { not: 'cancelled' } },
        select: { title: true, startTime: true, meetingCategory: true },
        orderBy: { startTime: 'asc' }, take: 8,
    });
    if (meetings.length > 0) {
        vars.meetingsSummary = meetings.map(m => {
            const time = fmtIST(m.startTime);
            const cat = m.meetingCategory ? ` [${m.meetingCategory}]` : '';
            return `${time} — ${m.title}${cat}`;
        }).join('\n');
        vars.meetingCount = String(meetings.length);
    } else {
        vars.meetingsSummary = 'No more meetings today';
        vars.meetingCount = '0';
    }

    // Specific meeting (for prep/debrief)
    if (meetingId) {
        const meeting = await prisma.meetingSyncRecord.findUnique({
            where: { id: meetingId },
            select: { title: true, startTime: true, participants: true, meetingCategory: true, desiredOutcome: true },
        });
        if (meeting) {
            vars.meetingTitle = meeting.title;
            vars.meetingTime = fmtIST(meeting.startTime);
            vars.meetingParticipants = Array.isArray(meeting.participants) ? (meeting.participants as string[]).join(', ') : '';
            vars.meetingCategory = meeting.meetingCategory || '';
            vars.meetingDesiredOutcome = meeting.desiredOutcome || '';
        }
    }

    // Overdue commitments
    const overdueActions = await prisma.relationshipAction.findMany({
        where: { goal: { userId }, status: 'IN_PROGRESS', dueDate: { lt: now } },
        select: { description: true }, take: 3,
    }).catch(() => []);
    vars.overdueCommitments = overdueActions.map(a => a.description).join('\n') || '';

    // Last call summary (prevent same-day repetition)
    const lastCall = await prisma.voiceCall.findFirst({
        where: { userId, status: 'ended', summary: { not: null } },
        orderBy: { endedAt: 'desc' },
        select: { summary: true, callType: true, endedAt: true },
    }).catch(() => null);
    if (lastCall?.summary && lastCall.endedAt?.toLocaleDateString() === now.toLocaleDateString()) {
        vars.lastCallSummary = `Earlier today (${lastCall.callType}): ${lastCall.summary.substring(0, 500)}`;
    } else {
        vars.lastCallSummary = '';
    }

    // Domain context + Company context (from knowledge graph)
    const [domainCtx, projectEntities, projectFacts] = await Promise.all([
        prisma.domainContext.findUnique({
            where: { userId }, select: { organization: true, landscape: true },
        }).catch(() => null),
        // Get project entities from knowledge graph
        prisma.knowledgeEntity.findMany({
            where: { userId, type: 'PROJECT' },
            select: { id: true, name: true, properties: true },
            take: 15,
        }).catch(() => []),
        // Get recent facts about projects (relationships, status, blockers)
        prisma.knowledgeFact.findMany({
            where: {
                userId,
                subject: { type: 'PROJECT' },
            },
            select: {
                predicate: true,
                objectValue: true,
                subject: { select: { name: true } },
                objectEntity: { select: { name: true, type: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 40,
        }).catch(() => []),
    ]);

    if (domainCtx) {
        const parts: string[] = [];
        for (const section of [domainCtx.organization, domainCtx.landscape]) {
            if (section && typeof section === 'object') {
                for (const [k, v] of Object.entries(section as Record<string, string>)) {
                    if (v) parts.push(`${k}: ${String(v).substring(0, 200)}`);
                }
            }
        }
        vars.domainContext = parts.join('\n') || '';
    } else {
        vars.domainContext = '';
    }

    // Build companyContext from knowledge graph — projects, their people, and relationships
    const projectSummaries: string[] = [];
    const projectNames = new Set(projectEntities.map(p => p.name));
    // Group facts by project
    const factsByProject: Record<string, string[]> = {};
    for (const f of projectFacts) {
        const proj = f.subject?.name || 'Unknown';
        if (!factsByProject[proj]) factsByProject[proj] = [];
        const obj = f.objectEntity ? `${f.objectEntity.name}` : (f.objectValue || '');
        if (obj) factsByProject[proj].push(`${f.predicate}: ${obj}`);
    }
    for (const proj of projectEntities.slice(0, 10)) {
        const facts = factsByProject[proj.name] || [];
        const uniqueFacts = [...new Set(facts)].slice(0, 5);
        if (uniqueFacts.length > 0) {
            projectSummaries.push(`${proj.name}: ${uniqueFacts.join('; ')}`);
        } else {
            projectSummaries.push(proj.name);
        }
    }
    vars.companyContext = projectSummaries.length > 0
        ? `Active projects:\n${projectSummaries.join('\n')}`
        : vars.domainContext;

    // Cross-call memory — recent call summaries so Mira remembers past conversations
    const recentCalls = await prisma.voiceCall.findMany({
        where: { userId, status: 'ended', summary: { not: null }, durationSeconds: { gt: 30 } },
        orderBy: { endedAt: 'desc' },
        take: 5,
        select: { summary: true, callType: true, endedAt: true },
    }).catch(() => []);

    if (recentCalls.length > 0) {
        const today = now.toLocaleDateString();
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
        vars.recentCallHistory = '';
    }

    // Voice-extracted learnings — what Mira has learned from past conversations
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const voiceInsights = await prisma.conversationInsight.findMany({
        where: { userId, conversationDate: { gte: sevenDaysAgo }, contextType: 'PAST_LEARNING' },
        orderBy: { conversationDate: 'desc' },
        take: 10,
        select: { insight: true },
    }).catch(() => []);
    vars.learnedFromCalls = voiceInsights.length > 0
        ? voiceInsights.map(i => (i.insight || '').substring(0, 200)).join('\n')
        : '';

    // PersonalContext — what we know about them as a person
    const personalDetails = await prisma.personalContext.findUnique({
        where: { userId },
        select: { energyPatterns: true, interests: true, stressSignals: true, values: true, personalWins: true, preferredCallStyle: true, knownTopics: true, gapTopics: true },
    }).catch(() => null);
    if (personalDetails) {
        const pp: string[] = [];
        if (personalDetails.interests?.length) pp.push(`Interests: ${personalDetails.interests}`);
        if (personalDetails.values?.length) pp.push(`Values: ${personalDetails.values}`);
        if (personalDetails.stressSignals) pp.push(`Stress signals: ${personalDetails.stressSignals}`);
        if (personalDetails.energyPatterns) pp.push(`Energy patterns: ${personalDetails.energyPatterns}`);
        if (personalDetails.preferredCallStyle) pp.push(`Prefers: ${personalDetails.preferredCallStyle}`);
        if (personalDetails.personalWins) pp.push(`Recent wins: ${personalDetails.personalWins}`);
        vars.personalContext = pp.join('\n') || '';
    } else {
        vars.personalContext = '';
    }

    // Calendar insights (for onboarding calls — show breadth of knowledge)
    if (callType === 'onboarding') {
        const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
        const weekMeetings = await prisma.meetingSyncRecord.findMany({
            where: { userId, startTime: { gte: weekStart, lt: weekEnd }, status: { not: 'cancelled' } },
            select: { title: true, startTime: true, endTime: true, meetingCategory: true, attendees: true, isRecurring: true },
            orderBy: { startTime: 'asc' },
        }).catch(() => []);
        if (weekMeetings.length > 0) {
            let totalHours = 0;
            const personCounts: Record<string, number> = {};
            for (const m of weekMeetings) {
                totalHours += (m.endTime.getTime() - m.startTime.getTime()) / (1000 * 60 * 60);
                for (const a of (Array.isArray(m.attendees) ? m.attendees as any[] : [])) {
                    const name = a.name || a.email?.split('@')[0] || '';
                    if (name && name.toLowerCase() !== userName.toLowerCase()) personCounts[name] = (personCounts[name] || 0) + 1;
                }
            }
            const topPeople = Object.entries(personCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n} (${c} meetings)`);
            vars.calendarInsights = [
                `${weekMeetings.length} meetings this week, ~${totalHours.toFixed(1)} hours`,
                topPeople.length > 0 ? `Most time with: ${topPeople.join(', ')}` : '',
            ].filter(Boolean).join('\n');

            // Busiest/lightest day for the prompt
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const meetingsByDay: Record<number, number> = {};
            for (const m of weekMeetings) {
                const day = m.startTime.getDay();
                meetingsByDay[day] = (meetingsByDay[day] || 0) + 1;
            }
            const sortedDays = Object.entries(meetingsByDay).sort(([, a], [, b]) => b - a);
            if (sortedDays.length > 0) {
                vars.busiestDay = `${dayNames[Number(sortedDays[0][0])]} (${sortedDays[0][1]} meetings)`;
                vars.lightestDay = `${dayNames[Number(sortedDays[sortedDays.length - 1][0])]} (${sortedDays[sortedDays.length - 1][1]} meetings)`;
            }
        } else {
            vars.calendarInsights = '';
        }

        // Email insights
        const recentEmails = await prisma.emailSummary.findMany({
            where: { userId }, orderBy: { lastMessageAt: 'desc' }, take: 10,
            select: { subject: true, from: true, isImportant: true, requiresAction: true, keyTopics: true },
        }).catch(() => []);
        if (recentEmails.length > 0) {
            const important = recentEmails.filter(e => e.isImportant || e.requiresAction).slice(0, 3).map(e => `"${e.subject}" from ${e.from}`);
            const topics = recentEmails.flatMap(e => e.keyTopics || []);
            const topicCounts: Record<string, number> = {};
            for (const t of topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
            const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
            vars.emailInsights = [
                important.length > 0 ? `Important: ${important.join('; ')}` : '',
                topTopics.length > 0 ? `Hot topics: ${topTopics.join(', ')}` : '',
            ].filter(Boolean).join('\n');
        } else {
            vars.emailInsights = '';
        }

        // Known stakeholders
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId }, orderBy: { powerLevel: 'asc' }, take: 8,
            select: { name: true, role: true, influenceRole: true },
        }).catch(() => []);
        vars.knownStakeholders = stakeholders.length > 0
            ? stakeholders.map(s => { const p = [s.name]; if (s.role) p.push(`(${s.role})`); return p.join(' '); }).join('\n')
            : '';

        // Recent documents
        const recentDocs = await prisma.workArtifact.findMany({
            where: { userId, type: 'DOCUMENT_AUTHORED' }, orderBy: { occurredAt: 'desc' }, take: 5, select: { title: true },
        }).catch(() => []);
        vars.recentDocuments = recentDocs.length > 0 ? recentDocs.map(d => d.title).join(', ') : '';
    }

    // Onboarding progress
    const progress = await prisma.onboardingProgress.findUnique({ where: { userId } }).catch(() => null);
    if (progress) {
        const covered: string[] = [], uncovered: string[] = [];
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
    // Principle: LEAD WITH VALUE. Never open with cold open-ended questions.
    if (callType === 'onboarding') {
        const callNum = parseInt(vars.totalOnboardingCalls || '0', 10);
        const firstName = userName.split(' ')[0];

        if (callNum === 0) {
            const meetingCount = parseInt(vars.meetingCount || '0', 10);
            if (meetingCount > 0) {
                vars.firstMessage = `Hey ${firstName}! I'm Mira. I've been looking through your week and I already have thoughts — you've got ${meetingCount} meetings today alone. This is going to be a short call, just five minutes. I want to tell you what I see and learn a bit about the person behind all those meetings.`;
            } else {
                vars.firstMessage = `Hey ${firstName}! I'm Mira. I'm really glad you're here. This is going to be a short call — just five minutes — and I promise by the end you'll know exactly what to expect from me. I'd love to start with your story — how'd you end up where you are?`;
            }
        } else if (callNum <= 5) {
            // Lead with something specific from recent calls or data
            if (vars.recentCallHistory && vars.recentCallHistory.length > 20) {
                const firstCall = vars.recentCallHistory.split('\n')[0] || '';
                const summary = firstCall.replace(/^(Yesterday|[0-9]+ days ago)\s*\([^)]+\):\s*/, '').substring(0, 100);
                if (summary.length > 10) {
                    vars.firstMessage = `Hey ${firstName}. I've been thinking about something from last time — ${summary.split('.')[0].toLowerCase()}. I want to pick that up.`;
                } else {
                    vars.firstMessage = `Hey ${firstName}. I've been looking at your day and I have some thoughts.`;
                }
            } else {
                vars.firstMessage = `Hey ${firstName}. I've been looking at your day and I have some thoughts.`;
            }
        } else {
            const coveredCount = (vars.onboardingCovered || '').split(',').filter((s: string) => s.trim()).length;
            if (coveredCount > 0) {
                vars.firstMessage = `Hey ${firstName}. We've covered a lot of ground in ${callNum} conversations — I feel like I'm starting to see the full picture. There are a few things I want to explore today.`;
            } else {
                vars.firstMessage = `Hey ${firstName}. Good to connect again. I've been looking through your calendar and I have some thoughts.`;
            }
        }
    }

    // Dynamic first message for daily/other calls — always lead with value
    if (!vars.firstMessage) {
        const name = userName.split(' ')[0];
        const meetingCount = parseInt(vars.meetingCount || '0', 10);

        if (callType === 'pre_meeting_prep') {
            vars.firstMessage = `Hey ${name}. Quick prep before your ${vars.meetingTitle || 'meeting'}.`;
        } else if (callType === 'post_meeting_debrief') {
            vars.firstMessage = `Hey ${name}. How'd ${vars.meetingTitle || 'it'} go?`;
        } else if (callCount <= 1) {
            vars.firstMessage = `Hey ${name}, it's Mira. I've been looking at your day — I think I can be useful.`;
        } else if (callCount <= 3) {
            vars.firstMessage = vars.recentCallHistory && vars.recentCallHistory.length > 10
                ? `Hey ${name}. Been thinking about what we talked about yesterday. I want to pick that up.`
                : `Morning, ${name}. I've been looking at your day and I have a couple thoughts.`;
        } else if (callCount <= 10) {
            if (vars.overdueCommitments && vars.overdueCommitments.length > 5) {
                vars.firstMessage = `Morning, ${name}. I've been tracking something — want to check in on it.`;
            } else if (meetingCount >= 5) {
                vars.firstMessage = `Hey ${name}. Full day ahead — I looked through it and want to flag a couple things.`;
            } else if (meetingCount === 0) {
                vars.firstMessage = `Morning, ${name}. Light calendar today — I want to use the breathing room well.`;
            } else if (vars.recentCallHistory && vars.recentCallHistory.length > 10) {
                vars.firstMessage = `Morning, ${name}. Something from yesterday's conversation has been on my mind.`;
            } else {
                vars.firstMessage = `Hey ${name}. I've been looking at your week and I have an observation.`;
            }
        } else if (callCount <= 20) {
            const openers = [
                `Morning, ${name}. I have thoughts.`,
                `Hey ${name}. I noticed something in your calendar I want to flag.`,
                `${name}. Couple things I want to get into today.`,
                `Morning. I've been looking at your week — I see a pattern.`,
                `Hey ${name}. Something came up that I think matters.`,
            ];
            vars.firstMessage = openers[callCount % openers.length];
        } else {
            const openers = [
                `Morning, ${name}. I've got something for you.`,
                `Hey ${name}. I noticed something interesting.`,
                `${name}. Let's dig in — I have thoughts.`,
                `Morning. Something I want to flag before your day starts.`,
                `Hey ${name}. I've been connecting some dots.`,
                `Good morning. I want to share an observation.`,
            ];
            vars.firstMessage = openers[callCount % openers.length];
        }
    }

    // Prompt Insights — auto-learned coaching strategies (self-activating)
    try {
        const insights = await prisma.promptInsight.findMany({
            where: {
                status: { in: ['active', 'validated'] },
                OR: [{ scope: 'system' }, { userId }],
            },
            orderBy: [{ status: 'asc' }, { confidence: 'desc' }],
            take: 6,
            select: { recommendation: true, status: true },
        });
        if (insights.length > 0) {
            const lines = insights.map(i => {
                const tag = i.status === 'validated' ? '✓ PROVEN' : '→ TESTING';
                return `[${tag}] ${i.recommendation}`;
            });
            vars.promptInsights = `DATA-DRIVEN COACHING INSIGHTS (learned from analyzing past calls):\n${lines.join('\n')}\nApply these naturally — don't mention that they come from analysis.`;
        } else {
            vars.promptInsights = '';
        }
    } catch {
        vars.promptInsights = '';
    }

    // Hypotheses to test — from hypothesis engine
    try {
        const readyHypotheses = await prisma.hypothesis.findMany({
            where: { userId, status: 'READY' },
            orderBy: [{ priority: 'asc' }, { confidence: 'desc' }],
            take: 2,
            select: { id: true, presentationText: true, evidence: true, confidence: true },
        });

        if (readyHypotheses.length > 0) {
            // Mark as PRESENTED
            await prisma.hypothesis.updateMany({
                where: { id: { in: readyHypotheses.map(h => h.id) } },
                data: { status: 'PRESENTED', presentedAt: new Date() },
            });

            const lines = readyHypotheses.map(h =>
                `- ${h.presentationText} [confidence: ${Math.round(h.confidence * 100)}%, based on: ${h.evidence.substring(0, 100)}]`
            );
            vars.hypotheses = `## HYPOTHESES TO TEST (present naturally, observe reaction)\n${lines.join('\n')}\nIMPORTANT: Frame as observations, not assertions. Watch for confirmation or correction.`;
        } else {
            vars.hypotheses = '';
        }
    } catch {
        vars.hypotheses = '';
    }

    return vars;
}

/**
 * POST /api/vapi/call
 * Start a contextual voice call with Mira.
 *
 * Body:
 *   type: 'phone' | 'web'
 *   callType: VoiceCallType
 *   meetingId?: string        — for pre/post meeting calls
 *   phoneNumber?: string      — override phone number
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const body = await req.json();
    let { type = 'web', callType = 'general', meetingId, phoneNumber } = body;

    // Auto-detect onboarding: if user hasn't completed onboarding and no specific callType requested,
    // use the onboarding assistant. After 10+ calls, graduate to daily even if not all topics covered —
    // onboarding detection continues in background to fill gaps naturally.
    if (callType === 'general' || callType === 'daily_checkin') {
        const onboarding = await prisma.onboardingProgress.findUnique({ where: { userId } }).catch(() => null);
        const completedCalls = await prisma.voiceCall.count({ where: { userId, status: 'ended' } }).catch(() => 0);
        if ((!onboarding || !onboarding.onboardingComplete) && completedCalls < 10) {
            callType = 'onboarding';
        }
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                jobTitle: true,
                company: true,
                phoneNumber: true,
                businessContext: {
                    select: { strengths: true, blindSpots: true },
                },
                personalContext: {
                    select: {
                        energyPatterns: true,
                        interests: true,
                        stressSignals: true,
                        preferredCallStyle: true,
                        humorReceptivity: true,
                        commuteInfo: true,
                        callCount: true,
                        firstCallDate: true,
                    },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const userName = user.name || 'there';

        // Calculate relationship week
        const firstCall = user.personalContext?.firstCallDate;
        const relationshipWeek = firstCall
            ? Math.max(1, Math.ceil((Date.now() - firstCall.getTime()) / (7 * 24 * 60 * 60 * 1000)))
            : 1;

        // Build personal context (only what user has opted in to share)
        const personal: PersonalCtx | undefined = user.personalContext ? {
            energyPatterns: user.personalContext.energyPatterns || undefined,
            interests: user.personalContext.interests,
            stressSignals: user.personalContext.stressSignals || undefined,
            preferredCallStyle: user.personalContext.preferredCallStyle || undefined,
            humorReceptivity: user.personalContext.humorReceptivity || undefined,
            commuteInfo: user.personalContext.commuteInfo || undefined,
            strengths: user.businessContext?.strengths || undefined,
            blindSpots: user.businessContext?.blindSpots || undefined,
            callCount: user.personalContext.callCount,
        } : undefined;

        // Build context based on call type
        const ctx: CallContext = {
            callType: callType as VoiceCallType,
            userName,
            userJobTitle: user.jobTitle || undefined,
            userId,
            personal,
            relationshipWeek,
        };

        // Enrich context based on call type
        if ((callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief') && meetingId) {
            ctx.meeting = await buildMeetingContext(userId, meetingId);
        } else if (callType === 'morning_brief') {
            ctx.todaySummary = await buildMorningSummary(userId);
        } else if (callType === 'commitment_reminder') {
            ctx.commitments = await buildCommitmentContext(userId);
        } else if (callType === 'weekly_reflection' || callType === 'friday_ritual') {
            ctx.weekSummary = await buildWeekSummary(userId);
        } else if (callType === 'general' || callType === 'the_walk') {
            ctx.additionalContext = await buildGeneralContext(userId, user);
        }

        if (type === 'phone') {
            // KILL SWITCH — outbound phone calls disabled (cost). Web calls are free.
            return NextResponse.json({ error: 'Phone calls are disabled. Use the web call button instead.' }, { status: 503 });

            let targetNumber = phoneNumber || user.phoneNumber;
            if (!targetNumber) {
                return NextResponse.json({
                    error: 'No phone number. Add your number in Settings.',
                }, { status: 400 });
            }

            // Ensure E.164 format for Vapi (e.g., +918130024145)
            targetNumber = targetNumber.replace(/[\s\-()]/g, '');
            if (!targetNumber.startsWith('+')) {
                if (targetNumber.startsWith('91') && targetNumber.length === 12) {
                    targetNumber = '+' + targetNumber;
                } else if (targetNumber.length === 10) {
                    targetNumber = '+91' + targetNumber;
                } else {
                    targetNumber = '+' + targetNumber;
                }
            }

            const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
            const apiKey = process.env.VAPI_API_KEY;
            if (!phoneNumberId || !apiKey) {
                return NextResponse.json({ error: 'Voice calling not configured' }, { status: 500 });
            }

            // Use persistent Vapi Assistant with exact data (no hallucination)
            const assistantId = getAssistantId(callType);
            const variableValues = await buildVariableValues(userId, userName, user.jobTitle, callType, meetingId);

            // FF_TEMP_ANNOUNCE_CALL_NUMBER: inject call number tag for persistent assistants
            if (FF_TEMP_ANNOUNCE_CALL_NUMBER) {
                const nextCallNumber = (parseInt(variableValues.callCount || '0', 10)) + 1;
                variableValues.callNumberTag = `Call number ${nextCallNumber}. `;
            } else {
                variableValues.callNumberTag = '';
            }

            // Resolve prompt from DB (with hardcoded fallback) for observation
            let observation: { templateName: string; templateVersion: number; source: string; assembledPrompt: string; firstMessage: string; variables: Record<string, string>; maxDurationSeconds: number } | undefined;

            let vapiPayload;
            if (assistantId) {
                vapiPayload = {
                    assistantId,
                    phoneNumberId,
                    customer: { number: targetNumber, name: userName },
                    assistantOverrides: {
                        variableValues,
                        firstMessage: variableValues.firstMessage || `Hey ${userName.split(' ')[0]}! It's Mira.`,
                        serverUrl: WEBHOOK_URL,
                    },
                    metadata: { userId, callType, meetingId: meetingId || undefined },
                };
            } else {
                // Fallback to inline assistant if no persistent assistant configured
                const { getMiraAssistantConfig } = await import('@/lib/vapi');
                const { config: assistant, observation: obs } = await getMiraAssistantConfig(ctx);
                observation = obs;
                vapiPayload = {
                    phoneNumberId,
                    customer: { number: targetNumber, name: userName },
                    assistant,
                    metadata: { userId, callType },
                };
            }

            const vapiRes = await fetch(`${VAPI_API_BASE}/call/phone`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(vapiPayload),
            });

            if (!vapiRes.ok) {
                const error = await vapiRes.text();
                throw new Error(`Vapi call failed: ${error}`);
            }

            const call = await vapiRes.json() as { id: string; status: string };

            await prisma.voiceCall.create({
                data: {
                    userId,
                    vapiCallId: call.id,
                    callType,
                    direction: 'outbound',
                    status: 'queued',
                    meetingId: meetingId || null,
                    // Observation: record what prompt was used
                    promptTemplateName: observation?.templateName || null,
                    promptTemplateVersion: observation?.templateVersion || null,
                    assembledPrompt: observation?.assembledPrompt || null,
                    sentVariables: observation ? observation.variables : variableValues,
                    firstMessageSent: observation?.firstMessage || null,
                },
            });

            return NextResponse.json({
                callId: call.id,
                status: call.status,
                type: 'phone',
                callType,
            });
        }

        // Web call — use persistent assistant with full context (same as phone)
        const webAssistantId = getAssistantId(callType);
        const webVariableValues = await buildVariableValues(userId, userName, user.jobTitle, callType, meetingId);

        // FF_TEMP_ANNOUNCE_CALL_NUMBER
        if (FF_TEMP_ANNOUNCE_CALL_NUMBER) {
            const nextCallNumber = (parseInt(webVariableValues.callCount || '0', 10)) + 1;
            webVariableValues.callNumberTag = `Call number ${nextCallNumber}. `;
        } else {
            webVariableValues.callNumberTag = '';
        }

        let webAssistant;
        let webSentVariables: Record<string, string> = webVariableValues;
        if (webAssistantId) {
            // Persistent assistant — return assistantId + overrides for Vapi Web SDK
            webAssistant = {
                assistantId: webAssistantId,
                assistantOverrides: {
                    variableValues: webVariableValues,
                    firstMessage: webVariableValues.firstMessage || `Hey ${userName.split(' ')[0]}! It's Mira.`,
                    serverUrl: WEBHOOK_URL,
                },
            };
        } else {
            // Fallback to inline assistant
            const { getMiraAssistantConfig } = await import('@/lib/vapi');
            const { config: inlineConfig } = await getMiraAssistantConfig(ctx);
            webAssistant = inlineConfig;
        }

        const voiceCall = await prisma.voiceCall.create({
            data: {
                userId,
                callType,
                direction: 'web',
                status: 'connecting',
                meetingId: meetingId || null,
                sentVariables: webSentVariables,
                firstMessageSent: webVariableValues.firstMessage || null,
            },
        });

        return NextResponse.json({
            assistant: webAssistant,
            type: 'web',
            callType,
            voiceCallId: voiceCall.id,
            publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || null,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Call failed';
        console.error('[Vapi Call] Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// ── Context Builders ──

async function buildMeetingContext(userId: string, meetingId: string) {
    const meeting = await prisma.meetingSyncRecord.findUnique({
        where: { id: meetingId, userId },
        select: {
            title: true,
            startTime: true,
            endTime: true,
            participants: true,
            meetingType: true,
            desiredOutcome: true,
            description: true,
            meetingCategory: true,
            userImportanceOverride: true,
        },
    });

    if (!meeting) return undefined;

    // Get attendee intel
    const participants = (meeting.participants || []) as string[];
    const attendeeProfiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            email: { in: participants.map(e => e.toLowerCase()), mode: 'insensitive' },
        },
        select: {
            name: true,
            role: true,
            powerLevel: true,
            relationshipType: true,
            relationshipStrength: true,
            personaArchetype: true,
            intelligence: {
                select: { profileSummary: true, successPatterns: true, objectionPatterns: true },
            },
        },
        take: 5,
    });

    // Build narrative intel with relationship context
    const intelLines = attendeeProfiles.map(p => {
        const parts = [p.name];
        if (p.role) parts.push(`(${p.role})`);
        if (p.powerLevel === 'HIGH') parts.push('— key decision maker');
        if (p.personaArchetype) parts.push(`[${p.personaArchetype}]`);
        if (p.relationshipStrength !== null && p.relationshipStrength < 0.3) {
            parts.push('⚠ Weak relationship — invest here');
        }
        if (p.intelligence?.profileSummary) parts.push(`— ${p.intelligence.profileSummary}`);
        if (p.intelligence?.objectionPatterns?.length) parts.push(`Watch for: ${p.intelligence.objectionPatterns.slice(0, 2).join('; ')}`);
        if (p.intelligence?.successPatterns?.length) parts.push(`What works: ${p.intelligence.successPatterns.slice(0, 2).join('; ')}`);
        return parts.join(' ');
    });

    // Get user's growth tip
    const userIntel = await prisma.userIntelligence.findUnique({
        where: { userId },
        select: { growthAreas: true },
    });

    const growthAreas = userIntel?.growthAreas as { area?: string }[] | null;
    const growthTip = growthAreas?.[0]?.area || null;

    const stakes = meeting.userImportanceOverride || (meeting.meetingCategory === 'NEEDLE_MOVER' ? 'high' : undefined);

    return {
        title: meeting.title,
        startTime: meeting.startTime.toISOString(),
        attendees: participants.map(e => {
            const profile = attendeeProfiles.find(p => p.name && e.toLowerCase().includes(p.name.toLowerCase()));
            return profile?.name || e.split('@')[0];
        }),
        attendeeIntel: intelLines.length > 0 ? intelLines.join('\n') : undefined,
        desiredOutcome: meeting.desiredOutcome || undefined,
        userGrowthTip: growthTip || undefined,
        stakes,
        meetingType: meeting.meetingType || undefined,
    };
}

async function buildMorningSummary(userId: string) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: startOfDay, lte: endOfDay }, status: { not: 'cancelled' } },
        orderBy: { startTime: 'asc' },
        select: { title: true, startTime: true, meetingCategory: true, userImportanceOverride: true },
        take: 10,
    });

    const overdueCommitments = await prisma.meetingCommitment.findMany({
        where: { userId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: now } },
        select: { description: true, owner: true },
        take: 3,
    });

    const lines = [`${meetings.length} meeting${meetings.length !== 1 ? 's' : ''} today.`];

    const keyMeeting = meetings.find(m =>
        m.userImportanceOverride === 'critical' || m.userImportanceOverride === 'high' || m.meetingCategory === 'NEEDLE_MOVER'
    ) || meetings[0];

    if (keyMeeting) {
        const time = fmtIST(new Date(keyMeeting.startTime));
        lines.push(`Key meeting: "${keyMeeting.title}" at ${time}.`);
    }

    if (meetings.length > 1) {
        const others = meetings.filter(m => m !== keyMeeting).slice(0, 3);
        lines.push(`Also: ${others.map(m => m.title).join(', ')}.`);
    }

    if (overdueCommitments.length > 0) {
        lines.push(`${overdueCommitments.length} overdue follow-up${overdueCommitments.length > 1 ? 's' : ''}: ${overdueCommitments.map(c => `"${c.description}"`).join(', ')}.`);
    }

    if (meetings.length === 0) {
        lines.push('Light day — no meetings. Good day for deep work or strategic thinking.');
    }

    return lines.join('\n');
}

async function buildWeekSummary(userId: string) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: startOfWeek, lte: now } },
        select: {
            title: true,
            outcomeResult: true,
            desiredOutcome: true,
            meetingCategory: true,
        },
    });

    const total = meetings.length;
    const withOutcomes = meetings.filter(m => m.desiredOutcome);
    const landed = meetings.filter(m => m.outcomeResult === 'LANDED');
    const missed = meetings.filter(m => m.outcomeResult === 'MISSED');
    const needlemovers = meetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER');

    const lines = [
        `${total} meetings this week.`,
        withOutcomes.length > 0 ? `Outcomes set on ${withOutcomes.length}. Landed ${landed.length}, missed ${missed.length}.` : '',
        needlemovers.length > 0 ? `${needlemovers.length} needle-mover meeting${needlemovers.length > 1 ? 's' : ''}.` : '',
    ].filter(Boolean);

    if (landed.length > 0) {
        lines.push(`Wins: ${landed.slice(0, 3).map(m => `"${m.title}"`).join(', ')}`);
    }
    if (missed.length > 0) {
        lines.push(`Missed: ${missed.slice(0, 2).map(m => `"${m.title}"`).join(', ')}`);
    }

    return lines.join('\n');
}

async function buildCommitmentContext(userId: string) {
    const now = new Date();
    const commitments = await prisma.meetingCommitment.findMany({
        where: { userId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: now } },
        include: { meeting: { select: { title: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
    });

    return commitments.map(c => ({
        description: c.description,
        owner: c.owner,
        dueDate: c.dueDate.toLocaleDateString(),
        meeting: c.meeting?.title,
    }));
}

async function buildGeneralContext(userId: string, user: { company: string | null; jobTitle: string | null }) {
    const parts: string[] = [];
    if (user.company) parts.push(`Works at ${user.company}`);
    if (user.jobTitle) parts.push(`Role: ${user.jobTitle}`);

    const upcoming = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) }, status: { not: 'cancelled' } },
        select: { title: true, startTime: true, participants: true, meetingCategory: true, desiredOutcome: true },
        orderBy: { startTime: 'asc' },
        take: 6,
    });

    if (upcoming.length > 0) {
        const meetingLines = upcoming.map(m => {
            const time = fmtIST(new Date(m.startTime));
            const cat = m.meetingCategory ? ` [${m.meetingCategory}]` : '';
            const people = Array.isArray(m.participants) && m.participants.length > 0
                ? ` (${(m.participants as string[]).slice(0, 3).map(p => p.split('@')[0]).join(', ')})`
                : '';
            const outcome = m.desiredOutcome ? ` — Goal: ${m.desiredOutcome}` : '';
            return `${time} — ${m.title}${cat}${people}${outcome}`;
        });
        parts.push(`Upcoming meetings:\n${meetingLines.join('\n')}`);
    }

    const responsibility = await prisma.userResponsibility.findFirst({
        where: { userId },
        select: { scope: true },
    });
    if (responsibility?.scope) parts.push(`Scope: ${responsibility.scope}`);

    // Recent projects/documents from Google Drive sync
    const recentDocs = await prisma.workArtifact.findMany({
        where: { userId, type: 'DOCUMENT_AUTHORED' },
        orderBy: { occurredAt: 'desc' },
        select: { title: true },
        take: 5,
    }).catch(() => []);

    if (recentDocs.length > 0) {
        parts.push(`Recent documents: ${recentDocs.map(d => d.title).join(', ')}`);
    }

    // Recent email threads from Gmail (EmailSummary table, kept fresh by email-sync worker)
    const recentEmails = await prisma.emailSummary.findMany({
        where: {
            userId,
            subject: {
                not: { startsWith: 'Accepted:' },
            },
        },
        orderBy: { lastMessageAt: 'desc' },
        select: { subject: true, from: true, summary: true, isImportant: true, requiresAction: true, messageCount: true },
        take: 8,
    }).catch(() => []);

    if (recentEmails.length > 0) {
        const emailLines = recentEmails
            .filter(e => !e.subject.startsWith('Invitation:') && !e.subject.startsWith('Declined:') && !e.subject.startsWith('Updated invitation:'))
            .slice(0, 5)
            .map(e => {
                const flags = [e.isImportant ? '!' : '', e.requiresAction ? 'ACTION' : ''].filter(Boolean).join(' ');
                const snippet = e.summary ? e.summary.substring(0, 80).replace(/\n/g, ' ') : '';
                return `"${e.subject}" (${e.from.split('<')[0].trim()})${flags ? ' [' + flags + ']' : ''}${snippet ? ' — ' + snippet : ''}`;
            });
        if (emailLines.length > 0) parts.push(`Recent emails:\n${emailLines.join('\n')}`);
    }

    // Knowledge graph — recent facts about projects, topics, and people
    // Deduplicate: group by subject + predicate, take unique objects
    const recentFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            confidence: { gte: 0.6 },
            subject: { type: { in: ['PROJECT', 'TOPIC', 'PERSON'] } },
        },
        orderBy: { createdAt: 'desc' },
        select: {
            subject: { select: { name: true, type: true } },
            predicate: true,
            objectValue: true,
            objectEntity: { select: { name: true } },
        },
        take: 20,
    }).catch(() => []);

    if (recentFacts.length > 0) {
        // Group by subject and collapse multiple facts into one line
        const grouped = new Map<string, string[]>();
        for (const f of recentFacts) {
            const obj = f.objectValue || f.objectEntity?.name || '';
            if (!obj) continue;
            const key = f.subject.name;
            if (!grouped.has(key)) grouped.set(key, []);
            const items = grouped.get(key)!;
            if (!items.includes(obj) && items.length < 3) items.push(obj);
        }
        const projectInfo = Array.from(grouped.entries())
            .map(([name, items]) => `${name}: ${items.join(', ')}`)
            .join('\n');
        if (projectInfo) parts.push(`Project intelligence:\n${projectInfo}`);
    }

    // Add recent voice call context for continuity
    const lastCall = await prisma.voiceCall.findFirst({
        where: { userId, status: 'ended', summary: { not: null } },
        orderBy: { endedAt: 'desc' },
        select: { summary: true, callType: true, endedAt: true },
    });

    if (lastCall?.summary) {
        const ago = Math.round((Date.now() - (lastCall.endedAt?.getTime() || 0)) / 3600000);
        if (ago < 48) {
            parts.push(`Last call (${lastCall.callType}, ${ago}h ago): ${lastCall.summary.substring(0, 300)}`);
        }
    }

    return parts.join('\n');
}
