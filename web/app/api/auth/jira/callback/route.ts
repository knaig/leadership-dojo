import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/jira/callback - Handle Jira (Atlassian) OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Jira OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Jira OAuth] Error from Atlassian:', error, errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code || !state) {
    console.error('[Jira OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.JIRA_CLIENT_ID;
    const clientSecret = process.env.JIRA_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/jira/callback`;

    console.log('[Jira OAuth] Exchanging code for tokens:', {
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

    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Jira OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Jira OAuth] Token exchange failed:', {
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
    console.log('[Jira OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
    });

    // Get user profile from Atlassian
    const profileResponse = await fetch('https://api.atlassian.com/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('[Jira OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=jira_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profile = await profileResponse.json();
    console.log('[Jira OAuth] Got user profile:', { id: profile.account_id, email: profile.email });

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.email,
      profile.name,
      profile.picture
    );
    console.log('[Jira OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);
    const encRefreshToken = tokens.refresh_token ? encryptOAuthToken(tokens.refresh_token) : null;

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'jira' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: encAccessToken,
          refresh_token: encRefreshToken || existingAccount.refresh_token,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Jira OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'jira',
          providerAccountId: profile.account_id,
          access_token: encAccessToken,
          refresh_token: encRefreshToken,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Jira OAuth] Created new account');
    }

    console.log('[Jira OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=jira_connected`);
  } catch (error: any) {
    console.error('[Jira OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=jira_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
