import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/db';
import { PLANS } from '@/lib/stripe';
import type { PlanTier } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * Verify Razorpay payment after client-side checkout modal completes.
 *
 * The client sends:
 *   - razorpay_subscription_id
 *   - razorpay_payment_id
 *   - razorpay_signature
 *   - tier, isAnnual (from the original checkout request)
 *
 * We verify the signature, then activate the subscription.
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            razorpay_subscription_id,
            razorpay_payment_id,
            razorpay_signature,
            tier,
            isAnnual,
        } = body as {
            razorpay_subscription_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
            tier: PlanTier;
            isAnnual: boolean;
        };

        if (!razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
        }

        // Verify signature: HMAC SHA256 of "payment_id|subscription_id" with key_secret
        const secret = process.env.RAZORPAY_KEY_SECRET;
        if (!secret) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const expectedSignature = createHmac('sha256', secret)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            console.error('[Razorpay] Signature mismatch');
            return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
        }

        // Signature valid — activate subscription
        const plan = PLANS[tier];
        if (!plan) {
            return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
        }

        // Calculate period end (1 month or 1 year from now)
        const periodEnd = new Date();
        if (isAnnual) {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Upsert subscription
        await prisma.subscription.upsert({
            where: { userId },
            update: {
                tier,
                status: 'ACTIVE',
                razorpaySubscriptionId: razorpay_subscription_id,
                razorpayPlanId: plan.stripePriceId, // reuse field for plan reference
                stripeCurrentPeriodEnd: periodEnd,
                // All features enabled
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
                tokensUsedThisMonth: BigInt(0),
            },
            create: {
                userId,
                tier,
                status: 'ACTIVE',
                razorpaySubscriptionId: razorpay_subscription_id,
                razorpayPlanId: plan.stripePriceId,
                stripeCurrentPeriodEnd: periodEnd,
                monthlyCaseLimit: 999999,
                monthlyAiFeedbackLimit: 999999,
                hasGoogleIntegrations: true,
                hasAiFeedback: true,
                hasAgenticCoach: true,
                hasTeamFeatures: true,
                monthlyTokenLimit: plan.tokenLimit,
                llmSource: plan.llmSource,
                tokenResetDate: periodEnd,
            },
        });

        // Record payment
        const amountPaise = isAnnual
            ? (tier === 'ENTERPRISE' ? plan.annualPriceINR : plan.annualPriceINR) * 12 * 100
            : plan.priceINR * 100;

        await prisma.payment.create({
            data: {
                userId,
                razorpayPaymentId: razorpay_payment_id,
                gateway: 'razorpay',
                amount: amountPaise,
                currency: 'inr',
                status: 'succeeded',
                description: `${plan.name} subscription (${isAnnual ? 'annual' : 'monthly'})`,
            },
        });

        return NextResponse.json({ success: true, tier });
    } catch (error: any) {
        console.error('[Razorpay Verify] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Verification failed' },
            { status: 500 }
        );
    }
}
