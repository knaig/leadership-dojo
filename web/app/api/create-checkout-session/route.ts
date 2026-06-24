import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { stripe, PLANS } from '@/lib/stripe';
import type { PlanTier } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { tier } = await req.json();

    if (tier !== 'PRO' && tier !== 'ENTERPRISE') {
      return NextResponse.json(
        { error: 'Invalid tier' },
        { status: 400 }
      );
    }

    const plan = PLANS[tier as PlanTier];

    // Ensure user exists in database
    await ensureUserExists(session.user.id);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { subscription: true }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get or create Stripe customer
    let customerId = user.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        name: session.user.name || undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Create or update subscription record
      if (user.subscription) {
        await prisma.subscription.update({
          where: { userId: user.id },
          data: { stripeCustomerId: customerId }
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId: user.id,
            stripeCustomerId: customerId,
            tier: 'FREE',
            status: 'ACTIVE',
          }
        });
      }
    }

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pricing?cancelled=true`,
      metadata: {
        userId: user.id,
        tier,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error('Create checkout session error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
