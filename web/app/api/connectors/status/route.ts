import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/connectors/status - Check Google account status and available scopes
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the user's Google account
    const googleAccount = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'google'
      },
      select: {
        id: true,
        access_token: true,
        refresh_token: true,
        expires_at: true,
        scope: true
      }
    });

    if (!googleAccount) {
      return NextResponse.json({
        connected: false,
        hasTokens: false,
        scopes: [],
        hasMissingScopes: true,
        missingScopeLabels: ['Google Calendar', 'Gmail', 'Google Drive'],
        message: 'Google account not connected. Please connect your Google account.'
      });
    }

    // Check if we have tokens
    const hasAccessToken = !!googleAccount.access_token;
    const hasRefreshToken = !!googleAccount.refresh_token;

    // Check if token is expired
    let isExpired = false;
    if (googleAccount.expires_at) {
      const expiresAt = googleAccount.expires_at * 1000; // Convert to ms
      isExpired = Date.now() > expiresAt;
    }

    // Parse scopes
    const scopes = googleAccount.scope ? googleAccount.scope.split(' ') : [];

    // Determine available connectors based on scopes
    const availableConnectors = {
      gmail: scopes.some(s => s.includes('gmail')),
      gcal: scopes.some(s => s.includes('calendar')),
      gdrive: scopes.some(s => s.includes('drive'))
    };

    // Check which required scopes are missing
    const requiredScopes = [
      { key: 'calendar', scope: 'calendar.readonly', label: 'Google Calendar' },
      { key: 'gmail', scope: 'gmail.readonly', label: 'Gmail' },
      { key: 'drive', scope: 'drive.readonly', label: 'Google Drive' },
    ];
    const missingScopeLabels = requiredScopes
      .filter(r => !scopes.some(s => s.includes(r.scope)))
      .map(r => r.label);

    // Only consider it a problem if we have no refresh token
    // Having a refresh token means we can auto-refresh, so isExpired is not an issue
    const needsReconnect = !hasRefreshToken;

    return NextResponse.json({
      connected: true,
      hasTokens: hasAccessToken || hasRefreshToken,
      hasAccessToken,
      hasRefreshToken,
      isExpired,
      needsReconnect,
      scopes,
      availableConnectors,
      // Scope upgrade required if any required scope is missing
      hasMissingScopes: missingScopeLabels.length > 0,
      missingScopeLabels,
      message: missingScopeLabels.length > 0
        ? `Missing permissions: ${missingScopeLabels.join(', ')}. Please reconnect Google to grant access.`
        : !hasRefreshToken
          ? 'Missing refresh token. Please reconnect Google account.'
          : 'Google account connected and tokens available.'
    });
  } catch (error) {
    console.error('Failed to check connector status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
