import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { analyzeWorkspaceContext, WorkspaceContextResult } from '@/lib/google-apis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { subscription: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has Google integrations enabled
    if (!user.subscription?.hasGoogleIntegrations) {
      return NextResponse.json(
        {
          error: 'Google integrations require Pro or Enterprise plan',
          upgrade: true
        },
        { status: 403 }
      );
    }

    // Check if Google account is connected
    const googleAccount = await prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: 'google',
      }
    });

    if (!googleAccount) {
      return NextResponse.json(
        {
          error: 'Google Workspace not connected',
          needsConnection: true
        },
        { status: 400 }
      );
    }

    // Fetch workspace context with resilient error handling
    const context = await analyzeWorkspaceContext(user.id);

    // Check for token issues that require reconnection
    const tokenErrors = ['invalid_grant', 'token_expired'];
    const hasTokenIssue = [context.calendar, context.drive, context.gmail].some(
      service => service.errorCode && tokenErrors.includes(service.errorCode)
    );

    if (hasTokenIssue) {
      return NextResponse.json(
        {
          error: 'Google connection expired. Please reconnect your account.',
          needsReconnection: true,
          context, // Still return partial data if any
        },
        { status: 401 }
      );
    }

    // Return full context with service statuses
    // Include legacy format for backward compatibility with existing components
    return NextResponse.json({
      context,
      legacyContext: {
        upcomingMeetings: context.calendar.data?.meetings || [],
        recentDocuments: context.drive.data?.documents || [],
        emailActivity: {
          count: context.gmail.data?.count || 0,
          threads: context.gmail.data?.threads || [],
        },
      },
    });
  } catch (error: any) {
    console.error('Workspace context error:', error);

    // Handle specific Google API errors at route level (shouldn't happen now with safe wrappers)
    if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired')) {
      return NextResponse.json(
        {
          error: 'Google connection expired. Please reconnect your account.',
          needsReconnection: true
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch workspace context' },
      { status: 500 }
    );
  }
}
