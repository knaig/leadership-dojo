import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/slack/callback - Handle Slack OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('[Slack OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Slack OAuth] Error from Slack:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    console.error('[Slack OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/slack/callback`;

    console.log('[Slack OAuth] Exchanging code for tokens:', {
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
    });

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    const responseText = await tokenResponse.text();
    console.log('[Slack OAuth] Token response status:', tokenResponse.status);

    const tokens = JSON.parse(responseText);

    if (!tokens.ok) {
      console.error('[Slack OAuth] Token exchange failed:', {
        error: tokens.error,
      });
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=token_exchange_failed&detail=${encodeURIComponent(tokens.error || 'Unknown error')}`
      );
    }

    console.log('[Slack OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasAuthedUser: !!tokens.authed_user,
      teamId: tokens.team?.id,
    });

    // Slack returns bot token as access_token and user token in authed_user
    const botToken = tokens.access_token;
    const userToken = tokens.authed_user?.access_token || null;
    const slackUserId = tokens.authed_user?.id || tokens.bot_user_id;
    const teamName = tokens.team?.name;

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      undefined, // Slack doesn't return email in token response
      teamName ? `${teamName} (Slack)` : undefined,
      undefined
    );
    console.log('[Slack OAuth] User exists in database:', userId);

    // Encrypt tokens before storing
    // Store bot token as access_token, user token as refresh_token
    const encAccessToken = encryptOAuthToken(botToken);
    const encRefreshToken = userToken ? encryptOAuthToken(userToken) : null;

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'slack' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: encAccessToken,
          refresh_token: encRefreshToken || existingAccount.refresh_token,
          expires_at: null, // Slack tokens don't expire
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Slack OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'slack',
          providerAccountId: slackUserId,
          access_token: encAccessToken,
          refresh_token: encRefreshToken,
          expires_at: null,
          token_type: tokens.token_type,
          scope: tokens.scope || null,
        },
      });
      console.log('[Slack OAuth] Created new account');
    }

    console.log('[Slack OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=slack_connected`);
  } catch (error: any) {
    console.error('[Slack OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=slack_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
