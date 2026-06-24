
import { prisma } from '../../lib/prisma';
import { InterviewerInput } from '../interviewer';
import { publishMessage, publishTypingIndicator, publishModeChange } from '../../lib/pusher';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';

export async function goalCaptureAgent(input: InterviewerInput, conversationState: any) {
    console.log(`[GoalCapture] Active for ${input.userId}`);

    // 1. Build Prompt - "You are an expert interviewer..."
    const prompt = `
    You are helping a user clarify a strategic goal.
    
    Current Conversation State: GOAL_CAPTURE
    User Message: "${input.message}"
    
    GOAL: Extract a concrete goal if present, or ask clarifying questions.
    
    If you have enough info to define a goal (Description + optionally Deadline/Magnitude), return a JSON with:
    {
      "gotGoal": true,
      "description": "Get Q2 Budget Approved",
      "magnitude": "QUARTERLY", // CAREER, QUARTERLY, PROJECT, TASK
      "deadline": "2024-06-30" // ISO Date or null
    }
    
    If unclear, return:
    {
      "gotGoal": false,
      "question": "Clarifying question here..."
    }
    
    RETURN ONLY JSON.
    `;

    // Publish typing indicator
    await publishTypingIndicator(input.userId, true);

    const model = await createTrackedGeminiModel(input.userId, {
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const data = JSON.parse(text);

    if (data.gotGoal) {
        // SAVE GOAL
        const goal = await (prisma as any).goal.create({
            data: {
                userId: input.userId,
                description: data.description,
                magnitude: data.magnitude || 'QUARTERLY',
                deadline: data.deadline ? new Date(data.deadline) : undefined
            }
        });

        // UPDATE STATE -> STAKEHOLDER_MAPPING
        await (prisma as any).conversationState.update({
            where: { id: conversationState.id },
            data: {
                mode: 'STAKEHOLDER_MAPPING',
                activeGoalId: goal.id
            }
        });

        const responseContent = `Got it. I've tracked "${goal.description}" as a new goal.\n\nNow, who are the key people involved in this? (Decision makers, blockers, allies?)`;
        const savedMessage = await prisma.message.create({
            data: {
                userId: input.userId,
                role: 'assistant',
                content: responseContent
            }
        });

        // Publish via Pusher
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: responseContent,
            createdAt: savedMessage.createdAt
        });
        await publishModeChange(input.userId, 'STAKEHOLDER_MAPPING');

    } else {
        // ASK QUESTION
        const savedMessage = await prisma.message.create({
            data: {
                userId: input.userId,
                role: 'assistant',
                content: data.question
            }
        });

        // Publish via Pusher
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: data.question,
            createdAt: savedMessage.createdAt
        });
    }

    return { success: true };
}
