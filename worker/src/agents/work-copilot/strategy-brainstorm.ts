
import { prisma } from '../../lib/prisma';
import { InterviewerInput } from '../interviewer';
import { PlaybookService } from './shared/playbooks';
import { publishTypingIndicator, publishModeChange } from '../../lib/pusher';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';

export async function strategyBrainstormAgent(input: InterviewerInput, state: any) {
    const goal = await (prisma as any).goal.findUnique({
        where: { id: state.activeGoalId },
        include: { stakeholders: { include: { stakeholder: true } } }
    });

    if (!goal) throw new Error("Goal context lost");

    // 1. BRAINSTORM (Prompt)
    const prompt = `
    GOAL: ${goal.description}
    STAKEHOLDERS: ${goal.stakeholders.map((s: any) => s.stakeholder.name).join(', ')}
    
    Generate 3 high-impact actions to advance this goal.
    Return JSON: { "actions": [{ "description": "...", "type": "MEETING" | "communication" }] }
    `;

    // Publish typing indicator
    await publishTypingIndicator(input.userId, true);

    const model = await createTrackedGeminiModel(input.userId, {
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const data = JSON.parse(result.response.text());

    // 2. SAVE ACTIONS
    // Data.actions -> DB
    // Simplified: Create one
    if (data.actions && data.actions.length > 0) {
        const firstAction = data.actions[0];
        const action = await (prisma as any).relationshipAction.create({
            data: {
                goalId: goal.id,
                description: firstAction.description,
                type: 'COMMUNICATION',
                status: 'PENDING'
            }
        });

        // 3. UPDATE STATE -> EXECUTION
        await (prisma as any).conversationState.update({
            where: { id: state.id },
            data: {
                mode: 'EXECUTION',
                activeActionId: action.id
            }
        });

        // Publish mode change
        await publishTypingIndicator(input.userId, false);
        await publishModeChange(input.userId, 'EXECUTION');
    } else {
        await publishTypingIndicator(input.userId, false);
    }

    return { success: true };
}
