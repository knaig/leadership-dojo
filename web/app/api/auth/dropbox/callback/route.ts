import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/dropbox/callback - Handle Dropbox OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Dropbox OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Dropbox OAuth] Error from Dropbox:', error, errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code || !state) {
    console.error('[Dropbox OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.DROPBOX_CLIENT_ID;
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/dropbox/callback`;

    console.log('[Dropbox OAuth] Exchanging code for tokens:', {
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

    const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Dropbox OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Dropbox OAuth] Token exchange failed:', {
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
    console.log('[Dropbox OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
    });

    // Get user profile from Dropbox
    const profileResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: 'null',
    });

    if (!profileResponse.ok) {
      console.error('[Dropbox OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=dropbox_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profile = await profileResponse.json();
    console.log('[Dropbox OAuth] Got user profile:', { id: profile.account_id, email: profile.email });

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.email,
      profile.name?.display_name,
      profile.profile_photo_url
    );
    console.log('[Dropbox OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);
    const encRefreshToken = tokens.refresh_token ? encryptOAuthToken(tokens.refresh_token) : null;

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'dropbox' },
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
      console.log('[Dropbox OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'dropbox',
          providerAccountId: profile.account_id,
          access_token: encAccessToken,
          refresh_token: encRefreshToken,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Dropbox OAuth] Created new account');
    }

    console.log('[Dropbox OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=dropbox_connected`);
  } catch (error: any) {
    console.error('[Dropbox OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=dropbox_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
