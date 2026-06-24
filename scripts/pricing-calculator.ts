/**
 * Mira — LLM Cost & Pricing Calculator
 *
 * Accurately models per-user costs across all LLM touchpoints in the product,
 * then derives sustainable pricing tiers.
 *
 * Run: npx ts-node scripts/pricing-calculator.ts
 *
 * All prices as of March 2026. Sources:
 *   - Gemini 2.0 Flash: https://ai.google.dev/pricing
 *   - GPT-4o-mini:      https://platform.openai.com/docs/pricing
 *   - OpenAI TTS:       https://platform.openai.com/docs/pricing
 *   - Claude Sonnet:    https://docs.anthropic.com/en/docs/about-claude/pricing
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. LLM PRICING (per 1M tokens)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ModelPricing {
    name: string;
    inputPer1M: number;   // $ per 1M input tokens
    outputPer1M: number;  // $ per 1M output tokens
}

const MODELS: Record<string, ModelPricing> = {
    // Our primary model for all worker + chat
    'gemini-2.0-flash': {
        name: 'Gemini 2.0 Flash',
        inputPer1M: 0.10,    // $0.10/1M input (< 128K context)
        outputPer1M: 0.40,   // $0.40/1M output
    },
    // Fallback / legacy web agents
    'gpt-4o': {
        name: 'GPT-4o',
        inputPer1M: 2.50,
        outputPer1M: 10.00,
    },
    'gpt-4o-mini': {
        name: 'GPT-4o Mini',
        inputPer1M: 0.15,
        outputPer1M: 0.60,
    },
    'claude-3.5-sonnet': {
        name: 'Claude 3.5 Sonnet',
        inputPer1M: 3.00,
        outputPer1M: 15.00,
    },
};

// TTS pricing
const TTS_COST_PER_1M_CHARS = 15.00;  // OpenAI TTS-1: $15/1M characters

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. INFRASTRUCTURE COSTS (monthly fixed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const INFRA = {
    vercel: {
        plan: 'Pro',
        cost: 20,  // $20/mo
    },
    render: {
        plan: 'Starter (worker)',
        cost: 7,   // $7/mo for starter instance
    },
    neon: {
        plan: 'Free → Scale',
        cost: 0,   // Free tier handles initial users; ~$19/mo at scale
        atScale: 19,
    },
    domain: {
        cost: 1,   // ~$12/yr ≈ $1/mo
    },
};

const TOTAL_INFRA_MONTHLY = Object.values(INFRA).reduce((sum, i) => sum + i.cost, 0);
const TOTAL_INFRA_AT_SCALE = TOTAL_INFRA_MONTHLY + INFRA.neon.atScale;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. PER-USER LLM CALL INVENTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Every LLM call in the codebase, with estimated token counts.
// Token estimates based on typical prompt sizes in the code.
//
// 1 token ≈ 4 characters (English text)
// Typical prompt = system instructions + user context + query

interface LLMCall {
    name: string;
    model: string;
    inputTokens: number;     // estimated per call
    outputTokens: number;    // maxOutputTokens from code
    callsPerDay: number;     // estimated for an active user
    tier: 'free' | 'pro' | 'all';  // which tier triggers this
    category: 'chat' | 'background' | 'synthesis' | 'tts';
}

const PER_USER_CALLS: LLMCall[] = [
    // ══════════════════════════════════════════
    // CHAT (user-initiated, happens on each message)
    // ══════════════════════════════════════════
    {
        name: 'Router Agent (classify intent)',
        model: 'gemini-2.0-flash',
        inputTokens: 800,     // short prompt: system + user msg + history snippet
        outputTokens: 500,    // maxOutputTokens: 500 in code
        callsPerDay: 8,       // avg messages/day for active user
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Context Agent (retrieve knowledge)',
        model: 'gemini-2.0-flash',
        inputTokens: 2500,    // larger: system + knowledge graph + meeting context
        outputTokens: 2000,   // maxOutputTokens: 2000 default
        callsPerDay: 8,       // 1:1 with router
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Response Agent (generate reply)',
        model: 'gemini-2.0-flash',
        inputTokens: 3000,    // system + context output + conversation history
        outputTokens: 1000,   // maxOutputTokens: 1000
        callsPerDay: 8,
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Action Agent (goals, relationships)',
        model: 'gemini-2.0-flash',
        inputTokens: 2000,
        outputTokens: 800,    // maxOutputTokens: 800
        callsPerDay: 3,       // not every msg triggers actions
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Chat Fact Extractor',
        model: 'gemini-2.0-flash',
        inputTokens: 1500,
        outputTokens: 800,    // maxOutputTokens: 800
        callsPerDay: 8,       // runs on each chat message
        tier: 'all',
        category: 'chat',
    },

    // ══════════════════════════════════════════
    // BACKGROUND (worker crons, async processing)
    // ══════════════════════════════════════════
    {
        name: 'Calendar Fact Extractor (per meeting)',
        model: 'gemini-2.0-flash',
        inputTokens: 1200,
        outputTokens: 1500,   // maxOutputTokens: 1500
        callsPerDay: 5,       // avg meetings/day for an exec
        tier: 'all',
        category: 'background',
    },
    {
        name: 'Meeting Champion (reflection)',
        model: 'gemini-2.0-flash',
        inputTokens: 2000,
        outputTokens: 2000,   // default maxOutputTokens
        callsPerDay: 5,       // 1 per meeting
        tier: 'all',
        category: 'background',
    },
    {
        name: 'Proactive Agent (nudges/prep)',
        model: 'gemini-2.0-flash',
        inputTokens: 1500,
        outputTokens: 300,    // maxOutputTokens: 300-800
        callsPerDay: 3,       // pre-meeting prep + end-of-day
        tier: 'all',
        category: 'background',
    },
    {
        name: 'Onboarding Knowledge Extract',
        model: 'gemini-2.0-flash',
        inputTokens: 800,
        outputTokens: 500,    // maxOutputTokens: 500
        callsPerDay: 0.1,     // only during onboarding, amortized
        tier: 'all',
        category: 'background',
    },
    {
        name: 'Document Fact Extractor',
        model: 'gemini-2.0-flash',
        inputTokens: 2000,
        outputTokens: 800,    // maxOutputTokens: 800
        callsPerDay: 0.5,     // occasional doc uploads
        tier: 'all',
        category: 'background',
    },

    // ══════════════════════════════════════════
    // DAILY/WEEKLY SYNTHESIS (cron jobs)
    // ══════════════════════════════════════════
    {
        name: 'Intelligence Synthesis (daily)',
        model: 'gemini-2.0-flash',
        inputTokens: 3000,
        outputTokens: 2000,   // maxOutputTokens: 2000
        callsPerDay: 1,       // daily cron
        tier: 'all',
        category: 'synthesis',
    },
    {
        name: 'Stakeholder Synthesis (daily)',
        model: 'gemini-2.0-flash',
        inputTokens: 2000,
        outputTokens: 1000,   // maxOutputTokens: 1000
        callsPerDay: 1,       // daily cron
        tier: 'all',
        category: 'synthesis',
    },
    {
        name: 'Domain Synthesis (daily)',
        model: 'gemini-2.0-flash',
        inputTokens: 2500,
        outputTokens: 1500,   // maxOutputTokens: 1500
        callsPerDay: 1,       // daily cron
        tier: 'all',
        category: 'synthesis',
    },
    {
        name: 'Community Detection',
        model: 'gemini-2.0-flash',
        inputTokens: 1000,
        outputTokens: 200,    // maxOutputTokens: 200
        callsPerDay: 0.14,    // ~weekly
        tier: 'all',
        category: 'synthesis',
    },

    // ══════════════════════════════════════════
    // WORK COPILOT (occasional, user-triggered)
    // ══════════════════════════════════════════
    {
        name: 'Goal Capture',
        model: 'gemini-2.0-flash',
        inputTokens: 1200,
        outputTokens: 800,
        callsPerDay: 0.5,
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Strategy Brainstorm',
        model: 'gemini-2.0-flash',
        inputTokens: 1500,
        outputTokens: 1000,
        callsPerDay: 0.3,
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Execution Helper',
        model: 'gemini-2.0-flash',
        inputTokens: 1200,
        outputTokens: 800,
        callsPerDay: 0.3,
        tier: 'all',
        category: 'chat',
    },
    {
        name: 'Relationship Mapper',
        model: 'gemini-2.0-flash',
        inputTokens: 1000,
        outputTokens: 600,
        callsPerDay: 0.2,
        tier: 'all',
        category: 'chat',
    },

    // ══════════════════════════════════════════
    // TTS (Pro tier only)
    // ══════════════════════════════════════════
    {
        name: 'Morning Briefing TTS',
        model: 'tts',
        inputTokens: 0,
        outputTokens: 0,
        callsPerDay: 1,       // 1 briefing/day
        tier: 'pro',
        category: 'tts',
    },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. COST CALCULATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function calcTokenCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODELS[model];
    if (!pricing) return 0;
    return (inputTokens / 1_000_000) * pricing.inputPer1M +
           (outputTokens / 1_000_000) * pricing.outputPer1M;
}

function calcTTSCost(): number {
    // Morning briefing: ~600 words ≈ 3600 chars
    const charsPerBriefing = 3600;
    return (charsPerBriefing / 1_000_000) * TTS_COST_PER_1M_CHARS;
}

interface UserProfile {
    name: string;
    chatMessagesPerDay: number;     // overrides default 8
    meetingsPerDay: number;         // overrides default 5
    usesAudio: boolean;
}

const PROFILES: UserProfile[] = [
    { name: 'Light User (your wife)',   chatMessagesPerDay: 3,  meetingsPerDay: 2, usesAudio: false },
    { name: 'Average User',            chatMessagesPerDay: 8,  meetingsPerDay: 5, usesAudio: false },
    { name: 'Power User (busy exec)',  chatMessagesPerDay: 20, meetingsPerDay: 8, usesAudio: true },
    { name: 'Heavy User (edge case)',  chatMessagesPerDay: 40, meetingsPerDay: 10, usesAudio: true },
];

function calculateCostForProfile(profile: UserProfile, tier: 'free' | 'pro'): {
    dailyCost: number;
    monthlyCost: number;
    breakdown: { category: string; daily: number; monthly: number }[];
} {
    const categoryTotals: Record<string, number> = {};

    for (const call of PER_USER_CALLS) {
        // Skip pro-only calls for free tier
        if (call.tier === 'pro' && tier === 'free') continue;

        let dailyCalls = call.callsPerDay;

        // Scale chat calls by message count
        if (call.category === 'chat' && call.callsPerDay >= 3) {
            const ratio = profile.chatMessagesPerDay / 8; // 8 = baseline
            dailyCalls = call.callsPerDay * ratio;
        }

        // Scale background calls by meeting count
        if (call.category === 'background' && call.callsPerDay >= 3) {
            const ratio = profile.meetingsPerDay / 5; // 5 = baseline
            dailyCalls = call.callsPerDay * ratio;
        }

        let dailyCost: number;
        if (call.category === 'tts') {
            dailyCost = profile.usesAudio ? calcTTSCost() * dailyCalls : 0;
        } else {
            dailyCost = calcTokenCost(call.model, call.inputTokens, call.outputTokens) * dailyCalls;
        }

        const cat = call.category;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + dailyCost;
    }

    const dailyCost = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
    const monthlyCost = dailyCost * 30;

    const breakdown = Object.entries(categoryTotals).map(([category, daily]) => ({
        category,
        daily,
        monthly: daily * 30,
    }));

    return { dailyCost, monthlyCost, breakdown };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. RUN CALCULATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║              MIRA — LLM Cost & Pricing Calculator               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');

// ── Token Count Summary ──
console.log('━━━ DAILY TOKEN USAGE (Average User, Gemini 2.0 Flash) ━━━');
let totalInputDaily = 0;
let totalOutputDaily = 0;
let totalCallsDaily = 0;
for (const call of PER_USER_CALLS) {
    if (call.model !== 'tts') {
        totalInputDaily += call.inputTokens * call.callsPerDay;
        totalOutputDaily += call.outputTokens * call.callsPerDay;
    }
    totalCallsDaily += call.callsPerDay;
}
console.log(`  Total LLM calls/day:   ${totalCallsDaily.toFixed(1)}`);
console.log(`  Input tokens/day:      ${totalInputDaily.toLocaleString()} (${(totalInputDaily / 1000).toFixed(1)}K)`);
console.log(`  Output tokens/day:     ${totalOutputDaily.toLocaleString()} (${(totalOutputDaily / 1000).toFixed(1)}K)`);
console.log(`  Total tokens/day:      ${(totalInputDaily + totalOutputDaily).toLocaleString()} (${((totalInputDaily + totalOutputDaily) / 1000).toFixed(1)}K)`);
console.log('');

// ── Model Pricing Reference ──
console.log('━━━ MODEL PRICING REFERENCE ━━━');
for (const [key, model] of Object.entries(MODELS)) {
    console.log(`  ${model.name.padEnd(22)} Input: $${model.inputPer1M.toFixed(2)}/1M  Output: $${model.outputPer1M.toFixed(2)}/1M`);
}
console.log(`  ${'OpenAI TTS-1'.padEnd(22)} $${TTS_COST_PER_1M_CHARS.toFixed(2)}/1M chars (~$0.054/briefing)`);
console.log('');

// ── Per-User Cost by Profile ──
console.log('━━━ PER-USER LLM COST (using Gemini 2.0 Flash as primary) ━━━');
console.log('');

for (const profile of PROFILES) {
    const free = calculateCostForProfile(profile, 'free');
    const pro = calculateCostForProfile(profile, 'pro');

    console.log(`  ┌─ ${profile.name}`);
    console.log(`  │  ${profile.chatMessagesPerDay} msgs/day, ${profile.meetingsPerDay} meetings/day, audio: ${profile.usesAudio ? 'yes' : 'no'}`);
    console.log(`  │`);
    console.log(`  │  FREE tier cost:  $${free.dailyCost.toFixed(4)}/day  →  $${free.monthlyCost.toFixed(2)}/month`);
    for (const b of free.breakdown) {
        if (b.daily > 0) {
            console.log(`  │    ${b.category.padEnd(14)} $${b.daily.toFixed(4)}/day  ($${b.monthly.toFixed(2)}/mo)`);
        }
    }
    console.log(`  │  PRO tier cost:   $${pro.dailyCost.toFixed(4)}/day  →  $${pro.monthlyCost.toFixed(2)}/month`);
    for (const b of pro.breakdown) {
        if (b.daily > 0) {
            console.log(`  │    ${b.category.padEnd(14)} $${b.daily.toFixed(4)}/day  ($${b.monthly.toFixed(2)}/mo)`);
        }
    }
    console.log(`  └──`);
    console.log('');
}

// ── Infrastructure ──
console.log('━━━ INFRASTRUCTURE COSTS (monthly fixed) ━━━');
for (const [name, infra] of Object.entries(INFRA)) {
    console.log(`  ${name.padEnd(12)} $${infra.cost}/mo${('atScale' in infra && infra.atScale) ? ` (→ $${infra.atScale}/mo at scale)` : ''}`);
}
console.log(`  ${'TOTAL'.padEnd(12)} $${TOTAL_INFRA_MONTHLY}/mo now, $${TOTAL_INFRA_AT_SCALE}/mo at scale`);
console.log('');

// ── Unit Economics at Scale ──
console.log('━━━ UNIT ECONOMICS & PRICING RECOMMENDATION ━━━');
console.log('');

const avgUserCost = calculateCostForProfile(PROFILES[1], 'free');
const proUserCost = calculateCostForProfile(PROFILES[2], 'pro');
const heavyUserCost = calculateCostForProfile(PROFILES[3], 'pro');

// Scenario: 100 users
const scenarios = [10, 50, 100, 500, 1000];

for (const totalUsers of scenarios) {
    const freeUsers = Math.round(totalUsers * 0.80);      // 80% free
    const proUsers = Math.round(totalUsers * 0.15);        // 15% pro
    const enterpriseUsers = totalUsers - freeUsers - proUsers; // 5% enterprise

    // Assume free users are light, pro users are average-to-power
    const lightCost = calculateCostForProfile(PROFILES[0], 'free');
    const avgProCost = calculateCostForProfile(PROFILES[1], 'pro');

    const monthlyLLMCost =
        freeUsers * lightCost.monthlyCost +
        proUsers * avgProCost.monthlyCost +
        enterpriseUsers * proUserCost.monthlyCost;

    const infraCost = totalUsers > 50 ? TOTAL_INFRA_AT_SCALE : TOTAL_INFRA_MONTHLY;
    const totalMonthlyCost = monthlyLLMCost + infraCost;

    // Revenue (proposed pricing)
    const PRICE_FREE = 0;
    const PRICE_PRO = 15;        // $/month
    const PRICE_ENTERPRISE = 39; // $/month

    const monthlyRevenue =
        freeUsers * PRICE_FREE +
        proUsers * PRICE_PRO +
        enterpriseUsers * PRICE_ENTERPRISE;

    const margin = monthlyRevenue > 0 ? ((monthlyRevenue - totalMonthlyCost) / monthlyRevenue * 100) : -100;

    console.log(`  ┌─ ${totalUsers} Users (${freeUsers}F / ${proUsers}P / ${enterpriseUsers}E)`);
    console.log(`  │  LLM cost:       $${monthlyLLMCost.toFixed(2)}/mo`);
    console.log(`  │  Infra cost:     $${infraCost.toFixed(2)}/mo`);
    console.log(`  │  Total cost:     $${totalMonthlyCost.toFixed(2)}/mo`);
    console.log(`  │  Revenue:        $${monthlyRevenue.toFixed(2)}/mo  (Free $0 / Pro $${PRICE_PRO} / Ent $${PRICE_ENTERPRISE})`);
    console.log(`  │  Margin:         ${margin.toFixed(1)}%`);
    console.log(`  │  Cost/user:      $${(totalMonthlyCost / totalUsers).toFixed(2)}/mo avg`);
    console.log(`  └──`);
    console.log('');
}

// ── What-If: If we used GPT-4o instead ──
console.log('━━━ WHAT-IF: GPT-4o INSTEAD OF GEMINI FLASH ━━━');
const gpt4oInputCost = (totalInputDaily / 1_000_000) * MODELS['gpt-4o'].inputPer1M;
const gpt4oOutputCost = (totalOutputDaily / 1_000_000) * MODELS['gpt-4o'].outputPer1M;
const gpt4oDailyCost = gpt4oInputCost + gpt4oOutputCost;
const geminiDailyCost = (totalInputDaily / 1_000_000) * MODELS['gemini-2.0-flash'].inputPer1M +
                        (totalOutputDaily / 1_000_000) * MODELS['gemini-2.0-flash'].outputPer1M;
console.log(`  Gemini Flash:  $${geminiDailyCost.toFixed(4)}/day  ($${(geminiDailyCost * 30).toFixed(2)}/mo per user)`);
console.log(`  GPT-4o:        $${gpt4oDailyCost.toFixed(4)}/day  ($${(gpt4oDailyCost * 30).toFixed(2)}/mo per user)`);
console.log(`  GPT-4o is ${(gpt4oDailyCost / geminiDailyCost).toFixed(0)}x more expensive!`);
console.log('');

// ── Free Tier Rate Limits ──
console.log('━━━ FREE TIER RATE LIMIT RECOMMENDATION ━━━');
const freeTargetCost = 0.50; // max $0.50/mo per free user
const costPerMsg = calcTokenCost('gemini-2.0-flash',
    800 + 2500 + 3000 + 1500, // router + context + response + fact extractor input
    500 + 2000 + 1000 + 800   // their outputs
);
const bgCostPerDay = calculateCostForProfile(PROFILES[0], 'free').breakdown
    .filter(b => b.category !== 'chat')
    .reduce((sum, b) => sum + b.daily, 0);
const bgCostPerMonth = bgCostPerDay * 30;
const budgetForChat = freeTargetCost - bgCostPerMonth;
const msgsPerMonth = Math.floor(budgetForChat / costPerMsg);
const msgsPerDay = Math.floor(msgsPerMonth / 30);

console.log(`  Target: keep free users under $${freeTargetCost.toFixed(2)}/mo`);
console.log(`  Background processing cost:  $${bgCostPerMonth.toFixed(2)}/mo (unavoidable for value)`);
console.log(`  Budget left for chat:        $${budgetForChat.toFixed(2)}/mo`);
console.log(`  Cost per chat message:       $${(costPerMsg * 1000).toFixed(2)} per 1000 msgs ($${costPerMsg.toFixed(5)}/msg)`);
console.log(`  → ${msgsPerMonth} messages/month (${msgsPerDay}/day) fits budget`);
console.log('');

// ── Final Pricing Recommendation ──
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║                    RECOMMENDED PRICING TIERS                    ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║                                                                 ║');
console.log('║  FREE — $0/mo                                                   ║');
console.log(`║    • ${msgsPerDay} Mira messages/day (${msgsPerMonth}/month)${' '.repeat(Math.max(0, 31 - String(msgsPerDay).length - String(msgsPerMonth).length))}║`);
console.log('║    • Calendar sync + meeting intelligence                       ║');
console.log('║    • Basic stakeholder tracking                                 ║');
console.log('║    • Daily text briefing                                        ║');
console.log('║    • Cost to you: ~$0.30-0.50/user/month                        ║');
console.log('║                                                                 ║');
console.log('║  PRO — $15/mo  (or $12/mo annual)                               ║');
console.log('║    • Unlimited Mira messages                                    ║');
console.log('║    • Audio morning briefing (TTS)                               ║');
console.log('║    • Advanced stakeholder intelligence                          ║');
console.log('║    • Meeting prep & post-meeting coaching                       ║');
console.log('║    • Priority processing                                        ║');
console.log('║    • Cost to you: ~$1.00-2.00/user/month                        ║');
console.log('║    • Margin: 85-93%                                             ║');
console.log('║                                                                 ║');
console.log('║  EXECUTIVE — $39/mo  (or $29/mo annual)                         ║');
console.log('║    • Everything in Pro                                           ║');
console.log('║    • AI video briefing                                           ║');
console.log('║    • Scenario planning & stakeholder simulations                ║');
console.log('║    • BYOK option (use own API keys for privacy)                 ║');
console.log('║    • Custom AI persona training                                 ║');
console.log('║    • Cost to you: ~$2.00-4.00/user/month                        ║');
console.log('║    • Margin: 90-95%                                             ║');
console.log('║                                                                 ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');

// ── Break-even analysis ──
console.log('━━━ BREAK-EVEN ANALYSIS ━━━');
const monthlyFixedCost = TOTAL_INFRA_AT_SCALE;
// Assume average paying user generates $15 revenue and costs $1.50 in LLM
const avgRevenuePerPayingUser = 15;
const avgLLMCostPerPayingUser = 1.50;
const contributionPerPayingUser = avgRevenuePerPayingUser - avgLLMCostPerPayingUser;
// Free users cost ~$0.40/mo each
const costPerFreeUser = 0.40;
// At 20% conversion: for every 5 users, 1 pays
// Net contribution per 5 users = $13.50 - (4 * $0.40) = $11.90
const netContribPer5Users = contributionPerPayingUser - (4 * costPerFreeUser);
const usersToBreakEven = Math.ceil((monthlyFixedCost / netContribPer5Users) * 5);

console.log(`  Fixed costs:                 $${monthlyFixedCost}/mo`);
console.log(`  Contribution per paying user: $${contributionPerPayingUser.toFixed(2)}/mo`);
console.log(`  Free user drag:              $${costPerFreeUser.toFixed(2)}/mo each`);
console.log(`  At 20% conversion rate:`);
console.log(`  → Break even at ${usersToBreakEven} total users (${Math.ceil(usersToBreakEven * 0.2)} paying)`);
console.log('');

// ── Key Insight ──
console.log('━━━ KEY INSIGHT ━━━');
console.log('  Gemini 2.0 Flash makes this viable. At $0.10/$0.40 per 1M tokens,');
console.log('  your all-in LLM cost is ~$0.30-0.50/mo per free user.');
console.log('  GPT-4o would be 25x more expensive and kill unit economics.');
console.log('  Keep Gemini Flash as primary, offer BYOK for users who want GPT-4o/Claude.');
console.log('  You will NOT go bankrupt — even 1000 free users costs ~$400-500/mo in LLM.');
console.log('');
