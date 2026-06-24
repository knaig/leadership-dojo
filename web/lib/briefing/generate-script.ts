/**
 * Morning Briefing Script Generator
 *
 * Takes structured user context and produces a ~60-second narration script.
 * This runs server-side as part of the briefing API.
 */

interface BriefingContext {
    userName: string;
    jobTitle: string | null;
    company: string | null;
    meetingsToday: number;
    meetingsTomorrow: number;
    totalWeekMeetings: number;
    needleMovers: number;
    presentations: number;
    topMeetings: { title: string; startTime: string; meetingCategory: string | null; isPresentation: boolean }[];
    outcomeHitRate: number | null;
    hitRateDelta: number | null;
    followThroughPct: number | null;
    commitmentsDueToday: number;
    commitmentsDueSoon: number;
    needsReview: number;
    upcomingWithoutGoals: number;
    stakeholderAlerts: { name: string; issue: string }[];
    patternInsight: string | null;
    recentInsight: string | null;
    kpiAlerts: { name: string; status: string }[];
    orgContext: any;
}

export function generateBriefingScript(ctx: BriefingContext): string {
    const firstName = ctx.userName?.split(' ')[0] || 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const lines: string[] = [];

    // Opening
    lines.push(`${greeting}, ${firstName}. Here's your briefing.`);

    // Meeting overview
    if (ctx.meetingsToday > 0) {
        const meetingLine = ctx.meetingsToday === 1
            ? `You have 1 meeting today`
            : `You have ${ctx.meetingsToday} meetings today`;

        const extras: string[] = [];
        if (ctx.needleMovers > 0) extras.push(`${ctx.needleMovers} needle mover${ctx.needleMovers > 1 ? 's' : ''}`);
        if (ctx.presentations > 0) extras.push(`${ctx.presentations} presentation${ctx.presentations > 1 ? 's' : ''}`);

        lines.push(extras.length > 0
            ? `${meetingLine}, including ${extras.join(' and ')}.`
            : `${meetingLine}.`
        );

        // Highlight top meeting
        const topMeeting = ctx.topMeetings.find(m =>
            m.meetingCategory === 'NEEDLE_MOVER' || m.isPresentation
        ) || ctx.topMeetings[0];
        if (topMeeting) {
            const time = new Date(topMeeting.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            lines.push(`Your most important one is "${topMeeting.title}" at ${time}.`);
        }
    } else if (ctx.meetingsTomorrow > 0) {
        lines.push(`No meetings today. Tomorrow you have ${ctx.meetingsTomorrow}. A good day to get ahead.`);
    } else {
        lines.push(`Your calendar is clear today. Use this time strategically.`);
    }

    // Performance pulse
    if (ctx.outcomeHitRate !== null) {
        let perfLine = `Your meeting effectiveness is at ${ctx.outcomeHitRate}%`;
        if (ctx.hitRateDelta !== null && ctx.hitRateDelta !== 0) {
            perfLine += ctx.hitRateDelta > 0
                ? `, up ${ctx.hitRateDelta} points from last week.`
                : `, down ${Math.abs(ctx.hitRateDelta)} points.`;
        } else {
            perfLine += '.';
        }
        lines.push(perfLine);
    }

    if (ctx.followThroughPct !== null && ctx.followThroughPct < 80) {
        lines.push(`Your follow-through rate is ${ctx.followThroughPct}%. Closing open loops will build credibility.`);
    }

    // Actions
    const actions: string[] = [];
    if (ctx.needsReview > 0) actions.push(`${ctx.needsReview} meeting${ctx.needsReview > 1 ? 's' : ''} to review`);
    if (ctx.commitmentsDueToday > 0) actions.push(`${ctx.commitmentsDueToday} commitment${ctx.commitmentsDueToday > 1 ? 's' : ''} due today`);
    if (ctx.upcomingWithoutGoals > 0) actions.push(`${ctx.upcomingWithoutGoals} meeting${ctx.upcomingWithoutGoals > 1 ? 's' : ''} without goals set`);

    if (actions.length > 0) {
        lines.push(`Action items: ${actions.join(', ')}.`);
    }

    // Stakeholder alert
    if (ctx.stakeholderAlerts.length > 0) {
        const alert = ctx.stakeholderAlerts[0];
        lines.push(`Relationship alert: ${alert.name} ${alert.issue}. Consider reaching out.`);
    }

    // Pattern insight or AI observation
    if (ctx.patternInsight) {
        lines.push(`One observation from your patterns: ${ctx.patternInsight}`);
    } else if (ctx.recentInsight) {
        lines.push(`Something Mira noticed: ${ctx.recentInsight}`);
    }

    // KPI alerts
    const atRisk = ctx.kpiAlerts.filter(k => k.status === 'AT_RISK' || k.status === 'OFF_TRACK');
    if (atRisk.length > 0) {
        lines.push(`Watch out: "${atRisk[0].name}" is ${atRisk[0].status === 'OFF_TRACK' ? 'off track' : 'at risk'}.`);
    }

    // Closing
    lines.push(`That's your briefing. Make it count.`);

    return lines.join(' ');
}
