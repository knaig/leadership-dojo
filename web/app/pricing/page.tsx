'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { Check, Sparkles, Key, ArrowRight } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';

type Currency = 'USD' | 'INR';

const PLANS = [
  {
    tier: 'PRO' as const,
    name: 'Starter',
    tagline: 'All features, bring your own key',
    priceUSD: 9,
    priceINR: 499,
    annualPriceUSD: 7,
    annualPriceINR: 399,
    popular: false,
    features: [
      'All coaching features',
      'Bring your own LLM key',
      'Google Workspace integrations',
      'Proactive coaching by Mira',
      'Stakeholder relationship graph',
      'Goal tracking & analytics',
      'Priority support',
    ],
    cta: 'Get Starter',
    icon: Key,
    llmNote: 'Requires your own OpenAI, Gemini, or Anthropic API key',
  },
  {
    tier: 'ENTERPRISE' as const,
    name: 'Pro',
    tagline: 'LLM included, zero setup',
    priceUSD: 29,
    priceINR: 1499,
    annualPriceUSD: 23,
    annualPriceINR: 1199,
    popular: true,
    features: [
      'Everything in Starter',
      'Gemini LLM included — no API key needed',
      '5M tokens/month',
      'Google Workspace integrations',
      'Proactive coaching by Mira',
      'Stakeholder relationship graph',
      'Goal tracking & analytics',
      'Priority support',
    ],
    cta: 'Get Pro',
    icon: Sparkles,
    llmNote: 'Gemini 2.0 Flash included. Add your own key anytime.',
  },
];

