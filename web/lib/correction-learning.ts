/**
 * Correction Learning Service (Web Side)
 *
 * Records user corrections when they override AI predictions via API routes.
 * Mirror of worker/src/lib/correction-learning.ts for web-side usage.
 */

import { prisma } from '@/lib/prisma';

export interface CorrectionInput {
    userId: string;
    entityType: string;     // "meeting_classification", "stakeholder_archetype", etc.
    entityId?: string;
    field: string;          // "meetingCategory", "importance", etc.
    aiValue: string | null;
    userValue: string;
    context?: Record<string, any>;
}

/**
 * Record a user correction. Called whenever the user overrides an AI prediction.
 */
export async function recordCorrection(input: CorrectionInput): Promise<void> {
    if (input.aiValue === input.userValue) return;

    try {
        await prisma.userCorrection.create({
            data: {
                userId: input.userId,
                entityType: input.entityType,
                entityId: input.entityId,
                field: input.field,
                aiValue: input.aiValue,
                userValue: input.userValue,
                context: input.context || undefined,
            },
        });
        console.log(`[CorrectionLearning] Recorded: ${input.entityType}.${input.field} "${input.aiValue}" → "${input.userValue}"`);
    } catch (err: any) {
        console.warn(`[CorrectionLearning] Failed to record correction: ${err.message}`);
    }
}
