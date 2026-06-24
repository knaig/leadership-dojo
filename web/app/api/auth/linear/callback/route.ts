import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/linear/callback - Handle Linear OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  console.log('[Linear OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Linear OAuth] Error from Linear:', error, errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code || !state) {
    console.error('[Linear OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.LINEAR_CLIENT_ID;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/linear/callback`;

    console.log('[Linear OAuth] Exchanging code for tokens:', {
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

    const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Linear OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', error_description: responseText };
      }
      console.error('[Linear OAuth] Token exchange failed:', {
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
    console.log('[Linear OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
    });

    // Get user profile from Linear via GraphQL
    const profileResponse = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ viewer { id name email } }' }),
    });

    if (!profileResponse.ok) {
      console.error('[Linear OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=linear_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profileData = await profileResponse.json();
    const profile = profileData.data?.viewer;
    console.log('[Linear OAuth] Got user profile:', { id: profile?.id, email: profile?.email });

    if (!profile?.id) {
      console.error('[Linear OAuth] No viewer ID in response');
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=linear_failed&detail=${encodeURIComponent('Failed to get user ID from Linear')}`
      );
    }

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.email,
      profile.name,
      undefined
    );
    console.log('[Linear OAuth] User exists in database:', userId);

    // Encrypt token before storing
    const encAccessToken = encryptOAuthToken(tokens.access_token);

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'linear' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: encAccessToken,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope || null,
        },
      });
      console.log('[Linear OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'linear',
          providerAccountId: profile.id,
          access_token: encAccessToken,
          refresh_token: null,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope || null,
        },
      });
      console.log('[Linear OAuth] Created new account');
    }

    console.log('[Linear OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=linear_connected`);
  } catch (error: any) {
    console.error('[Linear OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=linear_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
