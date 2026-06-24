/**
 * Pattern Detector Agent
 *
 * Detects negative leadership patterns from calendar, commitments,
 * stakeholder, and outcome data. Each pattern includes evidence
 * and a coaching suggestion.
 *
 * Runs daily via cron — if high-severity patterns are found,
 * a proactive nudge is sent via Pusher.
 */

import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type PatternSeverity = 'low' | 'medium' | 'high';

export interface DetectedPattern {
    id: string;
    name: string;
    severity: PatternSeverity;
    description: string;
    suggestion: string;
    dataPoints: string[];
}

// ─────────────────────────────────────────
// MAIN DETECTION
// ─────────────────────────────────────────

export async function detectPatterns(userId: string): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];
    const now = new Date();

    const [
        meetingOverload,
        commitmentDrift,
        relationshipNeglect,
        outcomeAvoidance,
        oneWayCommunication,
        calendarFragmentation,
    ] = await Promise.all([
        detectMeetingOverload(userId, now),
        detectCommitmentDrift(userId, now),
        detectRelationshipNeglect(userId, now),
        detectOutcomeAvoidance(userId, now),
        detectOneWayCommunication(userId, now),
        detectCalendarFragmentation(userId, now),
    ]);

    if (meetingOverload) patterns.push(meetingOverload);
    if (commitmentDrift) patterns.push(commitmentDrift);
    if (relationshipNeglect) patterns.push(relationshipNeglect);
    if (outcomeAvoidance) patterns.push(outcomeAvoidance);
    if (oneWayCommunication) patterns.push(oneWayCommunication);
    if (calendarFragmentation) patterns.push(calendarFragmentation);

    // Sort by severity: high first, then medium, then low
    const severityOrder: Record<PatternSeverity, number> = { high: 0, medium: 1, low: 2 };
    patterns.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return patterns;
}

// ─────────────────────────────────────────
// PATTERN: Meeting Overload
// 6+ meetings/day for 3+ days in a week
// ─────────────────────────────────────────

async function detectMeetingOverload(userId: string, now: Date): Promise<DetectedPattern | null> {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: weekAgo, lte: now },
            status: { not: 'cancelled' },
        },
        select: { startTime: true },
    });

    // Group by day
    const dayBuckets: Record<string, number> = {};
    for (const m of meetings) {
        const dayKey = m.startTime.toISOString().split('T')[0];
        dayBuckets[dayKey] = (dayBuckets[dayKey] || 0) + 1;
    }

    const heavyDays = Object.entries(dayBuckets).filter(([, count]) => count >= 6);

    if (heavyDays.length >= 3) {
        const worstDay = heavyDays.sort((a, b) => b[1] - a[1])[0];
        return {
            id: 'meeting-overload',
            name: 'Meeting Overload',
            severity: heavyDays.length >= 4 ? 'high' : 'medium',
            description: `You had 6+ meetings on ${heavyDays.length} days this week. Your heaviest day had ${worstDay[1]} meetings.`,
            suggestion: 'Block 2-hour focus windows each morning. Audit recurring meetings — decline or delegate at least 2 this week.',
            dataPoints: heavyDays.map(([day, count]) => `${day}: ${count} meetings`),
        };
    }

    return null;
}

// ─────────────────────────────────────────
// PATTERN: Commitment Drift
// <50% completion rate over 2 weeks
// ─────────────────────────────────────────

async function detectCommitmentDrift(userId: string, now: Date): Promise<DetectedPattern | null> {
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const commitments = await prisma.meetingCommitment.findMany({
        where: {
            userId,
            createdAt: { gte: twoWeeksAgo },
        },
        select: { status: true, description: true },
    });

    if (commitments.length < 4) return null; // Need enough data

    const fulfilled = commitments.filter(c => c.status === 'FULFILLED').length;
    const rate = fulfilled / commitments.length;

    if (rate < 0.5) {
        const overdue = commitments.filter(c => c.status === 'OVERDUE' || c.status === 'PENDING');
        return {
            id: 'commitment-drift',
            name: 'Commitment Drift',
            severity: rate < 0.25 ? 'high' : 'medium',
            description: `Only ${Math.round(rate * 100)}% of your commitments were fulfilled in the past 2 weeks (${fulfilled}/${commitments.length}).`,
            suggestion: 'Review open commitments today. Mark completed ones, renegotiate deadlines on the rest, and limit new commitments this week.',
            dataPoints: overdue.slice(0, 4).map(c => c.description.substring(0, 80)),
        };
    }

    return null;
}

// ─────────────────────────────────────────
// PATTERN: Relationship Neglect
// Important stakeholders not contacted in 21+ days
// ─────────────────────────────────────────

async function detectRelationshipNeglect(userId: string, now: Date): Promise<DetectedPattern | null> {
    const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

    const neglectedStakeholders = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            mergedIntoId: null,
            powerLevel: 'HIGH',
            lastInteraction: { lt: threeWeeksAgo },
        },
        select: { name: true, role: true, lastInteraction: true, powerLevel: true },
        take: 10,
    });

    if (neglectedStakeholders.length === 0) return null;

    const dataPoints = neglectedStakeholders.map(s => {
        const daysSince = s.lastInteraction
            ? Math.floor((now.getTime() - s.lastInteraction.getTime()) / (24 * 60 * 60 * 1000))
            : 999;
        return `${s.name}${s.role ? ` (${s.role})` : ''} — ${daysSince} days`;
    });

    return {
        id: 'relationship-neglect',
        name: 'Relationship Neglect',
        severity: neglectedStakeholders.length >= 3 ? 'high' : 'medium',
        description: `${neglectedStakeholders.length} key stakeholder${neglectedStakeholders.length > 1 ? 's haven\'t' : ' hasn\'t'} heard from you in 3+ weeks.`,
        suggestion: 'Send a quick check-in message or schedule a 15-minute catch-up with each this week. Relationships decay silently.',
        dataPoints,
    };
}

