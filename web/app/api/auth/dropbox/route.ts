import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/dropbox - Initiate Dropbox OAuth flow
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/dropbox')}`);
  }

  const clientId = process.env.DROPBOX_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=dropbox_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/dropbox/callback`;

  const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('token_access_type', 'offline');
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
