import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/db';
import { PLANS } from '@/lib/stripe';

/**
 * Razorpay Webhook Handler
 *
 * Handles subscription lifecycle events:
 * - subscription.charged — recurring payment succeeded
 * - subscription.cancelled — user cancelled
 * - subscription.halted — payment failures exhausted retries
 * - payment.captured — one-time payment captured (not used for subscriptions)
 */
export async function POST(req: Request) {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
        return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    // Verify webhook signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not configured');
        return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const expectedSignature = createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    if (expectedSignature !== signature) {
        console.error('[Razorpay Webhook] Signature mismatch');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    try {
        const event = JSON.parse(body);
        const eventType = event.event;

        console.log(`[Razorpay Webhook] Event: ${eventType}`);

        switch (eventType) {
            case 'subscription.charged': {
                // Recurring payment succeeded — extend period
                const sub = event.payload.subscription?.entity;
                const payment = event.payload.payment?.entity;
                if (sub?.id) {
                    await handleSubscriptionCharged(sub, payment);
                }
                break;
            }

            case 'subscription.cancelled':
            case 'subscription.halted': {
                // Subscription ended
                const sub = event.payload.subscription?.entity;
                if (sub?.id) {
                    await handleSubscriptionEnded(sub.id);
                }
                break;
            }

            default:
                console.log(`[Razorpay Webhook] Unhandled: ${eventType}`);
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('[Razorpay Webhook] Error:', error);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }
}

async function handleSubscriptionCharged(sub: any, payment: any) {
    const subscriptionId = sub.id;

    const existing = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId: subscriptionId },
    });

    if (!existing) {
        console.warn(`[Razorpay] No subscription found for ${subscriptionId}`);
        return;
    }

    // Determine tier from notes or existing record
    const tier = (sub.notes?.tier as 'PRO' | 'ENTERPRISE') || existing.tier;
    const plan = PLANS[tier];

    // Extend period
    const periodEnd = new Date();
    if (sub.notes?.isAnnual === 'true') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await prisma.subscription.update({
        where: { id: existing.id },
        data: {
            status: 'ACTIVE',
            stripeCurrentPeriodEnd: periodEnd,
            tokenResetDate: periodEnd,
            tokensUsedThisMonth: BigInt(0), // Reset tokens on renewal
            monthlyTokenLimit: plan.tokenLimit,
            llmSource: plan.llmSource,
        },
    });

    // Record payment
    if (payment?.id) {
        await prisma.payment.create({
            data: {
                userId: existing.userId,
                razorpayPaymentId: payment.id,
                gateway: 'razorpay',
                amount: payment.amount || 0, // in paise
                currency: payment.currency || 'inr',
                status: 'succeeded',
                description: 'Subscription renewal',
            },
        });
    }
}

async function handleSubscriptionEnded(subscriptionId: string) {
    const existing = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId: subscriptionId },
    });

    if (!existing) return;

    await prisma.subscription.update({
        where: { id: existing.id },
        data: {
            status: 'CANCELLED',
            tier: 'FREE',
            monthlyCaseLimit: 999999,
            monthlyAiFeedbackLimit: 999999,
            hasGoogleIntegrations: true,
            hasAiFeedback: true,
            hasAgenticCoach: true,
            hasTeamFeatures: true,
            monthlyTokenLimit: 0,
            llmSource: 'byollm',
            tokensUsedThisMonth: BigInt(0),
        },
    });
}
