import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('GITHUB_WEBHOOK_SECRET is not set');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256') ?? '';

    if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('GitHub webhook signature verification failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = request.headers.get('x-github-event');
    const body = JSON.parse(payload);

    if (event === 'installation') {
      const installationId = body.installation?.id;
      const account = body.installation?.account;
      const action = body.action; // created, deleted, suspend, unsuspend, etc.

      if (!installationId) {
        return NextResponse.json({ ok: true });
      }

      if (action === 'deleted' || action === 'suspend') {
        // Mark installation as removed
        const existing = await prisma.gitHubInstallation.findUnique({
          where: { installationId },
        });

        if (existing) {
          await prisma.gitHubInstallation.delete({
            where: { installationId },
          });

          await prisma.dataConnector.updateMany({
            where: { userId: existing.userId, provider: 'github' },
            data: { status: 'DISCONNECTED' },
          });
        }

        console.log(`GitHub installation ${installationId} ${action}`);
      } else if (action === 'created' || action === 'unsuspend') {
        // For created/unsuspend without a known user, we log and skip.
        // The callback route handles user association during install flow.
        console.log(
          `GitHub installation ${action}: ${installationId} (${account?.login})`
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Activity events — find user and log for worker sync
    if (['pull_request', 'issues', 'pull_request_review', 'push'].includes(event ?? '')) {
      const installationId = body.installation?.id;

      if (installationId) {
        const installation = await prisma.gitHubInstallation.findUnique({
          where: { installationId },
          select: { userId: true },
        });

        if (installation) {
          console.log(
            `GitHub ${event} event for user ${installation.userId}, ` +
            `installation ${installationId}. Worker cron will sync.`
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Unhandled event type — acknowledge
    console.log(`GitHub webhook: unhandled event type "${event}"`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
