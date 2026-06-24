import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
    try { return await promise; } catch (e) { console.error('[today] query failed:', e); return fallback; }
}

// ── MEETING CLASSIFICATION ──

interface AttendeeInsight {
    email: string;
    name: string;
    company: string;
    isExternal: boolean;
    isKeyStakeholder: boolean;
    relationshipType: string | null;
}

interface MeetingClassification {
    importance: 'critical' | 'high' | 'medium' | 'low' | 'audit';
    reasons: string[];
    group: 'must_win' | 'stakeholder' | 'growth' | 'operational' | 'recurring_audit';
    prepNeeded: boolean;
    attendeeInsights: AttendeeInsight[];
}

function parseNameFromEmail(email: string): string {
    const local = email.split('@')[0];
    return local
        .split(/[._-]/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
}

function getDomainFromEmail(email: string): string {
    const parts = email.split('@');
    return parts.length > 1 ? parts[1].toLowerCase() : '';
}

function getCompanyFromDomain(domain: string): string {
    // Strip common suffixes
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function classifyMeeting(
    meeting: {
        id: string; title: string; startTime: Date; endTime: Date;
        meetingCategory: string | null; isPresentation: boolean; meetingType: string | null;
        participants: string[]; desiredOutcome: string | null; description: string | null;
        outcomeResult: string | null; recurringId: string | null; isRecurring: boolean;
    },
    userDomain: string,
    stakeholderMap: Map<string, { powerLevel: string; name: string; email: string; relationshipType: string | null }>,
    recurringOutcomeMap: Map<string, boolean>
): MeetingClassification {
    let score = 0;
    const reasons: string[] = [];
    const titleLower = meeting.title.toLowerCase();

    // Title-based scoring
    const highValueKeywords = ['board', 'exec', 'review', 'planning', 'strategy', 'quarterly', 'leadership', 'skip-level'];
    if (highValueKeywords.some(kw => titleLower.includes(kw))) {
        score += 30;
        reasons.push('High-stakes meeting');
    }

    // Presentation scoring
    if (meeting.isPresentation) {
        score += 25;
        reasons.push('You are presenting');
    }

    // Attendee analysis
    const participants = meeting.participants || [];
    const attendeeInsights: AttendeeInsight[] = participants.map(email => {
        const domain = getDomainFromEmail(email);
        const isExternal = !!userDomain && domain !== userDomain && domain !== '';
        const stakeholder = stakeholderMap.get(email.toLowerCase());
        return {
            email,
            name: stakeholder?.name || parseNameFromEmail(email),
            company: getCompanyFromDomain(domain),
            isExternal,
            isKeyStakeholder: !!stakeholder && (stakeholder.powerLevel === 'HIGH' || stakeholder.powerLevel === 'CRITICAL'),
            relationshipType: stakeholder?.relationshipType || null,
        };
    });

    // Key stakeholder scoring — weight by relationship type
    // Vendors/suppliers are less strategically important than customers, execs, direct stakeholders
    const VENDOR_TYPES = ['vendor', 'supplier', 'contractor', 'agency'];
    const HIGH_VALUE_TYPES = ['customer', 'buyer', 'investor', 'board_member', 'executive'];

    // Also check if all external attendees share a single non-user domain — likely a vendor/partner org
    const externalDomains = new Set(
        attendeeInsights.filter(a => a.isExternal).map(a => getDomainFromEmail(a.email)).filter(Boolean)
    );
    const isSingleExternalOrg = externalDomains.size === 1;

    const keyStakeholders = attendeeInsights.filter(a => a.isKeyStakeholder);
    const nonVendorKeyStakeholders = keyStakeholders.filter(
        a => !a.relationshipType || !VENDOR_TYPES.includes(a.relationshipType)
    );

    if (nonVendorKeyStakeholders.length > 0) {
        score += 25;
        const keyNames = nonVendorKeyStakeholders.map(a => a.name).slice(0, 2);
        reasons.push(`Key stakeholder: ${keyNames.join(', ')}`);
    } else if (keyStakeholders.length > 0) {
        // Vendor stakeholders get reduced score
        score += 8;
    }
    const hasKeyStakeholder = nonVendorKeyStakeholders.length > 0;

    // External attendees scoring — differentiate by type
    const externalAttendees = attendeeInsights.filter(a => a.isExternal);
    const isVendorMeeting = externalAttendees.length > 0 &&
        externalAttendees.every(a => a.relationshipType && VENDOR_TYPES.includes(a.relationshipType));
    const hasHighValueExternal = externalAttendees.some(
        a => a.relationshipType && HIGH_VALUE_TYPES.includes(a.relationshipType)
    );

    if (hasHighValueExternal) {
        score += 20;
        const companies = [...new Set(externalAttendees.filter(a => a.relationshipType && HIGH_VALUE_TYPES.includes(a.relationshipType)).map(a => a.company))].slice(0, 2);
        reasons.push(`Customer/investor: ${companies.join(', ')}`);
    } else if (externalAttendees.length > 0 && !isVendorMeeting) {
        score += 15;
        const companies = [...new Set(externalAttendees.map(a => a.company))].slice(0, 2);
        reasons.push(`External: ${companies.join(', ')}`);
    } else if (isVendorMeeting) {
        // Vendor-only meetings get minimal external boost
        score += 3;
    }

    // Category scoring
    if (meeting.meetingCategory === 'NEEDLE_MOVER') {
        score += 20;
        reasons.push('Needle mover');
    }

    // Buyer/customer inference from title — only boost if not a vendor-context meeting
    const buyerKeywords = ['customer', 'client', 'sales', 'deal', 'pitch', 'proposal', 'contract'];
    const ambiguousKeywords = ['demo', 'review', 'release']; // Context-dependent: vendor demo ≠ customer demo
    const hasBuyerKeyword = buyerKeywords.some(kw => titleLower.includes(kw));
    const hasAmbiguousKeyword = ambiguousKeywords.some(kw => titleLower.includes(kw));

    if (hasBuyerKeyword && !isVendorMeeting) {
        score += 20;
        reasons.push('Customer/sales related');
    } else if (hasAmbiguousKeyword && hasHighValueExternal) {
        score += 15;
        reasons.push('Customer engagement');
    } else if (hasAmbiguousKeyword && isVendorMeeting) {
        // Vendor demo/review — no bonus, it's operational
    }

    // Has desired outcome
    if (meeting.desiredOutcome) {
        score += 5;
    } else {
        reasons.push('No goal set');
    }

    // Recurring with no outcomes penalty
    const isRecurringNoOutcome = meeting.isRecurring && meeting.recurringId &&
        recurringOutcomeMap.has(meeting.recurringId) && !recurringOutcomeMap.get(meeting.recurringId);
    if (isRecurringNoOutcome) {
        score -= 20;
        reasons.push('Recurring with no tracked outcomes');
    }

    // Large meeting penalty
    if (participants.length > 8) {
        score -= 10;
        reasons.push(`Large meeting (${participants.length} attendees)`);
    }

    // Determine importance
    let importance: MeetingClassification['importance'];
    if (score >= 60) importance = 'critical';
    else if (score >= 40) importance = 'high';
    else if (score >= 20) importance = 'medium';
    else if (isRecurringNoOutcome) importance = 'audit';
    else importance = 'low';

    // Determine group
    let group: MeetingClassification['group'];
    if (score >= 50) {
        group = 'must_win';
    } else if (score >= 30 && hasKeyStakeholder) {
        group = 'stakeholder';
    } else if (meeting.meetingCategory === 'GROWTH') {
        group = 'growth';
    } else if (score < 10 || isRecurringNoOutcome) {
        group = 'recurring_audit';
    } else {
        group = 'operational';
    }

    // Prep needed if high importance or no goal on important meeting
    const prepNeeded = importance === 'critical' || importance === 'high' ||
        (importance === 'medium' && !meeting.desiredOutcome) ||
        meeting.isPresentation || hasKeyStakeholder;

    return {
        importance,
        reasons: reasons.filter(Boolean),
        group,
        prepNeeded,
        attendeeInsights,
    };
}

export async function GET(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const tzOffset = parseInt(searchParams.get('tz') || '0', 10);
        const now = new Date();

        const userNow = new Date(now.getTime() - tzOffset * 60 * 1000);
        const startOfDay = new Date(userNow);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(userNow);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const startOfDayUTC = new Date(startOfDay.getTime() + tzOffset * 60 * 1000);
        const endOfDayUTC = new Date(endOfDay.getTime() + tzOffset * 60 * 1000);
        const endOfWeekUTC = new Date(endOfDayUTC.getTime() + 6 * 24 * 60 * 60 * 1000);
        const fourWeeksFromNow = new Date(endOfDayUTC.getTime() + 28 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // ── CORE QUERIES ──
        const [user, kpis, meetings, weekMeetings] = await Promise.all([
            safe(prisma.user.findUnique({
                where: { id: userId },
                select: { name: true, onboardingComplete: true, jobTitle: true, company: true, email: true }
            }), null),
            safe(prisma.userKPI.findMany({
                where: { userId },
                orderBy: { priority: 'asc' },
                take: 6
            }), []),
            safe(prisma.meetingSyncRecord.findMany({
                where: { userId, startTime: { gte: startOfDayUTC, lte: endOfDayUTC } },
                orderBy: { startTime: 'asc' },
                take: 20
            }), []),
            safe(prisma.meetingSyncRecord.findMany({
                where: { userId, startTime: { gt: endOfDayUTC, lte: endOfWeekUTC }, status: { not: 'cancelled' } },
                orderBy: { startTime: 'asc' },
                select: {
                    id: true, title: true, startTime: true, endTime: true,
                    meetingCategory: true, isPresentation: true, meetingType: true,
                    participants: true, desiredOutcome: true
                }
            }), [])
        ]);

        // ── UPCOMING 4 WEEKS QUERY ──
        const upcomingMeetings = await safe(prisma.meetingSyncRecord.findMany({
            where: { userId, startTime: { gt: endOfDayUTC, lte: fourWeeksFromNow }, status: { not: 'cancelled' } },
            orderBy: { startTime: 'asc' },
            select: {
                id: true, title: true, startTime: true, endTime: true,
                meetingCategory: true, isPresentation: true, meetingType: true,
                participants: true, desiredOutcome: true, description: true,
                outcomeResult: true, recurringId: true, isRecurring: true,
                userImportanceOverride: true, strategicLevel: true, strategicOwner: true,
            },
            take: 100
        }), []);

        // ── SECONDARY QUERIES ──
        const [
            commitmentsDueToday, commitmentsDueSoon, recentSnapshots,
            allCommitmentsThisWeek, meetingCommitmentsMap,
            stakeholders, recentOutcomes, domainContext, recentInsights,
            recurringOutcomes
        ] = await Promise.all([
            safe(prisma.meetingCommitment.findMany({
                where: { userId, status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lte: endOfDayUTC } },
                include: { meeting: { select: { title: true, startTime: true } } },
                orderBy: { dueDate: 'asc' },
                take: 10
            }), []),
            safe(prisma.meetingCommitment.findMany({
                where: { userId, status: 'PENDING', dueDate: { gt: endOfDayUTC, lte: new Date(endOfDayUTC.getTime() + 5 * 86400000) } },
                include: { meeting: { select: { title: true } } },
                orderBy: { dueDate: 'asc' },
                take: 8
            }), []),
            safe(prisma.meetingPatternSnapshot.findMany({
                where: { userId },
                orderBy: { weekStart: 'desc' },
                take: 5
            }), []),
            safe(prisma.meetingCommitment.findMany({
                where: { userId, createdAt: { gte: sevenDaysAgo } }
            }), []),
            safe((async () => {
                const meetingIds = meetings.map(m => m.id);
                if (meetingIds.length === 0) return new Map<string, any[]>();
                const comms = await prisma.meetingCommitment.findMany({
                    where: { meetingId: { in: meetingIds }, status: { in: ['PENDING', 'OVERDUE'] } }
                });
                const map = new Map<string, any[]>();
                for (const c of comms) {
                    const arr = map.get(c.meetingId) || [];
                    arr.push({ id: c.id, description: c.description, owner: c.owner, dueDate: c.dueDate, status: c.status });
                    map.set(c.meetingId, arr);
                }
                return map;
            })(), new Map()),
            safe(prisma.stakeholderProfile.findMany({
                where: { userId, mergedIntoId: null },
                orderBy: { relationshipStrength: 'asc' },
                take: 20,
                select: {
                    id: true, name: true, email: true, role: true,
                    relationshipStrength: true, powerLevel: true,
                    lastInteractionDate: true, influenceRole: true,
                    relationshipType: true
                }
            }), []),
            // Recent meeting outcomes (last 7 days with results)
            safe(prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    startTime: { gte: sevenDaysAgo },
                    outcomeResult: { not: null }
                },
                orderBy: { startTime: 'desc' },
                take: 8,
                select: {
                    id: true, title: true, startTime: true,
                    desiredOutcome: true, outcomeResult: true, meetingCategory: true
                }
            }), []),
            // Domain context
            safe(prisma.domainContext.findUnique({
                where: { userId },
                select: { organization: true, landscape: true }
            }), null),
            // Recent AI insights from conversations
            safe(prisma.conversationInsight.findMany({
                where: { userId, senderType: 'ASSISTANT', confidence: { gte: 0.7 } },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { insight: true, contextType: true, conversationDate: true }
            }), []),
            // Recurring meeting outcomes in past 3 weeks (for audit detection)
            safe(prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    isRecurring: true,
                    recurringId: { not: null },
                    startTime: { gte: threeWeeksAgo, lte: now },
                },
                select: { recurringId: true, outcomeResult: true },
            }), [])
        ]);

        // ── ONBOARDING PROGRESS ──
        const onboardingProgress = await safe(prisma.onboardingProgress.findUnique({
            where: { userId },
            select: {
                coveredStory: true, coveredDrivesAndValues: true, coveredLife: true,
                coveredRole: true, coveredStakeholders: true, coveredLeadershipStyle: true,
                coveredGoals: true, coveredChallenges: true, coveredGrowth: true,
                onboardingComplete: true, totalOnboardingCalls: true,
            }
        }), null);

        // ── STREAK ──
        let streak = 0;
        try {
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
            const recentActive = await prisma.meetingSyncRecord.findMany({
                where: { userId, startTime: { gte: thirtyDaysAgo }, OR: [{ outcomeResult: { not: null } }, { desiredOutcome: { not: null } }] },
                select: { startTime: true },
                orderBy: { startTime: 'desc' }
            });
            const activeDays = new Set(recentActive.map(m =>
                new Date(m.startTime.getTime() - tzOffset * 60 * 1000).toISOString().split('T')[0]
            ));
            const checkDate = new Date(userNow);
            for (let i = 0; i < 30; i++) {
                const dateStr = checkDate.toISOString().split('T')[0];
                if (activeDays.has(dateStr)) streak++;
                else if (i > 0) break;
                checkDate.setDate(checkDate.getDate() - 1);
            }
        } catch (e) { console.error('[today] streak calculation failed:', e); }

        // ── COMPUTED STATS ──
        const latestSnapshot = recentSnapshots[0];
        const previousSnapshot = recentSnapshots[1];
        const outcomeHitRate = latestSnapshot?.outcomesSet > 0
            ? Math.round((latestSnapshot.outcomesLanded / latestSnapshot.outcomesSet) * 100) : null;
        const previousHitRate = previousSnapshot?.outcomesSet > 0
            ? Math.round((previousSnapshot.outcomesLanded / previousSnapshot.outcomesSet) * 100) : null;
        const commitmentsFulfilled = allCommitmentsThisWeek.filter((c: any) => c.status === 'FULFILLED').length;
        const commitmentsMade = allCommitmentsThisWeek.length;

        // Post-meeting review — 24h window so yesterday's meetings still show until reviewed
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000);
        const needsReview = meetings.filter(m =>
            new Date(m.endTime) < now && new Date(m.endTime) > twentyFourHoursAgo &&
            !m.outcomeResult && m.status !== 'cancelled'
        );

        // ── ENRICHED MEETINGS ──
        const enrichedMeetings = meetings.map(m => {
            let riskLevel = 'low';
            if (m.title.toLowerCase().includes('board') || m.title.toLowerCase().includes('exec')) riskLevel = 'high';
            else if (m.meetingType === '1:1' || m.meetingType === 'external') riskLevel = 'medium';

            const connectedKpis = kpis
                .filter((k: any) => {
                    const kw = (k.name + ' ' + (k.description || '')).toLowerCase().split(/\s+/);
                    const mw = (m.title + ' ' + (m.description || '')).toLowerCase().split(/\s+/);
                    return kw.some((w: string) => w.length > 3 && mw.includes(w));
                })
                .map((k: any) => ({ id: k.id, name: k.name, status: k.status }));

            return {
                id: m.id, title: m.title || 'Untitled Meeting',
                startTime: m.startTime, endTime: m.endTime,
                riskLevel, meetingType: m.meetingType,
                meetingCategory: m.meetingCategory, isPresentation: m.isPresentation,
                attendees: m.participants || [],
                desiredOutcome: m.desiredOutcome, outcomeResult: m.outcomeResult,
                openCommitments: meetingCommitmentsMap.get(m.id) || [],
                connectedKpis
            };
        });

        // ── CLASSIFY UPCOMING MEETINGS ──
        // Build stakeholder lookup map
        const stakeholderMap = new Map<string, { powerLevel: string; name: string; email: string; relationshipType: string | null }>();
        for (const s of stakeholders) {
            if (s.email) {
                stakeholderMap.set(s.email.toLowerCase(), {
                    powerLevel: s.powerLevel,
                    name: s.name,
                    email: s.email,
                    relationshipType: (s as any).relationshipType || null,
                });
            }
        }

        // Build recurring outcome map: recurringId -> hasOutcome
        const recurringOutcomeMap = new Map<string, boolean>();
        for (const ro of recurringOutcomes) {
            if (ro.recurringId) {
                const current = recurringOutcomeMap.get(ro.recurringId) || false;
                recurringOutcomeMap.set(ro.recurringId, current || !!ro.outcomeResult);
            }
        }

        // Determine user's email domain
        let userDomain = '';
        if (user?.email) {
            userDomain = getDomainFromEmail(user.email);
        } else {
            // Fallback: find the most common domain among all participants
            const domainCounts: Record<string, number> = {};
            for (const m of upcomingMeetings) {
                for (const p of (m.participants || [])) {
                    const d = getDomainFromEmail(p);
                    if (d) domainCounts[d] = (domainCounts[d] || 0) + 1;
                }
            }
            const sorted = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) userDomain = sorted[0][0];
        }

        // Classify all upcoming meetings
        const classifiedMeetings = upcomingMeetings.map(m => {
            const classification = classifyMeeting(
                {
                    ...m,
                    participants: m.participants || [],
                },
                userDomain,
                stakeholderMap,
                recurringOutcomeMap,
            );

            // Apply user overrides
            if (m.userImportanceOverride) {
                classification.importance = m.userImportanceOverride as MeetingClassification['importance'];
                // Re-derive group from overridden importance
                if (m.userImportanceOverride === 'critical') classification.group = 'must_win';
                else if (m.userImportanceOverride === 'high') classification.group = 'stakeholder';
                else if (m.userImportanceOverride === 'medium') classification.group = 'operational';
                else classification.group = 'operational';
            }

            return {
                id: m.id,
                title: m.title,
                startTime: m.startTime,
                endTime: m.endTime,
                meetingCategory: m.meetingCategory,
                isPresentation: m.isPresentation,
                meetingType: m.meetingType,
                desiredOutcome: m.desiredOutcome,
                attendeeCount: (m.participants || []).length,
                classification,
                userImportanceOverride: m.userImportanceOverride,
                strategicLevel: m.strategicLevel,
                strategicOwner: m.strategicOwner,
            };
        });

        // Group by classification.group and sort within each group by startTime
        const groupOrder: Record<string, number> = {
            must_win: 0, stakeholder: 1, growth: 2, operational: 3, recurring_audit: 4,
        };
        classifiedMeetings.sort((a, b) => {
            const ga = groupOrder[a.classification.group] ?? 99;
            const gb = groupOrder[b.classification.group] ?? 99;
            if (ga !== gb) return ga - gb;
            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });

        // ── STRATEGIC DATA ──
        const patternInsights: string[] = [];
        const categoryBreakdown: Record<string, number> = {};
        const stakeholderGaps: any[] = [];
        const recurringWithNoValue: any[] = [];

        if (latestSnapshot) {
            try { const ins = latestSnapshot.insights as any; if (Array.isArray(ins)) patternInsights.push(...ins.slice(0, 3).map((i: any) => typeof i === 'string' ? i : i.text || i.insight || '')); } catch (e) { console.error('[today] patternInsights parse failed:', e); }
            try { const bd = latestSnapshot.categoryBreakdown as any; if (bd && typeof bd === 'object') Object.assign(categoryBreakdown, bd); } catch (e) { console.error('[today] categoryBreakdown parse failed:', e); }
            try { const g = latestSnapshot.stakeholderGaps as any; if (Array.isArray(g)) stakeholderGaps.push(...g.slice(0, 5)); } catch (e) { console.error('[today] stakeholderGaps parse failed:', e); }
            try { const r = latestSnapshot.recurringWithNoValue as any; if (Array.isArray(r)) recurringWithNoValue.push(...r.slice(0, 3)); } catch (e) { console.error('[today] recurringWithNoValue parse failed:', e); }
        }

        const VENDOR_RELATION_TYPES = ['vendor', 'supplier', 'contractor', 'agency'];
        const stakeholderHealth = stakeholders
            .filter((s: any) => {
                const isHighPower = s.powerLevel === 'HIGH' || s.powerLevel === 'CRITICAL';
                const isVendor = s.relationshipType && VENDOR_RELATION_TYPES.includes(s.relationshipType);
                return isHighPower && !isVendor;
            })
            .map((s: any) => {
                const isStale = !s.lastInteractionDate || new Date(s.lastInteractionDate) < twoWeeksAgo;
                return {
                    id: s.id, name: s.name, role: s.role,
                    relationshipStrength: s.relationshipStrength, powerLevel: s.powerLevel,
                    lastInteraction: s.lastInteractionDate,
                    needsAttention: isStale || s.relationshipStrength < 0.4,
                    influenceRole: s.influenceRole
                };
            })
            .sort((a: any, b: any) => (a.needsAttention === b.needsAttention ? a.relationshipStrength - b.relationshipStrength : a.needsAttention ? -1 : 1))
            .slice(0, 6);

        // Also include ALL stakeholders for the full radar (not just high-power)
        const allStakeholdersSummary = stakeholders.map((s: any) => ({
            id: s.id, name: s.name, role: s.role,
            relationshipStrength: s.relationshipStrength, powerLevel: s.powerLevel,
            lastInteraction: s.lastInteractionDate, influenceRole: s.influenceRole
        }));

        const upcomingWithoutGoals = enrichedMeetings.filter(m =>
            new Date(m.startTime) > now && !m.desiredOutcome && m.meetingCategory !== 'OPERATIONAL'
        );

        const totalMeetingHoursThisWeek = latestSnapshot?.totalMeetingHours || 0;
        const totalCategorized = Object.values(categoryBreakdown).reduce((s, v) => s + v, 0);

        // User stage
        const hasCalendar = meetings.length > 0 || weekMeetings.length > 0;
        const hasMultipleWeeks = recentSnapshots.length >= 2;
        let userStage: 'new' | 'building' | 'active' = 'new';
        if (hasMultipleWeeks) userStage = 'active';
        else if (hasCalendar || (latestSnapshot && latestSnapshot.outcomesSet > 0)) userStage = 'building';

        // ── TOMORROW'S MEETINGS (for "no meetings today" case) ──
        const tomorrowStart = new Date(endOfDayUTC.getTime() + 1);
        const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000 - 1);
        const tomorrowMeetings = weekMeetings.filter(m => {
            const t = new Date(m.startTime).getTime();
            return t >= tomorrowStart.getTime() && t <= tomorrowEnd.getTime();
        });

        // ── PEOPLE INTEL: Top stakeholders in today's/tomorrow's meetings ──
        const peopleIntel = await (async () => {
            try {
                // Collect attendee emails and names from today's + tomorrow's meetings
                const relevantMeetings = [
                    ...meetings.map(m => ({ title: m.title, participants: m.participants || [] })),
                    ...tomorrowMeetings.map(m => ({ title: m.title, participants: (m.participants as string[]) || [] })),
                ];
                if (relevantMeetings.length === 0) return [];

                const attendeeEmails = new Set<string>();
                const attendeeNames = new Set<string>();
                const emailToMeeting = new Map<string, string>();
                const nameToMeeting = new Map<string, string>();

                for (const m of relevantMeetings) {
                    for (const p of m.participants) {
                        const emailLower = p.toLowerCase();
                        attendeeEmails.add(emailLower);
                        if (!emailToMeeting.has(emailLower)) emailToMeeting.set(emailLower, m.title || 'Meeting');
                        const parsedName = parseNameFromEmail(p).toLowerCase();
                        attendeeNames.add(parsedName);
                        if (!nameToMeeting.has(parsedName)) nameToMeeting.set(parsedName, m.title || 'Meeting');
                    }
                }

                // Remove user's own email
                if (user?.email) attendeeEmails.delete(user.email.toLowerCase());

                const emailArray = Array.from(attendeeEmails);
                const nameArray = Array.from(attendeeNames);

                if (emailArray.length === 0 && nameArray.length === 0) return [];

                const profiles = await prisma.stakeholderProfile.findMany({
                    where: {
                        userId,
                        mergedIntoId: null,
                        OR: [
                            ...(emailArray.length > 0 ? [{ email: { in: emailArray, mode: 'insensitive' as const } }] : []),
                            ...(nameArray.length > 0 ? [{ name: { in: nameArray, mode: 'insensitive' as const } }] : []),
                        ],
                    },
                    orderBy: [
                        { powerLevel: 'desc' },
                        { relationshipStrength: 'desc' },
                    ],
                    take: 12, // Fetch more, then sort/filter below
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        personaArchetype: true,
                        communicationStyle: true,
                        decisionStyle: true,
                        riskTolerance: true,
                        primaryMotivation: true,
                        fears: true,
                        archetype: true,
                        politicalStance: true,
                        communicationTone: true,
                        relationshipStrength: true,
                        powerLevel: true,
                        influenceRole: true,
                        relationshipType: true,
                        organization: true,
                        intelligence: {
                            select: {
                                profileSummary: true,
                                successPatterns: true,
                                objectionPatterns: true,
                                failurePatterns: true,
                                recentTopics: true,
                                currentMood: true,
                                decisionMakingNotes: true,
                                evidenceCount: true,
                            },
                        },
                    },
                });

                // Sort by strategic relevance: decision-makers & customers first, vendors last
                const VENDOR_TYPES = ['vendor', 'supplier', 'contractor', 'agency'];
                const HIGH_VALUE_TYPES = ['customer', 'buyer', 'investor', 'board_member', 'executive'];

                const sortedProfiles = profiles
                    .map(p => {
                        const emailKey = p.email?.toLowerCase() || '';
                        const nameKey = p.name.toLowerCase();
                        const meetingContext = emailToMeeting.get(emailKey) || nameToMeeting.get(nameKey) || 'Meeting';
                        const relType = p.relationshipType;
                        // Strategic relevance score for sorting
                        let relevance = 0;
                        if (relType && HIGH_VALUE_TYPES.includes(relType)) relevance = 3;
                        else if (p.influenceRole === 'DECISION_MAKER') relevance = 3;
                        else if (!relType || relType === 'internal_peer') relevance = 2;
                        else if (relType && VENDOR_TYPES.includes(relType)) relevance = 0;
                        else relevance = 1;
                        // Power level boost
                        if (p.powerLevel === 'HIGH') relevance += 2;
                        else if (p.powerLevel === 'MEDIUM') relevance += 1;
                        return { ...p, meetingContext, _relevance: relevance };
                    })
                    .sort((a, b) => b._relevance - a._relevance)
                    .slice(0, 5);

                return sortedProfiles;
            } catch (e) {
                console.error('[today] peopleIntel query failed:', e);
                return [];
            }
        })();

        // Week summary stats
        const totalWeekMeetings = meetings.length + weekMeetings.length;
        const weekNeedleMovers = weekMeetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER').length +
            meetings.filter(m => m.meetingCategory === 'NEEDLE_MOVER').length;
        const weekPresentations = weekMeetings.filter(m => m.isPresentation).length +
            meetings.filter(m => m.isPresentation).length;

        // ── GROUND GAME: Relationships to Watch ──
        const groundGameWatch: { name: string; signal: string; action: string; stakeholderId: string; meetingId?: string; priority: string }[] = [];
        try {
            const importantStale = (stakeholders as any[]).filter((s: any) => {
                if (!s.lastInteractionDate) return false;
                const daysSince = Math.floor((now.getTime() - new Date(s.lastInteractionDate).getTime()) / (24 * 60 * 60 * 1000));
                const isKey = s.powerLevel === 'HIGH' || s.influenceRole === 'DECISION_MAKER';
                return isKey && daysSince >= 14;
            });
            for (const s of importantStale.slice(0, 3)) {
                const daysSince = Math.floor((now.getTime() - new Date(s.lastInteractionDate).getTime()) / (24 * 60 * 60 * 1000));
                groundGameWatch.push({
                    name: s.name,
                    signal: `No contact in ${daysSince} days${s.role ? ` (${s.role})` : ''}`,
                    action: 'Book 1:1',
                    stakeholderId: s.id,
                    priority: daysSince >= 30 ? 'high' : 'medium',
                });
            }
        } catch (e) { console.error('[today] groundGame failed:', e); }

        // Domain context summary
        let orgContext: any = null;
        if (domainContext) {
            try {
                const org = domainContext.organization as any;
                const landscape = domainContext.landscape as any;
                orgContext = { organization: org, landscape };
            } catch (e) { console.error('[today] orgContext parse failed:', e); }
        }

        return NextResponse.json({
            success: true,
            data: {
                userStage,
                user: {
                    name: user?.name || 'Leader',
                    onboardingComplete: onboardingProgress?.onboardingComplete || user?.onboardingComplete || false,
                    jobTitle: user?.jobTitle || null,
                    company: user?.company || null
                },
                onboarding: onboardingProgress ? {
                    complete: onboardingProgress.onboardingComplete,
                    totalCalls: onboardingProgress.totalOnboardingCalls,
                    topics: {
                        story: onboardingProgress.coveredStory,
                        drivesAndValues: onboardingProgress.coveredDrivesAndValues,
                        life: onboardingProgress.coveredLife,
                        role: onboardingProgress.coveredRole,
                        stakeholders: onboardingProgress.coveredStakeholders,
                        leadershipStyle: onboardingProgress.coveredLeadershipStyle,
                        goals: onboardingProgress.coveredGoals,
                        challenges: onboardingProgress.coveredChallenges,
                        growth: onboardingProgress.coveredGrowth,
                    },
                    coveredCount: [
                        onboardingProgress.coveredStory, onboardingProgress.coveredDrivesAndValues,
                        onboardingProgress.coveredLife, onboardingProgress.coveredRole,
                        onboardingProgress.coveredStakeholders, onboardingProgress.coveredLeadershipStyle,
                        onboardingProgress.coveredGoals, onboardingProgress.coveredChallenges,
                        onboardingProgress.coveredGrowth,
                    ].filter(Boolean).length,
                    totalTopics: 9,
                } : null,
                stats: {
                    outcomeHitRate,
                    previousHitRate,
                    outcomesSet: latestSnapshot?.outcomesSet || 0,
                    outcomesLanded: latestSnapshot?.outcomesLanded || 0,
                    totalMeetingsThisWeek: latestSnapshot?.totalMeetings || meetings.length,
                    commitmentsMade,
                    commitmentsFulfilled,
                    streak
                },
                weekSummary: {
                    totalMeetings: totalWeekMeetings,
                    needleMovers: weekNeedleMovers,
                    presentations: weekPresentations,
                    meetingsToday: meetings.length,
                    meetingsTomorrow: tomorrowMeetings.length
                },
                commitments: {
                    dueToday: commitmentsDueToday.map((c: any) => ({
                        id: c.id, description: c.description, owner: c.owner,
                        dueDate: c.dueDate, status: c.status,
                        meetingTitle: c.meeting?.title || 'Meeting',
                        meetingDate: c.meeting?.startTime
                    })),
                    dueSoon: commitmentsDueSoon.map((c: any) => ({
                        id: c.id, description: c.description, owner: c.owner,
                        dueDate: c.dueDate, meetingTitle: c.meeting?.title || 'Meeting'
                    }))
                },
                meetings: enrichedMeetings,
                tomorrowMeetings: tomorrowMeetings.map(m => ({
                    id: m.id, title: m.title, startTime: m.startTime,
                    meetingCategory: m.meetingCategory, isPresentation: m.isPresentation,
                    attendeeCount: (m.participants as string[])?.length || 0,
                    desiredOutcome: m.desiredOutcome
                })),
                needsReview: needsReview.map(m => ({
                    id: m.id, title: m.title, endTime: m.endTime, desiredOutcome: m.desiredOutcome
                })),
                recentOutcomes: recentOutcomes.map((m: any) => ({
                    id: m.id, title: m.title, startTime: m.startTime,
                    desiredOutcome: m.desiredOutcome, outcomeResult: m.outcomeResult,
                    meetingCategory: m.meetingCategory
                })),
                kpis: kpis.map((k: any) => ({
                    id: k.id, name: k.name, status: k.status,
                    confidence: k.confidence, currentValue: k.currentValue,
                    targetValue: k.targetValue, targetDate: k.targetDate
                })),
                weeklyTrend: recentSnapshots.reverse().map((s: any) => ({
                    weekStart: s.weekStart, outcomesSet: s.outcomesSet,
                    outcomesLanded: s.outcomesLanded, totalMeetings: s.totalMeetings,
                    commitmentsFulfilled: s.commitmentsFulfilled,
                    commitmentsMade: s.commitmentsMade, totalHours: s.totalMeetingHours
                })),
                strategic: {
                    patternInsights,
                    categoryBreakdown,
                    stakeholderHealth,
                    allStakeholders: allStakeholdersSummary,
                    stakeholderGaps,
                    recurringWithNoValue,
                    upcomingWithoutGoals: upcomingWithoutGoals.map(m => ({
                        id: m.id, title: m.title, startTime: m.startTime, meetingCategory: m.meetingCategory
                    })),
                    timeAllocation: { totalHours: totalMeetingHoursThisWeek, totalCategorized },
                    recentInsights: recentInsights.map((i: any) => ({
                        insight: i.insight, type: i.contextType, date: i.conversationDate
                    })),
                    orgContext,
                    peopleIntel
                },
                weekAhead: (() => {
                    const days: Record<string, { date: string; dayLabel: string; meetings: any[] }> = {};
                    for (const m of weekMeetings) {
                        const dayKey = new Date(m.startTime.getTime() - tzOffset * 60 * 1000).toISOString().split('T')[0];
                        if (!days[dayKey]) {
                            const d = new Date(dayKey + 'T00:00:00');
                            days[dayKey] = { date: dayKey, dayLabel: d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), meetings: [] };
                        }
                        days[dayKey].meetings.push({
                            id: m.id, title: m.title, startTime: m.startTime,
                            meetingCategory: m.meetingCategory, isPresentation: m.isPresentation,
                            attendeeCount: (m.participants as string[])?.length || 0,
                            desiredOutcome: m.desiredOutcome
                        });
                    }
                    return Object.values(days);
                })(),
                upcomingClassified: classifiedMeetings,
                groundGame: {
                    relationshipsToWatch: groundGameWatch,
                },
            }
        });
    } catch (error) {
        console.error('[API] Failed to fetch Today data:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
