import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/notion - Initiate Notion OAuth flow
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/notion')}`);
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=notion_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/notion/callback`;

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
