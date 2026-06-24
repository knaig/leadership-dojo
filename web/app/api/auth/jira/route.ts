import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/jira - Initiate Jira (Atlassian) OAuth flow
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/jira')}`);
  }

  const clientId = process.env.JIRA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=jira_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/jira/callback`;
  const scopes = 'read:jira-work read:jira-user offline_access';

  const authUrl = new URL('https://auth.atlassian.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('audience', 'api.atlassian.com');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
