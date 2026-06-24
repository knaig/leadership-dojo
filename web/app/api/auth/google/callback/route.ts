import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';
import { setupCalendarWatch } from '@/lib/connectors/calendar-watch';
import { setupGmailWatch } from '@/lib/connectors/gmail-watch';
import { setupDriveWatch } from '@/lib/connectors/drive-watch';

export const dynamic = 'force-dynamic';

// GET /api/auth/google/callback - Handle Google OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This is the userId
  const error = searchParams.get('error');

  console.log('[Google OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
    baseUrl
  });

  if (error) {
    console.error('[Google OAuth] Error from Google:', error);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    console.error('[Google OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    console.log('[Google OAuth] Exchanging code for tokens:', {
      redirectUri,
      userId: userId.substring(0, 8) + '...',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });

    const tokenBody = new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    // Intentionally not logging auth code, client_id, or tokens

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Google OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Google OAuth] Token exchange failed:', {
        status: tokenResponse.status,
        error: errorData.error,
        errorDescription: errorData.error_description,
      });
      const errorDetail = errorData.error_description || errorData.error;
      return NextResponse.redirect(`${baseUrl}/settings/connectors?error=token_exchange_failed&detail=${encodeURIComponent(errorDetail)}`);
    }

    const tokens = JSON.parse(responseText);
    console.log('[Google OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token
    });

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userInfoResponse.json();
    console.log('[Google OAuth] Got user info:', { id: userInfo.id, email: userInfo.email });

    // Ensure user exists in database (creates if needed for Clerk users)
    await ensureUserExistsWithData(
      userId,
      userInfo.email,
      userInfo.name,
      userInfo.picture
    );
    console.log('[Google OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);
    const encRefreshToken = encryptOAuthToken(tokens.refresh_token);

    // Upsert on the unique (provider, providerAccountId) constraint to handle cases where
    // the account already exists (Clerk SSO, reconnect, or dev re-runs)
    const upsertedAccount = await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: 'google', providerAccountId: userInfo.id } },
      update: {
        userId,
        access_token: encAccessToken,
        refresh_token: encRefreshToken || undefined,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
      create: {
        userId,
        type: 'oauth',
        provider: 'google',
        providerAccountId: userInfo.id,
        access_token: encAccessToken,
        refresh_token: encRefreshToken,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
    });
    console.log('[Google OAuth] Upserted account:', upsertedAccount.id);

    // Auto-create data connectors for all granted scopes
    const accountId = upsertedAccount.id;
    const scope = tokens.scope || '';
    const connectorDefs: { type: 'CALENDAR' | 'EMAIL' | 'DOCUMENTS'; provider: string; scope: string }[] = [
      { type: 'CALENDAR', provider: 'gcal', scope: 'calendar' },
      { type: 'EMAIL', provider: 'gmail', scope: 'gmail' },
      { type: 'DOCUMENTS', provider: 'gdrive', scope: 'drive' },
    ];

    for (const def of connectorDefs) {
      if (!scope.includes(def.scope)) continue;
      const exists = await prisma.dataConnector.findFirst({ where: { userId, provider: def.provider } });
      if (!exists) {
        await prisma.dataConnector.create({
          data: {
            userId,
            type: def.type,
            provider: def.provider,
            status: 'CONNECTED',
            accountId: accountId || null,
            syncFrequency: 60,
            permissions: {},
          },
        });
        console.log(`[Google OAuth] Created ${def.type} connector`);
      }
    }

    // Create SyncStatus records for each connector
    const syncConnectorMap: Record<string, string> = { gcal: 'calendar', gmail: 'email', gdrive: 'drive' };
    for (const def of connectorDefs) {
      if (!scope.includes(def.scope)) continue;
      const syncConnector = syncConnectorMap[def.provider];
      await prisma.syncStatus.upsert({
        where: { userId_connector: { userId, connector: syncConnector } },
        create: { userId, connector: syncConnector, status: 'idle' },
        update: {},
      });
    }

    // Trigger immediate sync via pg-boss jobs
    try {
      const payload = JSON.stringify({ userId });
      const syncJobs = ['calendar-sync', 'email-sync', 'drive-sync'].map(name =>
        prisma.$queryRaw`
          INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
          VALUES (
            ${name},
            ${payload}::jsonb,
            'created',
            2, 0, 30, 300,
            now(),
            now() + interval '1 day'
          )
        `
      );
      await Promise.all(syncJobs);
      console.log('[Google OAuth] Queued immediate sync jobs (calendar, email, drive)');
    } catch (e: any) {
      console.error('[Google OAuth] Failed to queue sync:', e.message);
    }

    // Set up watch channels for real-time push notifications (non-blocking)
    try {
      const watchResults = await Promise.allSettled([
        scope.includes('calendar') ? setupCalendarWatch(userId) : Promise.resolve(null),
        scope.includes('gmail') ? setupGmailWatch(userId) : Promise.resolve(null),
        scope.includes('drive') ? setupDriveWatch(userId) : Promise.resolve(null),
      ]);
      const succeeded = watchResults.filter(r => r.status === 'fulfilled' && r.value && (r.value as any).success).length;
      console.log(`[Google OAuth] Watch channels: ${succeeded}/3 set up successfully`);
    } catch (e: any) {
      console.warn('[Google OAuth] Watch channel setup failed (non-fatal):', e.message);
    }

    console.log('[Google OAuth] Successfully stored tokens for user:', userId);

    // Redirect to dashboard for onboarding flow, settings for existing users
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboardingComplete: true } });
    const redirectPath = user?.onboardingComplete ? '/settings/connectors?success=google_connected' : '/onboarding?google=connected';
    return NextResponse.redirect(`${baseUrl}${redirectPath}`);
  } catch (error: any) {
    console.error('[Google OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=callback_failed&detail=${encodeURIComponent(error.message)}`);
  }
}
