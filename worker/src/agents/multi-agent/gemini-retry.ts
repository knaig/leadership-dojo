/**
 * Gemini API retry helper with exponential backoff.
 *
 * Handles 429 (RESOURCE_EXHAUSTED) and 503 (Service Unavailable) errors
 * by waiting and retrying, respecting Google's RetryInfo delay when available.
 */

export async function withGeminiRetry<T>(
    fn: () => Promise<T>,
    opts: { retries?: number; label?: string } = {}
): Promise<T> {
    const { retries = 3, label = 'Gemini' } = opts;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const status = err?.status ?? err?.code;
            const isRetryable = status == 429 || status == 503;

            if (!isRetryable || attempt === retries) {
                throw err;
            }

            // Respect Google's explicit retry delay if provided
            let waitMs = Math.min(5000 * Math.pow(2, attempt), 30000); // 5s, 10s, 20s, cap 30s
            if (err?.errorDetails) {
                const retryInfo = err.errorDetails.find((d: any) =>
                    d['@type']?.includes('RetryInfo')
                );
                if (retryInfo?.retryDelay) {
                    const seconds = parseInt(retryInfo.retryDelay.replace('s', ''), 10);
                    if (!isNaN(seconds)) waitMs = (seconds + 1) * 1000;
                }
            }

            console.warn(
                `[${label}] Rate limit / server error (${status}). ` +
                `Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}...`
            );
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
    }

    // TypeScript requires this but it's unreachable
    throw new Error(`[${label}] All retries exhausted`);
}
