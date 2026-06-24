import Razorpay from 'razorpay';

let razorpayInstance: InstanceType<typeof Razorpay> | null = null;

export function getRazorpay(): InstanceType<typeof Razorpay> {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be defined');
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Razorpay Plan IDs — created via Razorpay Dashboard or API.
 * Each maps to a subscription plan with INR pricing + billing interval.
 *
 * Env vars:
 *   RAZORPAY_STARTER_MONTHLY_PLAN_ID  — ₹499/mo
 *   RAZORPAY_STARTER_ANNUAL_PLAN_ID   — ₹399/mo billed yearly (₹4,788/yr)
 *   RAZORPAY_PRO_MONTHLY_PLAN_ID      — ₹1,499/mo
 *   RAZORPAY_PRO_ANNUAL_PLAN_ID       — ₹1,199/mo billed yearly (₹14,388/yr)
 */
export function getRazorpayPlanId(tier: string, isAnnual: boolean): string {
  if (tier === 'PRO') {
    return isAnnual
      ? (process.env.RAZORPAY_STARTER_ANNUAL_PLAN_ID || '')
      : (process.env.RAZORPAY_STARTER_MONTHLY_PLAN_ID || '');
  }
  if (tier === 'ENTERPRISE') {
    return isAnnual
      ? (process.env.RAZORPAY_PRO_ANNUAL_PLAN_ID || '')
      : (process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID || '');
  }
  return '';
}