// ─────────────────────────────────────────
// PATTERN: Outcome Avoidance
// <30% of meetings have outcomes recorded (for 2+ weeks)
// ─────────────────────────────────────────

async function detectOutcomeAvoidance(userId: string, now: Date): Promise<DetectedPattern | null> {
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: twoWeeksAgo, lte: now },
            status: { not: 'cancelled' },
        },
        select: { title: true, outcomeResult: true, desiredOutcome: true },
    });

    if (meetings.length < 6) return null; // Need enough data

    const withOutcome = meetings.filter(m => m.outcomeResult !== null).length;
    const rate = withOutcome / meetings.length;

    if (rate < 0.3) {
        const noOutcome = meetings.filter(m => !m.outcomeResult && !m.desiredOutcome);
        return {
            id: 'outcome-avoidance',
            name: 'Outcome Avoidance',
            severity: rate < 0.15 ? 'high' : 'medium',
            description: `Only ${Math.round(rate * 100)}% of your meetings had outcomes tracked over the last 2 weeks (${withOutcome}/${meetings.length}).`,
            suggestion: 'Set a desired outcome before each meeting starts. Even a one-liner — "Get alignment on X" — changes how you show up.',
            dataPoints: noOutcome.slice(0, 4).map(m => m.title),
        };
    }

    return null;
}

// ─────────────────────────────────────────
// PATTERN: One-Way Communication
// User only interacts with the same 3-5 people repeatedly
// ─────────────────────────────────────────

async function detectOneWayCommunication(userId: string, now: Date): Promise<DetectedPattern | null> {
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: fourWeeksAgo, lte: now },
            status: { not: 'cancelled' },
        },
        select: { participants: true },
    });

    if (meetings.length < 10) return null; // Need enough data

    // Count interaction frequency per participant
    const contactFrequency: Record<string, number> = {};
    for (const m of meetings) {
        for (const email of (m.participants || [])) {
            const key = email.toLowerCase();
            contactFrequency[key] = (contactFrequency[key] || 0) + 1;
        }
    }

    const sortedContacts = Object.entries(contactFrequency).sort((a, b) => b[1] - a[1]);
    const totalContacts = sortedContacts.length;
    const totalInteractions = sortedContacts.reduce((sum, [, count]) => sum + count, 0);

    if (totalContacts <= 5) return null; // Too few contacts to judge

    // Check if top 5 people account for 80%+ of interactions
    const topFiveInteractions = sortedContacts.slice(0, 5).reduce((sum, [, count]) => sum + count, 0);
    const concentration = topFiveInteractions / totalInteractions;

    if (concentration >= 0.8 && totalContacts > 8) {
        const topNames = sortedContacts.slice(0, 5).map(([email, count]) => {
            const name = email.split('@')[0].split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
            return `${name} (${count}x)`;
        });

        return {
            id: 'one-way-communication',
            name: 'Echo Chamber',
            severity: concentration >= 0.9 ? 'medium' : 'low',
            description: `${Math.round(concentration * 100)}% of your meeting interactions are with the same 5 people. You have ${totalContacts} contacts but a narrow active circle.`,
            suggestion: 'Diversify your calendar. Reach out to a cross-functional peer, a skip-level, or someone outside your usual orbit this week.',
            dataPoints: topNames,
        };
    }

    return null;
}

// ─────────────────────────────────────────
// PATTERN: Calendar Fragmentation
// Average focus block < 30 minutes between meetings
// ─────────────────────────────────────────

async function detectCalendarFragmentation(userId: string, now: Date): Promise<DetectedPattern | null> {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: weekAgo, lte: now },
            status: { not: 'cancelled' },
        },
        select: { startTime: true, endTime: true },
        orderBy: { startTime: 'asc' },
    });

    if (meetings.length < 4) return null;

    // Group by day, then compute gaps
    const dayMeetings: Record<string, { start: Date; end: Date }[]> = {};
    for (const m of meetings) {
        const dayKey = m.startTime.toISOString().split('T')[0];
        if (!dayMeetings[dayKey]) dayMeetings[dayKey] = [];
        dayMeetings[dayKey].push({ start: m.startTime, end: m.endTime });
    }

    const allGaps: number[] = [];
    const fragmentedDays: string[] = [];

    for (const [day, dayMs] of Object.entries(dayMeetings)) {
        if (dayMs.length < 2) continue;
        const sorted = dayMs.sort((a, b) => a.start.getTime() - b.start.getTime());
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
            const gap = (sorted[i].start.getTime() - sorted[i - 1].end.getTime()) / 60000;
            if (gap > 0) gaps.push(gap);
        }
        if (gaps.length > 0) {
            const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
            allGaps.push(...gaps);
            if (avgGap < 30) fragmentedDays.push(day);
        }
    }

    if (allGaps.length < 3 || fragmentedDays.length < 2) return null;

    const overallAvg = Math.round(allGaps.reduce((s, g) => s + g, 0) / allGaps.length);

    if (overallAvg < 30) {
        return {
            id: 'calendar-fragmentation',
            name: 'Calendar Fragmentation',
            severity: overallAvg < 15 ? 'high' : 'medium',
            description: `Your average gap between meetings is ${overallAvg} minutes. On ${fragmentedDays.length} days this week, you had barely any focus time.`,
            suggestion: 'Consolidate meetings into blocks. Try "no-meeting mornings" or batch all 1:1s on one day.',
            dataPoints: fragmentedDays.map(d => `${d}: fragmented`),
        };
    }

    return null;
}
