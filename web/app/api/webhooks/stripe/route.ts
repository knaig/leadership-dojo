import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, PLANS } from '@/lib/stripe';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed:`, err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancellation(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Determine tier based on price ID
  let tier: 'FREE' | 'PRO' | 'ENTERPRISE' = 'FREE';

  if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
    tier = 'PRO';
  } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
    tier = 'ENTERPRISE';
  }

  const plan = PLANS[tier];

  // Token reset date = Stripe billing cycle end
  const periodEnd = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end * 1000)
    : new Date();

  // Find or create subscription
  const existingSubscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true }
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        tier,
        status: subscription.status === 'active' ? 'ACTIVE' :
                subscription.status === 'trialing' ? 'TRIALING' :
                subscription.status === 'past_due' ? 'PAST_DUE' : 'CANCELLED',
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: periodEnd,
        // All features enabled for all paid tiers
        monthlyCaseLimit: 999999,
        monthlyAiFeedbackLimit: 999999,
        hasGoogleIntegrations: true,
        hasAiFeedback: true,
        hasAgenticCoach: true,
        hasTeamFeatures: true,
        // Token metering
        monthlyTokenLimit: plan.tokenLimit,
        llmSource: plan.llmSource,
        tokenResetDate: periodEnd,
      }
    });
  }
}

async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      status: 'CANCELLED',
      tier: 'FREE',
      // Reset to free tier defaults
      monthlyCaseLimit: 999999,
      monthlyAiFeedbackLimit: 999999,
      hasGoogleIntegrations: true,
      hasAiFeedback: true,
      hasAgenticCoach: true,
      hasTeamFeatures: true,
      // Reset token metering to BYOLLM
      monthlyTokenLimit: 0,
      llmSource: 'byollm',
      tokensUsedThisMonth: BigInt(0),
    }
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const paymentIntentId = (invoice as any).payment_intent as string;

  // Find user by customer ID
  const subscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true }
  });

  if (subscription) {
    // Record payment
    await prisma.payment.create({
      data: {
        userId: subscription.userId,
        stripePaymentId: paymentIntentId,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'succeeded',
        description: invoice.description || 'Subscription payment',
        receiptUrl: invoice.hosted_invoice_url || null,
      }
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  await prisma.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      status: 'PAST_DUE',
    }
  });
}
