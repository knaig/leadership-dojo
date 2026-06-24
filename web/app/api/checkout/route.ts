import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getStripe, PLANS } from '@/lib/stripe';
import { getRazorpay, getRazorpayPlanId } from '@/lib/razorpay';
import type { PlanTier } from '@/lib/stripe';
import { BRAND } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { tier, currency, isAnnual, couponCode } = body as {
            tier: PlanTier;
            currency: 'USD' | 'INR';
            isAnnual: boolean;
            couponCode?: string;
        };

        const plan = PLANS[tier];
        if (!plan || tier === 'FREE') {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // ─── Razorpay (INR) ───
        if (currency === 'INR') {
            const razorpay = getRazorpay();
            const planId = getRazorpayPlanId(tier, isAnnual);

            if (!planId) {
                return NextResponse.json({
                    error: 'Razorpay plan not configured. Please contact support.',
                }, { status: 500 });
            }

            // Create a Razorpay Subscription
            const subscription = await razorpay.subscriptions.create({
                plan_id: planId,
                total_count: isAnnual ? 1 : 12, // 1 yearly charge or 12 monthly
                quantity: 1,
                notes: {
                    userId,
                    tier,
                    isAnnual: isAnnual ? 'true' : 'false',
                    llmSource: plan.llmSource,
                    tokenLimit: String(plan.tokenLimit),
                },
            });

            // Return subscription ID + key for client-side Razorpay checkout modal
            return NextResponse.json({
                gateway: 'razorpay',
                subscriptionId: subscription.id,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID,
                planName: `${BRAND.name} ${plan.name}`,
                amount: isAnnual ? plan.annualPriceINR * 100 : plan.priceINR * 100, // paise
                currency: 'INR',
                tier,
                isAnnual,
            });
        }

        // ─── Stripe (USD) ───
        const stripe = getStripe();

        const priceInCents = isAnnual
            ? plan.annualPriceUSD * 100
            : plan.priceUSD * 100;

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            metadata: {
                userId,
                tier,
                isAnnual: isAnnual ? 'true' : 'false',
                llmSource: plan.llmSource,
                tokenLimit: String(plan.tokenLimit),
            },
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${BRAND.name} ${plan.name}`,
                            description: plan.tagline,
                        },
                        unit_amount: priceInCents,
                        recurring: {
                            interval: isAnnual ? 'year' : 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?checkout=success&tier=${tier}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pricing?checkout=cancelled`,
            client_reference_id: userId,
            ...(couponCode && { discounts: [{ coupon: couponCode }] }),
        });

        return NextResponse.json({ gateway: 'stripe', url: session.url });
    } catch (error: any) {
        console.error('[Checkout] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Checkout failed' },
            { status: 500 }
        );
    }
}
