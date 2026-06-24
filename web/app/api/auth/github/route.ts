import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appName = process.env.GITHUB_APP_NAME;
    if (!appName) {
      console.error('GITHUB_APP_NAME environment variable is not set');
      return NextResponse.json(
        { error: 'GitHub integration is not configured' },
        { status: 500 }
      );
    }

    const installUrl = `https://github.com/apps/${appName}/installations/new?state=${userId}`;
    return NextResponse.redirect(installUrl);
  } catch (error) {
    console.error('GitHub auth redirect error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate GitHub connection' },
      { status: 500 }
    );
  }
}
