#!/usr/bin/env node

/**
 * Create Razorpay Subscription Plans for Leadership Dojo
 *
 * Usage:
 *   RAZORPAY_KEY_ID=rzp_xxx RAZORPAY_KEY_SECRET=xxx node scripts/create-razorpay-plans.js
 *
 * Creates 4 plans:
 *   1. Starter Monthly  — ₹499/mo
 *   2. Starter Annual   — ₹4,788/yr  (₹399/mo equivalent)
 *   3. Pro Monthly      — ₹1,499/mo
 *   4. Pro Annual       — ₹14,388/yr (₹1,199/mo equivalent)
 *
 * After running, add the printed plan IDs to your .env.local files.
 */

const Razorpay = require('razorpay');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars');
  process.exit(1);
}

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

const plans = [
  {
    envVar: 'RAZORPAY_STARTER_MONTHLY_PLAN_ID',
    config: {
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Leadership Dojo Starter (Monthly)',
        amount: 49900, // ₹499 in paise
        currency: 'INR',
        description: 'All features, bring your own LLM key',
      },
    },
  },
  {
    envVar: 'RAZORPAY_STARTER_ANNUAL_PLAN_ID',
    config: {
      period: 'yearly',
      interval: 1,
      item: {
        name: 'Leadership Dojo Starter (Annual)',
        amount: 478800, // ₹4,788 in paise (₹399 × 12)
        currency: 'INR',
        description: 'All features, bring your own LLM key — annual billing',
      },
    },
  },
  {
    envVar: 'RAZORPAY_PRO_MONTHLY_PLAN_ID',
    config: {
      period: 'monthly',
      interval: 1,
      item: {
        name: 'Leadership Dojo Pro (Monthly)',
        amount: 149900, // ₹1,499 in paise
        currency: 'INR',
        description: 'All features + Gemini LLM included, 5M tokens/month',
      },
    },
  },
  {
    envVar: 'RAZORPAY_PRO_ANNUAL_PLAN_ID',
    config: {
      period: 'yearly',
      interval: 1,
      item: {
        name: 'Leadership Dojo Pro (Annual)',
        amount: 1438800, // ₹14,388 in paise (₹1,199 × 12)
        currency: 'INR',
        description: 'All features + Gemini LLM included — annual billing',
      },
    },
  },
];

async function main() {
  console.log('Creating Razorpay plans...\n');

  const results = [];

  for (const { envVar, config } of plans) {
    try {
      const plan = await razorpay.plans.create(config);
      console.log(`✓ ${config.item.name}`);
      console.log(`  ${envVar}=${plan.id}\n`);
      results.push({ envVar, planId: plan.id });
    } catch (err) {
      console.error(`✗ Failed: ${config.item.name}`);
      console.error(`  ${err.message || JSON.stringify(err)}\n`);
    }
  }

  if (results.length > 0) {
    console.log('\n# Add these to your .env.local files:\n');
    for (const { envVar, planId } of results) {
      console.log(`${envVar}=${planId}`);
    }
  }
}

main().catch(console.error);
