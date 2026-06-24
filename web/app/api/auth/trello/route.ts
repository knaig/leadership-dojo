import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/trello - Initiate Trello token-based auth flow
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/trello')}`);
  }

  const apiKey = process.env.TRELLO_API_KEY;
  if (!apiKey) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=trello_not_configured`);
  }

  const callbackUrl = `${baseUrl}/api/auth/trello/callback?state=${userId}`;

  const authUrl = new URL('https://trello.com/1/authorize');
  authUrl.searchParams.set('expiration', 'never');
  authUrl.searchParams.set('name', 'MiraCOS');
  authUrl.searchParams.set('scope', 'read');
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('key', apiKey);
  authUrl.searchParams.set('return_url', callbackUrl);

  return NextResponse.redirect(authUrl.toString());
}
