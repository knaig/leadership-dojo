import { prisma } from '@/lib/db';
import OpenAI from 'openai';
import { generateRecPlan } from './rec_engine';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * The Advisor / Project Consultant Agent
 * Analyzes (Diagnose) -> Plans (Missions) -> Measures (Health)
 * Methodology: COSS Beacon (Theory of Change, Stakeholder Map, Leading Indicators)
 */

interface MeetingDiagnostic {
    clarity: number; // 0-5
    alignment: number; // 0-5
    risks: string[];
    coachable_moments: string[];
}

interface OrganizationHealth {
    ragStatus: 'RED' | 'AMBER' | 'GREEN';
    pivotSignal: boolean;
    advice: string;
    leadingIndicators: { metric: string; status: 'On Track' | 'At Risk' }[];
}

export async function analyzeMeetingNotes(userId: string, notes: string, date: Date = new Date()) {
    console.log(`[AdvisorAgent] Analyzing meeting for User ${userId}...`);

    // 1. Diagnostics (Stakeholder & Intent)
    const prompt = `
    You are an Expert Project Consultant for Digital Transformation (COSS Methodology).
    Analyze these meeting notes.
    
    Notes:
    "${notes.slice(0, 3000)}"

    Diagnose:
    1. Goal Clarity: Was the goal clear? (0-5)
    2. Alignment: Did stakeholders agree? (0-5)
    3. Stakeholder Map: Detect 'Champions', 'Resistors', or 'Fence Sitters'.
    4. Risks: Any hidden political or technical risks?
    
    Return JSON.
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    const analysis = JSON.parse(completion.choices[0].message.content || "{}") as MeetingDiagnostic;

    // 2. Persist Log
    const log = await prisma.meetingLog.create({
        data: {
            userId,
            date,
            source: 'Manual_Upload',
            notes: notes.slice(0, 5000),
            analysis: analysis as any
        }
    });

    // 3. Trigger Interventions (Feedback Loop)
    if (analysis && (analysis.risks?.length > 0 || analysis.alignment < 3)) {
        console.log("[AdvisorAgent] Risk Detected. Triggering Rec Engine...");
        await generateRecPlan(userId);
    }

    return log;
}

/**
 * Generates actionable "Missions" (Activities) based on Project Context.
 * Aligns with "Theory of Change": Input -> Activity -> Output.
 */
export async function generateMission(userId: string, projectId: string) {
    const project = await prisma.userProject.findUnique({
        where: { id: projectId },
        include: { meetings: { take: 3, orderBy: { date: 'desc' } } }
    });

    if (!project) return null;

    const prompt = `
    Context: Project "${project.name}" - ${project.description}
    Recent Meeting Risks: ${project.meetings.map(m => JSON.stringify(m.analysis)).join('; ')}
    
    Task: Generate a high-impact 'Mission' (Activity) to unblock this project.
    Use COSS methodology: Focus on "Inertia Breaking" or "Stakeholder Conversion".
    
    Return JSON:
    {
       "title": "String (Action Verb)",
       "description": "String (Why & How)",
       "skillSlug": "String (e.g., offer-positioning, inertia-breaking)" 
    }
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    const suggestion = JSON.parse(completion.choices[0].message.content || "{}");

    // Find skill
    const skill = await prisma.skill.findUnique({ where: { slug: suggestion.skillSlug } });

    if (!skill) {
        console.warn(`[AdvisorAgent] Skill ${suggestion.skillSlug} not found. access generic.`);
        return null;
    }

    // Creating Mission
    const mission = await prisma.mission.create({
        data: {
            userId,
            projectId,
            skillId: skill.id,
            title: suggestion.title,
            description: suggestion.description,
            status: 'PLANNED'
        }
    });

    return mission;
}

/**
 * Evaluates Project Health (Leading Indicators)
 */
export async function checkProjectHealth(projectId: string) {
    // In a real app, this would aggregate Mission completion rates, Stakeholder scores etc.
    // For MVP, we simulate an expert review of the metadata.

    const project = await prisma.userProject.findUnique({
        where: { id: projectId },
        include: { missions: true }
    });

    if (!project) return null;

    const completionRate = project.missions.filter(m => m.status === 'COMPLETED').length / (project.missions.length || 1);

    const health: OrganizationHealth = {
        ragStatus: completionRate > 0.5 ? 'GREEN' : 'AMBER',
        pivotSignal: completionRate < 0.2 && project.missions.length > 5,
        advice: completionRate > 0.5 ? "Momentum is building. Focus on 'Scaling'." : "Stalled. Attempt 'Inertia Breaking' protocol.",
        leadingIndicators: [
            { metric: "Mission Velocity", status: completionRate > 0.5 ? 'On Track' : 'At Risk' }
        ]
    };

    const check = await prisma.projectHealth.create({
        data: {
            projectId,
            ragStatus: health.ragStatus,
            pivotSignal: health.pivotSignal,
            advice: JSON.stringify({ advice: health.advice, indicators: health.leadingIndicators })
        }
    });

    return check;
}
