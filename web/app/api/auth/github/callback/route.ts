import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

function generateGitHubJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + (10 * 60), iss: process.env.GITHUB_APP_ID },
    process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const installationId = searchParams.get('installation_id');
    const setupAction = searchParams.get('setup_action');

    // userId from state param (when initiated from our app) or from Clerk session
    const stateUserId = searchParams.get('state');
    const { userId: clerkUserId } = await auth();
    const userId = stateUserId || clerkUserId;

    if (!installationId || !userId) {
      return NextResponse.redirect(
        new URL('/settings/connectors?error=github_callback_failed', request.url)
      );
    }

    if (setupAction === 'install' || setupAction === 'update') {
      const token = generateGitHubJWT();

      const installationResponse = await fetch(
        `https://api.github.com/app/installations/${installationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      );

      if (!installationResponse.ok) {
        console.error(
          'Failed to fetch GitHub installation:',
          installationResponse.status,
          await installationResponse.text()
        );
        return NextResponse.redirect(
          new URL('/settings/connectors?error=github_callback_failed', request.url)
        );
      }

      const installation = await installationResponse.json();

      await prisma.gitHubInstallation.upsert({
        where: { installationId: parseInt(installationId) },
        create: {
          userId,
          installationId: parseInt(installationId),
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          permissions: installation.permissions ?? {},
          repositorySelection: installation.repository_selection ?? 'all',
        },
        update: {
          userId,
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          permissions: installation.permissions ?? {},
          repositorySelection: installation.repository_selection ?? 'all',
        },
      });

      await prisma.dataConnector.upsert({
        where: {
          userId_provider: { userId, provider: 'github' },
        },
        create: {
          userId,
          type: 'GITHUB',
          provider: 'github',
          status: 'CONNECTED',
        },
        update: {
          status: 'CONNECTED',
        },
      });

      return NextResponse.redirect(
        new URL('/settings/connectors?success=github_connected', request.url)
      );
    }

    // setup_action is something else (e.g., 'request') — just redirect
    return NextResponse.redirect(
      new URL('/settings/connectors', request.url)
    );
  } catch (error) {
    console.error('GitHub callback error:', error);
    return NextResponse.redirect(
      new URL('/settings/connectors?error=github_callback_failed', request.url)
    );
  }
}
