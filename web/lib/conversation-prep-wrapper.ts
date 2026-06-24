// import { generateConversationPrep as originalGenerateConversationPrep } from './conversation-prep-original';

interface PrepInput {
    userId: string;
    conversationId: string;
    title: string;
    type: string;
    objective: string;
    stakeholderName?: string | null;
    stakeholderRole?: string | null;
    context?: string;
}

// Wrapper with field name normalization  
export async function generateConversationPrep(input: PrepInput) {
    try {
        const result: any = { keyMessages: [], anticipatedObjections: [], primaryObjective: '' };
        console.warn('originalGenerateConversationPrep is missing. Returning empty prep.');

        // Log what we got
        console.log('[WRAPPER] Received result with keys:', Object.keys(result));
        console.log('[WRAPPER] keyMessages:', Array.isArray(result.keyMessages) ? result.keyMessages.length : 'NOT ARRAY');
        console.log('[WRAPPER] anticipatedObjections:', Array.isArray(result.anticipatedObjections) ? result.anticipatedObjections.length : 'NOT ARRAY');

        // Ensure arrays exist
        if (!Array.isArray(result.keyMessages)) {
            console.warn('[WRAPPER] keyMessages is not an array, defaulting to empty');
            result.keyMessages = [];
        }
        if (!Array.isArray(result.anticipatedObjections)) {
            console.warn('[WRAPPER] anticipatedObjections is not an array, defaulting to empty');
            result.anticipatedObjections = [];
        }

        return result;
    } catch (error) {
        console.error('[WRAPPER] Error:', error);
        throw error;
    }
}
