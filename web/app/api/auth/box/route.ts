import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/box - Initiate Box OAuth flow
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/box')}`);
  }

  const clientId = process.env.BOX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=box_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/box/callback`;

  const authUrl = new URL('https://account.box.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
