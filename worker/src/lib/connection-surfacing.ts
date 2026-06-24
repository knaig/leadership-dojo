/**
 * Connection Surfacing Engine
 *
 * Detects missing data connections for a user and generates
 * context-appropriate suggestions for Mira to surface naturally
 * in calls or chat.
 *
 * Rules:
 * - Maximum one suggestion per call
 * - Never suggest in the first 2 calls
 * - Don't suggest the same connection twice in a week
 * - Frame as value for the user, not data extraction
 */

import { prisma } from './prisma';

interface ConnectionSuggestion {
    provider: string;
    type: 'calendar' | 'email' | 'messaging' | 'documents' | 'meetings' | 'projects';
    priority: number; // 1 = highest
    message: string;  // what Mira says (conversational, not salesy)
    triggerContext?: string; // when this is most relevant
}

/**
 * Detect missing connections and return prioritized suggestions.
 * Returns at most one suggestion (the highest priority one that
 * hasn't been suggested recently).
 */
export async function getConnectionSuggestion(
    userId: string,
): Promise<ConnectionSuggestion | null> {
    // Don't suggest in first 2 calls
    const personalCtx = await prisma.personalContext.findUnique({
        where: { userId },
        select: { callCount: true },
    });
    if ((personalCtx?.callCount || 0) < 2) return null;

    // Get connected providers
    const accounts = await prisma.account.findMany({
        where: { userId },
        select: { provider: true },
        distinct: ['provider'],
    });
    const connected = new Set(accounts.map(a => a.provider === 'azure-ad' ? 'microsoft' : a.provider));

    // Get user's country/locale for India-specific suggestions
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { countryCode: true, email: true },
    });
    const isIndia = user?.countryCode === '+91' || user?.email?.endsWith('.in');

    // Get recent suggestions to avoid nagging
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { connectionSuggestionsShown: true },
    });
    const recentSuggestions = (prefs?.connectionSuggestionsShown as Record<string, string>) || {};
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    function wasRecentlySuggested(provider: string): boolean {
        const lastShown = recentSuggestions[provider];
        if (!lastShown) return false;
        return new Date(lastShown) > oneWeekAgo;
    }

    // Build prioritized suggestions based on what's missing
    const suggestions: ConnectionSuggestion[] = [];

    // 1. Calendar — highest priority, core value
    if (!connected.has('google') && !connected.has('microsoft')) {
        suggestions.push({
            provider: 'calendar',
            type: 'calendar',
            priority: 1,
            message: "I'm coaching blind without your calendar. It takes 10 seconds to connect — want to do it now?",
            triggerContext: 'always',
        });
    }

    // 2. Email — second highest, stakeholder discovery
    // (Usually connected with calendar via same OAuth, but check)
    if (!connected.has('google') && !connected.has('microsoft')) {
        suggestions.push({
            provider: 'email',
            type: 'email',
            priority: 2,
            message: "If you connect your email, I can see who you're talking to and prep you better for people interactions.",
            triggerContext: 'when user mentions a person Mira doesn\'t know',
        });
    }

    // 3. WhatsApp — critical for India
    const waSession = await prisma.whatsAppSession.findUnique({
        where: { userId },
        select: { status: true },
    }).catch(() => null);
    const waConnected = waSession?.status === 'CONNECTED';

    if (!waConnected && isIndia) {
        suggestions.push({
            provider: 'whatsapp',
            type: 'messaging',
            priority: 3,
            message: "Most of your real conversations probably happen on WhatsApp, not email. If you connect it, I'll understand your network much faster. I only read — never send.",
            triggerContext: 'when Mira notices stakeholder gaps or user mentions WhatsApp',
        });
    }

    // 4. Slack — for tech/startup users
    if (!connected.has('slack')) {
        suggestions.push({
            provider: 'slack',
            type: 'messaging',
            priority: 5,
            message: "I notice there are people you work with that I don't have much context on. Do you use Slack? That'd help me understand the informal dynamics.",
            triggerContext: 'when stakeholder gap detected',
        });
    }

    // 5. Zoom — for meeting intelligence
    if (!connected.has('zoom')) {
        suggestions.push({
            provider: 'zoom',
            type: 'meetings',
            priority: 6,
            message: "If you connect Zoom, I can read meeting transcripts and save you the recap. I'll also pick up on dynamics I can't see from the calendar.",
            triggerContext: 'after a meeting with no debrief data',
        });
    }

    // 6. Document storage
    if (!connected.has('google') && !connected.has('microsoft') && !connected.has('dropbox') && !connected.has('notion')) {
        suggestions.push({
            provider: 'documents',
            type: 'documents',
            priority: 7,
            message: "You mentioned a document. If you connect your Drive or Dropbox, I can read it and give you better context.",
            triggerContext: 'when user mentions a doc or shares a link',
        });
    }

    // 7. Project tools
    if (!connected.has('linear') && !connected.has('jira') && !connected.has('trello') && !connected.has('asana')) {
        suggestions.push({
            provider: 'projects',
            type: 'projects',
            priority: 8,
            message: "You keep mentioning project status. If you connect your project tool, I can see what's actually on the board instead of guessing.",
            triggerContext: 'when user mentions project/sprint/ticket',
        });
    }

    // Filter out recently suggested and sort by priority
    const eligible = suggestions
        .filter(s => !wasRecentlySuggested(s.provider))
        .sort((a, b) => a.priority - b.priority);

    if (eligible.length === 0) return null;

    // Return the highest priority suggestion
    return eligible[0];
}

/**
 * Mark a connection suggestion as shown (prevents re-suggesting for a week).
 */
export async function markSuggestionShown(userId: string, provider: string): Promise<void> {
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
        select: { connectionSuggestionsShown: true },
    });

    const existing = (prefs?.connectionSuggestionsShown as Record<string, string>) || {};
    existing[provider] = new Date().toISOString();

    await prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, connectionSuggestionsShown: existing },
        update: { connectionSuggestionsShown: existing },
    });
}
