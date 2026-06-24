'use client';
import { useEffect, useState, useCallback } from 'react';
import {
    Calendar, Clock, Users, ChevronRight, CheckCircle2,
    Circle, AlertCircle, Target, Loader2, Lightbulb, ArrowRight,
    TrendingUp, UserCheck, Zap, MessageCircle,
    Briefcase, ArrowUpRight, X, BarChart3, ShieldAlert, RefreshCw,
    Building2, Globe, Shield, Gauge, Edit2, User, UsersRound, Network,
    Star, Phone
} from 'lucide-react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MiraWidget } from './MiraWidget';
import { PeopleIntelHub } from './PeopleIntelHub';
import { VoiceCallButton } from '@/components/voice/VoiceCallButton';

// ===============================================================
// TYPES
// ===============================================================

interface Meeting {
    id: string; title: string; startTime: string; endTime: string;
    riskLevel: string; meetingType: string | null; meetingCategory: string | null;
    isPresentation: boolean; attendees: string[]; desiredOutcome: string | null;
    outcomeResult: string | null;
    openCommitments: { id: string; description: string; owner: string; dueDate: string | null; status: string }[];
    connectedKpis: { id: string; name: string; status: string }[];
}
interface Commitment { id: string; description: string; owner: string; dueDate: string | null; status: string; meetingTitle: string; }
interface KPI { id: string; name: string; status: string; confidence: number | null; currentValue: number | null; targetValue: number | null; targetDate: string | null; }
interface StakeholderHealth { id: string; name: string; role: string | null; relationshipStrength: number; powerLevel: string; lastInteraction: string | null; needsAttention: boolean; }
interface WeekDay { date: string; dayLabel: string; meetings: { id: string; title: string; startTime: string; meetingCategory: string | null; isPresentation: boolean; attendeeCount: number; desiredOutcome: string | null }[]; }
interface RecentOutcome { id: string; title: string; startTime: string; desiredOutcome: string | null; outcomeResult: string; meetingCategory: string | null; }
interface TomorrowMeeting { id: string; title: string; startTime: string; meetingCategory: string | null; isPresentation: boolean; attendeeCount: number; desiredOutcome: string | null; }

interface ClassifiedMeeting {
    id: string; title: string; startTime: string; endTime: string;
    meetingCategory: string | null; isPresentation: boolean; meetingType: string | null;
    desiredOutcome: string | null; attendeeCount: number;
    classification: {
        importance: string;
        reasons: string[];
        group: string;
        prepNeeded: boolean;
        attendeeInsights: { email: string; name: string; company: string; isExternal: boolean; isKeyStakeholder: boolean }[];
    };
    userImportanceOverride?: string | null;
    strategicLevel?: string | null;
    strategicOwner?: string | null;
}

