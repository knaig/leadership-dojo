import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/microsoft/callback - Handle Microsoft OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // This is the userId
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Microsoft OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Microsoft OAuth] Error from Microsoft:', error, errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code || !state) {
    console.error('[Microsoft OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    // Exchange code for tokens
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;

    console.log('[Microsoft OAuth] Exchanging code for tokens:', {
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
      scope: 'openid profile offline_access Calendars.Read Mail.Read Files.Read User.Read',
    });

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Microsoft OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Microsoft OAuth] Token exchange failed:', {
        status: tokenResponse.status,
        error: errorData.error,
        errorDescription: errorData.error_description,
      });
      const errorDetail = errorData.error_description || errorData.error;
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=token_exchange_failed&detail=${encodeURIComponent(errorDetail)}`
      );
    }

    const tokens = JSON.parse(responseText);
    console.log('[Microsoft OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
    });

    // Get user profile from Microsoft Graph API
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('[Microsoft OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=microsoft_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profile = await profileResponse.json();
    console.log('[Microsoft OAuth] Got user profile:', { id: profile.id, email: profile.mail || profile.userPrincipalName });

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.mail || profile.userPrincipalName,
      profile.displayName,
      undefined // Microsoft Graph v1.0/me doesn't return photo URL directly
    );
    console.log('[Microsoft OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);
    const encRefreshToken = tokens.refresh_token ? encryptOAuthToken(tokens.refresh_token) : null;

    // Upsert on the unique (provider, providerAccountId) constraint to handle cases where
    // the account already exists (Clerk SSO, reconnect, or dev re-runs)
    const upsertedAccount = await prisma.account.upsert({
      where: { provider_providerAccountId: { provider: 'microsoft', providerAccountId: profile.id } },
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
        provider: 'microsoft',
        providerAccountId: profile.id,
        access_token: encAccessToken,
        refresh_token: encRefreshToken,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
    });
    console.log('[Microsoft OAuth] Upserted account:', upsertedAccount.id);

    console.log('[Microsoft OAuth] Successfully stored tokens for user:', userId);
    // Redirect to onboarding for new users, settings for existing
    const msUser = await prisma.user.findUnique({ where: { id: userId }, select: { onboardingComplete: true } });
    const redirectPath = msUser?.onboardingComplete
      ? '/settings/connectors?success=microsoft_connected'
      : '/onboarding?success=microsoft_connected';
    return NextResponse.redirect(`${baseUrl}${redirectPath}`);
  } catch (error: any) {
    console.error('[Microsoft OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=microsoft_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
