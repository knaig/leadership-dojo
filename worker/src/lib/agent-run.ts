/**
 * Agent Run Tracking — Observability for all background agents.
 *
 * Wraps any agent function in start/complete/fail lifecycle tracking.
 * Every run creates an AgentRun record so admin can see:
 * - What ran, when, for whom
 * - What was processed vs skipped
 * - Errors and durations
 * - Whether agents are silently producing nothing
 */

import { prisma } from './prisma';

export interface AgentRunContext {
    runId: string;
    agentName: string;
    userId: string | null;
    startTime: number;
    itemsProcessed: number;
    itemsSkipped: number;
    llmCalls: number;
    tokensUsed: number;
    logs: string[];
}

/**
 * Start tracking an agent run. Returns a context object to pass through.
 */
export async function startAgentRun(
    agentName: string,
    opts: {
        userId?: string;
        triggerType: 'cron' | 'event' | 'api' | 'queue';
        triggerRef?: string;
        inputSummary?: string;
    },
): Promise<AgentRunContext> {
    const run = await prisma.agentRun.create({
        data: {
            agentName,
            userId: opts.userId || null,
            triggerType: opts.triggerType,
            triggerRef: opts.triggerRef || null,
            inputSummary: opts.inputSummary || null,
            status: 'running',
        },
    });

    return {
        runId: run.id,
        agentName,
        userId: opts.userId || null,
        startTime: Date.now(),
        itemsProcessed: 0,
        itemsSkipped: 0,
        llmCalls: 0,
        tokensUsed: 0,
        logs: [],
    };
}

/**
 * Mark an agent run as completed.
 */
export async function completeAgentRun(
    ctx: AgentRunContext,
    outputSummary?: string,
): Promise<void> {
    const durationMs = Date.now() - ctx.startTime;

    await prisma.agentRun.update({
        where: { id: ctx.runId },
        data: {
            status: 'completed',
            completedAt: new Date(),
            durationMs,
            itemsProcessed: ctx.itemsProcessed,
            itemsSkipped: ctx.itemsSkipped,
            llmCalls: ctx.llmCalls,
            tokensUsed: ctx.tokensUsed,
            outputSummary: outputSummary || (ctx.logs.length > 0 ? ctx.logs.join('\n') : null),
        },
    });

    // Warn if agent ran but produced nothing
    if (ctx.itemsProcessed === 0 && ctx.itemsSkipped === 0) {
        console.warn(
            `[AgentRun] WARNING: ${ctx.agentName} completed but processed 0 items` +
            (ctx.userId ? ` for user ${ctx.userId.substring(0, 8)}` : '') +
            ` (duration: ${durationMs}ms)`
        );
    }
}

/**
 * Mark an agent run as failed.
 */
export async function failAgentRun(
    ctx: AgentRunContext,
    error: Error | string,
): Promise<void> {
    const durationMs = Date.now() - ctx.startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;

    await prisma.agentRun.update({
        where: { id: ctx.runId },
        data: {
            status: 'failed',
            completedAt: new Date(),
            durationMs,
            itemsProcessed: ctx.itemsProcessed,
            itemsSkipped: ctx.itemsSkipped,
            errorMessage: errMsg,
            errorStack: errStack || null,
            outputSummary: ctx.logs.length > 0 ? ctx.logs.join('\n') : null,
        },
    });

    console.error(
        `[AgentRun] FAILED: ${ctx.agentName}` +
        (ctx.userId ? ` for user ${ctx.userId.substring(0, 8)}` : '') +
        `: ${errMsg}`
    );
}

/**
 * Mark an agent run as skipped (e.g., no data to process, recently refreshed).
 */
export async function skipAgentRun(
    ctx: AgentRunContext,
    reason: string,
): Promise<void> {
    await prisma.agentRun.update({
        where: { id: ctx.runId },
        data: {
            status: 'skipped',
            completedAt: new Date(),
            durationMs: Date.now() - ctx.startTime,
            outputSummary: reason,
        },
    });
}

/**
 * Convenience wrapper — runs a function with automatic agent run tracking.
 * Handles start/complete/fail lifecycle automatically.
 *
 * Usage:
 *   const result = await withAgentRun('stakeholder-synthesis', userId, 'cron', async (ctx) => {
 *       ctx.itemsProcessed++;
 *       ctx.logs.push('processed stakeholder X');
 *       return someResult;
 *   });
 */
export async function withAgentRun<T>(
    agentName: string,
    userId: string | undefined,
    triggerType: 'cron' | 'event' | 'api' | 'queue',
    fn: (ctx: AgentRunContext) => Promise<T>,
    opts?: { triggerRef?: string; inputSummary?: string },
): Promise<T> {
    const ctx = await startAgentRun(agentName, {
        userId,
        triggerType,
        triggerRef: opts?.triggerRef,
        inputSummary: opts?.inputSummary,
    });

    try {
        const result = await fn(ctx);

        // Build output summary from the result if it has standard shape
        let summary: string | undefined;
        if (result && typeof result === 'object') {
            const r = result as Record<string, unknown>;
            if ('processed' in r || 'skipped' in r || 'errors' in r) {
                summary = JSON.stringify(r);
            }
        }

        await completeAgentRun(ctx, summary);
        return result;
    } catch (error) {
        await failAgentRun(ctx, error instanceof Error ? error : new Error(String(error)));
        throw error; // Re-throw so the caller's error handling still works
    }
}
