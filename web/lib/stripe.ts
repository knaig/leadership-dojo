import Stripe from 'stripe';

// Stripe is optional - only initialize if key is provided
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover' as const,
      typescript: true,
    });
  }
  return stripeInstance;
}

// For backwards compatibility - lazy initialization
export const stripe = {
  get checkout() { return getStripe().checkout; },
  get customers() { return getStripe().customers; },
  get subscriptions() { return getStripe().subscriptions; },
  get prices() { return getStripe().prices; },
  get products() { return getStripe().products; },
  get paymentIntents() { return getStripe().paymentIntents; },
  get webhooks() { return getStripe().webhooks; },
};

// ============================================================================
// PRICING PLANS — 2-Tier SaaS Model
// ============================================================================

export type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  priceUSD: number;      // Monthly price in USD
  priceINR: number;      // Monthly price in INR
  annualPriceUSD: number; // Monthly price when billed annually (USD)
  annualPriceINR: number; // Monthly price when billed annually (INR)
  stripePriceId: string;
  features: string[];
  limits: {
    monthlyCaseLimit: number;
    monthlyAiFeedbackLimit: number;
    monthlyChatLimit: number;
  };
  featureFlags: {
    hasGoogleIntegrations: boolean;
    hasAiFeedback: boolean;
    hasAgenticCoach: boolean;
    hasTeamFeatures: boolean;
    hasProactiveCoaching: boolean;
  };
  // Token-based metering
  tokenLimit: number;    // 0 = BYOLLM, 5000000 = 5M
  llmSource: 'byollm' | 'platform';
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: 'FREE',
    name: 'Free',
    tagline: 'Try with your own API key',
    priceUSD: 0,
    priceINR: 0,
    annualPriceUSD: 0,
    annualPriceINR: 0,
    stripePriceId: '',
    features: [
      'All coaching features',
      'Bring your own LLM key (required)',
      'Unlimited cases & chat',
      'Basic skill tracking',
    ],
    limits: {
      monthlyCaseLimit: 999999,
      monthlyAiFeedbackLimit: 999999,
      monthlyChatLimit: 999999,
    },
    featureFlags: {
      hasGoogleIntegrations: true,
      hasAiFeedback: true,
      hasAgenticCoach: true,
      hasTeamFeatures: true,
      hasProactiveCoaching: true,
    },
    tokenLimit: 0,
    llmSource: 'byollm',
  },
  PRO: {
    tier: 'PRO',
    name: 'Starter',
    tagline: 'All features, bring your own key',
    priceUSD: 9,
    priceINR: 499,
    annualPriceUSD: 7,
    annualPriceINR: 399,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro',
    features: [
      'All coaching features',
      'Bring your own LLM key',
      'Google Workspace integrations',
      'Proactive coaching by Mira',
      'Stakeholder relationship graph',
      'Goal tracking & analytics',
      'Priority support',
    ],
    limits: {
      monthlyCaseLimit: 999999,
      monthlyAiFeedbackLimit: 999999,
      monthlyChatLimit: 999999,
    },
    featureFlags: {
      hasGoogleIntegrations: true,
      hasAiFeedback: true,
      hasAgenticCoach: true,
      hasTeamFeatures: true,
      hasProactiveCoaching: true,
    },
    tokenLimit: 0,
    llmSource: 'byollm',
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Pro',
    tagline: 'LLM included, zero setup',
    priceUSD: 29,
    priceINR: 1499,
    annualPriceUSD: 23,
    annualPriceINR: 1199,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
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
    limits: {
      monthlyCaseLimit: 999999,
      monthlyAiFeedbackLimit: 999999,
      monthlyChatLimit: 999999,
    },
    featureFlags: {
      hasGoogleIntegrations: true,
      hasAiFeedback: true,
      hasAgenticCoach: true,
      hasTeamFeatures: true,
      hasProactiveCoaching: true,
    },
    tokenLimit: 5000000,
    llmSource: 'platform',
  },
};

// Helper: Detect if user should see INR pricing
export function shouldShowINR(acceptLanguage?: string, country?: string): boolean {
  if (country?.toUpperCase() === 'IN') return true;
  if (acceptLanguage?.includes('hi') || acceptLanguage?.includes('en-IN')) return true;
  return false;
}
