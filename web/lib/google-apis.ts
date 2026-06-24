import { google } from 'googleapis';
import { prisma } from './db';
import { encryptOAuthToken, decryptOAuthToken } from './encryption';

// ============================================================================
// Types for Resilient Service Fetching
// ============================================================================

export type ServiceStatus = 'success' | 'error' | 'disabled';

export interface ServiceResult<T> {
  status: ServiceStatus;
  data: T | null;
  error?: string;
  errorCode?: string;
}

export interface CalendarData {
  meetings: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
    attendees: string[];
    description?: string;
  }>;
}

export interface DriveData {
  documents: Array<{
    id: string;
    name: string;
    modifiedTime: string;
    webViewLink?: string;
  }>;
}

export interface GmailData {
  count: number;
  threads: Array<{
    id: string;
    threadId: string;
    snippet: string;
  }>;
}

export interface WorkspaceContextResult {
  calendar: ServiceResult<CalendarData>;
  drive: ServiceResult<DriveData>;
  gmail: ServiceResult<GmailData>;
  overallStatus: 'full' | 'partial' | 'none';
}

// ============================================================================
// Google OAuth Client
// ============================================================================

/**
 * Get Google OAuth2 client with user's access token
 */
export async function getGoogleClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  });

  if (!account || !account.access_token) {
    throw new Error('Google account not connected');
  }

  // Decrypt tokens from storage (migration-safe: handles both encrypted and plaintext)
  const accessToken = decryptOAuthToken(account.access_token);
  const refreshToken = decryptOAuthToken(account.refresh_token);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  // Handle token refresh — encrypt before persisting
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: encryptOAuthToken(tokens.access_token),
          refresh_token: encryptOAuthToken(tokens.refresh_token),
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        },
      });
    } else if (tokens.access_token) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: encryptOAuthToken(tokens.access_token),
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        },
      });
    }
  });

  return oauth2Client;
}

/**
 * Google Drive Integration
 */
export async function getDriveFiles(userId: string, folderId?: string) {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: 'v3', auth });

  const query = folderId
    ? `'${folderId}' in parents and trashed=false`
    : `trashed=false`;

  const response = await drive.files.list({
    q: query,
    pageSize: 100,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size)',
    orderBy: 'modifiedTime desc',
  });

  return response.data.files || [];
}

export async function getFileContent(userId: string, fileId: string) {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: 'v3', auth });

  // Get file metadata first
  const metadata = await drive.files.get({
    fileId,
    fields: 'name, mimeType',
  });

  const mimeType = metadata.data.mimeType;

  // Export Google Docs as plain text
  if (mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export({
      fileId,
      mimeType: 'text/plain',
    });
    return {
      name: metadata.data.name || 'Untitled',
      content: response.data as string,
      mimeType: 'text/plain',
    };
  }

  // For other file types, get content directly
  const response = await drive.files.get({
    fileId,
    alt: 'media',
  });

  return {
    name: metadata.data.name || 'Untitled',
    content: response.data as string,
    mimeType: mimeType || 'application/octet-stream',
  };
}

export async function searchDriveFiles(userId: string, query: string) {
  const auth = await getGoogleClient(userId);
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q: `fullText contains '${query}' and trashed=false`,
    pageSize: 50,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
    orderBy: 'modifiedTime desc',
  });

  return response.data.files || [];
}

/**
 * Google Calendar Integration
 */
export async function getCalendarEvents(
  userId: string,
  options: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  } = {}
) {
  const auth = await getGoogleClient(userId);
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = options.timeMin || new Date();
  const timeMax = options.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const maxResults = options.maxResults || 50;

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

export async function getUpcomingMeetings(userId: string, days: number = 7) {
  const events = await getCalendarEvents(userId, {
    timeMin: new Date(),
    timeMax: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  });

  // Filter to only events with attendees (meetings)
  return events.filter(event => event.attendees && event.attendees.length > 0);
}

/**
 * Gmail Integration
 */
export async function getRecentEmails(
  userId: string,
  options: {
    maxResults?: number;
    query?: string;
  } = {}
) {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const { maxResults = 20, query = '' } = options;

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
  });

  if (!response.data.messages) {
    return [];
  }

  // Fetch full message details
  const messages = await Promise.all(
    response.data.messages.slice(0, 10).map(async (message) => {
      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });
      return details.data;
    })
  );

  return messages;
}

export async function getEmailThread(userId: string, threadId: string) {
  const auth = await getGoogleClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
  });

  return response.data;
}

// ============================================================================
// Error Code Extraction Helper
// ============================================================================

function extractErrorCode(error: any): string | undefined {
  const message = error.message || '';
  if (message.includes('invalid_grant')) return 'invalid_grant';
  if (message.includes('Token has been expired')) return 'token_expired';
  if (message.includes('insufficient_permissions')) return 'insufficient_permissions';
  if (message.includes('accessNotConfigured')) return 'api_not_enabled';
  if (message.includes('quotaExceeded')) return 'quota_exceeded';
  if (message.includes('Request had insufficient authentication scopes')) return 'insufficient_scopes';
  return undefined;
}

