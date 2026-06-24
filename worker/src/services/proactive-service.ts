
import { prisma } from '../lib/prisma';
import { PromptType } from '@prisma/client';

export class ProactiveService {

    /**
     * MORNING BRIEF ENGINE
     * Runs daily at ~8am. Determines the "Theme of the Day".
     */
    static async generateMorningBrief(userId: string) {
        // 1. Get Context
        const goals = await prisma.goal.findMany({
            where: { userId, status: 'ACTIVE' },
            include: { stakeholders: true }
        });

        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        // Mocking upcoming meeting fetch for now
        const hasMeeting = Math.random() > 0.5;

        let content = "";
        let type: PromptType = 'MORNING_BRIEF';
        let goalId: string | null = null;

        if (hasMeeting && goals.length > 0) {
            // SCENARIO: Meeting Opportunity
            const g = goals[0];
            content = `Good morning! You have a busy day ahead. Since you're focusing on "${g.description}", look out for opportunities to align with stakeholders in your 2pm meeting.`;
            type = 'OPPORTUNITY';
            goalId = g.id;
        } else if (goals.length > 0) {
            // SCENARIO: Goal Focus
            const g = goals[0];
            content = `Good morning. Your top priority is "${g.description}". What is ONE thing you can do today to move this forward?`;
            goalId = g.id;
        } else {
            // SCENARIO: Empty State
            content = "Good morning! You don't have any active strategic goals tracked yet. Would you like to set one for this week?";
        }

        // 2. Save Prompt to DB (So UI can fetch it)
        await prisma.proactivePrompt.create({
            data: {
                userId,
                type,
                content,
                goalId
            }
        });

        console.log(`[Proactive] Generated ${type} for user ${userId}`);
        return content;
    }

    /**
     * EXECUTION NUDGER
     * Runs hourly. Checks for overdue actions or "staleness".
     */
    static async checkExecutionNudges(userId: string) {
        // 1. Check Overdue Actions
        const overdueActions = await prisma.relationshipAction.findMany({
            where: {
                goal: { userId },
                status: 'IN_PROGRESS',
                dueDate: { lt: new Date() }
            },
            include: { goal: true }
        });

        if (overdueActions.length > 0) {
            const action = overdueActions[0];
            const content = `Caught you! You planned to "${action.description}" for your goal "${action.goal.description}" by today. Need help drafting the message?`;

            await prisma.proactivePrompt.create({
                data: {
                    userId,
                    type: 'EXECUTION_NUDGE',
                    content,
                    goalId: action.goalId
                }
            });
            return content;
        }

        return null;
    }
}
