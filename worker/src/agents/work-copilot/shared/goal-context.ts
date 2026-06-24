import { prisma } from '../../../lib/prisma';
// import { Goal, GoalStakeholder, StakeholderProfile } from '@prisma/client'; // Removed to avoid type errors in worker


export interface PromptContext {
    goals: any[];
    upcomingMeetings: any[];
}

export class GoalContextService {

    /**
     * Builds the "Context Garden" specific to the Work Co-pilot.
     * Fetches Active Goals, their Stakeholders, and Relationship Gaps.
     */
    static async buildContext(userId: string): Promise<PromptContext> {

        // 1. Fetch Active Goals with enriched stakeholder data
        const goals = await (prisma as any).goal.findMany({
            where: {
                userId,
                status: 'ACTIVE'
            },
            include: {
                stakeholders: {
                    include: {
                        stakeholder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // 2. Fetch upcoming meetings (Next 3 days)
        // Note: Using existing meeting log or context service would be better, 
        // but for now we query MeetingLog if available, or just return empty.
        // In a real implementation, we'd reuse ContextService.getRecentContext logic here.
        const upcomingMeetings: any[] = [];

        return {
            goals,
            upcomingMeetings
        };
    }

    /**
     * Formats the Goal Context into a string for the System Prompt.
     */
    static formatContextForPrompt(ctx: PromptContext): string {
        if (ctx.goals.length === 0) {
            return "No active goals found. Ask the user what they are trying to achieve this quarter.";
        }

        let output = "ACTIVE GOALS & RELATIONSHIPS:\n";

        ctx.goals.forEach(g => {
            output += `\n🎯 GOAL: "${g.description}" (Status: ${g.status})\n`;

            if (g.stakeholders.length === 0) {
                output += "   - No stakeholders mapped yet.\n";
            } else {
                g.stakeholders.forEach(gs => {
                    const gap = gs.currentState !== gs.requiredState;
                    const gapIcon = gap ? "🔴 GAP" : "🟢 OK";
                    output += `   - ${gs.stakeholder.name} (${gs.role}): ${gs.currentState} -> ${gs.requiredState} [${gapIcon}]\n`;
                });
            }
        });

        return output;
    }
}
