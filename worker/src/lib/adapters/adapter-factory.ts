import { prisma } from '../prisma';
import type { CalendarAdapter } from './calendar-adapter';
import type { EmailAdapter } from './email-adapter';
import type { DocumentAdapter } from './document-adapter';
import type { DataProvider } from './types';

/**
 * All supported providers and their adapter capabilities.
 */
const PROVIDER_CAPABILITIES: Record<string, {
    calendar?: boolean;
    email?: boolean;
    documents?: boolean;
    messaging?: boolean;
    meetings?: boolean;
    projects?: boolean;
}> = {
    google:    { calendar: true, email: true, documents: true },
    microsoft: { calendar: true, email: true, documents: true },
    dropbox:   { documents: true },
    box:       { documents: true },
    slack:     { messaging: true },
    zoom:      { meetings: true },
    notion:    { documents: true },
    linear:    { projects: true },
    jira:      { projects: true },
    trello:    { projects: true },
    asana:     { projects: true },
};

/**
 * Detect which providers a user has connected.
 */
export async function getConnectedProviders(userId: string): Promise<string[]> {
    const accounts = await prisma.account.findMany({
        where: { userId },
        select: { provider: true },
        distinct: ['provider'],
    });
    return accounts.map(a => {
        if (a.provider === 'azure-ad') return 'microsoft';
        return a.provider;
    });
}

/**
 * Get the primary calendar/email/document provider for a user.
 */
export async function getProvider(userId: string): Promise<DataProvider | null> {
    const providers = await getConnectedProviders(userId);
    if (providers.includes('google')) return 'google';
    if (providers.includes('microsoft')) return 'microsoft';
    return null;
}

/**
 * Check if a specific provider is connected.
 */
export async function hasProvider(userId: string, provider: string): Promise<boolean> {
    const providers = await getConnectedProviders(userId);
    return providers.includes(provider);
}

// ════════════════════════════════════════════════════════════════
// CALENDAR ADAPTERS
// ════════════════════════════════════════════════════════════════

export async function getCalendarAdapter(userId: string): Promise<CalendarAdapter> {
    const provider = await getProvider(userId);
    switch (provider) {
        case 'google': {
            const { GoogleCalendarAdapter } = require('./google/google-calendar');
            return new GoogleCalendarAdapter(userId);
        }
        case 'microsoft': {
            const { MicrosoftCalendarAdapter } = require('./microsoft/microsoft-calendar');
            return new MicrosoftCalendarAdapter(userId);
        }
        default:
            throw new Error(`No calendar provider connected for user ${userId}`);
    }
}

// ════════════════════════════════════════════════════════════════
// EMAIL ADAPTERS
// ════════════════════════════════════════════════════════════════

export async function getEmailAdapter(userId: string): Promise<EmailAdapter> {
    const provider = await getProvider(userId);
    switch (provider) {
        case 'google': {
            const { GoogleEmailAdapter } = require('./google/google-email');
            return new GoogleEmailAdapter(userId);
        }
        case 'microsoft': {
            const { MicrosoftEmailAdapter } = require('./microsoft/microsoft-email');
            return new MicrosoftEmailAdapter(userId);
        }
        default:
            throw new Error(`No email provider connected for user ${userId}`);
    }
}

// ════════════════════════════════════════════════════════════════
// DOCUMENT ADAPTERS (multiple providers can coexist)
// ════════════════════════════════════════════════════════════════

export async function getDocumentAdapter(userId: string): Promise<DocumentAdapter> {
    const provider = await getProvider(userId);
    switch (provider) {
        case 'google': {
            const { GoogleDocumentAdapter } = require('./google/google-drive');
            return new GoogleDocumentAdapter(userId);
        }
        case 'microsoft': {
            const { MicrosoftDocumentAdapter } = require('./microsoft/microsoft-onedrive');
            return new MicrosoftDocumentAdapter(userId);
        }
        default:
            throw new Error(`No document provider connected for user ${userId}`);
    }
}

/**
 * Get all document adapters for a user (they may have Google Drive + Dropbox + Notion).
 */
export async function getAllDocumentAdapters(userId: string): Promise<DocumentAdapter[]> {
    const providers = await getConnectedProviders(userId);
    const adapters: DocumentAdapter[] = [];

    for (const provider of providers) {
        try {
            switch (provider) {
                case 'google': {
                    const { GoogleDocumentAdapter } = require('./google/google-drive');
                    adapters.push(new GoogleDocumentAdapter(userId));
                    break;
                }
                case 'microsoft': {
                    const { MicrosoftDocumentAdapter } = require('./microsoft/microsoft-onedrive');
                    adapters.push(new MicrosoftDocumentAdapter(userId));
                    break;
                }
                case 'dropbox': {
                    const { DropboxDocumentAdapter } = require('./dropbox/dropbox-documents');
                    adapters.push(new DropboxDocumentAdapter(userId));
                    break;
                }
                case 'box': {
                    const { BoxDocumentAdapter } = require('./box/box-documents');
                    adapters.push(new BoxDocumentAdapter(userId));
                    break;
                }
                case 'notion': {
                    const { NotionDocumentAdapter } = require('./notion/notion-adapter');
                    adapters.push(new NotionDocumentAdapter(userId));
                    break;
                }
            }
        } catch (err: any) {
            console.warn(`[AdapterFactory] Failed to create ${provider} document adapter: ${err.message}`);
        }
    }

    return adapters;
}

// ════════════════════════════════════════════════════════════════
// MESSAGING ADAPTERS
// ════════════════════════════════════════════════════════════════

export async function getSlackAdapter(userId: string) {
    const connected = await hasProvider(userId, 'slack');
    if (!connected) return null;
    const { SlackMessagingAdapter } = require('./slack/slack-messaging');
    return new SlackMessagingAdapter(userId);
}

// ════════════════════════════════════════════════════════════════
// MEETING/RECORDING ADAPTERS
// ════════════════════════════════════════════════════════════════

export async function getZoomAdapter(userId: string) {
    const connected = await hasProvider(userId, 'zoom');
    if (!connected) return null;
    const { ZoomMeetingAdapter } = require('./zoom/zoom-meetings');
    return new ZoomMeetingAdapter(userId);
}

// ════════════════════════════════════════════════════════════════
// PROJECT MANAGEMENT ADAPTERS
// ════════════════════════════════════════════════════════════════

export async function getProjectAdapter(userId: string) {
    const providers = await getConnectedProviders(userId);

    if (providers.includes('linear')) {
        const { LinearAdapter } = require('./linear/linear-adapter');
        return new LinearAdapter(userId);
    }
    if (providers.includes('jira')) {
        const { JiraAdapter } = require('./jira/jira-adapter');
        return new JiraAdapter(userId);
    }
    if (providers.includes('trello')) {
        const { TrelloAdapter } = require('./trello/trello-adapter');
        return new TrelloAdapter(userId);
    }
    if (providers.includes('asana')) {
        const { AsanaAdapter } = require('./asana/asana-adapter');
        return new AsanaAdapter(userId);
    }

    return null;
}

/**
 * Get all connected providers with their capabilities for a user.
 * Useful for the settings/connectors UI.
 */
export async function getProviderStatus(userId: string): Promise<Array<{
    provider: string;
    connected: boolean;
    capabilities: string[];
}>> {
    const connected = await getConnectedProviders(userId);

    return Object.entries(PROVIDER_CAPABILITIES).map(([provider, caps]) => ({
        provider,
        connected: connected.includes(provider),
        capabilities: Object.entries(caps).filter(([, v]) => v).map(([k]) => k),
    }));
}
