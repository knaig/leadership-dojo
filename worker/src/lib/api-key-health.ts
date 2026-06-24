/**
 * API Key Health Monitor
 *
 * Checks quota/balance for all external API keys and creates alerts
 * when keys are approaching or have exceeded their limits.
 *
 * Supported services:
 * - Tavily (GET /usage endpoint)
 * - Perplexity (track locally via request counting)
 * - Gemini platform key (existing token-tracking.ts)
 * - Google Custom Search (track locally)
 */

import { prisma } from './prisma';

interface ApiKeyStatus {
    service: string;
    status: 'healthy' | 'warning' | 'critical' | 'expired' | 'not_configured';
    used: number | null;
    limit: number | null;
    remaining: number | null;
    percentUsed: number | null;
    message: string;
    checkedAt: Date;
}

/**
 * Check health of all configured API keys.
 * Returns status for each service.
 */
export async function checkAllApiKeys(): Promise<ApiKeyStatus[]> {
    const results: ApiKeyStatus[] = [];

    results.push(await checkTavily());
    results.push(await checkPerplexity());
    results.push(await checkGeminiPlatform());
    results.push(checkGoogleSearch());

    // Store results and create alerts for warning/critical
    await storeHealthResults(results);

    return results;
}

async function checkTavily(): Promise<ApiKeyStatus> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return { service: 'tavily', status: 'not_configured', used: null, limit: null, remaining: null, percentUsed: null, message: 'TAVILY_API_KEY not set', checkedAt: new Date() };

    try {
        const res = await fetch(`https://api.tavily.com/usage`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        if (!res.ok) {
            // Try POST method as some versions use it
            const res2 = await fetch('https://api.tavily.com/usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey }),
            });

            if (!res2.ok) {
                return { service: 'tavily', status: 'warning', used: null, limit: null, remaining: null, percentUsed: null, message: `Usage endpoint returned ${res.status}`, checkedAt: new Date() };
            }

            const data = await res2.json() as any;
            return parseTavilyUsage(data);
        }

        const data = await res.json() as any;
        return parseTavilyUsage(data);
    } catch (err: any) {
        return { service: 'tavily', status: 'warning', used: null, limit: null, remaining: null, percentUsed: null, message: `Check failed: ${err.message}`, checkedAt: new Date() };
    }
}

function parseTavilyUsage(data: any): ApiKeyStatus {
    const used = data.total_credits_used ?? data.used ?? data.api_credits_used ?? null;
    const limit = data.total_credits ?? data.limit ?? data.api_credits_limit ?? 1000;
    const remaining = (used !== null && limit !== null) ? limit - used : null;
    const percentUsed = (used !== null && limit) ? Math.round((used / limit) * 100) : null;

    let status: ApiKeyStatus['status'] = 'healthy';
    let message = `${used ?? '?'}/${limit} credits used`;

    if (percentUsed !== null) {
        if (percentUsed >= 95) { status = 'critical'; message = `${percentUsed}% credits used — will run out soon`; }
        else if (percentUsed >= 80) { status = 'warning'; message = `${percentUsed}% credits used — approaching limit`; }
    }

    return { service: 'tavily', status, used, limit, remaining, percentUsed, message, checkedAt: new Date() };
}

async function checkPerplexity(): Promise<ApiKeyStatus> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return { service: 'perplexity', status: 'not_configured', used: null, limit: null, remaining: null, percentUsed: null, message: 'PERPLEXITY_API_KEY not set', checkedAt: new Date() };

    // Perplexity has no usage endpoint — make a minimal test call to verify the key works
    try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
        });

        if (res.status === 401 || res.status === 403) {
            const data = await res.json() as any;
            if (data.error?.type === 'insufficient_quota') {
                return { service: 'perplexity', status: 'critical', used: null, limit: null, remaining: 0, percentUsed: 100, message: 'Quota exhausted — add credits at perplexity.ai/settings/api', checkedAt: new Date() };
            }
            return { service: 'perplexity', status: 'expired', used: null, limit: null, remaining: null, percentUsed: null, message: 'API key invalid or expired', checkedAt: new Date() };
        }

        if (res.ok) {
            return { service: 'perplexity', status: 'healthy', used: null, limit: null, remaining: null, percentUsed: null, message: 'Key active — no usage endpoint available, monitor at perplexity.ai/settings/api', checkedAt: new Date() };
        }

        return { service: 'perplexity', status: 'warning', used: null, limit: null, remaining: null, percentUsed: null, message: `API returned ${res.status}`, checkedAt: new Date() };
    } catch (err: any) {
        return { service: 'perplexity', status: 'warning', used: null, limit: null, remaining: null, percentUsed: null, message: `Check failed: ${err.message}`, checkedAt: new Date() };
    }
}

async function checkGeminiPlatform(): Promise<ApiKeyStatus> {
    try {
        const { getGlobalPlatformUsage } = require('./token-tracking');
        const usage = await getGlobalPlatformUsage();

        const percentUsed = Math.round((usage.total / usage.budget) * 100);
        let status: ApiKeyStatus['status'] = 'healthy';
        let message = `${percentUsed}% of platform budget used (${Math.round(usage.total / 1_000_000)}M / ${Math.round(usage.budget / 1_000_000)}M tokens)`;

        if (usage.exhausted) { status = 'critical'; message = 'Platform budget exhausted — users need own API keys'; }
        else if (percentUsed >= 80) { status = 'warning'; message = `${percentUsed}% budget used — approaching limit`; }

        return { service: 'gemini_platform', status, used: usage.total, limit: usage.budget, remaining: usage.budget - usage.total, percentUsed, message, checkedAt: new Date() };
    } catch (err: any) {
        return { service: 'gemini_platform', status: 'warning', used: null, limit: null, remaining: null, percentUsed: null, message: `Check failed: ${err.message}`, checkedAt: new Date() };
    }
}

function checkGoogleSearch(): ApiKeyStatus {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        return { service: 'google_search', status: 'not_configured', used: null, limit: null, remaining: null, percentUsed: null, message: 'Google Search API keys not set (deprecated — using Tavily instead)', checkedAt: new Date() };
    }

    return { service: 'google_search', status: 'healthy', used: null, limit: 100, remaining: null, percentUsed: null, message: 'Configured — 100 free queries/day (no usage tracking available)', checkedAt: new Date() };
}

/**
 * Store health check results and create admin alerts for warning/critical.
 */
async function storeHealthResults(results: ApiKeyStatus[]): Promise<void> {
    const alertable = results.filter(r => r.status === 'warning' || r.status === 'critical' || r.status === 'expired');

    for (const result of alertable) {
        // Use SystemAlert model if it exists, otherwise log
        try {
            await prisma.systemAlert.create({
                data: {
                    type: 'API_KEY_HEALTH',
                    severity: result.status === 'critical' || result.status === 'expired' ? 'CRITICAL' : 'WARNING',
                    title: `${result.service}: ${result.status}`,
                    message: result.message,
                    metadata: result as any,
                    resolved: false,
                },
            });
        } catch {
            // SystemAlert model may not exist yet — just log
            console.warn(`[ApiKeyHealth] ALERT: ${result.service} — ${result.status}: ${result.message}`);
        }
    }

    console.log(`[ApiKeyHealth] Checked ${results.length} services: ${results.map(r => `${r.service}=${r.status}`).join(', ')}`);
}
