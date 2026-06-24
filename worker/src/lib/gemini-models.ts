/**
 * Gemini Model Configuration
 *
 * Central place for model names. When Google deprecates a model,
 * change it here — not in 20+ files.
 *
 * Fallback chain: if the primary model returns 404 (deprecated/unavailable),
 * the system should try the next model in the chain.
 */

// Primary model for all LLM calls
// Google discontinuing gemini-2.0-flash on June 1, 2026
export const GEMINI_MODEL = 'gemini-2.5-flash';

// Fallback models in priority order (tried if primary returns 404)
export const GEMINI_MODEL_FALLBACKS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
];

// For background jobs
export const GEMINI_MODEL_BACKGROUND = 'gemini-2.5-flash';

/**
 * Check if an error indicates a model is unavailable (deprecated/not found).
 */
export function isModelUnavailableError(err: any): boolean {
    const msg = err?.message || String(err);
    return msg.includes('404') && (
        msg.includes('no longer available') ||
        msg.includes('not found') ||
        msg.includes('NOT_FOUND')
    );
}