function Toggle({
  leftLabel,
  rightLabel,
  isRight,
  onToggle,
  badge,
}: {
  leftLabel: string;
  rightLabel: string;
  isRight: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm font-medium select-none ${!isRight ? 'text-white' : 'text-slate-500'}`}>
        {leftLabel}
      </span>
      <button
        onClick={onToggle}
        aria-label={`Toggle ${leftLabel} or ${rightLabel}`}
        className="relative w-12 h-[26px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        style={{ backgroundColor: isRight ? '#6366f1' : 'rgba(255,255,255,0.15)' }}
      >
        <span
          className="absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: isRight ? 'translateX(22px)' : 'translateX(0)' }}
        />
      </button>
      <span className={`text-sm font-medium select-none ${isRight ? 'text-white' : 'text-slate-500'}`}>
        {rightLabel}
      </span>
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-400">
          {badge}
        </span>
      )}
    </div>
  );
}

export default function PricingPage() {
  const { userId } = useAuth();
  const [currency, setCurrency] = useState<Currency>('USD');
  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  useEffect(() => {
    const lang = navigator.language || '';
    if (lang.includes('hi') || lang.includes('en-IN')) {
      setCurrency('INR');
    }
  }, []);

  const handleCheckout = async (tier: string) => {
    if (!userId) {
      window.location.href = '/sign-up';
      return;
    }
    setLoadingTier(tier);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, currency, isAnnual }),
      });
      const data = await res.json();

      if (data.gateway === 'razorpay') {
        await openRazorpayCheckout(data, tier);
      } else if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  };

  const openRazorpayCheckout = (data: any, tier: string) => {
    return new Promise<void>((resolve, reject) => {
      const loadScript = () => {
        if ((window as any).Razorpay) return Promise.resolve();
        return new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => res();
          script.onerror = () => rej(new Error('Failed to load Razorpay'));
          document.body.appendChild(script);
        });
      };

      loadScript().then(() => {
        const options = {
          key: data.razorpayKeyId,
          subscription_id: data.subscriptionId,
          name: BRAND.name,
          description: data.planName,
          handler: async (response: any) => {
            try {
              const verifyRes = await fetch('/api/checkout/razorpay-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  tier,
                  isAnnual,
                }),
              });
              const result = await verifyRes.json();
              if (result.success) {
                window.location.href = `/dashboard?checkout=success&tier=${tier}`;
              } else {
                alert(result.error || 'Payment verification failed');
              }
            } catch {
              alert('Payment verification failed. Please contact support.');
            }
            resolve();
          },
          modal: { ondismiss: () => resolve() },
          theme: { color: '#6366f1' },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }).catch(() => {
        alert('Failed to load payment gateway. Please try again.');
        reject();
      });
    });
  };

  const formatPrice = (plan: (typeof PLANS)[0]) => {
    if (currency === 'INR') {
      const price = isAnnual ? plan.annualPriceINR : plan.priceINR;
      return `\u20B9${price}`;
    }
    const price = isAnnual ? plan.annualPriceUSD : plan.priceUSD;
    return `$${price}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-3">
          <MiraLogo size={36} />
          <span className="text-lg font-semibold">{BRAND.name}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/" className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Home
          </Link>
          {userId ? (
            <Link href="/dashboard" className="px-4 py-2 text-sm bg-indigo-500 hover:bg-indigo-500/90 rounded-lg transition-colors font-medium">
              Dashboard
            </Link>
          ) : (
            <Link href="/sign-up" className="px-4 py-2 text-sm bg-indigo-500 hover:bg-indigo-500/90 rounded-lg transition-colors font-medium">
              Get started
            </Link>
          )}
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          All features included on every plan. The only difference is who provides the AI.
        </p>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap items-center justify-center gap-8 mb-12 px-6">
        <Toggle
          leftLabel="$ USD"
          rightLabel="&#8377; INR"
          isRight={currency === 'INR'}
          onToggle={() => setCurrency(currency === 'USD' ? 'INR' : 'USD')}
        />
        <Toggle
          leftLabel="Monthly"
          rightLabel="Annual"
          isRight={isAnnual}
          onToggle={() => setIsAnnual(!isAnnual)}
          badge={isAnnual ? 'Save ~20%' : undefined}
        />
      </div>

      {/* Pricing Cards */}
      <div className="max-w-3xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isPro = plan.popular;
          return (
            <div
              key={plan.tier}
              className={`relative rounded-2xl p-8 flex flex-col transition-all duration-300 hover:scale-[1.02] ${
                isPro
                  ? 'bg-white/[0.07] border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.1)]'
                  : 'bg-white/[0.04] border border-white/[0.08]'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-xs font-bold px-4 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg">
                    RECOMMENDED
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                  isPro ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-white/10'
                }`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-sm mt-1 text-slate-400">{plan.tagline}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">
                    {formatPrice(plan)}
                  </span>
                  <span className="text-sm text-slate-500">/month</span>
                </div>
                {isAnnual && (
                  <p className="text-xs mt-1 text-slate-500">Billed annually</p>
                )}
              </div>

              {/* LLM Note */}
              <div className={`rounded-lg p-3 mb-6 text-xs ${
                isPro ? 'bg-indigo-500/10 text-indigo-300' : 'bg-white/[0.04] text-slate-400'
              }`}>
                {plan.llmNote}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                    <span className="text-sm text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleCheckout(plan.tier)}
                disabled={loadingTier === plan.tier}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                  isPro
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
                    : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
                }`}
              >
                {loadingTier === plan.tier ? 'Loading...' : plan.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Free tier callout */}
      <div className="max-w-3xl mx-auto px-6 mt-12 mb-8 text-center">
        <div className="rounded-2xl p-6 bg-white/[0.04] border border-white/[0.08]">
          <p className="text-sm text-slate-400">
            Want to try first?{' '}
            <Link
              href="/sign-up"
              className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Start free with your own API key
            </Link>
            {' '}&mdash; all features included, no credit card required.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-10">Frequently asked questions</h2>
        <div className="space-y-6">
          {[
            {
              q: 'What does Mira actually do?',
              a: 'Mira connects to your Google Calendar, Gmail, and Drive. Before meetings, she preps you with context. After meetings, she tracks outcomes and commitments. Over time, she surfaces patterns in how you lead.',
            },
            {
              q: 'What\'s the difference between Starter and Pro?',
              a: 'Both plans include all features. Starter requires you to bring your own LLM API key (from OpenAI, Google, or Anthropic). Pro includes Gemini built-in so there\'s zero setup.',
            },
            {
              q: 'Is my data safe?',
              a: 'Your data is encrypted at rest and in transit. We never share or sell your data. Calendar and email content is processed to generate insights, then the raw content is discarded.',
            },
            {
              q: 'Can I switch plans later?',
              a: 'Yes. You can upgrade, downgrade, or cancel anytime. If you start on Pro and later get your own API key, you can switch to Starter and save.',
            },
          ].map((faq, i) => (
            <div key={i} className="border-b border-white/[0.08] pb-6">
              <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <h2 className="text-2xl font-bold mb-3">Ready to lead sharper?</h2>
        <p className="text-slate-400 mb-6">Start free. No credit card required.</p>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-500/90 rounded-xl text-base font-medium transition-colors"
        >
          Get started <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-500">
          <span>{BRAND.name} &mdash; {BRAND.tagline}</span>
          <span>Your data stays yours.</span>
        </div>
      </footer>
    </div>
  );
}
