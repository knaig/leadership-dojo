/**
 * Langfuse integration — observability + prompt management.
 *
 * Replaces our custom PromptVersion table and prompt-optimizer cron.
 * Prompts are managed in the Langfuse UI (versioned, labeled, A/B testable).
 * LLM calls are traced for cost tracking and performance analytics.
 *
 * Uses Langfuse cloud free tier (50K observations/mo) — no self-hosting needed.
 */

import Langfuse from 'langfuse';

let langfuseInstance: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
    if (langfuseInstance) return langfuseInstance;

    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    if (!publicKey || !secretKey) {
        // Langfuse is optional — gracefully degrade if not configured
        return null;
    }

    langfuseInstance = new Langfuse({
        publicKey,
        secretKey,
        baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    });

    return langfuseInstance;
}

/**
 * Get a prompt from Langfuse by name.
 * Returns compiled text with variables substituted, or null if Langfuse isn't configured.
 */
export async function getPrompt(
    name: string,
    variables: Record<string, string> = {},
    opts?: { label?: string; version?: number }
): Promise<string | null> {
    const lf = getLangfuse();
    if (!lf) return null;

    try {
        const prompt = await lf.getPrompt(name, opts?.version, {
            label: opts?.label || 'production',
            type: 'text',
        });
        return prompt.compile(variables);
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Langfuse] Failed to get prompt "${name}": ${errMsg}`);
        return null;
    }
}

/**
 * Get a chat prompt (array of messages) from Langfuse.
 */
export async function getChatPrompt(
    name: string,
    variables: Record<string, string> = {},
    opts?: { label?: string; version?: number }
): Promise<Array<{ role: string; content: string }> | null> {
    const lf = getLangfuse();
    if (!lf) return null;

    try {
        const prompt = await lf.getPrompt(name, opts?.version, {
            label: opts?.label || 'production',
            type: 'chat',
        });
        return prompt.compile(variables) as Array<{ role: string; content: string }>;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Langfuse] Failed to get chat prompt "${name}": ${errMsg}`);
        return null;
    }
}

/**
 * Create a trace for an LLM operation. Returns a trace object you can
 * add generations/spans to, or null if Langfuse isn't configured.
 */
export function createTrace(params: {
    name: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    input?: unknown;
}) {
    const lf = getLangfuse();
    if (!lf) return null;

    return lf.trace({
        name: params.name,
        userId: params.userId,
        metadata: params.metadata,
        input: params.input,
    });
}

/**
 * Wrap a generateText call with Langfuse tracing.
 * Tracks input, output, model, tokens, cost, and duration.
 */
export async function tracedGenerate(params: {
    name: string;
    userId?: string;
    model: string;
    provider: string;
    prompt: string;
    generateFn: () => Promise<string>;
    metadata?: Record<string, unknown>;
}): Promise<string> {
    const lf = getLangfuse();
    if (!lf) return params.generateFn();

    const trace = lf.trace({
        name: params.name,
        userId: params.userId,
        metadata: params.metadata,
    });

    const generation = trace.generation({
        name: `${params.name}-generation`,
        model: params.model,
        input: params.prompt,
        metadata: { provider: params.provider },
    });

    try {
        const result = await params.generateFn();
        generation.end({ output: result });
        return result;
    } catch (err) {
        generation.end({
            output: null,
            level: 'ERROR',
            statusMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}

/**
 * Score a trace (e.g., call feedback rating).
 */
export function scoreTrace(params: {
    traceId: string;
    name: string;
    value: number;
    comment?: string;
}) {
    const lf = getLangfuse();
    if (!lf) return;

    lf.score({
        traceId: params.traceId,
        name: params.name,
        value: params.value,
        comment: params.comment,
    });
}

/**
 * Create a session-scoped trace for grouping related calls by user.
 * Langfuse sessions show cross-call learning in one timeline.
 */
export function createSessionTrace(params: {
    name: string;
    userId: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
    input?: unknown;
}) {
    const lf = getLangfuse();
    if (!lf) return null;

    return lf.trace({
        name: params.name,
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: params.metadata,
        input: params.input,
    });
}

/**
 * Score a trace with multiple metrics at once (e.g. 6 KPIs from a call evaluation).
 */
export function scoreTraceMulti(params: {
    traceId: string;
    scores: Array<{ name: string; value: number; comment?: string }>;
}) {
    const lf = getLangfuse();
    if (!lf) return;

    for (const s of params.scores) {
        lf.score({
            traceId: params.traceId,
            name: s.name,
            value: s.value,
            comment: s.comment,
        });
    }
}

/**
 * Log a Langfuse event (non-LLM observation) on a trace.
 * Useful for tracking hypothesis lifecycle, learning events, etc.
 */
export function logEvent(params: {
    traceId: string;
    name: string;
    metadata?: Record<string, unknown>;
    input?: unknown;
    output?: unknown;
    level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
}) {
    const lf = getLangfuse();
    if (!lf) return;

    // Use trace event via the trace reference
    lf.trace({ id: params.traceId }).event({
        name: params.name,
        metadata: params.metadata,
        input: params.input,
        output: params.output,
        level: params.level || 'DEFAULT',
    });
}

/**
 * Flush pending events. Call before process exit.
 */
export async function flushLangfuse(): Promise<void> {
    const lf = getLangfuse();
    if (lf) {
        await lf.flushAsync();
    }
}