interface TodayData {
    userStage: 'new' | 'building' | 'active';
    user: { name: string; onboardingComplete: boolean; jobTitle: string | null; company: string | null };
    onboarding: {
        complete: boolean;
        totalCalls: number;
        topics: Record<string, boolean>;
        coveredCount: number;
        totalTopics: number;
    } | null;
    stats: { outcomeHitRate: number | null; previousHitRate: number | null; outcomesSet: number; outcomesLanded: number; totalMeetingsThisWeek: number; commitmentsMade: number; commitmentsFulfilled: number; streak: number; };
    weekSummary: { totalMeetings: number; needleMovers: number; presentations: number; meetingsToday: number; meetingsTomorrow: number; };
    commitments: { dueToday: Commitment[]; dueSoon: Commitment[] };
    meetings: Meeting[];
    tomorrowMeetings: TomorrowMeeting[];
    needsReview: { id: string; title: string; endTime: string; desiredOutcome: string | null }[];
    recentOutcomes: RecentOutcome[];
    kpis: KPI[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    weeklyTrend: any[];
    strategic: {
        patternInsights: string[];
        categoryBreakdown: Record<string, number>;
        stakeholderHealth: StakeholderHealth[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allStakeholders: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recurringWithNoValue: any[];
        upcomingWithoutGoals: { id: string; title: string; startTime: string; meetingCategory: string | null }[];
        timeAllocation: { totalHours: number; totalCategorized: number };
        recentInsights: { insight: string; type: string; date: string }[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orgContext: any;
        peopleIntel?: PersonIntel[];
    };
    weekAhead: WeekDay[];
    upcomingClassified?: ClassifiedMeeting[];
    groundGame?: {
        relationshipsToWatch: { name: string; signal: string; action: string; stakeholderId: string; meetingId?: string; priority: string }[];
    };
}

interface PersonIntel {
    id: string;
    name: string;
    role: string | null;
    personaArchetype: string | null;
    communicationStyle: string | null;
    decisionStyle: string | null;
    riskTolerance: string | null;
    primaryMotivation: string | null;
    fears: string[];
    archetype: string | null;
    politicalStance: string | null;
    communicationTone: string | null;
    relationshipStrength: number;
    powerLevel: string;
    influenceRole: string | null;
    organization?: string | null;
    email?: string | null;
    intelligence: {
        profileSummary: string | null;
        successPatterns: string[];
        objectionPatterns: string[];
        failurePatterns: string[];
        recentTopics: string[];
        currentMood: string | null;
        decisionMakingNotes: string | null;
        evidenceCount: number;
    } | null;
    meetingContext: string;
}

// Archetype playbook — tactical advice for each persona type
const ARCHETYPE_PLAYBOOK: Record<string, { emoji: string; label: string; brief: string; doThis: string; dontDoThis: string; discMap: string }> = {
    DRIVER: { emoji: '🎯', label: 'Driver', brief: 'Results-first, decisive, impatient with process', doThis: 'Lead with outcomes, be concise, show ROI', dontDoThis: 'Ramble, bury the ask, bring problems without solutions', discMap: 'D' },
    ANALYST: { emoji: '📊', label: 'Analyst', brief: 'Data-driven, methodical, cautious about claims', doThis: 'Bring evidence, give them time to process, be precise', dontDoThis: 'Use vague claims, rush decisions, skip the details', discMap: 'C' },
    COLLABORATOR: { emoji: '🤝', label: 'Collaborator', brief: 'Consensus-seeking, values inclusion and harmony', doThis: 'Include them early, validate input, build agreement', dontDoThis: 'Steamroll, decide without consulting, create us-vs-them', discMap: 'S' },
    VISIONARY: { emoji: '🔭', label: 'Visionary', brief: 'Big-picture thinker, inspired by possibility', doThis: 'Connect to vision, show long-term impact, be bold', dontDoThis: 'Get lost in minutiae, focus only on risks, be incremental', discMap: 'I' },
    GUARDIAN: { emoji: '🛡️', label: 'Guardian', brief: 'Risk-averse, protective of team and process', doThis: 'Show safety nets, propose incremental steps, respect tradition', dontDoThis: 'Propose radical change, dismiss concerns, move too fast', discMap: 'S/C' },
    POLITICIAN: { emoji: '♟️', label: 'Politician', brief: 'Influence-driven, strategic, reads the room', doThis: 'Understand their agenda, find mutual wins, give them credit', dontDoThis: 'Challenge publicly, ignore their network, be naïve about motives', discMap: 'D/I' },
    CHAMPION: { emoji: '📣', label: 'Champion', brief: 'Enthusiastic advocate, amplifies what they believe in', doThis: 'Give them something to champion, share early, public credit', dontDoThis: 'Keep them out of the loop, be cynical, undermine their enthusiasm', discMap: 'I/D' },
    PRAGMATIST: { emoji: '⚙️', label: 'Pragmatist', brief: 'Practical, ROI-focused, wants concrete next steps', doThis: 'Show ROI, be specific about timelines, start small', dontDoThis: 'Be abstract, promise the moon, skip implementation details', discMap: 'C/S' },
    SKEPTIC: { emoji: '🔍', label: 'Skeptic', brief: 'Questions everything, needs proof before commitment', doThis: 'Welcome objections, provide evidence, earn trust gradually', dontDoThis: 'Dismiss concerns, ask for blind trust, take shortcuts', discMap: 'C' },
    CONSERVATIVE: { emoji: '⚓', label: 'Conservative', brief: 'Values stability, prefers proven approaches', doThis: 'Change slowly, show precedent, respect what exists', dontDoThis: 'Propose disruption, dismiss history, force urgency', discMap: 'S' },
    OPERATOR: { emoji: '📋', label: 'Operator', brief: 'Process-focused, reliable, detail-oriented', doThis: 'Be structured, respect their systems, follow up in writing', dontDoThis: 'Be disorganized, skip steps, change plans frequently', discMap: 'C/S' },
};

interface MeetingInsight {
    icon: React.ReactNode;
    title: string;
    detail: string;
    severity: 'warning' | 'info' | 'success';
    actionLink?: string;
}

// ===============================================================
// HELPERS
// ===============================================================

function getGreeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type TimeCtx = 'morning' | 'midday' | 'afternoon' | 'evening' | 'weekend';
function getTimeCtx(): TimeCtx {
    const d = new Date(); const day = d.getDay(); const h = d.getHours();
    if (day === 0 || day === 6) return 'weekend';
    if (h < 10) return 'morning'; if (h < 14) return 'midday';
    if (h < 18) return 'afternoon'; return 'evening';
}

function getMiraPrompt(ctx: TimeCtx): string {
    switch (ctx) {
        case 'morning': return 'What should I prioritize today?';
        case 'midday': return 'How is my day tracking?';
        case 'afternoon': return 'Summarize what I accomplished today';
        case 'evening': return 'Help me reflect on this week';
        case 'weekend': return 'Help me plan for next week';
    }
}

function formatTime(d: string) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function getTimeUntil(d: string) { const diff = new Date(d).getTime() - Date.now(); if (diff < 0) return 'now'; const m = Math.round(diff / 60000); return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; }
function getRiskBorder(l: string) { return l === 'high' ? 'border-l-red-400' : l === 'medium' ? 'border-l-amber-400' : 'border-l-emerald-400'; }
function getCatLabel(c: string | null) { return c === 'NEEDLE_MOVER' ? 'Needle Mover' : c === 'TACTICAL' ? 'Tactical' : c === 'OPERATIONAL' ? 'Operational' : c === 'GROWTH' ? 'Growth' : null; }
function statusColor(s: string) { return s === 'ON_TRACK' || s === 'ACHIEVED' ? 'text-emerald-500' : s === 'AT_RISK' ? 'text-amber-500' : s === 'OFF_TRACK' ? 'text-red-500' : 'text-muted-foreground'; }
function statusBg(s: string) { return s === 'ON_TRACK' || s === 'ACHIEVED' ? 'bg-emerald-500/10' : s === 'AT_RISK' ? 'bg-amber-500/10' : s === 'OFF_TRACK' ? 'bg-red-500/10' : 'bg-muted'; }
function outcomeColor(r: string) { return r === 'LANDED' ? 'text-emerald-500 bg-emerald-500/10' : r === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10' : 'text-red-400 bg-red-400/10'; }

// ===============================================================
// SCORE RING — SVG ring chart
// ===============================================================

function ScoreRing({ value, max, size = 72, strokeWidth = 6, color }: { value: number; max: number; size?: number; strokeWidth?: number; color: string }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const offset = circumference * (1 - pct);
    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted" />
            <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={color}
                strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
    );
}

// ===============================================================
// RETRO GAUGE — premium vintage speedometer-style SVG gauge
// ===============================================================

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function RetroGauge({ value, max, label, color: _color, size = 160, sublabel }: {
    value: number; max: number; label: string; color: string; size?: number; sublabel?: string;
}) {
    const pct = max > 0 ? Math.min(value / max, 1) : 0;
    const START_ANGLE = -135;
    const END_ANGLE = 135;
    const SWEEP = END_ANGLE - START_ANGLE; // 270 degrees

    // SVG draws only the circular gauge; label lives outside as HTML
    const svgSize = size;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const outerR = svgSize * 0.46;
    const bezelWidth = svgSize * 0.045;
    const faceR = outerR - bezelWidth;
    const arcR = faceR * 0.75;
    const needleLen = arcR * 0.88;
    const needleAngle = START_ANGLE + pct * SWEEP;

    const uid = `rg-${label.replace(/\s+/g, '-').toLowerCase()}`;

    // ── Color zone arcs ──
    const zones = [
        { from: 0,    to: 0.4,  color: '#22c55e' },
        { from: 0.4,  to: 0.7,  color: '#f59e0b' },
        { from: 0.7,  to: 1.0,  color: '#ef4444' },
    ];
    const zoneArcs = zones.map((z, i) => {
        const a1 = START_ANGLE + z.from * SWEEP;
        const a2 = START_ANGLE + z.to * SWEEP;
        return (
            <path key={i} d={describeArc(cx, cy, arcR, a1, a2)}
                fill="none" stroke={z.color} strokeWidth={svgSize * 0.04}
                strokeLinecap="butt" opacity={0.2}
            />
        );
    });

    const activeZoneArcs = zones.map((z, i) => {
        const clampedPct = Math.min(pct, z.to);
        if (clampedPct <= z.from) return null;
        const a1 = START_ANGLE + Math.max(z.from, 0) * SWEEP;
        const a2 = START_ANGLE + clampedPct * SWEEP;
        if (a2 <= a1) return null;
        return (
            <path key={`active-${i}`} d={describeArc(cx, cy, arcR, a1, a2)}
                fill="none" stroke={z.color} strokeWidth={svgSize * 0.04}
                strokeLinecap="butt" opacity={0.9}
            />
        );
    });

    // ── Tick marks only (no numeric labels — they overlap with readout) ──
    const ticks: React.ReactNode[] = [];
    const majorCount = 5;
    const minorPerMajor = 4;
    const totalTicks = majorCount * minorPerMajor;
    for (let i = 0; i <= totalTicks; i++) {
        const frac = i / totalTicks;
        const angle = START_ANGLE + frac * SWEEP;
        const rad = (angle * Math.PI) / 180;
        const isMajor = i % minorPerMajor === 0;
        const tickOuter = arcR + svgSize * 0.025;
        const tickInner = isMajor ? arcR - svgSize * 0.045 : arcR - svgSize * 0.02;
        ticks.push(
            <line key={`t${i}`}
                x1={cx + tickInner * Math.cos(rad)} y1={cy + tickInner * Math.sin(rad)}
                x2={cx + tickOuter * Math.cos(rad)} y2={cy + tickOuter * Math.sin(rad)}
                stroke={isMajor ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)'}
                strokeWidth={isMajor ? svgSize * 0.012 : svgSize * 0.005}
            />
        );
    }

    // ── Needle ──
    const needleRad = (needleAngle * Math.PI) / 180;
    const tipX = cx + needleLen * Math.cos(needleRad);
    const tipY = cy + needleLen * Math.sin(needleRad);
    const baseHalf = svgSize * 0.022;
    const perpRad = needleRad + Math.PI / 2;
    const b1x = cx + baseHalf * Math.cos(perpRad);
    const b1y = cy + baseHalf * Math.sin(perpRad);
    const b2x = cx - baseHalf * Math.cos(perpRad);
    const b2y = cy - baseHalf * Math.sin(perpRad);
    const tailLen = svgSize * 0.04;
    const tailX = cx - tailLen * Math.cos(needleRad);
    const tailY = cy - tailLen * Math.sin(needleRad);

    return (
        <div className="flex flex-col items-center gap-1.5">
            <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
                <defs>
                    <linearGradient id={`${uid}-bezel`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#e8e8e8" />
                        <stop offset="20%" stopColor="#b0b0b0" />
                        <stop offset="40%" stopColor="#d4d4d4" />
                        <stop offset="60%" stopColor="#8a8a8a" />
                        <stop offset="80%" stopColor="#c8c8c8" />
                        <stop offset="100%" stopColor="#a0a0a0" />
                    </linearGradient>
                    <radialGradient id={`${uid}-face`} cx="40%" cy="35%" r="60%">
                        <stop offset="0%" stopColor="#2a2a2e" />
                        <stop offset="100%" stopColor="#111113" />
                    </radialGradient>
                    <radialGradient id={`${uid}-hub`} cx="35%" cy="30%" r="65%">
                        <stop offset="0%" stopColor="#d4d4d4" />
                        <stop offset="50%" stopColor="#888" />
                        <stop offset="100%" stopColor="#555" />
                    </radialGradient>
                    <linearGradient id={`${uid}-needle`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ff3d00" />
                        <stop offset="100%" stopColor="#ff6e40" />
                    </linearGradient>
                    <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation={svgSize * 0.008} />
                    </filter>
                </defs>

                {/* Chrome bezel ring */}
                <circle cx={cx} cy={cy} r={outerR} fill={`url(#${uid}-bezel)`} />
                <circle cx={cx} cy={cy} r={outerR} fill="none"
                    stroke="rgba(0,0,0,0.3)" strokeWidth={svgSize * 0.005} />
                <circle cx={cx} cy={cy} r={outerR - bezelWidth * 0.5}
                    fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={bezelWidth * 0.3} />

                {/* Dark face */}
                <circle cx={cx} cy={cy} r={faceR} fill={`url(#${uid}-face)`} />
                <circle cx={cx} cy={cy} r={faceR - svgSize * 0.008}
                    fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={svgSize * 0.004} />

                {zoneArcs}
                {activeZoneArcs}
                {ticks}

                {/* Needle glow */}
                <polygon
                    points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
                    fill="#ff3d00" opacity={0.35}
                    filter={`url(#${uid}-glow)`}
                    style={{ transition: 'all 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />
                {/* Needle body */}
                <polygon
                    points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
                    fill={`url(#${uid}-needle)`}
                    stroke="rgba(0,0,0,0.4)" strokeWidth={svgSize * 0.003}
                    style={{ transition: 'all 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                />

                {/* Center hub */}
                <circle cx={cx} cy={cy} r={svgSize * 0.05} fill={`url(#${uid}-hub)`}
                    stroke="rgba(0,0,0,0.4)" strokeWidth={svgSize * 0.004} />
                <circle cx={cx} cy={cy} r={svgSize * 0.02} fill="#555"
                    stroke="rgba(0,0,0,0.3)" strokeWidth={svgSize * 0.002} />

                {/* Percentage readout — inside dark face, always legible */}
                <text x={cx} y={cy + faceR * 0.5} textAnchor="middle"
                    dominantBaseline="central"
                    fill="white" fontSize={svgSize * 0.14} fontWeight="700"
                    fontFamily="'SF Mono', 'Menlo', 'Consolas', monospace"
                    letterSpacing={svgSize * 0.005}
                >
                    {Math.round(pct * 100)}%
                </text>

                {/* Glass reflection */}
                <ellipse cx={cx - svgSize * 0.08} cy={cy - faceR * 0.35}
                    rx={faceR * 0.35} ry={faceR * 0.18}
                    fill="white" opacity={0.03}
                    transform={`rotate(-20 ${cx} ${cy})`}
                />
            </svg>
            {/* Label + sublabel as HTML — respects light/dark theme */}
            <div className="text-center -mt-1">
                <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">{label}</div>
                {sublabel && <div className="text-[10px] text-muted-foreground">{sublabel}</div>}
            </div>
        </div>
    );
}

// Backward-compatible alias so existing call sites keep working
const NeedleGauge = RetroGauge;

// ===============================================================
// MEETING INTELLIGENCE
// ===============================================================

function computeMeetingIntelligence(data: TodayData): MeetingInsight[] {
    const insights: MeetingInsight[] = [];
    const { weekSummary, strategic, commitments, meetings, stats } = data;

    // Needle Mover Ratio
    if (weekSummary.totalMeetings > 0) {
        const nmRatio = Math.round((weekSummary.needleMovers / weekSummary.totalMeetings) * 100);
        if (nmRatio < 30) {
            insights.push({
                icon: <BarChart3 size={14} className="text-amber-500" />,
                title: 'Low needle mover ratio',
                detail: `Only ${nmRatio}% of your meetings are needle movers. Top performers aim for 40%+.`,
                severity: 'warning',
                actionLink: '/meetings',
            });
        }
    }

    // Goal Coverage
    if (strategic.upcomingWithoutGoals.length > 0) {
        insights.push({
            icon: <Target size={14} className="text-amber-500" />,
            title: 'Meetings without goals',
            detail: `${strategic.upcomingWithoutGoals.length} meeting${strategic.upcomingWithoutGoals.length > 1 ? 's' : ''} this week ${strategic.upcomingWithoutGoals.length > 1 ? 'have' : 'has'} no desired outcome set.`,
            severity: 'warning',
            actionLink: `/chat?prep=Help me set goals for my upcoming meetings`,
        });
    }

    // Stakeholder Gaps
    const attentionStakeholders = strategic.stakeholderHealth.filter(s => s.needsAttention);
    if (attentionStakeholders.length > 0) {
        const names = attentionStakeholders.slice(0, 3).map(s => s.name).join(', ');
        insights.push({
            icon: <UserCheck size={14} className="text-amber-500" />,
            title: 'Stakeholder gaps',
            detail: `Schedule check-ins with ${names}${attentionStakeholders.length > 3 ? ` and ${attentionStakeholders.length - 3} more` : ''}.`,
            severity: 'warning',
            actionLink: '/stakeholders',
        });
    }

    // Commitment Load
    if (commitments.dueToday.length > 3) {
        insights.push({
            icon: <AlertCircle size={14} className="text-amber-500" />,
            title: 'Heavy commitment load',
            detail: `${commitments.dueToday.length} commitments due today — consider delegating or rescheduling.`,
            severity: 'warning',
        });
    }

    // Back-to-back Detection
    const sortedMeetings = [...meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    let backToBackCount = 0;
    for (let i = 0; i < sortedMeetings.length - 1; i++) {
        const endTime = new Date(sortedMeetings[i].endTime).getTime();
        const nextStart = new Date(sortedMeetings[i + 1].startTime).getTime();
        if (nextStart - endTime < 15 * 60 * 1000) backToBackCount++;
    }
    if (backToBackCount > 0) {
        insights.push({
            icon: <Clock size={14} className="text-amber-500" />,
            title: 'Back-to-back meetings',
            detail: `${backToBackCount} transition${backToBackCount > 1 ? 's' : ''} with < 15 min prep time. Consider adding buffer.`,
            severity: 'warning',
        });
    }

    // Large Meetings
    const largeMeetings = meetings.filter(m => m.attendees.length > 6);
    if (largeMeetings.length > 0) {
        insights.push({
            icon: <Users size={14} className="text-primary" />,
            title: 'Large meeting ahead',
            detail: `Consider sending a pre-read for "${largeMeetings[0].title}" — large meetings need structure.`,
            severity: 'info',
            actionLink: `/chat?prep=${encodeURIComponent(largeMeetings[0].title)}`,
        });
    }

    // Recurring Low Value
    if (strategic.recurringWithNoValue.length > 0) {
        insights.push({
            icon: <RefreshCw size={14} className="text-red-400" />,
            title: 'Low-value recurring meetings',
            detail: `${strategic.recurringWithNoValue.length} recurring meeting${strategic.recurringWithNoValue.length > 1 ? 's' : ''} showing no outcomes. Consider cancelling or restructuring.`,
            severity: 'warning',
            actionLink: '/meetings',
        });
    }

    // Hit Rate Trend
    const hitRateDelta = stats?.outcomeHitRate !== null && stats?.previousHitRate !== null ? (stats.outcomeHitRate ?? 0) - (stats.previousHitRate ?? 0) : null;
    if (hitRateDelta !== null && hitRateDelta < 0) {
        insights.push({
            icon: <TrendingUp size={14} className="text-red-400" />,
            title: 'Declining effectiveness',
            detail: `Your hit rate dropped ${Math.abs(hitRateDelta)}% from last week. Review recent misses to course-correct.`,
            severity: 'warning',
            actionLink: '/wins',
        });
    }

    // Sort: warnings first, then info, then success
    const severityOrder = { warning: 0, info: 1, success: 2 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return insights.slice(0, 4);
}

// ===============================================================
// PREP WITH MIRA — pick meetings that need prep
// ===============================================================

interface PrepMeeting {
    id: string;
    title: string;
    startTime: string;
    reason: string;
    priority: number;
}

function computePrepMeetings(data: TodayData): PrepMeeting[] {
    const allMeetings = [...data.meetings, ...data.tomorrowMeetings.map(m => ({
        ...m, endTime: m.startTime, riskLevel: 'low', meetingType: null,
        attendees: Array(m.attendeeCount).fill(''), desiredOutcome: m.desiredOutcome,
        outcomeResult: null, openCommitments: [], connectedKpis: [],
    }))];

    const now = new Date();
    const upcoming = allMeetings.filter(m => new Date(m.startTime) > now);
    const preps: PrepMeeting[] = [];

    const highRiskKeywords = ['board', 'exec', 'review', 'leadership', 'skip-level', 'all-hands'];
    const attentionStakeholders = data.strategic.stakeholderHealth.filter(s => s.needsAttention).map(s => s.name.toLowerCase());

    for (const m of upcoming) {
        let priority = 0;
        const reasons: string[] = [];
        const titleLower = m.title.toLowerCase();

        // High-risk meetings without goals
        const isHighRisk = highRiskKeywords.some(kw => titleLower.includes(kw)) || m.riskLevel === 'high';
        if (isHighRisk && !m.desiredOutcome) {
            priority += 50;
            reasons.push('high-risk, no goal set');
        } else if (isHighRisk) {
            priority += 30;
            reasons.push('high-risk meeting');
        }

        // Stakeholders needing attention
        const hasAttentionStakeholder = m.attendees.some(a => attentionStakeholders.some(s => a.toLowerCase().includes(s)));
        if (hasAttentionStakeholder) {
            priority += 25;
            reasons.push('key stakeholder');
        }

        // Presentations
        if (m.isPresentation) {
            priority += 20;
            reasons.push('presenting');
        }

        // Needle movers
        if (m.meetingCategory === 'NEEDLE_MOVER') {
            priority += 15;
            reasons.push('needle mover');
        }

        // Large meetings
        if (m.attendees.length > 5) {
            priority += 10;
            reasons.push(`${m.attendees.length} attendees`);
        }

        // No goal set
        if (!m.desiredOutcome && !isHighRisk) {
            priority += 5;
            reasons.push('no goal set');
        }

        if (priority > 0) {
            preps.push({
                id: m.id,
                title: m.title,
                startTime: m.startTime,
                reason: reasons[0],
                priority,
            });
        }
    }

    preps.sort((a, b) => b.priority - a.priority);
    return preps.slice(0, 3);
}

// ===============================================================
// MEETING BLUEPRINTS
// ===============================================================

interface BlueprintMeeting {
    name: string;
    cadence: string;
    keywords: string[];
    importance: 'critical' | 'important' | 'nice-to-have';
}

interface BlueprintCategory {
    category: string;
    meetings: BlueprintMeeting[];
}

interface BlueprintMatch {
    category: string;
    meetings: {
        name: string;
        cadence: string;
        status: 'matched' | 'partial' | 'missing' | 'suggested';
        detail?: string;
        importance: 'critical' | 'important' | 'nice-to-have';
    }[];
}

const MEETING_BLUEPRINTS: Record<string, BlueprintCategory[]> = {
    VP: [
        { category: 'Managing Up', meetings: [
            { name: 'CEO/CTO 1:1', cadence: 'Weekly', keywords: ['ceo', 'cto', 'c-suite', 'exec 1:1'], importance: 'critical' },
            { name: 'Board Prep', cadence: 'Quarterly', keywords: ['board', 'board prep', 'board review'], importance: 'critical' },
            { name: 'Business Review', cadence: 'Monthly', keywords: ['business review', 'qbr', 'quarterly review'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Directors', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'director'], importance: 'critical' },
            { name: 'Staff Meeting', cadence: 'Weekly', keywords: ['staff', 'leadership team', 'lt meeting'], importance: 'critical' },
            { name: 'Skip-Level 1:1s', cadence: 'Monthly', keywords: ['skip-level', 'skip level'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product-Eng Sync', cadence: 'Weekly', keywords: ['product sync', 'product-eng', 'roadmap'], importance: 'important' },
            { name: 'Architecture Review', cadence: 'Bi-weekly', keywords: ['architecture', 'tech review', 'design review'], importance: 'important' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Strategy Session', cadence: 'Monthly', keywords: ['strategy', 'planning', 'offsites'], importance: 'important' },
            { name: 'Talent Review', cadence: 'Quarterly', keywords: ['talent', 'perf review', 'calibration'], importance: 'nice-to-have' },
        ]},
    ],
    DIRECTOR: [
        { category: 'Managing Up', meetings: [
            { name: 'VP/Head 1:1', cadence: 'Weekly', keywords: ['vp', 'head of', 'exec 1:1', 'director 1:1'], importance: 'critical' },
            { name: 'Leadership Sync', cadence: 'Weekly', keywords: ['leadership', 'lt meeting', 'staff'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Managers', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'manager'], importance: 'critical' },
            { name: 'Team All-Hands', cadence: 'Bi-weekly', keywords: ['all-hands', 'team meeting', 'town hall'], importance: 'important' },
            { name: 'Sprint Review', cadence: 'Bi-weekly', keywords: ['sprint', 'demo', 'showcase'], importance: 'nice-to-have' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product Sync', cadence: 'Weekly', keywords: ['product', 'pm sync', 'roadmap'], importance: 'important' },
            { name: 'Design Review', cadence: 'Weekly', keywords: ['design', 'ux review'], importance: 'nice-to-have' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'OKR Check-in', cadence: 'Monthly', keywords: ['okr', 'goal', 'objective', 'key result'], importance: 'important' },
            { name: 'Hiring Pipeline', cadence: 'Weekly', keywords: ['hiring', 'recruiting', 'interview'], importance: 'nice-to-have' },
        ]},
    ],
    MANAGER: [
        { category: 'Managing Up', meetings: [
            { name: 'Manager 1:1', cadence: 'Weekly', keywords: ['1:1', '1-1', 'director', 'manager 1:1'], importance: 'critical' },
            { name: 'Team Leads Sync', cadence: 'Weekly', keywords: ['leads', 'staff', 'sync'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Reports', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one'], importance: 'critical' },
            { name: 'Team Standup', cadence: 'Daily', keywords: ['standup', 'stand-up', 'daily', 'scrum'], importance: 'important' },
            { name: 'Retrospective', cadence: 'Bi-weekly', keywords: ['retro', 'retrospective'], importance: 'nice-to-have' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product Sync', cadence: 'Weekly', keywords: ['product', 'pm', 'roadmap', 'planning'], importance: 'important' },
            { name: 'Cross-Team Collab', cadence: 'As needed', keywords: ['cross-team', 'collaboration', 'inter-team'], importance: 'nice-to-have' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Sprint Planning', cadence: 'Bi-weekly', keywords: ['sprint planning', 'planning'], importance: 'important' },
            { name: 'Career Development', cadence: 'Monthly', keywords: ['career', 'growth', 'development'], importance: 'nice-to-have' },
        ]},
    ],
    FOUNDER: [
        { category: 'Managing Up', meetings: [
            { name: 'Board Meeting', cadence: 'Monthly/Quarterly', keywords: ['board', 'investor', 'advisory'], importance: 'critical' },
            { name: 'Investor Update', cadence: 'Monthly', keywords: ['investor', 'fundraising', 'vc'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Leads', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'lead'], importance: 'critical' },
            { name: 'All-Hands', cadence: 'Weekly/Bi-weekly', keywords: ['all-hands', 'town hall', 'company'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Customer Discovery', cadence: 'Weekly', keywords: ['customer', 'user research', 'discovery', 'sales call'], importance: 'critical' },
            { name: 'Go-to-Market', cadence: 'Weekly', keywords: ['gtm', 'marketing', 'go-to-market', 'sales'], importance: 'important' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Strategy/Vision', cadence: 'Monthly', keywords: ['strategy', 'vision', 'roadmap', 'planning'], importance: 'important' },
            { name: 'Hiring', cadence: 'As needed', keywords: ['hiring', 'recruiting', 'interview', 'candidate'], importance: 'nice-to-have' },
        ]},
    ],
    GENERIC: [
        { category: 'Managing Up', meetings: [
            { name: 'Manager 1:1', cadence: 'Weekly', keywords: ['1:1', '1-1', 'manager', 'sync'], importance: 'critical' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: 'Team Meeting', cadence: 'Weekly', keywords: ['team', 'standup', 'sync', 'all-hands'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Cross-Team Sync', cadence: 'Weekly', keywords: ['cross-team', 'collaboration', 'product', 'design'], importance: 'nice-to-have' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Planning', cadence: 'Bi-weekly', keywords: ['planning', 'strategy', 'okr', 'goal'], importance: 'important' },
        ]},
    ],
};

function getBlueprintKey(title: string | null): string {
    if (!title) return 'GENERIC';
    const t = title.toLowerCase();
    if (/\b(vp|svp|vice president)\b/.test(t)) return 'VP';
    if (/\b(director|head of)\b/.test(t)) return 'DIRECTOR';
    if (/\b(founder|ceo|cto|co-founder)\b/.test(t)) return 'FOUNDER';
    if (/\b(manager|lead|senior manager|engineering manager|em)\b/.test(t)) return 'MANAGER';
    return 'GENERIC';
}

function matchBlueprint(userTitle: string | null, meetings: Meeting[], weekMeetings: WeekDay[]): { matches: BlueprintMatch[]; coverage: number; topRecommendation: string | null } {
    const key = getBlueprintKey(userTitle);
    const blueprint = MEETING_BLUEPRINTS[key] || MEETING_BLUEPRINTS.GENERIC;

    // Collect all meeting titles from today + week ahead
    const allTitles = [
        ...meetings.map(m => m.title.toLowerCase()),
        ...weekMeetings.flatMap(d => d.meetings.map(m => m.title.toLowerCase())),
    ];

    let totalSlots = 0;
    let matchedSlots = 0;
    let topMissing: string | null = null;

    const matches: BlueprintMatch[] = blueprint.map(cat => ({
        category: cat.category,
        meetings: cat.meetings.map(bm => {
            totalSlots++;
            const found = allTitles.some(t => bm.keywords.some(kw => t.includes(kw)));
            if (found) {
                matchedSlots++;
                return { name: bm.name, cadence: bm.cadence, status: 'matched' as const, importance: bm.importance };
            }
            // Partial: keyword appears in a longer phrase
            const partial = allTitles.some(t => bm.keywords.some(kw => {
                const parts = kw.split(' ');
                return parts.length > 1 && parts.some(p => t.includes(p));
            }));
            if (partial) {
                matchedSlots += 0.5;
                return { name: bm.name, cadence: bm.cadence, status: 'partial' as const, detail: 'Similar meeting found', importance: bm.importance };
            }
            if (!topMissing && bm.importance !== 'nice-to-have') {
                topMissing = `Consider scheduling: ${bm.name} (${bm.cadence})`;
            }
            return { name: bm.name, cadence: bm.cadence, status: 'missing' as const, importance: bm.importance };
        }),
    }));

    const coverage = totalSlots > 0 ? Math.round((matchedSlots / totalSlots) * 100) : 0;
    return { matches, coverage, topRecommendation: topMissing };
}

// ===============================================================
// MEETING EXCELLENCE CARDS
// ===============================================================

function computeExcellenceCards(data: TodayData): { title: string; insights: string[]; visual: React.ReactNode; actionLink?: string }[] {
    const cards: { title: string; insights: string[]; visual: React.ReactNode; priority: number; actionLink?: string }[] = [];
    const { strategic, stats } = data;

    // The Pre-Read Multiplier — show when user has meetings with 5+ attendees
    const largeMeetings = data.meetings.filter(m => m.attendees.length >= 5);
    if (largeMeetings.length > 0) {
        cards.push({
            title: 'The Pre-Read Multiplier',
            insights: [
                `"${largeMeetings[0].title}" has ${largeMeetings[0].attendees.length} people.`,
                'Meetings with pre-reads are 2.5x more likely to reach a decision in the first session.',
            ],
            visual: (
                <div className="w-20 flex flex-col gap-1.5">
                    <div className="text-[8px] text-muted-foreground">Without pre-read</div>
                    <div className="h-2.5 bg-red-400/20 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{ width: '35%' }} /></div>
                    <div className="text-[8px] text-muted-foreground">With pre-read</div>
                    <div className="h-2.5 bg-emerald-500/20 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: '88%' }} /></div>
                    <div className="text-[7px] text-muted-foreground text-center">Decision rate</div>
                </div>
            ),
            actionLink: `/chat?prep=Help me write a pre-read for ${encodeURIComponent(largeMeetings[0].title)}`,
            priority: 8,
        });
    }

    // The 2-Minute Opener — show when many meetings lack goals
    if (strategic.upcomingWithoutGoals.length > 2) {
        cards.push({
            title: 'The 2-Minute Opener',
            insights: [
                `${strategic.upcomingWithoutGoals.length} meetings have no clear goal.`,
                'Start with: "By the end of this meeting, we will..."  — frames every minute that follows.',
            ],
            visual: (
                <div className="w-20 flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">2m</span>
                    </div>
                    <div className="text-[7px] text-muted-foreground text-center">opener</div>
                </div>
            ),
            actionLink: `/chat?prep=Help me set goals for my upcoming meetings`,
            priority: strategic.upcomingWithoutGoals.length > 4 ? 9 : 6,
        });
    }

    // The Follow-Up Window — show when commitments are stale
    if (data.commitments.dueSoon.length > 2) {
        cards.push({
            title: 'The Follow-Up Window',
            insights: [
                `${data.commitments.dueSoon.length} commitments in your pipeline.`,
                'Recall drops 50% after 24 hours. The best follow-ups happen same-day.',
            ],
            visual: (
                <div className="w-20 flex flex-col gap-1">
                    <div className="flex items-end gap-0.5 justify-center h-10">
                        {[100, 70, 50, 35, 25].map((h, i) => (
                            <div key={i} className={`w-3 rounded-t ${i < 2 ? 'bg-emerald-500' : i < 3 ? 'bg-amber-500' : 'bg-red-400/60'}`} style={{ height: `${h}%` }} />
                        ))}
                    </div>
                    <div className="flex justify-between text-[7px] text-muted-foreground px-0.5">
                        <span>0h</span><span>48h</span>
                    </div>
                    <div className="text-[7px] text-muted-foreground text-center">Recall decay</div>
                </div>
            ),
            priority: 5,
        });
    }

    // Relationship Half-Life — show when stakeholders need attention
    const needsAttn = strategic.stakeholderHealth.filter(s => s.needsAttention);
    if (needsAttn.length > 0) {
        cards.push({
            title: 'Relationship Half-Life',
            insights: [
                `${needsAttn.length} stakeholder${needsAttn.length > 1 ? 's' : ''} fading: ${needsAttn.slice(0, 2).map(s => s.name).join(', ')}`,
                'Professional relationships lose 50% of strength every 3 weeks without contact.',
            ],
            visual: (
                <div className="w-20 flex flex-col gap-1">
                    {['Manager', 'Peer', 'Report'].map((label, i) => (
                        <div key={label} className="flex items-center gap-1">
                            <div className="text-[7px] text-muted-foreground w-8 truncate">{label}</div>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${i === 0 ? 'bg-red-400' : i === 1 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${[40, 60, 85][i]}%` }} />
                            </div>
                        </div>
                    ))}
                    <div className="text-[7px] text-muted-foreground text-center">Refresh cadence</div>
                </div>
            ),
            actionLink: '/stakeholders',
            priority: needsAttn.length > 2 ? 9 : 4,
        });
    }

    // Recurring Meeting Audit — show when recurringWithNoValue > 0
    if (strategic.recurringWithNoValue.length > 0) {
        cards.push({
            title: 'Recurring Meeting Audit',
            insights: [
                `${strategic.recurringWithNoValue.length} recurring meeting${strategic.recurringWithNoValue.length > 1 ? 's' : ''} with no tracked outcomes.`,
                'Ask: "If I cancelled this, would anyone notice within a week?"',
            ],
            visual: (
                <div className="w-20 flex flex-col items-center gap-1">
                    <RefreshCw size={20} className="text-red-400" />
                    <div className="text-lg font-bold text-red-400">{strategic.recurringWithNoValue.length}</div>
                    <div className="text-[7px] text-muted-foreground text-center">dead weight</div>
                </div>
            ),
            actionLink: '/meetings',
            priority: strategic.recurringWithNoValue.length > 2 ? 10 : 7,
        });
    }

    // 50/25/25 time split
    if (strategic.timeAllocation.totalCategorized > 0) {
        const breakdown = strategic.categoryBreakdown;
        const total = strategic.timeAllocation.totalCategorized;
        const nmPct = Math.round(((breakdown['NEEDLE_MOVER'] || 0) / total) * 100);
        const growthPct = Math.round(((breakdown['GROWTH'] || 0) / total) * 100);
        const opPct = Math.round(((breakdown['OPERATIONAL'] || 0) / total) * 100);
        const offBy = Math.abs(nmPct - 50) + Math.abs(growthPct - 25) + Math.abs(opPct - 25);

        cards.push({
            title: 'The 50/25/25 Rule',
            insights: [
                `Your split: ${nmPct}% needle movers, ${growthPct}% growth, ${opPct}% operational.`,
                nmPct < 40 ? 'Consider restructuring to increase needle mover time.' : 'Your meeting mix looks healthy.',
            ],
            visual: (
                <div className="w-20 flex flex-col gap-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${nmPct}%` }} />
                        <div className="h-full bg-blue-500" style={{ width: `${growthPct}%` }} />
                        <div className="h-full bg-gray-400 rounded-r-full" style={{ width: `${opPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[8px] text-muted-foreground">
                        <span className="text-emerald-500">{nmPct}%</span>
                        <span className="text-blue-500">{growthPct}%</span>
                        <span>{opPct}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex mt-0.5">
                        <div className="h-full bg-emerald-500/30 rounded-l-full" style={{ width: '50%' }} />
                        <div className="h-full bg-blue-500/30" style={{ width: '25%' }} />
                        <div className="h-full bg-gray-400/30 rounded-r-full" style={{ width: '25%' }} />
                    </div>
                    <div className="text-[8px] text-muted-foreground text-center">ideal</div>
                </div>
            ),
            priority: offBy > 30 ? 10 : 3,
        });
    }

    // Prep Advantage
    if (stats.outcomesSet > 0) {
        const withGoalRate = stats.outcomesLanded > 0 ? Math.round((stats.outcomesLanded / stats.outcomesSet) * 100) : 0;
        const noGoalCount = strategic.upcomingWithoutGoals.length;

        cards.push({
            title: 'The Prep Advantage',
            insights: [
                `Meetings with goals: ${withGoalRate}% land outcomes.`,
                noGoalCount > 0 ? `${noGoalCount} upcoming meetings still need goals.` : 'All upcoming meetings have goals set.',
            ],
            visual: (
                <div className="w-20 flex flex-col items-center gap-1">
                    <div className="relative">
                        <ScoreRing value={withGoalRate} max={100} size={40} strokeWidth={4} color="text-emerald-500" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-bold">{withGoalRate}%</span>
                        </div>
                    </div>
                    <div className="text-[8px] text-muted-foreground text-center">with goals</div>
                </div>
            ),
            priority: noGoalCount > 2 ? 8 : 2,
        });
    }

    cards.sort((a, b) => b.priority - a.priority);
    return cards.slice(0, 2).map(({ title, insights, visual, actionLink }) => ({ title, insights, visual, actionLink }));
}

// ===============================================================
// MIRA'S CONTEXT INTELLIGENCE
// ===============================================================

const CONTEXT_AREAS = [
    { key: 'stakeholders', label: 'Stakeholders', Icon: Users },
    { key: 'goals', label: 'Goals & KPIs', Icon: Target },
    { key: 'org_politics', label: 'Org & Politics', Icon: Building2 },
    { key: 'domain', label: 'Domain / Industry', Icon: Globe },
    { key: 'meeting_patterns', label: 'Meeting Patterns', Icon: BarChart3 },
    { key: 'team_dynamics', label: 'Team Dynamics', Icon: Shield },
    { key: 'preferences', label: 'Preferences', Icon: MessageCircle },
    { key: 'decisions', label: 'Decision Context', Icon: Zap },
] as const;

const CONTEXT_QUESTIONS: Record<string, string> = {
    stakeholders: 'Who are the 3 people whose opinion matters most for your success this quarter?',
    goals: "What's the ONE outcome that would make this quarter a win?",
    org_politics: 'Who holds informal power — the person everyone checks with before a decision sticks?',
    domain: "What's the biggest competitive threat or market shift your team faces?",
    meeting_patterns: 'Which recurring meeting do you dread most, and why?',
    team_dynamics: "Who on your team is struggling right now, and what's blocking them?",
    preferences: 'Do you prefer bullet-point prep or narrative briefings before meetings?',
    decisions: "What's the hardest decision on your plate right now?",
};

function computeContextScores(data: TodayData): Record<string, number> {
    const scores: Record<string, number> = {};
    const { strategic, kpis, weeklyTrend } = data;

    // stakeholders
    const sCount = strategic.allStakeholders.length;
    const withRole = strategic.stakeholderHealth.filter(s => s.role).length;
    scores.stakeholders = Math.min(sCount * 10, 70) + (withRole > 0 ? 30 : 0);
    scores.stakeholders = Math.min(scores.stakeholders, 100);

    // goals
    if (kpis.length === 0) {
        scores.goals = 0;
    } else {
        scores.goals = 30;
        if (kpis.some(k => k.targetValue !== null)) scores.goals += 30;
        if (kpis.some(k => k.currentValue !== null)) scores.goals += 20;
        if (kpis.length >= 3) scores.goals += 20;
        scores.goals = Math.min(scores.goals, 100);
    }

    // org_politics
    scores.org_politics = strategic.orgContext?.organization ? 40 : 0;
    const withPower = strategic.stakeholderHealth.filter(s => s.powerLevel && s.powerLevel !== 'UNKNOWN').length;
    if (withPower > 0) scores.org_politics += 30;
    if (strategic.allStakeholders.length > 5) scores.org_politics += 30;
    scores.org_politics = Math.min(scores.org_politics, 100);

    // domain
    scores.domain = strategic.orgContext?.landscape ? 50 : 0;
    if (strategic.orgContext) scores.domain += 30;
    scores.domain = Math.min(scores.domain, 100);

    // meeting_patterns
    scores.meeting_patterns = Math.min(weeklyTrend.length * 20, 100);

    // team_dynamics
    const directReports = strategic.stakeholderHealth.filter(s => s.role?.includes('DIRECT') || s.role?.includes('REPORT'));
    scores.team_dynamics = directReports.length > 0 ? Math.min(50 + directReports.length * 10, 100) : 0;

    // preferences
    scores.preferences = strategic.recentInsights.length > 0 ? Math.min(40 + strategic.recentInsights.length * 10, 100) : 0;

    // decisions
    const decisionInsights = strategic.recentInsights.filter(i => i.type === 'DECISION' || i.type === 'decision');
    scores.decisions = decisionInsights.length > 0 ? Math.min(30 + decisionInsights.length * 20, 100) : 0;

    return scores;
}

// ===============================================================
// CALL FEEDBACK CARD — subtle post-call feedback prompt
// ===============================================================

interface RecentCall {
    id: string;
    callType: string;
    durationSeconds: number | null;
    startedAt: string;
    summary: string | null;
}

function CallFeedbackCard() {
    const [call, setCall] = useState<RecentCall | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [rating, setRating] = useState<number | null>(null);
    const [tooLong, setTooLong] = useState(false);
    const [tooShort, setTooShort] = useState(false);
    const [notRelevant, setNotRelevant] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [hoveredStar, setHoveredStar] = useState<number | null>(null);

    useEffect(() => {
        // Check if we've already dismissed feedback today
        const dismissKey = 'mira-feedback-dismissed';
        const lastDismissed = localStorage.getItem(dismissKey);
        if (lastDismissed) {
            const dismissedAt = new Date(lastDismissed);
            const hoursSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60);
            if (hoursSince < 12) {
                setDismissed(true);
                return;
            }
        }

        fetch('/api/calls/recent-unfeedback')
            .then(r => r.json())
            .then(data => { if (data.call) setCall(data.call); })
            .catch(() => {});
    }, []);

    const submitFeedback = async (starRating: number) => {
        if (!call) return;
        setRating(starRating);

        try {
            await fetch(`/api/calls/${call.id}/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: starRating,
                    tooLong,
                    tooShort,
                    wasRelevant: !notRelevant,
                }),
            });
            setSubmitted(true);
            setTimeout(() => setDismissed(true), 2000);
        } catch {
            // Silent fail
        }
    };

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem('mira-feedback-dismissed', new Date().toISOString()); } catch { /* ignore */ }
    };

    if (dismissed || !call) return null;

    const callLabel = (() => {
        const labels: Record<string, string> = {
            daily_checkin: 'your check-in',
            morning_brief: 'your morning brief',
            pre_meeting_prep: 'your meeting prep',
            post_meeting_debrief: 'your debrief',
            friday_ritual: 'the Friday wind-down',
            weekly_reflection: 'your weekly reflection',
            commitment_reminder: 'the follow-up check',
            onboarding: 'our first call',
        };
        return labels[call.callType] || 'your call with Mira';
    })();

    const timeLabel = (() => {
        const d = new Date(call.startedAt);
        const h = d.getHours();
        if (h < 12) return 'this morning';
        if (h < 17) return 'this afternoon';
        return 'earlier';
    })();

    if (submitted) {
        return (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">Thanks! This helps Mira get better.</span>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3 relative">
            <button
                onClick={dismiss}
                className="absolute top-2 right-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>

            <div className="flex items-start gap-3">
                <Phone size={15} className="text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm text-foreground/80">
                        How was {callLabel} {timeLabel}?
                    </p>

                    {/* Star rating */}
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                            <button
                                key={star}
                                onClick={() => submitFeedback(star)}
                                onMouseEnter={() => setHoveredStar(star)}
                                onMouseLeave={() => setHoveredStar(null)}
                                className="p-0.5 transition-transform hover:scale-110"
                            >
                                <Star
                                    size={20}
                                    className={
                                        (hoveredStar !== null ? star <= hoveredStar : star <= (rating || 0))
                                            ? 'text-amber-400 fill-amber-400'
                                            : 'text-muted-foreground/30'
                                    }
                                />
                            </button>
                        ))}
                    </div>

                    {/* Quick toggles */}
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setTooLong(!tooLong)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${tooLong ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border/40 text-muted-foreground hover:border-border'}`}
                        >
                            Too long
                        </button>
                        <button
                            onClick={() => setTooShort(!tooShort)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${tooShort ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-border/40 text-muted-foreground hover:border-border'}`}
                        >
                            Too short
                        </button>
                        <button
                            onClick={() => setNotRelevant(!notRelevant)}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${notRelevant ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-border/40 text-muted-foreground hover:border-border'}`}
                        >
                            Not relevant
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ===============================================================
// MAIN COMPONENT
// ===============================================================

export function TodayBrief() {
    const [data, setData] = useState<TodayData | null>(null);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [reviewNote, setReviewNote] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [updatingCommitment, setUpdatingCommitment] = useState<string | null>(null);
    const [contextAnswer, setContextAnswer] = useState('');
    const [contextSubmitting, setContextSubmitting] = useState(false);
    const [contextAnswered, setContextAnswered] = useState<Record<string, boolean>>(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('mira-context-answered') : null;
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const [learningAck, setLearningAck] = useState<{ meetingId: string; message: string } | null>(null);
    const [patternAlerts, setPatternAlerts] = useState<{ id: string; name: string; severity: string; description: string; suggestion: string; dataPoints: string[] }[]>([]);
    const [dismissedPatterns, setDismissedPatterns] = useState<Record<string, boolean>>(() => {
        try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem('mira-dismissed-patterns') : null;
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });

    const [coachingBrief, setCoachingBrief] = useState<string | null>(null);
    const [briefLoading, setBriefLoading] = useState(true);

    const fetchData = useCallback(() => {
        const tz = new Date().getTimezoneOffset();
        fetch(`/api/today?tz=${tz}`).then(r => r.ok ? r.json() : null)
            .then(j => { if (j?.success) setData(j.data); })
            .catch(() => {}).finally(() => setLoading(false));
    }, []);
    useEffect(() => { fetchData(); }, [fetchData]);

    // Fetch coaching brief (LLM-generated, cached 4h)
    useEffect(() => {
        fetch('/api/coaching-brief')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.brief) setCoachingBrief(d.brief); })
            .catch(() => {})
            .finally(() => setBriefLoading(false));
    }, []);

    // Fetch pattern alerts
    useEffect(() => {
        fetch('/api/patterns').then(r => r.ok ? r.json() : null)
            .then(j => { if (j?.success && j.patterns) setPatternAlerts(j.patterns); })
            .catch(() => {});
    }, []);

    const submitContextAnswer = async (areaKey: string, question: string) => {
        if (!contextAnswer.trim() || contextSubmitting) return;
        setContextSubmitting(true);
        try {
            const res = await fetch('/api/context/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ area: areaKey, question, answer: contextAnswer.trim() }),
            });
            if (res.ok) {
                const updated = { ...contextAnswered, [areaKey]: true };
                setContextAnswered(updated);
                try { localStorage.setItem('mira-context-answered', JSON.stringify(updated)); } catch { /* ignore */ }
                setContextAnswer('');
                // Refresh data so scores update
                fetchData();
            }
        } catch { /* ignore */ }
        setContextSubmitting(false);
    };

    const dismissPattern = (patternId: string) => {
        const updated = { ...dismissedPatterns, [patternId]: true };
        setDismissedPatterns(updated);
        try { localStorage.setItem('mira-dismissed-patterns', JSON.stringify(updated)); } catch { /* ignore */ }
    };

    const commitAction = async (id: string, action: 'done' | 'snooze' | 'drop') => {
        setUpdatingCommitment(id);
        try { const r = await fetch('/api/commitments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) }); if (r.ok) fetchData(); } catch {}
        setUpdatingCommitment(null);
    };
    const submitReview = async (meetingId: string, result: string) => {
        setSubmittingReview(true);
        try { const r = await fetch(`/api/meetings/${meetingId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result, note: reviewNote }) }); if (r.ok) { setReviewingId(null); setReviewNote(''); fetchData(); } } catch {}
        setSubmittingReview(false);
    };

    if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
    if (!data) return <div className="p-6 text-center text-sm text-muted-foreground py-12"><p>Could not load your dashboard.</p><button onClick={() => { setLoading(true); fetchData(); }} className="text-primary underline mt-2 text-xs">Retry</button></div>;

    const { userStage, strategic, weekSummary } = data;
    const timeCtx = getTimeCtx();
    const upcomingMeetings = data.meetings.filter(m => new Date(m.startTime) > new Date());

    const actionCount = data.needsReview.length + data.commitments.dueToday.length + strategic.upcomingWithoutGoals.length;
    const needsAttentionCount = strategic.stakeholderHealth.filter(s => s.needsAttention).length;

    // Briefing line
    const briefingLine = (() => {
        const parts: string[] = [];
        if (weekSummary.meetingsToday > 0) parts.push(`${weekSummary.meetingsToday} meetings today`);
        if (weekSummary.needleMovers > 0) parts.push(`${weekSummary.needleMovers} needle movers this week`);
        if (weekSummary.presentations > 0) parts.push(`${weekSummary.presentations} presentation${weekSummary.presentations > 1 ? 's' : ''}`);
        if (actionCount > 0) parts.push(`${actionCount} action${actionCount > 1 ? 's' : ''} pending`);
        if (parts.length === 0) {
            if (weekSummary.meetingsTomorrow > 0) parts.push(`${weekSummary.meetingsTomorrow} meetings tomorrow`);
            if (weekSummary.totalMeetings > 0) parts.push(`${weekSummary.totalMeetings} meetings this week`);
        }
        if (parts.length === 0) return 'Your command center is ready';
        return parts.join(' · ');
    })();

    // Computed data
    const contextScores = computeContextScores(data);

    // Find biggest gap area for daily question
    // Pick the biggest gap, skipping already-answered areas (today)
    const unansweredAreas = CONTEXT_AREAS.filter(a => !contextAnswered[a.key]);
    const gapCandidates = unansweredAreas.length > 0 ? unansweredAreas : CONTEXT_AREAS;
    const biggestGap = gapCandidates.reduce((worst, area) => {
        const score = contextScores[area.key] || 0;
        return score < (contextScores[worst.key] || 0) ? area : worst;
    }, gapCandidates[0]);

    // ─── NEW USER ───
    if (userStage === 'new') {
        return (
            <div className="w-full px-4 lg:px-8 py-4 space-y-5">
                <div>
                    <h1 className="text-xl font-semibold">{getGreeting()}, {data.user.name?.split(' ')[0] || 'there'}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{briefingLine}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Setup */}
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4 lg:col-span-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Zap size={20} className="text-primary" /></div>
                            <div><div className="text-sm font-medium">Get started in 3 steps</div><div className="text-xs text-muted-foreground">Each step unlocks more intelligence</div></div>
                        </div>
                        <div className="space-y-3">
                            {[
                                { done: data.meetings.length > 0, label: 'Calendar connected', desc: data.meetings.length > 0 ? `${data.meetings.length} meetings synced` : 'Connect Google Calendar in Settings', href: '/settings/connectors' },
                                { done: data.kpis.length > 0, label: 'Define your goals', desc: 'Tell Mira what you\'re driving this quarter', href: '/chat?prep=Help me define my top goals for this quarter' },
                                { done: data.stats?.outcomesSet > 0, label: 'Set your first meeting goal', desc: 'Tap any meeting and tell Mira your desired outcome', href: upcomingMeetings[0] ? `/chat?prep=${encodeURIComponent(upcomingMeetings[0].title)}` : '/chat' },
                            ].map((s, i) => (
                                <Link key={i} href={s.href} className="flex items-start gap-3 group">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${s.done ? 'bg-emerald-500/20' : 'bg-primary/10'}`}>
                                        {s.done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-xs text-primary font-bold">{i + 1}</span>}
                                    </div>
                                    <div className="flex-1"><div className={`text-sm group-hover:text-primary ${s.done ? 'text-muted-foreground line-through' : ''}`}>{s.label}</div><div className="text-xs text-muted-foreground">{s.desc}</div></div>
                                    <ChevronRight size={14} className="text-muted-foreground mt-1 opacity-0 group-hover:opacity-100" />
                                </Link>
                            ))}
                        </div>
                    </div>
                    {/* Meeting Blueprint Preview */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What Mira will help you build</div>
                        {[
                            { icon: Target, label: 'Outcome Tracking', desc: 'Know your meeting effectiveness' },
                            { icon: UserCheck, label: 'Stakeholder Radar', desc: 'Track key relationships' },
                            { icon: TrendingUp, label: 'Meeting Blueprint', desc: 'Ideal cadence for your role' },
                            { icon: Lightbulb, label: 'AI Insights', desc: 'Mira spots what you miss' },
                        ].map((it, i) => (
                            <div key={i} className="flex items-center gap-3"><it.icon size={14} className="text-primary flex-shrink-0" /><div><div className="text-xs font-medium">{it.label}</div><div className="text-[10px] text-muted-foreground">{it.desc}</div></div></div>
                        ))}
                    </div>
                    {/* Mira */}
                    <div className="lg:col-span-1"><MiraWidget /></div>
                </div>
            </div>
        );
    }

    // ─── BUILDING + ACTIVE USERS: MORNING BRIEF ───

    // ── MIRA'S BRIEF: Assemble an advisory sentence from existing data ──
    const miraBrief = (() => {
        const parts: string[] = [];

        // Find the highest-stakes upcoming meeting — skip low-importance and vendor-only meetings
        const VENDOR_TYPES = ['vendor', 'supplier', 'contractor', 'agency'];
        const classified = data.upcomingClassified || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isVendorOnly = (m: Record<string, any>) => {
            const insights = m.classification?.attendeeInsights || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const externals = insights.filter((a: Record<string, any>) => a.isExternal);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return externals.length > 0 && externals.every((a: Record<string, any>) => a.relationshipType && VENDOR_TYPES.includes(a.relationshipType));
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const notLowOrVendor = classified.filter((m: Record<string, any>) => m.classification.importance !== 'low' && !isVendorOnly(m));
        const mustWins = notLowOrVendor.filter(m => m.classification.group === 'must_win' || m.classification.importance === 'critical');
        const highStakes = notLowOrVendor.filter(m => m.classification.importance === 'high' || m.classification.group === 'stakeholder');
        const topMeeting = mustWins[0] || highStakes[0] || notLowOrVendor[0] || upcomingMeetings[0];

        // Find people intel for the top meeting
        const topMeetingPeople = (strategic.peopleIntel || []).filter(p =>
            topMeeting && p.meetingContext === topMeeting.title
        );
        const decisionMaker = topMeetingPeople.find(p => p.influenceRole === 'DECISION_MAKER');
        const skeptic = topMeetingPeople.find(p => p.politicalStance === 'SKEPTIC' || p.politicalStance === 'HOSTILE');

        // Build the advisory sentence
        if (topMeeting) {
            // Only highlight external companies that aren't vendors
            const externalCompany = topMeeting.classification?.attendeeInsights?.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (a: Record<string, any>) => a.isExternal && !(a.relationshipType && VENDOR_TYPES.includes(a.relationshipType))
            )?.company;

            if (externalCompany) {
                parts.push(`${externalCompany} is in your ${topMeeting.title} at ${formatTime(topMeeting.startTime)} — that's your highest-leverage moment today`);
            } else if (topMeeting.classification?.importance === 'critical') {
                parts.push(`Your ${topMeeting.title} at ${formatTime(topMeeting.startTime)} is the one that matters today`);
            } else {
                parts.push(`${weekSummary.meetingsToday} meeting${weekSummary.meetingsToday !== 1 ? 's' : ''} today`);
                if (topMeeting && new Date(topMeeting.startTime) > new Date()) {
                    parts.push(`next up: ${topMeeting.title} at ${formatTime(topMeeting.startTime)}`);
                }
            }

            // Add people context
            if (decisionMaker && skeptic) {
                parts.push(`${decisionMaker.name.split(' ')[0]} is the decision-maker, expect pushback from ${skeptic.name.split(' ')[0]}`);
            } else if (decisionMaker) {
                parts.push(`${decisionMaker.name.split(' ')[0]} is the decision-maker — lead with what they need`);
            } else if (skeptic) {
                parts.push(`Watch for pushback from ${skeptic.name.split(' ')[0]} — come prepared with evidence`);
            }

            // Add unresolved thread
            if (topMeeting.desiredOutcome) {
                parts.push(`your goal: "${topMeeting.desiredOutcome}"`);
            } else if (!topMeeting.desiredOutcome && topMeeting.classification?.importance === 'critical') {
                parts.push(`no goal set yet — what do you want to walk out with?`);
            }
        } else if (weekSummary.meetingsToday === 0 && weekSummary.meetingsTomorrow > 0) {
            parts.push(`Clear day today. ${weekSummary.meetingsTomorrow} meeting${weekSummary.meetingsTomorrow !== 1 ? 's' : ''} tomorrow`);
            if (data.commitments.dueToday.length > 0) {
                parts.push(`${data.commitments.dueToday.length} commitment${data.commitments.dueToday.length !== 1 ? 's' : ''} due — good day to close those out`);
            }
        } else {
            parts.push(`${weekSummary.totalMeetings} meetings this week`);
            if (needsAttentionCount > 0) {
                parts.push(`${needsAttentionCount} stakeholder relationship${needsAttentionCount !== 1 ? 's' : ''} drifting`);
            }
        }

        return parts.join('. ') + '.';
    })();

    // ── NEXT UP: Top 1-2 high-stakes meetings with people intel ──
    const nextUpMeetings = (() => {
        const now = new Date();
        const classified = data.upcomingClassified || [];
        // Find strategic upcoming meetings (not "recurring_audit")
        const strategic_meetings = classified.filter(m =>
            new Date(m.startTime) > now &&
            m.classification.group !== 'recurring_audit' &&
            (m.classification.importance === 'critical' || m.classification.importance === 'high' || m.classification.group === 'must_win' || m.classification.group === 'stakeholder' || m.classification.group === 'growth')
        );
        // Fall back to today's upcoming meetings if no classified
        if (strategic_meetings.length === 0) {
            return upcomingMeetings.slice(0, 2).map(m => ({
                id: m.id,
                title: m.title,
                startTime: m.startTime,
                endTime: m.endTime,
                attendeeCount: m.attendees.length,
                desiredOutcome: m.desiredOutcome,
                importance: 'medium' as string,
                group: 'operational' as string,
                reasons: [] as string[],
                attendeeInsights: [] as Record<string, unknown>[],
            }));
        }
        return strategic_meetings.slice(0, 2).map(m => ({
            id: m.id,
            title: m.title,
            startTime: m.startTime,
            endTime: m.endTime || m.startTime,
            attendeeCount: m.attendeeCount,
            desiredOutcome: m.desiredOutcome,
            importance: m.classification.importance,
            group: m.classification.group,
            reasons: m.classification.reasons,
            attendeeInsights: m.classification.attendeeInsights || [],
        }));
    })();

    // Handler for meeting updates (used by StrategicMeetingView)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateMeeting = async (id: string, updates: Record<string, any>) => {
        try {
            const res = await fetch(`/api/meetings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (res.ok) {
                const result = await res.json();
                setData(prev => {
                    if (!prev || !prev.upcomingClassified) return prev;
                    return {
                        ...prev,
                        upcomingClassified: prev.upcomingClassified!.map(m => {
                            if (m.id !== id) return m;
                            const updated = { ...m, ...updates };
                            if (updates.userImportanceOverride !== undefined) {
                                const imp = updates.userImportanceOverride || m.classification.importance;
                                const newGroup = imp === 'critical' ? 'must_win' : imp === 'high' ? 'stakeholder' : 'operational';
                                updated.classification = { ...m.classification, importance: imp, group: newGroup };
                            }
                            return updated;
                        }),
                    };
                });
                // Show inline learning acknowledgment on the specific meeting card
                if (result.learned && result.learnedMessage) {
                    setLearningAck({ meetingId: id, message: result.learnedMessage });
                    setTimeout(() => setLearningAck(null), 8000);
                }
            }
        } catch { /* ignore */ }
    };

    // Unified attention items
    const attentionItems: Array<{ type: string; id: string; content: React.ReactNode }> = [];

    // Post-meeting reviews
    data.needsReview.slice(0, 2).forEach(m => {
        attentionItems.push({
            type: 'review', id: m.id,
            content: (
                <div>
                    <div className="text-sm"><span className="font-medium">{m.title}</span> just ended</div>
                    {m.desiredOutcome && <div className="text-xs text-muted-foreground mt-0.5">Goal: &ldquo;{m.desiredOutcome}&rdquo;</div>}
                    {reviewingId === m.id ? (
                        <div className="mt-2 space-y-2">
                            <div className="flex gap-2">{['LANDED', 'PARTIAL', 'MISSED'].map(r => (
                                <button key={r} onClick={() => submitReview(m.id, r)} disabled={submittingReview}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 ${r === 'LANDED' ? 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10' : r === 'PARTIAL' ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10' : 'border-red-400/30 text-red-400 hover:bg-red-400/10'}`}>
                                    {submittingReview ? '...' : r === 'LANDED' ? 'Landed' : r === 'PARTIAL' ? 'Partial' : 'Missed'}
                                </button>
                            ))}</div>
                            <input type="text" value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="What changed? (optional)" className="w-full text-xs bg-input border border-border rounded-lg px-3 py-2" />
                        </div>
                    ) : (
                        <div className="flex gap-2 mt-1.5 items-center">
                            <button onClick={() => setReviewingId(m.id)} className="px-3 py-1 text-xs font-medium bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500/20">Log Outcome</button>
                            <VoiceCallButton compact callType="post_meeting_debrief" meetingId={m.id} />
                            <button onClick={() => submitReview(m.id, 'SKIPPED')} className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Skip</button>
                        </div>
                    )}
                </div>
            ),
        });
    });

    // Overdue commitments
    data.commitments.dueToday.slice(0, 3).forEach(c => {
        attentionItems.push({
            type: 'commitment', id: c.id,
            content: (
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm">{c.description}</div>
                        <div className="text-[10px] text-muted-foreground">{c.owner} · {c.meetingTitle}{c.status === 'OVERDUE' && <span className="text-red-400 ml-1">overdue</span>}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                        {updatingCommitment === c.id ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : (
                            <>
                                <button onClick={() => commitAction(c.id, 'done')} className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10"><CheckCircle2 size={16} /></button>
                                <button onClick={() => commitAction(c.id, 'snooze')} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted text-[10px] font-medium">+1d</button>
                            </>
                        )}
                    </div>
                </div>
            ),
        });
    });

    // Stale relationships
    const staleStakeholders = strategic.stakeholderHealth.filter(s => s.needsAttention).slice(0, 2);
    staleStakeholders.forEach(s => {
        attentionItems.push({
            type: 'relationship', id: s.id,
            content: (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm"><span className="font-medium">{s.name}</span> {s.role ? `(${s.role})` : ''}</div>
                        <div className="text-[10px] text-muted-foreground">
                            {s.lastInteraction
                                ? `Last spoke ${Math.floor((Date.now() - new Date(s.lastInteraction).getTime()) / 86400000)} days ago`
                                : 'Never met'}
                        </div>
                    </div>
                    <Link href={`/stakeholders?highlight=${s.id}`} className="text-[10px] text-primary hover:text-primary/80 font-medium flex-shrink-0">
                        Schedule
                    </Link>
                </div>
            ),
        });
    });

    // Metrics — one line
    const hitRate = data.stats?.outcomeHitRate;
    const prevHitRate = data.stats?.previousHitRate;
    const hitDelta = hitRate !== null && prevHitRate !== null ? hitRate - prevHitRate : null;
    const nmRatio = weekSummary.totalMeetings > 0 ? Math.round((weekSummary.needleMovers / weekSummary.totalMeetings) * 100) : null;
    const followThrough = data.stats?.commitmentsMade > 0 ? Math.round((data.stats.commitmentsFulfilled / data.stats.commitmentsMade) * 100) : null;

    // ── Chart data prep ──
    const categoryData = Object.entries(strategic.categoryBreakdown || {}).map(([cat, count]) => ({
        label: cat === 'NEEDLE_MOVER' ? 'Needle Movers' : cat === 'TACTICAL' ? 'Tactical' : cat === 'OPERATIONAL' ? 'Operational' : cat === 'GROWTH' ? 'Growth' : cat === 'UNCATEGORIZED' ? 'Uncategorized' : cat,
        value: count as number,
        color: cat === 'NEEDLE_MOVER' ? '#10b981' : cat === 'GROWTH' ? '#6366f1' : cat === 'TACTICAL' ? '#f59e0b' : cat === 'OPERATIONAL' ? '#64748b' : '#94a3b8',
    }));
    const totalCatMeetings = categoryData.reduce((s, d) => s + d.value, 0);
    const weekTrend = data.weeklyTrend || [];
    const trendMaxMeetings = Math.max(...weekTrend.map(w => w.totalMeetings || 0), 1);
    const trendMaxHours = Math.max(...weekTrend.map(w => w.totalHours || 0), 1);

    // Stakeholder health summary
    const healthyStakeholders = strategic.stakeholderHealth.filter(s => !s.needsAttention).length;
    const atRiskStakeholders = strategic.stakeholderHealth.filter(s => s.needsAttention).length;
    const totalStakeholders = strategic.stakeholderHealth.length;

    // KPI summary
    const kpisOnTrack = data.kpis.filter(k => k.status === 'ON_TRACK' || k.status === 'ACHIEVED').length;
    const kpisAtRisk = data.kpis.filter(k => k.status === 'AT_RISK').length;
    const kpisOffTrack = data.kpis.filter(k => k.status === 'OFF_TRACK').length;

    return (
        <div className="w-full max-w-5xl mx-auto px-4 lg:px-8 py-6 space-y-6">

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 0. HEADER + CALL FEEDBACK                              */}
            {/* ═══════════════════════════════════════════════════════ */}
            <CallFeedbackCard />
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-serif font-light tracking-tight text-foreground/90">{getGreeting()}, {data.user.name?.split(' ')[0] || 'there'}.</h1>
                    <div className="text-xs text-muted-foreground mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                </div>
                <div className="flex items-center gap-3">
                    <SyncHealthBadge />
                    <VoiceCallButton compact callType="general" />
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* SYNC STATUS — What Mira has access to                  */}
            {/* ═══════════════════════════════════════════════════════ */}
            <SyncStatusCard />

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 0. ONBOARDING PROGRESS — Mira's knowledge of you       */}
            {/* ═══════════════════════════════════════════════════════ */}
            {data.onboarding && !data.onboarding.complete && (() => {
                const ob = data.onboarding;
                const pct = Math.round((ob.coveredCount / ob.totalTopics) * 100);
                const topicLabels: Record<string, { label: string; layer: string }> = {
                    story: { label: 'Story', layer: 'Person' },
                    drivesAndValues: { label: 'Values', layer: 'Person' },
                    life: { label: 'Life', layer: 'Person' },
                    role: { label: 'Role', layer: 'Leader' },
                    stakeholders: { label: 'People', layer: 'Leader' },
                    leadershipStyle: { label: 'Style', layer: 'Leader' },
                    goals: { label: 'Goals', layer: 'Ambition' },
                    challenges: { label: 'Challenges', layer: 'Ambition' },
                    growth: { label: 'Growth', layer: 'Ambition' },
                };
                return (
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mira&apos;s Knowledge of You</div>
                            <div className="text-xs text-muted-foreground">{ob.totalCalls} call{ob.totalCalls !== 1 ? 's' : ''} analyzed</div>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm font-bold tabular-nums">{pct}%</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(topicLabels).map(([key, { label }]) => (
                                <span key={key} className={`text-[10px] px-2 py-0.5 rounded-full ${ob.topics[key] ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                    {ob.topics[key] ? '\u2713' : '\u25CB'} {label}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 1. STAT CARDS — key numbers at a glance                */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Meetings Today */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Today</div>
                    <div className="text-2xl font-bold tabular-nums mt-1">{weekSummary.meetingsToday}</div>
                    <div className="text-[10px] text-muted-foreground">meetings</div>
                </div>
                {/* Effectiveness */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Effectiveness</div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-2xl font-bold tabular-nums">{hitRate !== null ? `${hitRate}%` : '--'}</span>
                        {hitDelta !== null && hitDelta !== 0 && (
                            <span className={`text-xs font-semibold ${hitDelta > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                {hitDelta > 0 ? '+' : ''}{hitDelta}%
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">outcome hit rate</div>
                </div>
                {/* Follow-Through */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Follow-through</div>
                    <div className="text-2xl font-bold tabular-nums mt-1">{followThrough !== null ? `${followThrough}%` : '--'}</div>
                    <div className="text-[10px] text-muted-foreground">{data.stats?.commitmentsFulfilled || 0}/{data.stats?.commitmentsMade || 0} commitments</div>
                </div>
                {/* Needle Movers */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Needle Movers</div>
                    <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-2xl font-bold tabular-nums text-emerald-500">{weekSummary.needleMovers}</span>
                        <span className="text-sm text-muted-foreground">/ {weekSummary.totalMeetings}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">this week</div>
                </div>
                {/* KPIs */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">KPIs</div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-2xl font-bold tabular-nums text-emerald-500">{kpisOnTrack}</span>
                        {kpisAtRisk > 0 && <span className="text-sm font-semibold text-amber-500">{kpisAtRisk}</span>}
                        {kpisOffTrack > 0 && <span className="text-sm font-semibold text-red-400">{kpisOffTrack}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{data.kpis.length > 0 ? `${kpisOnTrack} on track` : 'none set'}</div>
                </div>
                {/* Stakeholders */}
                <div className="rounded-xl border border-border bg-card p-3.5">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Relationships</div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-2xl font-bold tabular-nums">{totalStakeholders}</span>
                        {atRiskStakeholders > 0 && <span className="text-xs font-semibold text-amber-500">{atRiskStakeholders} drifting</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground">tracked</div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 2. CHARTS ROW — visual analytics                       */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Weekly Trend — bar chart */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Weekly Trend</div>
                    {weekTrend.length > 1 ? (
                        <div className="flex items-end gap-1.5 h-24">
                            {weekTrend.slice(-8).map((w, i) => {
                                const h = Math.max((w.totalMeetings || 0) / trendMaxMeetings * 100, 4);
                                const landed = w.outcomesLanded || 0;
                                const set = w.outcomesSet || 0;
                                const rate = set > 0 ? Math.round(landed / set * 100) : 0;
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="text-[9px] tabular-nums text-muted-foreground">{rate > 0 ? `${rate}%` : ''}</div>
                                        <div
                                            className="w-full rounded-t-sm bg-primary/60 transition-all"
                                            style={{ height: `${h}%`, minHeight: 3 }}
                                            title={`${w.totalMeetings} meetings, ${rate}% hit rate`}
                                        />
                                        <div className="text-[8px] text-muted-foreground tabular-nums">
                                            {w.weekStart ? new Date(w.weekStart).toLocaleDateString([], { month: 'short', day: 'numeric' }) : `W${i + 1}`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">Building trend data...</div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/60" /> Meetings</span>
                        <span>% = hit rate</span>
                    </div>
                </div>

                {/* Meeting Mix — donut chart */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Meeting Mix</div>
                    {totalCatMeetings > 0 ? (
                        <div className="flex items-center gap-4">
                            <svg width={80} height={80} viewBox="0 0 80 80" className="flex-shrink-0">
                                {(() => {
                                    let cumAngle = -90;
                                    return categoryData.map((d, i) => {
                                        const angle = (d.value / totalCatMeetings) * 360;
                                        const startAngle = cumAngle;
                                        cumAngle += angle;
                                        const startRad = (startAngle * Math.PI) / 180;
                                        const endRad = ((startAngle + angle) * Math.PI) / 180;
                                        const largeArc = angle > 180 ? 1 : 0;
                                        const r = 35;
                                        const x1 = 40 + r * Math.cos(startRad);
                                        const y1 = 40 + r * Math.sin(startRad);
                                        const x2 = 40 + r * Math.cos(endRad);
                                        const y2 = 40 + r * Math.sin(endRad);
                                        if (angle === 0) return null;
                                        if (angle >= 359.9) return <circle key={i} cx={40} cy={40} r={r} fill={d.color} />;
                                        return <path key={i} d={`M40,40 L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`} fill={d.color} opacity={0.8} />;
                                    });
                                })()}
                                <circle cx={40} cy={40} r={18} className="fill-card" />
                                <text x={40} y={43} textAnchor="middle" className="fill-foreground text-sm font-bold" fontSize={14}>{totalCatMeetings}</text>
                            </svg>
                            <div className="flex-1 space-y-1.5">
                                {categoryData.filter(d => d.value > 0).map(d => (
                                    <div key={d.label} className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                        <span className="text-[11px] text-muted-foreground flex-1 truncate">{d.label}</span>
                                        <span className="text-[11px] font-semibold tabular-nums">{d.value}</span>
                                        <span className="text-[9px] text-muted-foreground tabular-nums w-7 text-right">{Math.round(d.value / totalCatMeetings * 100)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">No categorized meetings</div>
                    )}
                </div>

                {/* Time Allocation + Hours */}
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Time This Week</div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative w-16 h-16">
                            <ScoreRing value={strategic.timeAllocation.totalHours} max={40} size={64} strokeWidth={5} color="text-primary" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold tabular-nums">{Math.round(strategic.timeAllocation.totalHours)}h</span>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            <div>{Math.round(strategic.timeAllocation.totalHours)}h in meetings</div>
                            <div className="text-foreground/60 mt-0.5">{weekSummary.presentations > 0 ? `${weekSummary.presentations} presentations` : ''}</div>
                        </div>
                    </div>
                    {/* Hours trend sparkline */}
                    {weekTrend.length > 1 && (
                        <div className="flex items-end gap-1 h-8">
                            {weekTrend.slice(-8).map((w, i) => (
                                <div key={i} className="flex-1">
                                    <div
                                        className="w-full rounded-t-sm bg-muted-foreground/20"
                                        style={{ height: `${Math.max((w.totalHours || 0) / trendMaxHours * 100, 4)}%`, minHeight: 2 }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 3. MIRA'S COACHING NOTE                                */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
                {briefLoading ? (
                    <div className="py-2">
                        <div className="h-3 bg-muted/50 rounded w-3/4 mb-2 animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded w-full mb-2 animate-pulse" />
                        <div className="h-3 bg-muted/50 rounded w-2/3 animate-pulse" />
                    </div>
                ) : coachingBrief ? (
                    <div>
                        {coachingBrief.split('\n\n').filter(Boolean).map((para, i) => (
                            <p key={i} className="text-[15px] leading-[1.8] text-foreground/80 mb-3 last:mb-0">
                                {para}
                            </p>
                        ))}
                    </div>
                ) : (
                    <p className="text-[15px] leading-[1.7] text-foreground/80">{miraBrief}</p>
                )}
                <div className="flex items-center gap-4">
                    <Link href={`/v2/chat?prep=${encodeURIComponent(getMiraPrompt(timeCtx))}`}
                        className="flex items-center gap-2 text-sm text-primary/80 hover:text-primary transition-colors">
                        <MessageCircle size={14} />
                        <span className="italic">&ldquo;{getMiraPrompt(timeCtx)}&rdquo;</span>
                    </Link>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 4. TWO-COLUMN: MEETINGS + ATTENTION                    */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Meeting Timeline — wider */}
                <div className="lg:col-span-3 rounded-xl border border-border bg-card p-4">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Today &middot; {weekSummary.meetingsToday} meeting{weekSummary.meetingsToday !== 1 ? 's' : ''}
                    </div>
                    {data.meetings.length > 0 ? (
                        <div className="space-y-0.5">
                            {data.meetings.map((meeting) => {
                                const meetingPeople = (strategic.peopleIntel || []).filter(p => p.meetingContext === meeting.title);
                                const classified = (data.upcomingClassified || []).find(c => c.id === meeting.id);
                                const importance = classified?.classification.importance;
                                const isHighStakes = importance === 'critical' || importance === 'high';
                                const isPast = new Date(meeting.endTime) < new Date();

                                return (
                                    <div key={meeting.id} className={`flex items-start gap-3 py-2 ${isPast ? 'opacity-35' : ''}`}>
                                        <div className="w-12 text-right flex-shrink-0">
                                            <span className="text-xs tabular-nums text-muted-foreground">{formatTime(meeting.startTime)}</span>
                                        </div>
                                        <div className={`w-0.5 self-stretch flex-shrink-0 rounded-full ${isHighStakes ? 'bg-primary' : 'bg-border'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className={`text-sm ${isHighStakes ? 'font-semibold' : 'font-medium'}`}>{meeting.title}</div>
                                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                                        {meeting.attendees.slice(0, 3).join(', ')}
                                                        {meeting.attendees.length > 3 && ` +${meeting.attendees.length - 3}`}
                                                    </div>
                                                </div>
                                                {!isPast && isHighStakes && (
                                                    <Link href={`/v2/chat?prep=${encodeURIComponent(meeting.title)}`}
                                                        className="text-[10px] font-medium text-primary hover:text-primary/80 flex-shrink-0 flex items-center gap-1">
                                                        <Zap size={10} /> Prep
                                                    </Link>
                                                )}
                                            </div>
                                            {meeting.desiredOutcome && (
                                                <div className="text-[10px] text-foreground/60 mt-1 flex items-center gap-1">
                                                    <Target size={9} className="text-primary/50" />
                                                    {meeting.desiredOutcome}
                                                </div>
                                            )}
                                            {!isPast && isHighStakes && meetingPeople.length > 0 && (
                                                <div className="flex items-center gap-3 mt-1">
                                                    {meetingPeople.slice(0, 2).map(person => {
                                                        const archetype = person.personaArchetype ? ARCHETYPE_PLAYBOOK[person.personaArchetype] : null;
                                                        const label = person.influenceRole === 'DECISION_MAKER' ? 'Decides'
                                                            : (person.politicalStance === 'SKEPTIC' || person.politicalStance === 'HOSTILE') ? 'Skeptic'
                                                            : (person.politicalStance === 'CHAMPION' || person.politicalStance === 'SUPPORTIVE') ? 'Ally'
                                                            : archetype?.label || null;
                                                        if (!label) return null;
                                                        return (
                                                            <span key={person.id} className="text-[10px] text-muted-foreground">
                                                                {person.name.split(' ')[0]}: <span className="font-medium text-foreground/60">{label}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-6 text-center text-xs text-muted-foreground">No meetings today</div>
                    )}
                </div>

                {/* Right column: Attention + KPIs */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Needs Attention */}
                    {attentionItems.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Needs Attention ({attentionItems.length})
                            </div>
                            <div className="space-y-3">
                                {attentionItems.map(item => (
                                    <div key={item.id} className="border-l-2 border-amber-500/40 pl-3">
                                        {item.content}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* KPI Status */}
                    {data.kpis.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4">
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Goals & KPIs
                            </div>
                            <div className="space-y-2.5">
                                {data.kpis.slice(0, 6).map(kpi => {
                                    const pct = kpi.targetValue && kpi.currentValue ? Math.min(Math.round(kpi.currentValue / kpi.targetValue * 100), 100) : null;
                                    return (
                                        <div key={kpi.id}>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-xs font-medium truncate flex-1">{kpi.name}</span>
                                                <span className={`text-[10px] font-semibold ${statusColor(kpi.status)}`}>
                                                    {kpi.status === 'ON_TRACK' ? 'On Track' : kpi.status === 'AT_RISK' ? 'At Risk' : kpi.status === 'OFF_TRACK' ? 'Off Track' : kpi.status === 'ACHIEVED' ? 'Done' : kpi.status}
                                                </span>
                                            </div>
                                            {pct !== null && (
                                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${kpi.status === 'ON_TRACK' || kpi.status === 'ACHIEVED' ? 'bg-emerald-500' : kpi.status === 'AT_RISK' ? 'bg-amber-500' : 'bg-red-400'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stakeholder Health Mini */}
                    {totalStakeholders > 0 && (
                        <Link href="/v2/stakeholders" className="block rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors group">
                            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Relationship Health</div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
                                    {healthyStakeholders > 0 && <div className="h-full bg-emerald-500" style={{ width: `${healthyStakeholders / totalStakeholders * 100}%` }} />}
                                    {atRiskStakeholders > 0 && <div className="h-full bg-amber-500" style={{ width: `${atRiskStakeholders / totalStakeholders * 100}%` }} />}
                                </div>
                                <span className="text-[10px] tabular-nums text-muted-foreground">{healthyStakeholders}/{totalStakeholders}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Healthy</span>
                                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Drifting</span>
                                <ArrowRight size={8} className="ml-auto text-primary opacity-0 group-hover:opacity-100" />
                            </div>
                        </Link>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 5. THINK WITH MIRA — compact pills                     */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="pt-2 border-t border-border/30">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Think with Mira</div>
                <div className="flex flex-wrap gap-2">
                    {MIRA_MODES.map(mode => (
                        <Link
                            key={mode.key}
                            href={`/v2/chat?prep=${encodeURIComponent(mode.prep)}`}
                            className={`px-3 py-1.5 rounded-full border ${mode.borderColor} text-xs font-medium ${mode.iconColor} hover:bg-muted/50 transition-colors`}
                        >
                            {mode.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* 6. RECENT CALLS                                        */}
            {/* ═══════════════════════════════════════════════════════ */}
            <RecentCallsSection />

        </div>
    );
}

// ===============================================================
// THINK WITH MIRA — conversational mode cards
// ===============================================================

const MIRA_MODES = [
    {
        key: 'OUTCOMES',
        label: 'Outcomes',
        tagline: 'What should success look like?',
        prep: 'Help me think about what success looks like for my current priorities',
        borderColor: 'border-emerald-500/40',
        bgColor: 'bg-emerald-500/5 hover:bg-emerald-500/10',
        iconColor: 'text-emerald-500',
    },
    {
        key: 'DEVILS_ADVOCATE',
        label: "Devil's Advocate",
        tagline: 'Poke holes in my plan',
        prep: "Play devil's advocate — challenge my current thinking and poke holes in my plan",
        borderColor: 'border-red-400/40',
        bgColor: 'bg-red-400/5 hover:bg-red-400/10',
        iconColor: 'text-red-400',
    },
    {
        key: 'SKILL_BUILDING',
        label: 'Skill Building',
        tagline: 'Practice a hard conversation',
        prep: 'Help me practice a difficult conversation I need to have',
        borderColor: 'border-blue-500/40',
        bgColor: 'bg-blue-500/5 hover:bg-blue-500/10',
        iconColor: 'text-blue-500',
    },
    {
        key: 'PERSONAL',
        label: 'Personal',
        tagline: 'I need to talk',
        prep: "I need to talk through something that's on my mind",
        borderColor: 'border-purple-500/40',
        bgColor: 'bg-purple-500/5 hover:bg-purple-500/10',
        iconColor: 'text-purple-500',
    },
] as const;

function ThinkWithMira() {
    return (
        <div className="space-y-3">
            <div className="text-sm font-medium text-foreground/70">Think with Mira</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {MIRA_MODES.map(mode => (
                    <Link
                        key={mode.key}
                        href={`/v2/chat?prep=${encodeURIComponent(mode.prep)}`}
                        className={`rounded-xl border ${mode.borderColor} ${mode.bgColor} p-4 transition-colors group`}
                    >
                        <div className={`text-sm font-semibold ${mode.iconColor} mb-1`}>{mode.label}</div>
                        <div className="text-xs text-muted-foreground leading-relaxed">&ldquo;{mode.tagline}&rdquo;</div>
                        <div className="flex items-center gap-2 mt-3">
                            <span className="text-[10px] text-muted-foreground/70 group-hover:text-primary transition-colors flex items-center gap-1">
                                <MessageCircle size={10} /> Chat
                            </span>
                            <VoiceCallButton compact callType="general" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ===============================================================
// SYNC HEALTH BADGE — compact sync status indicator
// ===============================================================

interface SyncConnector {
    provider: string;
    status: string;
    lastSyncAgo: string;
    syncStatus: string;
    hasWatchChannel: boolean;
}

function SyncHealthBadge() {
    const [connectors, setConnectors] = useState<SyncConnector[]>([]);
    const [overall, setOverall] = useState<string>('unknown');
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        fetch('/api/sync/health')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.connectors) setConnectors(d.connectors);
                if (d?.overall) setOverall(d.overall);
            })
            .catch(() => {});
    }, []);

    if (connectors.length === 0) return null;

    const statusDot = overall === 'healthy' ? 'bg-emerald-500' : overall === 'degraded' ? 'bg-amber-500' : 'bg-red-400';
    const statusLabel = overall === 'healthy' ? 'All synced' : overall === 'degraded' ? 'Sync delayed' : 'Disconnected';

    const providerLabel: Record<string, string> = { gcal: 'Calendar', gmail: 'Email', gdrive: 'Drive' };

    return (
        <div className="inline-flex items-center relative">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                <span>{statusLabel}</span>
            </button>
            {expanded && (
                <div className="absolute right-0 top-6 z-10 rounded-lg border border-border bg-card shadow-lg p-3 space-y-2 min-w-[200px]">
                    {connectors.map(c => (
                        <div key={c.provider} className="flex items-center justify-between text-xs">
                            <span>{providerLabel[c.provider] || c.provider}</span>
                            <div className="flex items-center gap-1.5">
                                {c.hasWatchChannel && <Zap size={9} className="text-emerald-500" />}
                                <span className={`w-1.5 h-1.5 rounded-full ${c.syncStatus === 'idle' ? 'bg-emerald-500' : c.syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : 'bg-red-400'}`} />
                                <span className="text-muted-foreground">{c.lastSyncAgo}</span>
                            </div>
                        </div>
                    ))}
                    <Link href="/settings/connectors" className="text-[10px] text-primary hover:underline block pt-1 border-t border-border/50">
                        Manage connections
                    </Link>
                </div>
            )}
        </div>
    );
}

// ===============================================================
// RECENT CALLS — last few voice calls
// ===============================================================

interface RecentCallSummary {
    id: string;
    callType: string;
    durationSeconds: number | null;
    summary: string | null;
    createdAt: string;
}

function RecentCallsSection() {
    const [calls, setCalls] = useState<RecentCallSummary[]>([]);

    useEffect(() => {
        fetch('/api/voice/calls?limit=3')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.calls) setCalls(d.calls); })
            .catch(() => {});
    }, []);

    if (calls.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="text-sm font-medium text-foreground/70 flex items-center gap-2">
                <Phone size={14} className="text-muted-foreground/50" />
                Recent calls
            </div>
            <div className="space-y-2">
                {calls.map(call => {
                    const dur = call.durationSeconds ? `${Math.ceil(call.durationSeconds / 60)} min` : '';
                    const timeAgo = (() => {
                        const diff = Date.now() - new Date(call.createdAt).getTime();
                        const hours = Math.floor(diff / 3600000);
                        if (hours < 1) return 'Just now';
                        if (hours < 24) return `${hours}h ago`;
                        const days = Math.floor(hours / 24);
                        return `${days}d ago`;
                    })();
                    return (
                        <div key={call.id} className="flex items-start gap-3 text-sm">
                            <Phone size={12} className="text-muted-foreground/40 mt-1 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span>{dur}</span>
                                    <span className="text-muted-foreground/40">{timeAgo}</span>
                                </div>
                                {call.summary && (
                                    <div className="text-xs text-foreground/70 line-clamp-1 mt-0.5">{call.summary}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ===============================================================
// STRATEGIC MEETING VIEW — grouped by classification
// ===============================================================

const GROUP_CONFIG: Record<string, { label: string; Icon: typeof Shield; borderClass: string; badgeClass: string }> = {
    must_win: { label: 'Must Win', Icon: Shield, borderClass: 'border-l-red-400', badgeClass: 'bg-red-500/10 text-red-400' },
    stakeholder: { label: 'Key Relationships', Icon: UserCheck, borderClass: 'border-l-amber-400', badgeClass: 'bg-amber-500/10 text-amber-500' },
    growth: { label: 'Growth & Strategy', Icon: TrendingUp, borderClass: 'border-l-emerald-400', badgeClass: 'bg-emerald-500/10 text-emerald-500' },
    operational: { label: 'Operational', Icon: Calendar, borderClass: 'border-l-gray-400', badgeClass: 'bg-muted text-muted-foreground' },
    recurring_audit: { label: 'Review These', Icon: AlertCircle, borderClass: 'border-l-red-400 border-dashed', badgeClass: 'bg-red-400/10 text-red-400' },
};

const GROUP_ORDER = ['must_win', 'stakeholder', 'growth', 'operational', 'recurring_audit'];

function formatMeetingDate(d: string): string {
    const date = new Date(d);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (isTomorrow) return `Tomorrow, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
        ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function synthesizeMeetingGist(m: ClassifiedMeeting, peopleIntel: PersonIntel[]): string | null {
    // Find people from peopleIntel who are in this meeting (match by meeting title in meetingContext)
    const meetingPeople = peopleIntel.filter(p => p.meetingContext === m.title);
    if (meetingPeople.length === 0) return null;

    const parts: string[] = [];

    // Summarize the room by archetypes
    const archetypes = meetingPeople
        .filter(p => p.personaArchetype && ARCHETYPE_PLAYBOOK[p.personaArchetype])
        .map(p => ({ name: p.name.split(' ')[0], archetype: ARCHETYPE_PLAYBOOK[p.personaArchetype!] }));

    // Find champions vs skeptics
    const champions = meetingPeople.filter(p => p.politicalStance === 'CHAMPION' || p.politicalStance === 'SUPPORTIVE');
    const skeptics = meetingPeople.filter(p => p.politicalStance === 'SKEPTIC' || p.politicalStance === 'HOSTILE');

    // Find the decision-maker
    const decisionMaker = meetingPeople.find(p => p.influenceRole === 'DECISION_MAKER');

    if (decisionMaker) {
        parts.push(`${decisionMaker.name.split(' ')[0]} is the decision-maker`);
    }
    if (champions.length > 0 && skeptics.length > 0) {
        parts.push(`${champions[0].name.split(' ')[0]} is an ally, ${skeptics[0].name.split(' ')[0]} will push back`);
    } else if (skeptics.length > 0) {
        parts.push(`expect pushback from ${skeptics[0].name.split(' ')[0]}`);
    } else if (champions.length > 0) {
        parts.push(`${champions[0].name.split(' ')[0]} can back you up`);
    } else if (archetypes.length > 0) {
        const first = archetypes[0];
        parts.push(`${first.name} is a ${first.archetype.label.toLowerCase()} — ${first.archetype.doThis.split(',')[0].toLowerCase()}`);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : null;
}

function StrategicMeetingView({ meetings, noMeetingsToday, onUpdateMeeting, peopleIntel = [], learningAck }: {
    meetings: ClassifiedMeeting[];
    noMeetingsToday: boolean;
    onUpdateMeeting?: (id: string, updates: { userImportanceOverride?: string | null; strategicLevel?: string | null; strategicOwner?: string | null; meetingCategory?: string | null }) => void;
    peopleIntel?: PersonIntel[];
    learningAck?: { meetingId: string; message: string } | null;
}) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [strategicTab, setStrategicTab] = useState<'all' | 'personal' | 'team'>('all');
    const [teamOwnerInput, setTeamOwnerInput] = useState('');

    if (meetings.length === 0) return null;

    // Filter by strategic level tab
    const filteredMeetings = strategicTab === 'all'
        ? meetings
        : meetings.filter(m => {
            if (strategicTab === 'personal') return m.strategicLevel === 'personal' || (!m.strategicLevel && (m.classification.importance === 'critical' || m.classification.importance === 'high'));
            if (strategicTab === 'team') return m.strategicLevel === 'team';
            return true;
        });

    // Group meetings
    const groups: Record<string, ClassifiedMeeting[]> = {};
    for (const m of filteredMeetings) {
        const g = m.classification.group;
        if (!groups[g]) groups[g] = [];
        groups[g].push(m);
    }

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const personalCount = meetings.filter(m => m.strategicLevel === 'personal' || (!m.strategicLevel && (m.classification.importance === 'critical' || m.classification.importance === 'high'))).length;
    const teamCount = meetings.filter(m => m.strategicLevel === 'team').length;

    const importanceOptions = [
        { value: 'critical', label: 'Must Win', color: 'text-red-400 bg-red-500/10' },
        { value: 'high', label: 'High', color: 'text-amber-500 bg-amber-500/10' },
        { value: 'medium', label: 'Normal', color: 'text-muted-foreground bg-muted' },
        { value: 'low', label: 'Low', color: 'text-muted-foreground bg-muted' },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shield size={14} className="text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {noMeetingsToday ? 'Strategic Meeting View' : 'Upcoming (4 weeks)'}
                    </span>
                </div>
                <span className="text-[10px] text-muted-foreground">{filteredMeetings.length} meetings</span>
            </div>
            {/* Two-level strategic tabs */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                {[
                    { key: 'all' as const, label: 'All', count: meetings.length, icon: Calendar },
                    { key: 'personal' as const, label: 'My Strategic', count: personalCount, icon: User },
                    { key: 'team' as const, label: 'Team Strategic', count: teamCount, icon: UsersRound },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setStrategicTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors ${strategicTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        <tab.icon size={11} />
                        {tab.label}
                        <span className="text-[9px] text-muted-foreground">({tab.count})</span>
                    </button>
                ))}
            </div>
            {noMeetingsToday && (
                <div className="text-xs text-muted-foreground">No meetings today — here&apos;s your strategic view ahead.</div>
            )}
            {GROUP_ORDER.map(groupKey => {
                const groupMeetings = groups[groupKey];
                if (!groupMeetings || groupMeetings.length === 0) return null;

                // "Review These" group defaults to collapsed — show dismissible count line instead of anxiety badge
                if (groupKey === 'recurring_audit' && !expandedGroups[groupKey]) {
                    return (
                        <div key={groupKey} className="text-center py-2">
                            <button
                                onClick={() => toggleGroup(groupKey)}
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {groupMeetings.length} low-priority meeting{groupMeetings.length !== 1 ? 's' : ''} hidden — <span className="text-primary">show</span>
                            </button>
                        </div>
                    );
                }

                const config = GROUP_CONFIG[groupKey];
                const GroupIcon = config.Icon;
                const isExpanded = expandedGroups[groupKey];
                const displayCount = 3;
                const visibleMeetings = isExpanded ? groupMeetings : groupMeetings.slice(0, displayCount);
                const hasMore = groupMeetings.length > displayCount;

                return (
                    <div key={groupKey} className="rounded-xl border border-border bg-card overflow-hidden">
                        {/* Group Header */}
                        <div className={`flex items-center gap-2 px-4 py-2.5 border-l-2 ${config.borderClass}`}>
                            <GroupIcon size={14} className={groupKey === 'must_win' ? 'text-red-400' : groupKey === 'stakeholder' ? 'text-amber-500' : groupKey === 'growth' ? 'text-emerald-500' : groupKey === 'recurring_audit' ? 'text-red-400' : 'text-muted-foreground'} />
                            <span className="text-xs font-medium">{config.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${config.badgeClass}`}>{groupMeetings.length}</span>
                        </div>
                        {/* Meeting Cards */}
                        <div className="divide-y divide-border">
                            {visibleMeetings.map(m => {
                                const externalAttendee = m.classification.attendeeInsights?.find(a => a.isExternal);
                                const isEditing = editingId === m.id;
                                const isOverridden = !!m.userImportanceOverride;
                                const importanceBadge = m.classification.importance === 'critical'
                                    ? 'bg-red-500/10 text-red-400'
                                    : m.classification.importance === 'high'
                                    ? 'bg-amber-500/10 text-amber-500'
                                    : m.classification.importance === 'audit'
                                    ? 'bg-red-400/10 text-red-400'
                                    : 'bg-muted text-muted-foreground';

                                return (
                                    <div key={m.id} className="px-4 py-3 hover:bg-muted/50 transition-colors group relative">
                                        <div className="flex items-start justify-between gap-2">
                                            <Link href={`/chat?prep=Help me prepare for ${encodeURIComponent(m.title)}`} className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-medium truncate">{m.title}</span>
                                                    {isOverridden && <span className="text-[8px] text-primary">edited</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
                                                    <span>{formatMeetingDate(m.startTime)}</span>
                                                    <span className="text-border">|</span>
                                                    <span className={`px-1.5 py-0.5 rounded ${importanceBadge}`}>
                                                        {m.classification.importance === 'critical' ? 'Must Win' : m.classification.importance === 'high' ? 'High' : m.classification.importance === 'audit' ? 'Review' : 'Normal'}
                                                    </span>
                                                    {m.strategicLevel && (
                                                        <span className={`px-1.5 py-0.5 rounded ${m.strategicLevel === 'personal' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-teal-500/10 text-teal-400'}`}>
                                                            {m.strategicLevel === 'personal' ? 'My' : `Team${m.strategicOwner ? `: ${m.strategicOwner}` : ''}`}
                                                        </span>
                                                    )}
                                                    {m.attendeeCount > 0 && (
                                                        <span className="flex items-center gap-0.5"><Users size={9} />{m.attendeeCount}</span>
                                                    )}
                                                    {externalAttendee && (
                                                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">{externalAttendee.company}</span>
                                                    )}
                                                    {!m.desiredOutcome && (
                                                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">No goal</span>
                                                    )}
                                                </div>
                                                {/* People gist — one-liner room dynamics */}
                                                {(() => {
                                                    const gist = synthesizeMeetingGist(m, peopleIntel);
                                                    return gist ? (
                                                        <div className="mt-1.5 text-[11px] leading-relaxed text-foreground/60 italic">
                                                            {gist}
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </Link>
                                            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                                                <button onClick={(e) => { e.preventDefault(); setEditingId(isEditing ? null : m.id); setTeamOwnerInput(m.strategicOwner || ''); }}
                                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-all"
                                                    title="Edit classification">
                                                    <Edit2 size={12} />
                                                </button>
                                                <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100" />
                                            </div>
                                        </div>
                                        {/* Inline edit panel */}
                                        {isEditing && onUpdateMeeting && (
                                            <div className="mt-2 p-2.5 bg-muted/50 rounded-lg border border-border space-y-2" onClick={e => e.stopPropagation()}>
                                                {/* Importance override */}
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Importance</div>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {importanceOptions.map(opt => (
                                                            <button key={opt.value}
                                                                onClick={() => onUpdateMeeting(m.id, { userImportanceOverride: m.userImportanceOverride === opt.value ? null : opt.value })}
                                                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${(m.userImportanceOverride || m.classification.importance) === opt.value ? opt.color + ' ring-1 ring-primary/30' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Strategic level */}
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Strategic For</div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => onUpdateMeeting(m.id, { strategicLevel: m.strategicLevel === 'personal' ? null : 'personal' })}
                                                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${m.strategicLevel === 'personal' ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                                            <User size={10} /> Me
                                                        </button>
                                                        <button onClick={() => onUpdateMeeting(m.id, { strategicLevel: m.strategicLevel === 'team' ? null : 'team' })}
                                                            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${m.strategicLevel === 'team' ? 'bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/30' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                                            <UsersRound size={10} /> Team
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Team member name (when team) */}
                                                {m.strategicLevel === 'team' && (
                                                    <div>
                                                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Team Member</div>
                                                        <div className="flex gap-1">
                                                            <input type="text" value={teamOwnerInput} onChange={e => setTeamOwnerInput(e.target.value)}
                                                                placeholder="e.g. Sarah Chen" className="flex-1 text-xs bg-input border border-border rounded px-2 py-1"
                                                                onKeyDown={e => { if (e.key === 'Enter') { onUpdateMeeting(m.id, { strategicOwner: teamOwnerInput.trim() || null }); } }} />
                                                            <button onClick={() => onUpdateMeeting(m.id, { strategicOwner: teamOwnerInput.trim() || null })}
                                                                className="px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90">Save</button>
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Meeting category */}
                                                <div>
                                                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Category</div>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {[
                                                            { value: 'NEEDLE_MOVER', label: 'Needle Mover', color: 'text-emerald-500 bg-emerald-500/10' },
                                                            { value: 'TACTICAL', label: 'Tactical', color: 'text-blue-400 bg-blue-500/10' },
                                                            { value: 'OPERATIONAL', label: 'Operational', color: 'text-gray-400 bg-gray-500/10' },
                                                            { value: 'GROWTH', label: 'Growth', color: 'text-purple-400 bg-purple-500/10' },
                                                        ].map(opt => (
                                                            <button key={opt.value}
                                                                onClick={() => onUpdateMeeting(m.id, { meetingCategory: m.meetingCategory === opt.value ? null : opt.value })}
                                                                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${m.meetingCategory === opt.value ? opt.color + ' ring-1 ring-primary/30' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Learning acknowledgment — inline, connected to action */}
                                                {learningAck?.meetingId === m.id && (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-medium animate-in fade-in duration-200">
                                                        <Lightbulb size={11} />
                                                        {learningAck.message}
                                                    </div>
                                                )}
                                                {/* Clear all overrides */}
                                                {(m.userImportanceOverride || m.strategicLevel) && (
                                                    <button onClick={() => { onUpdateMeeting(m.id, { userImportanceOverride: null, strategicLevel: null, strategicOwner: null, meetingCategory: null }); setEditingId(null); }}
                                                        className="text-[9px] text-red-400 hover:text-red-300 mt-1">
                                                        Reset to Mira&apos;s classification
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* Show More */}
                        {hasMore && (
                            <button
                                onClick={() => toggleGroup(groupKey)}
                                className="w-full px-4 py-2 text-[10px] text-primary hover:bg-muted/50 transition-colors flex items-center justify-center gap-1 border-t border-border"
                            >
                                {isExpanded ? 'Show less' : `Show ${groupMeetings.length - displayCount} more`}
                                <ChevronRight size={10} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ===============================================================
// NETWORK NUDGE — progressive, persistent, never coercive
// ===============================================================

const NETWORK_MILESTONES = [
    { min: 0, max: 0, key: 'zero' },
    { min: 1, max: 2, key: 'start' },
    { min: 3, max: 4, key: 'growing' },
    { min: 5, max: 7, key: 'building' },
    { min: 8, max: 11, key: 'strong' },
    { min: 12, max: 14, key: 'almost' },
    { min: 15, max: Infinity, key: 'complete' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function NetworkNudge({ count, meetings, tomorrowMeetings }: {
    count: number;
    meetings: Meeting[];
    tomorrowMeetings: TomorrowMeeting[];
}) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    const milestone = NETWORK_MILESTONES.find(m => count >= m.min && count <= m.max) || NETWORK_MILESTONES[NETWORK_MILESTONES.length - 1];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const meetingAttendees = [...meetings, ...tomorrowMeetings as Array<Record<string, any>>]
        .flatMap((m: Record<string, any>) => m.attendees || [])
    /* eslint-enable @typescript-eslint/no-explicit-any */
        .filter(Boolean);
    const hasUnmappedAttendees = meetingAttendees.length > 0;

    const dayOfWeek = new Date().getDay();
    const hour = new Date().getHours();
    const weekOfMonth = Math.ceil(new Date().getDate() / 7);

    let message = '';
    let subtext = '';
    let intensity: 'subtle' | 'normal' | 'encouraging' = 'normal';
    let ctaLabel = 'Add';

    switch (milestone.key) {
        case 'zero':
            message = 'Who are the 3 people you interact with most?';
            subtext = 'Adding just a few names helps Mira prep you better for meetings.';
            intensity = 'normal';
            break;
        case 'start':
            message = hour < 12
                ? `${count} people in your network. Who's missing?`
                : `You've started your network. Who else shapes your week?`;
            subtext = 'Your manager, key peers, and direct reports are a great next step.';
            intensity = 'subtle';
            break;
        case 'growing':
            if (hasUnmappedAttendees) {
                message = 'You have meetings with people not yet in your network';
                subtext = 'Add them so Mira can give you relationship-aware prep.';
            } else {
                message = `${count} people mapped. Any customers or cross-functional partners?`;
                subtext = 'External relationships help Mira understand the full picture.';
            }
            intensity = 'subtle';
            break;
        case 'building':
            if (dayOfWeek % 2 !== 0) return null;
            message = `Nice — ${count} key relationships mapped`;
            subtext = 'A few more and your meeting prep will be significantly sharper.';
            intensity = 'encouraging';
            break;
        case 'strong':
            if (dayOfWeek !== 1) return null;
            message = `${count} people — your network is taking shape`;
            subtext = 'Consider adding anyone who influences your goals or blocks your progress.';
            intensity = 'subtle';
            break;
        case 'almost':
            if (dayOfWeek !== 1 || hour > 12) return null;
            message = `${count} people — almost at full intelligence`;
            subtext = 'A couple more and Mira can map your complete influence landscape.';
            intensity = 'encouraging';
            break;
        case 'complete': {
            if (dayOfWeek !== 1) return null;
            ctaLabel = 'Review';
            intensity = 'subtle';
            const rotation = weekOfMonth % 4;
            if (rotation === 0) {
                message = `${count} people in your network`;
                subtext = 'Anyone new join your world recently? Roles change, teams shift.';
            } else if (rotation === 1) {
                if (hasUnmappedAttendees) {
                    message = 'New faces in your meetings this week';
                    subtext = 'Add them to get relationship-aware prep from Mira.';
                    ctaLabel = 'Add';
                } else {
                    message = `Your network · ${count} people`;
                    subtext = 'Review your influence map — anything outdated?';
                }
            } else if (rotation === 2) {
                message = `Your network · ${count} people`;
                subtext = 'Any stakeholders left your org, changed roles, or need re-categorizing?';
            } else {
                message = `Your network · ${count} people`;
                subtext = 'Missing any customers, partners, or cross-functional allies?';
            }
            break;
        }
    }

    const borderColor = intensity === 'encouraging' ? 'border-emerald-500/20' : intensity === 'normal' ? 'border-primary/20' : 'border-border';
    const bgColor = intensity === 'encouraging' ? 'bg-emerald-500/5' : intensity === 'normal' ? 'bg-primary/5' : 'bg-card';
    const iconColor = intensity === 'encouraging' ? 'text-emerald-500' : intensity === 'normal' ? 'text-primary' : 'text-muted-foreground';

    return (
        <div className={`flex items-center gap-3 rounded-xl border ${borderColor} ${bgColor} px-4 py-2.5 group relative`}>
            <Users size={15} className={`${iconColor} flex-shrink-0`} />
            <Link href="/stakeholders" className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{message}</span>
                <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{subtext}</span>
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
                {count < 15 && (
                    <div className="hidden sm:flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < Math.ceil(count / 3) ? 'bg-primary' : 'bg-muted'}`} />
                        ))}
                    </div>
                )}
                <Link href="/stakeholders" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                    {ctaLabel} <ChevronRight size={10} />
                </Link>
                <button
                    onClick={(e) => { e.preventDefault(); setDismissed(true); }}
                    className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Dismiss for today"
                >
                    <X size={12} />
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MEETINGS TO BOOK — Proactive meeting suggestions
// ═══════════════════════════════════════════════════════════════

interface MeetingSuggestion {
    type: 'relationship_gap' | 'pre_meeting' | 'follow_up' | 'new_connection';
    stakeholderId: string;
    stakeholderName: string;
    stakeholderRole: string | null;
    reason: string;
    urgency: 'urgent' | 'soon' | 'when_convenient';
    suggestedAgenda: string;
    relatedMeetingId?: string;
    relatedMeetingTitle?: string;
}

const SUGGESTION_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    relationship_gap: { label: 'Gap', bg: 'bg-orange-500/10', text: 'text-orange-500' },
    pre_meeting: { label: 'Pre-meet', bg: 'bg-blue-500/10', text: 'text-blue-500' },
    follow_up: { label: 'Follow up', bg: 'bg-purple-500/10', text: 'text-purple-500' },
    new_connection: { label: 'New', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
};

function MeetingSuggestionsCard() {
    const [suggestions, setSuggestions] = useState<MeetingSuggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/ground-game/meeting-suggestions')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.suggestions) setSuggestions(d.suggestions.slice(0, 3)); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading || suggestions.length === 0) return null;

    return (
        <div className="border-l-2 border-amber-500/60 pl-4 py-1 space-y-3">
            <div className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                <Calendar size={14} className="text-amber-400" />
                Meetings to Book
            </div>
            {suggestions.map((s, i) => {
                const typeConfig = SUGGESTION_TYPE_CONFIG[s.type] || SUGGESTION_TYPE_CONFIG.relationship_gap;
                const expanded = expandedIdx === i;
                return (
                    <div key={i} className="space-y-1">
                        <button
                            onClick={() => setExpandedIdx(expanded ? null : i)}
                            className="w-full text-left space-y-1"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium flex-1 truncate">{s.stakeholderName}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.urgency === 'urgent' ? 'bg-red-500/10 text-red-400' : s.urgency === 'soon' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                                    {s.urgency === 'urgent' ? 'Urgent' : s.urgency === 'soon' ? 'Soon' : 'Convenient'}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeConfig.bg} ${typeConfig.text}`}>
                                    {typeConfig.label}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">{s.reason}</p>
                        </button>
                        {expanded && (
                            <div className="ml-0.5 mt-1 p-2 rounded-lg bg-muted/50 space-y-1.5">
                                <p className="text-[11px] text-foreground/70">{s.suggestedAgenda}</p>
                                <Link href={`/stakeholders?highlight=${s.stakeholderId}`} className="text-[10px] text-primary hover:text-primary/80 font-medium">
                                    View profile →
                                </Link>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// HONEST MIRROR — What Mira Knows About You
// ═══════════════════════════════════════════════════════════════

function HonestMirrorCard() {
    const [data, setData] = useState<{
        relationship: {
            score: number;
            callCount: number;
            totalMinutes: number;
            knownAreas: string[];
            gapAreas: string[];
            stakeholderCount: number;
            insightCount: number;
        };
    } | null>(null);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        fetch('/api/voice/personal-context')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.relationship) setData(d); })
            .catch(() => {});
    }, []);

    if (!data) return null;

    const { relationship: r } = data;
    const scoreColor = r.score >= 60 ? 'text-emerald-500' : r.score >= 30 ? 'text-amber-500' : 'text-red-400';

    return (
        <div className="border-l-2 border-purple-500/60 pl-4 py-1 space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 w-full text-left"
            >
                <User size={14} className="text-purple-400" />
                <span className="text-sm font-medium text-foreground/80 flex-1">What Mira Knows</span>
                <span className={`text-xs font-bold ${scoreColor}`}>{r.score}%</span>
                <ChevronRight size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>

            {!expanded && r.gapAreas.length > 0 && (
                <p className="text-[10px] text-muted-foreground ml-5">
                    Still learning: {r.gapAreas.slice(0, 3).join(', ')}
                </p>
            )}

            {expanded && (
                <div className="ml-5 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                            <div className="text-lg font-bold">{r.stakeholderCount}</div>
                            <div className="text-[10px] text-muted-foreground">People mapped</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold">{r.insightCount}</div>
                            <div className="text-[10px] text-muted-foreground">Insights</div>
                        </div>
                        <div>
                            <div className="text-lg font-bold">{r.callCount}</div>
                            <div className="text-[10px] text-muted-foreground">Voice calls</div>
                        </div>
                    </div>

                    {r.knownAreas.length > 0 && (
                        <div>
                            <div className="text-[10px] font-medium text-emerald-500 mb-1">Mira understands</div>
                            <div className="flex flex-wrap gap-1">
                                {r.knownAreas.map((a, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{a}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {r.gapAreas.length > 0 && (
                        <div>
                            <div className="text-[10px] font-medium text-amber-500 mb-1">Still learning</div>
                            <div className="flex flex-wrap gap-1">
                                {r.gapAreas.map((a, i) => (
                                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{a}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <Link
                        href="/chat?prep=Tell me more about my work context"
                        className="text-[10px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                    >
                        Help Mira learn more <ArrowRight size={8} />
                    </Link>
                </div>
            )}
        </div>
    );
}

// ===============================================================
// SYNC STATUS CARD — prominent display of what Mira has access to
// ===============================================================

function SyncStatusCard() {
    const [data, setData] = useState<{
        connectors: Array<{ provider: string; status: string; lastSyncAgo: string; syncStatus: string }>;
        overall: string;
        totalMeetings?: number;
        totalEmails?: number;
        totalDocs?: number;
        totalStakeholders?: number;
    } | null>(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/sync/health').then(r => r.ok ? r.json() : null),
            fetch('/api/context/stats').then(r => r.ok ? r.json() : null),
        ]).then(([health, stats]) => {
            setData({
                connectors: health?.connectors || [],
                overall: health?.overall || 'unknown',
                totalMeetings: stats?.meetings || 0,
                totalEmails: stats?.emails || 0,
                totalDocs: stats?.documents || 0,
                totalStakeholders: stats?.stakeholders || 0,
            });
        }).catch(() => {});
    }, []);

    if (!data || data.connectors.length === 0) return null;

    const isHealthy = data.overall === 'healthy';
    const providerIcons: Record<string, string> = { gcal: '📅', gmail: '✉️', gdrive: '📁' };
    const providerLabels: Record<string, string> = { gcal: 'Calendar', gmail: 'Email', gdrive: 'Drive' };

    return (
        <div className={`rounded-xl border ${isHealthy ? 'border-border' : 'border-amber-500/30'} bg-card p-4`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">Mira&apos;s Knowledge</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isHealthy ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {isHealthy ? 'Up to date' : 'Sync needed'}
                </span>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-3">
                {[
                    { label: 'Meetings', count: data.totalMeetings },
                    { label: 'Emails', count: data.totalEmails },
                    { label: 'Documents', count: data.totalDocs },
                    { label: 'People', count: data.totalStakeholders },
                ].map(item => (
                    <div key={item.label} className="text-center">
                        <div className="text-lg font-semibold text-foreground">{item.count?.toLocaleString() || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{item.label}</div>
                    </div>
                ))}
            </div>

            <div className="flex gap-3">
                {data.connectors.map(c => {
                    const isOk = c.syncStatus === 'idle' || c.syncStatus === 'syncing';
                    return (
                        <div key={c.provider} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{providerIcons[c.provider] || '🔗'}</span>
                            <span>{providerLabels[c.provider] || c.provider}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-red-400'} ${c.syncStatus === 'syncing' ? 'animate-pulse' : ''}`} />
                            <span className="text-[10px]">{c.lastSyncAgo}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

