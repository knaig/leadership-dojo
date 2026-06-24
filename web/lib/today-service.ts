import { prisma } from '@/lib/prisma';
import { generatePrescriptions } from './recommendation-service';
import type { StrategicArcData } from '@/components/today/StrategicArc';
import type { NeedleMover } from '@/components/today/MoveTheNeedleSection';
import type { DayMeeting } from '@/components/today/YourDaySection';
import type { SkillCardData } from '@/components/today/SharpenYourEdgeSection';
import type { GrowthSnapshot } from '@/components/today/YourGrowthSection';

export interface Briefing {
    content: string;
    generatedAt: Date;
}

export interface TodayData {
    briefing?: Briefing;
    arc: StrategicArcData;
    needleMovers: NeedleMover[];
    meetings: DayMeeting[];
    skill: SkillCardData | null;
    growth: GrowthSnapshot;
}

export async function getTodayData(userId: string): Promise<TodayData> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // 1. Strategic Arc (From latest active UserProject)
    const project = await prisma.userProject.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { missions: true } // metrics not directly there, but maybe infer
    });

    let arc: StrategicArcData;

    if (project) {
        // Infer dates. If no deadline, assume 30 day sprint from creation or update.
        const startDate = project.createdAt;
        const endDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000));
        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const currentDay = Math.ceil((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        arc = {
            title: project.name.toUpperCase(),
            startDate,
            endDate,
            currentDay: Math.min(Math.max(1, currentDay), totalDays),
            totalDays,
            milestones: [
                { label: 'Kickoff', date: startDate, status: 'completed' },
                { label: 'Today', date: new Date(), status: 'today' },
                { label: 'Review', date: endDate, status: 'upcoming' },
            ],
            todayStakes: project.description ? `Focus: ${project.description.substring(0, 30)}...` : undefined
        };
    } else {
        // Fallback or empty state if no project
        arc = {
            title: "GROWTH ANALYSIS COMPLETE",
            startDate: new Date(),
            endDate: new Date(),
            currentDay: 1,
            totalDays: 1,
            milestones: [],
            todayStakes: "Review your leadership profile below to set a new baseline."
        }
    }

    // 2. Needle Movers (Interventions + High Priority items)
    let interventions = await prisma.userActionPlan.findMany({
        where: {
            userId,
            type: 'INTERVENTION',
            status: { in: ['PENDING', 'COMMITTED'] }
        },
        take: 2,
        orderBy: { createdAt: 'desc' }
    });

    // Fallback: If no interventions, use NUDGEs as needle movers
    // This ensures new users who just analyzed see *something* actionable
    if (interventions.length === 0) {
        interventions = await prisma.userActionPlan.findMany({
            where: {
                userId,
                type: 'NUDGE',
                status: { in: ['PENDING', 'COMMITTED'] }
            },
            take: 2,
            orderBy: { createdAt: 'desc' }
        });
    }

    const needleMovers: NeedleMover[] = interventions.map(inv => ({
        id: inv.id,
        type: 'strategic',
        headline: inv.actionSummary,
        subline: inv.type === 'INTERVENTION' ? 'Intervention' : 'Focus Area',
        whyItMatters: inv.evidenceObservation || 'Identified as high impact for your growth.',
        status: inv.status === 'COMMITTED' ? 'prepped' : 'pending'
    }));

    // If we have room, maybe items from missions? 
    // For now, adhere to 1-2 items from interventions.

    // 3. Meetings (From MeetingLog for today)
    const meetingLogs = await prisma.meetingLog.findMany({
        where: {
            userId,
            date: {
                gte: startOfDay,
                lte: endOfDay
            }
        },
        orderBy: { date: 'asc' }
    });

    const meetings: DayMeeting[] = meetingLogs.map(log => {
        // Infer duration if not strictly stored (MeetingLog only has date). 
        // We'll assume 30 mins or check if end time exists? 
        // Schema: date DateTime. No endDate or duration. 
        // We will assume 30 mins.
        const startTime = log.date;
        const endTime = new Date(startTime.getTime() + 30 * 60000);

        // Infer importance from analysis if possible
        const analysis = log.analysis as any;
        const isHighStakes = (analysis?.risks?.length || 0) > 0;

        return {
            id: log.id,
            title: 'Meeting', // MeetingLog doesn't have title?? It has `notes`. 
            // Wait, schema check: `date`, `source`, `notes`, `analysis`. NO TITLE?
            // `notes` might be the raw text/transcript or summary?
            // "source: GCal" might imply we don't have the title unless it's in notes or analysis.
            // Let's use a generic title or extract from first line of notes.
            startTime,
            endTime,
            importance: isHighStakes ? 'high' : 'routine',
            needsPrep: isHighStakes,
            status: 'upcoming' // Can't easily tell
        };
    });

    // 4. Sharpen Your Edge (Antigravity Case Surfacing)
    // Run the engine to check for new context matches
    await import('@/lib/cases/matcher').then(m => m.CaseSurfacingEngine.run(userId)).catch(console.error);

    // Look for high-priority surfaced cases first
    const surfacedCase = await prisma.caseSurfacing.findFirst({
        where: {
            userId,
            OR: [
                { response: null },
                { response: 'VIEWED' } // If we want to keep showing viewed ones
            ]
        },
        orderBy: { relevanceScore: 'desc' }
    });

    let skill: SkillCardData | null = null;
    const { caseSummaries } = await import('@/lib/case-index');

    if (surfacedCase) {
        // Hydrate from static index
        const caseMeta = caseSummaries.find(c => c.id === surfacedCase.caseId);
        if (caseMeta) {
            const context = surfacedCase.triggerContext as any;
            skill = {
                id: surfacedCase.id, // Use surfacing ID so we can track interaction
                name: "Leadership Simulation", // Generic Label or specific?
                insight: context?.reason || "Relevant to your current context.",
                theMove: `Master ${caseMeta.title}`,
                whyItWorks: "Antigravity detected this aligns with your upcoming challenges.",
                whenToUse: "Before your next big meeting.",
                readTime: "15 min",
                status: 'pending',
                case: {
                    title: caseMeta.title,
                    readTime: "15 min",
                    situation: caseMeta.contextSummary,
                    theMiss: "Acting without strategic patience.",
                    theFix: "Analyze underlying stakeholders first.",
                    principle: caseMeta.learningObjectives[0] || "Strategic Alignment"
                }
            };
        }
    }

    // Fallback to generic ActionPlan if no case surfaced
    if (!skill) {
        await generatePrescriptions(userId);
        const nudge = await prisma.userActionPlan.findFirst({
            where: {
                userId,
                status: { in: ['PENDING', 'COMMITTED'] },
                type: { not: 'INTERVENTION' }
            },
            orderBy: { createdAt: 'desc' },
            include: { relatedCase: true }
        });

        if (nudge) {
            skill = {
                id: nudge.id,
                name: nudge.capacity,
                insight: nudge.evidenceObservation || "Practice makes perfect.",
                theMove: nudge.actionSummary,
                whyItWorks: "Aligned with your learning goals.",
                whenToUse: "In your next conversation.",
                readTime: "5 min",
                status: nudge.status as any,
                case: nudge.relatedCase ? {
                    title: nudge.relatedCase.title,
                    readTime: "10 min",
                    situation: "Context from simple case...",
                    theMiss: "Common pitfall...",
                    theFix: "Recommended approach...",
                    principle: "Core lesson."
                } : undefined
            };
            // Enrich with source context if available
            const meta = nudge.metadata as any;
            if (meta?.sourceArtifactId) {
                const artifact = await prisma.workArtifact.findUnique({
                    where: { id: meta.sourceArtifactId },
                    select: { title: true, type: true }
                });

                if (artifact) {
                    skill.source = {
                        type: artifact.type,
                        title: artifact.title || 'Untitled Artifact'
                    };
                }
            }
        }
    }

    // 5. Growth (CapacityScores)
    const scores = await prisma.capacityScore.findMany({
        where: { userId },
        include: { capacity: true }
    });

    const capacities = scores.map(s => {
        // Map slug/name to Code
        const code = s.capacity.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

        return {
            code,
            name: s.capacity.name,
            score: s.score,
            trend: s.trend === 'IMPROVING' ? 'up' : s.trend === 'DECLINING' ? 'down' : 'stable'
        };
    }) as any[]; // Type assertion for simple match

    // Weekly Focus (Active PracticeMission)
    const mission = await prisma.practiceMission.findFirst({
        where: { userId, status: 'IN_PROGRESS' },
        include: { capacity: true }
    });

    const growth: GrowthSnapshot = {
        capacities: capacities.length > 0 ? capacities : [], // If empty, empty array
        weeklyFocus: mission ? {
            capacityName: mission.capacity.name,
            currentScore: mission.currentScore || mission.baselineScore,
            targetScore: mission.targetScore,
            completedPractices: [], // Need artifact count or similar
            requiredPractices: 3
        } : { // Fallback if no active mission
            capacityName: "No Active Mission",
            currentScore: 0,
            targetScore: 5,
            completedPractices: [],
            requiredPractices: 0
        }
    };

    // 6. Construct Briefing (Rules-based for speed)
    const highStakesMeeting = meetings.find(m => m.importance === 'high');
    const topNeedleMover = needleMovers.length > 0 ? needleMovers[0] : null;

    let briefingContent = `Good morning. You have ${meetings.length} meetings today.`;

    if (highStakesMeeting) {
        briefingContent = `High attention required: You have a high-stakes session "${highStakesMeeting.title}" at ${highStakesMeeting.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Prep is recommended.`;
    } else if (topNeedleMover) {
        briefingContent = `Good morning. Your key focus today is "${topNeedleMover.headline}". ${topNeedleMover.whyItMatters}`;
    } else if (meetings.length === 0) {
        briefingContent = "Good morning. You have a clear calendar today. It's a great opportunity to focus on your strategic growth plan.";
    }

    const briefing: Briefing = {
        content: briefingContent,
        generatedAt: new Date()
    };

    return { arc, needleMovers, meetings, skill, growth, briefing };
}
