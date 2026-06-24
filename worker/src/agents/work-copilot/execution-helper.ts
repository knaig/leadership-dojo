
import { prisma } from '../../lib/prisma';
import { InterviewerInput } from '../interviewer';
import { OpenClawService, OpenClawAction } from '../../services/openclaw-service';
import { publishMessage, publishTypingIndicator, publishModeChange } from '../../lib/pusher';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';

export async function executionHelperAgent(input: InterviewerInput, conversationState: any) {
    const actionId = conversationState.activeActionId;
    const action = await (prisma as any).relationshipAction.findUnique({ where: { id: actionId }, include: { goal: true } });

    if (!action) throw new Error("Action not found");

    if (input.message.toLowerCase() === 'send') {
        await publishTypingIndicator(input.userId, true);

        let replyText = "✅ Message sent via OpenClaw!";

        try {
            // EXECUTE via OpenClaw
            const openClawAction: OpenClawAction = {
                type: 'EMAIL', // Simplification for now
                recipient: 'mock@example.com', // Would come from StakeholderProfile
                content: action.draftMessages ? JSON.stringify(action.draftMessages) : "Just checking in...",
                subject: `Re: ${action.goal.description}`
            };

            await OpenClawService.execute(openClawAction);

            await (prisma as any).relationshipAction.update({
                where: { id: actionId },
                data: { status: 'COMPLETED', completedAt: new Date() }
            });

        } catch (err: any) {
            replyText = `❌ Message failed to send: ${err.message}. Try again?`;
        }

        const savedMessage = await prisma.message.create({
            data: {
                userId: input.userId,
                role: 'assistant',
                content: replyText
            }
        });

        // Publish via Pusher
        await publishTypingIndicator(input.userId, false);
        await publishMessage(input.userId, {
            id: savedMessage.id,
            role: 'assistant',
            content: replyText,
            createdAt: savedMessage.createdAt
        });

        // Return to General ONLY IF SUCCESS
        if (!replyText.includes('failed')) {
            await (prisma as any).conversationState.update({
                where: { id: conversationState.id },
                data: { mode: 'GENERAL', activeActionId: null }
            });
            await publishModeChange(input.userId, 'GENERAL');
        }

        return { success: true };
    }

    // Otherwise, assume drafting
    await publishTypingIndicator(input.userId, true);

    const prompt = `
    Action: ${action.description}
    User Request: "${input.message}"

    Draft a message for the user.
    Output JSON: { "draft": "Hi Alice..." }
    `;

    const model = await createTrackedGeminiModel(input.userId, {
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent(prompt);
    const data = JSON.parse(result.response.text());

    // Update Draft in DB
    await (prisma as any).relationshipAction.update({
        where: { id: actionId },
        data: { draftMessages: data.draft }
    });

    const draftContent = `Here is a draft:\n\n---\n${data.draft}\n---\n\nType "Send" to send it, or tell me what to change.`;
    const savedMessage = await prisma.message.create({
        data: {
            userId: input.userId,
            role: 'assistant',
            content: draftContent
        }
    });

    // Publish via Pusher
    await publishTypingIndicator(input.userId, false);
    await publishMessage(input.userId, {
        id: savedMessage.id,
        role: 'assistant',
        content: draftContent,
        createdAt: savedMessage.createdAt
    });

    return { success: true };
}
