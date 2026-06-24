import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/zoom/callback - Handle Zoom OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('[Zoom OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Zoom OAuth] Error from Zoom:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    console.error('[Zoom OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/zoom/callback`;

    console.log('[Zoom OAuth] Exchanging code for tokens:', {
      redirectUri,
      userId: userId.substring(0, 8) + '...',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });

    // Zoom uses Basic auth for token exchange
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenBody = new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Zoom OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Zoom OAuth] Token exchange failed:', {
        status: tokenResponse.status,
        error: errorData.error,
        errorDescription: errorData.reason || errorData.error_description,
      });
      const errorDetail = errorData.reason || errorData.error_description || errorData.error;
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=token_exchange_failed&detail=${encodeURIComponent(errorDetail)}`
      );
    }

    const tokens = JSON.parse(responseText);
    console.log('[Zoom OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
    });

    // Get user profile from Zoom
    const profileResponse = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('[Zoom OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=zoom_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profile = await profileResponse.json();
    console.log('[Zoom OAuth] Got user profile:', { id: profile.id, email: profile.email });

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.email,
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || undefined,
      profile.pic_url
    );
    console.log('[Zoom OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);
    const encRefreshToken = tokens.refresh_token ? encryptOAuthToken(tokens.refresh_token) : null;

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'zoom' },
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
      console.log('[Zoom OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'zoom',
          providerAccountId: profile.id,
          access_token: encAccessToken,
          refresh_token: encRefreshToken,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Zoom OAuth] Created new account');
    }

    console.log('[Zoom OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=zoom_connected`);
  } catch (error: any) {
    console.error('[Zoom OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=zoom_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
