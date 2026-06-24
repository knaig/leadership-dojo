import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

// GET /api/auth/microsoft - Initiate Microsoft OAuth flow for connector access
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/sign-in?redirect_url=${encodeURIComponent('/api/auth/microsoft')}`);
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${baseUrl}/settings/connectors?error=microsoft_not_configured`);
  }

  const redirectUri = `${baseUrl}/api/auth/microsoft/callback`;
  const scopes = 'openid profile offline_access Calendars.Read Mail.Read Files.Read User.Read';

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('state', userId);
  authUrl.searchParams.set('prompt', 'consent');

  return NextResponse.redirect(authUrl.toString());
}
