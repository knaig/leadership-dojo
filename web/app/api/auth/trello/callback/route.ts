import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExistsWithData } from '@/lib/ensure-user';
import { encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/auth/trello/callback - Handle Trello token callback
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get('token');
  const state = searchParams.get('state');

  console.log('[Trello OAuth] Callback received:', {
    hasToken: !!token,
    hasState: !!state,
  });

  if (!token || !state) {
    console.error('[Trello OAuth] Missing params:', { token: !!token, state: !!state });
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=missing_params`);
  }

  const userId = state;

  try {
    const apiKey = process.env.TRELLO_API_KEY;

    console.log('[Trello OAuth] Got token, fetching user profile:', {
      userId: userId.substring(0, 8) + '...',
      hasApiKey: !!apiKey,
    });

    // Get user profile from Trello
    const profileResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${apiKey}&token=${token}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!profileResponse.ok) {
      console.error('[Trello OAuth] Failed to fetch user profile:', profileResponse.status);
      return NextResponse.redirect(
        `${baseUrl}/settings/connectors?error=trello_failed&detail=${encodeURIComponent('Failed to fetch user profile')}`
      );
    }

    const profile = await profileResponse.json();
    console.log('[Trello OAuth] Got user profile:', { id: profile.id, username: profile.username });

    // Ensure user exists in database
    await ensureUserExistsWithData(
      userId,
      profile.email || undefined,
      profile.fullName,
      profile.avatarUrl ? `${profile.avatarUrl}/170.png` : undefined
    );
    console.log('[Trello OAuth] User exists in database:', userId);

    // Encrypt token before storing
    const encAccessToken = encryptOAuthToken(token);

    // Store token in Account table (Trello tokens don't expire when expiration=never)
    const existingAccount = await prisma.account.findFirst({
      where: { userId, provider: 'trello' },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: encAccessToken,
          expires_at: null,
          token_type: 'bearer',
        },
      });
      console.log('[Trello OAuth] Updated existing account');
    } else {
      await prisma.account.create({
        data: {
          userId,
          type: 'oauth',
          provider: 'trello',
          providerAccountId: profile.id,
          access_token: encAccessToken,
          refresh_token: null,
          expires_at: null,
          token_type: 'bearer',
          scope: 'read',
        },
      });
      console.log('[Trello OAuth] Created new account');
    }

    console.log('[Trello OAuth] Successfully stored token for user:', userId);
    return NextResponse.redirect(`${baseUrl}/settings/connectors?success=trello_connected`);
  } catch (error: any) {
    console.error('[Trello OAuth] Callback error:', error.message, error.stack);
    return NextResponse.redirect(
      `${baseUrl}/settings/connectors?error=trello_failed&detail=${encodeURIComponent(error.message)}`
    );
  }
}
