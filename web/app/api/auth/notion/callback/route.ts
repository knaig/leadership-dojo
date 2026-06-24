import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/notion/callback - Handle Notion OAuth callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  console.log('[Notion OAuth] Callback received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  if (error) {
    console.error('[Notion OAuth] Error from Notion:', error);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=oauth_failed&detail=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    console.error('[Notion OAuth] Missing params:', { code: !!code, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/notion/callback`;

    console.log('[Notion OAuth] Exchanging code for tokens:', {
      redirectUri,
      userId: userId.substring(0, 8) + '...',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });

    // Notion uses Basic auth for token exchange
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const responseText = await tokenResponse.text();
    console.log('[Notion OAuth] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'parse_error', message: responseText };
      }
      console.error('[Notion OAuth] Token exchange failed:', {
        status: tokenResponse.status,
        error: errorData.error,
        message: errorData.message,
      });
      const errorDetail = errorData.message || errorData.error;
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=token_exchange_failed&detail=${encodeURIComponent(errorDetail)}`
      );
    }

    const tokens = JSON.parse(responseText);
    console.log('[Notion OAuth] Got tokens:', {
      hasAccessToken: !!tokens.access_token,
      workspaceId: tokens.workspace_id,
      ownerType: tokens.owner?.type,
    });

    // Notion token response includes owner info and workspace_id
    const providerAccountId = tokens.owner?.user?.id || tokens.workspace_id;
    const ownerName = tokens.owner?.user?.name;
    const workspaceName = tokens.workspace_name;

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      undefined, // Notion doesn't return email in token response
      ownerName || workspaceName,
      tokens.owner?.user?.avatar_url
    );
    console.log('[Notion OAuth] User exists in database:', userId);

    // Encrypt token before storing (Notion tokens don't expire)
    const encAccessToken = encryptOAuthToken(tokens.access_token);

    // Store tokens in Account table
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'notion' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: encAccessToken,
          expires_at: null, // Notion tokens don't expire
          token_type: tokens.token_type || 'bearer',
          scope: null,
        },
      });
      console.log('[Notion OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'notion',
          providerAccountId,
          access_token: encAccessToken,
          refresh_token: null,
          expires_at: null,
          token_type: tokens.token_type || 'bearer',
          scope: null,
        },
      });
      console.log('[Notion OAuth] Created new account');
    }

    console.log('[Notion OAuth] Successfully stored tokens for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=notion_connected`);
  } catch (error: any) {
    console.error('[Notion OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=notion_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