// ============================================================================
// Safe Wrapper Functions with Individual Error Handling
// ============================================================================

async function fetchCalendarSafe(userId: string): Promise<ServiceResult<CalendarData>> {
  try {
    console.log('[Google Calendar] Fetching meetings for user:', userId);
    const meetings = await getUpcomingMeetings(userId, 7);
    console.log('[Google Calendar] Successfully fetched', meetings.length, 'meetings');
    return {
      status: 'success',
      data: {
        meetings: meetings.map(m => ({
          id: m.id || '',
          summary: m.summary || 'Untitled',
          start: m.start?.dateTime || m.start?.date || '',
          end: m.end?.dateTime || m.end?.date || '',
          attendees: m.attendees?.map(a => a.email || '') || [],
          description: m.description || undefined,
        })),
      },
    };
  } catch (error: any) {
    console.error('[Google Calendar] Fetch failed:', error.message);
    return {
      status: 'error',
      data: null,
      error: error.message || 'Failed to fetch calendar events',
      errorCode: extractErrorCode(error),
    };
  }
}

async function fetchDriveSafe(userId: string): Promise<ServiceResult<DriveData>> {
  try {
    console.log('[Google Drive] Fetching files for user:', userId);
    const recentFiles = await getDriveFiles(userId);
    const lastWeekFiles = recentFiles.filter(file => {
      const modifiedTime = new Date(file.modifiedTime || 0);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return modifiedTime > weekAgo;
    });
    console.log('[Google Drive] Successfully fetched', lastWeekFiles.length, 'recent files');
    return {
      status: 'success',
      data: {
        documents: lastWeekFiles.map(f => ({
          id: f.id || '',
          name: f.name || 'Untitled',
          modifiedTime: f.modifiedTime || '',
          webViewLink: f.webViewLink || undefined,
        })),
      },
    };
  } catch (error: any) {
    console.error('[Google Drive] Fetch failed:', error.message);
    return {
      status: 'error',
      data: null,
      error: error.message || 'Failed to fetch drive files',
      errorCode: extractErrorCode(error),
    };
  }
}

async function fetchGmailSafe(userId: string): Promise<ServiceResult<GmailData>> {
  try {
    console.log('[Gmail] Fetching emails for user:', userId);
    const recentEmails = await getRecentEmails(userId, {
      maxResults: 50,
      query: 'newer_than:7d',
    });
    console.log('[Gmail] Successfully fetched', recentEmails.length, 'emails');
    return {
      status: 'success',
      data: {
        count: recentEmails.length,
        threads: recentEmails.map(e => ({
          id: e.id || '',
          threadId: e.threadId || '',
          snippet: e.snippet || '',
        })),
      },
    };
  } catch (error: any) {
    console.error('[Gmail] Fetch failed:', error.message);
    return {
      status: 'error',
      data: null,
      error: error.message || 'Failed to fetch emails',
      errorCode: extractErrorCode(error),
    };
  }
}

// ============================================================================
// Context Analysis - Extract insights from Google Workspace (Resilient)
// ============================================================================

/**
 * Fetches all Google services in parallel with individual error handling.
 * Returns partial results if some services fail.
 */
export async function analyzeWorkspaceContext(userId: string): Promise<WorkspaceContextResult> {
  console.log('[Workspace Context] Starting parallel fetch for all services');

  // Fetch all services in parallel - each wrapped in error handling
  const [calendarResult, driveResult, gmailResult] = await Promise.all([
    fetchCalendarSafe(userId),
    fetchDriveSafe(userId),
    fetchGmailSafe(userId),
  ]);

  // Calculate overall status
  const successCount = [calendarResult, driveResult, gmailResult]
    .filter(r => r.status === 'success').length;

  const overallStatus: 'full' | 'partial' | 'none' =
    successCount === 3 ? 'full' :
    successCount > 0 ? 'partial' : 'none';

  console.log('[Workspace Context] Completed. Status:', overallStatus,
    '- Calendar:', calendarResult.status,
    '- Drive:', driveResult.status,
    '- Gmail:', gmailResult.status);

  return {
    calendar: calendarResult,
    drive: driveResult,
    gmail: gmailResult,
    overallStatus,
  };
}

/**
 * Legacy format for backward compatibility
 */
export async function analyzeWorkspaceContextLegacy(userId: string) {
  const result = await analyzeWorkspaceContext(userId);

  return {
    upcomingMeetings: result.calendar.data?.meetings || [],
    recentDocuments: result.drive.data?.documents || [],
    emailActivity: {
      count: result.gmail.data?.count || 0,
      threads: result.gmail.data?.threads || [],
    },
  };
}
