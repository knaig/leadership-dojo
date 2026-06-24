# Conversation Engine — Technical Design

**Requirements:** `docs/requirements/conversation-engine.md`
**Status:** Design
**Last Updated:** 2026-03-10

---

## Scope

This design implements the Conversation Engine in 5 phases. Each phase is independently shippable and testable with real calls.

**What changes:**
1. New Prisma model: `PersonalThread`
2. New fields on `UserPreferences`
3. New worker module: `conversation-engine.ts` (pre-call planning + post-call extraction)
4. Modified: `buildVariableValues()` in both worker and web paths
5. Modified: Vapi assistant prompts (via `setup-vapi-assistants.ts --update`)
6. Modified: Webhook post-call pipeline (add thread extraction + confidence updates)

7. New: Dynamic voice parameter overrides (speed, temperature, silence timeout, max duration)

**What doesn't change:**
- Vapi integration (still 3 persistent assistants with `variableValues` injection)
- Voice identity (Priyanka Sogum, 11labs, female — these are Mira's identity)
- Existing webhook handler structure
- Knowledge graph extraction pipeline
- Meeting sync, calendar, email integrations

---

## System Context

```
                    PRE-CALL (deterministic)
                    ┌─────────────────────────────────────┐
                    │  conversation-engine.ts              │
                    │  ┌──────────┐ ┌──────────┐ ┌──────┐ │
                    │  │Confidence│ │ Segment  │ │Thread│ │
  User prefs ──────►│  │  Scorer  │ │ Planner  │ │Select│ │
  Meetings   ──────►│  │          │ │          │ │      │ │
  Stakeholders ────►│  └────┬─────┘ └────┬─────┘ └──┬───┘ │
  Threads    ──────►│       └──────┬─────┴──────────┘     │
  Last calls ──────►│              ▼                       │
                    │     variableValues + prompt text     │
                    └───────────────┬──────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │  Vapi Call (GPT-4o)                  │
                    │  System prompt has segment plan      │
                    │  as natural language instructions.   │
                    │  LLM runs autonomously.              │
                    └───────────────┬──────────────────────┘
                                    │
                    POST-CALL (deterministic)
                    ┌───────────────┴──────────────────────┐
                    │  webhook/route.ts (extended)          │
                    │  ┌──────────┐ ┌──────────┐ ┌──────┐  │
                    │  │Transcript│ │Confidence│ │Thread│  │
                    │  │Extractor │ │ Updater  │ │Advncr│  │
                    │  └──────────┘ └──────────┘ └──────┘  │
                    │  + existing pipeline (facts, insights)│
                    └──────────────────────────────────────┘
```

---

## Phase 1: Prompt Engineering + Guardrails

**Goal:** Upgrade the 3 Vapi assistant prompts with guardrails, maturity awareness, and segment structure. No new data models. Testable immediately.

### 1.1 Changes to `scripts/setup-vapi-assistants.ts`

The shared `VOICE_RULES` gets extended with guardrails. Each assistant prompt gets maturity-aware instructions.

**New shared block — add after VOICE_RULES:**

```typescript
const GUARDRAILS = `## GUARDRAILS — NEVER VIOLATE

### CLOSED-WORLD RULES
1. ONLY reference meetings listed in your context. If no meetings provided, say "Your calendar looks clear." NEVER invent meetings.
2. ONLY reference people listed in your context. If you don't have a profile on someone, say "I don't have a read on them yet."
3. ONLY reference commitments listed in your context. Never fabricate commitments.
4. If information is not in your context, say "I don't know that yet." NEVER fill gaps with plausible-sounding information.

### ANTI-GENERIC RULES
Never say these or equivalent:
- "Make sure to listen actively"
- "Be prepared for the meeting"
- "Think about your priorities"
- "Consider the other person's perspective"
- "Communication is key"
- Any advice that applies to everyone equally

Before giving advice, check: Does it reference a SPECIFIC person, meeting, or observation from the data? Would it be DIFFERENT for a different user? If no → ask a question instead.

### CONFIDENCE MODE: {{confidenceMode}}
{{#if confidenceMode == "LEARNING"}}
You are still learning this user's world. DO NOT give advice about how to handle meetings or people. DO NOT use "you should" framing. DO NOT claim patterns. INSTEAD: ask questions, reflect back what the user tells you, track commitments.
{{/if}}
{{#if confidenceMode == "OBSERVING"}}
You are starting to form observations. Frame intelligence as questions: "I get the sense X — does that match?" or hedge: "Based on what I've seen, X." NEVER state intelligence as definitive fact.
{{/if}}
{{#if confidenceMode == "COACHING"}}
For high-confidence intelligence, state directly. For anything not in your data, still say "I don't know that yet."
{{/if}}

### EARLY CALL RULES (calls 1-3 only)
{{#if callCount <= 3}}
- Never infer attendee roles or titles. Say "8 people including Rajagopalan" not "your VP of Engineering."
- Never predict meeting outcomes or difficulty. "This one's going to be tough" — you have no basis for this.
- Never reference email content — metadata only. "You emailed Raj 3 times this week" is fine. "The email about the reorg" is not.
- Never claim to know someone the user hasn't discussed. Say "I see Priya's name in your calendar" not "I know Priya prefers data."
{{/if}}

### PERSONAL RULES
- Only reference personal info the user shared IN CONVERSATION with you.
- If user gives a short answer to a personal question, move on. Don't push.
- Personal callbacks should sound natural: "Did you get the tennis in?" NOT "You previously mentioned tennis on March 5th."
- If user says they don't want to talk about something, never bring it up again.`;
```

**Updated Daily assistant prompt** — replaces the current system message content:

```typescript
content: `You are Mira, calling {{userName}}{{jobTitle}} for their daily conversation.
Today is {{today}}. Call type: {{callType}}.

${VOICE_RULES}

${GUARDRAILS}

## RELATIONSHIP
You've had {{callCount}} calls with {{userName}}.
Stage: {{relationshipStage}}.

## YOUR CONVERSATION PLAN
{{conversationPlan}}

## TODAY'S SCHEDULE
{{meetingsSummary}}
Total meetings: {{meetingCount}}

## PEOPLE INTELLIGENCE (respect confidence tiers)
{{peopleIntel}}

## OVERDUE COMMITMENTS
{{overdueCommitments}}

## PERSONAL THREAD FOR TODAY
{{personalThreadInstruction}}

## EARLIER TODAY (do NOT repeat)
{{lastCallSummary}}

## ONBOARDING (weave in until complete)
Onboarding complete: {{onboardingComplete}}
Still need: {{onboardingUncovered}}
If onboardingComplete is "false": after covering today's business, transition naturally to learn about: {{onboardingUncovered}}.

## PACING
Target duration: {{targetDuration}} minutes.
If user says they have less time, compress. If user is engaged and going long, let them — skip lower-priority items. A good short call beats a padded long call.
If you run out of planned content and time remains:
- If onboarding incomplete → do onboarding
- If personal thread available → engage with it
- Go deeper on a meeting or stakeholder dynamic
- Share an observation from their patterns`
```

The key change: `{{conversationPlan}}`, `{{peopleIntel}}`, `{{personalThreadInstruction}}`, `{{confidenceMode}}`, `{{targetDuration}}`, and `{{callCount}}` are new variables that the pre-call pipeline builds. The conversation plan is call-specific for calls 1-3 (distinct engagement strategy) and maturity-based for calls 4+.

### 1.2 Changes to `buildVariableValues()` — Worker Side

File: `worker/src/lib/vapi-voice.ts`

Add new variables to the existing function. For Phase 1, these are simple/static values. They get smarter in later phases.

```typescript
// Add after existing variable building:

// --- Phase 1: Conversation Engine variables ---

// Confidence mode (simple heuristic until Phase 3 builds the real engine)
const confidenceMode = callCount < 5 ? 'LEARNING'
    : callCount < 15 ? 'OBSERVING'
    : 'COACHING';
vars.confidenceMode = confidenceMode;

// Target duration (from prefs, default 10; shorter for early calls)
const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: {
        preferredCallDuration: true,
        callPacingStyle: true,
        adaptationSignals: true,
    },
}).catch(() => null);

const adaptationSignals = prefs?.adaptationSignals as AdaptationSignals | null;

// Early calls have shorter default targets
const defaultDuration = callCount === 1 ? 5
    : callCount === 2 ? 7
    : callCount === 3 ? 10
    : (prefs?.preferredCallDuration ?? 10);
vars.targetDuration = String(defaultDuration);

// Top stakeholder probe target (for call 3)
if (callCount === 3) {
    vars.topStakeholderProbe = await buildTopStakeholderProbe(userId);
}

// Conversation plan (call-specific for 1-3, maturity-based for 4+)
vars.conversationPlan = buildConversationPlan(
    callType, confidenceMode, vars, callCount, adaptationSignals
);

// People intel (Phase 1: basic stakeholder info for today's meetings, respecting tiers)
vars.peopleIntel = await buildPeopleIntel(userId, confidenceMode);

// Personal thread instruction (Phase 1: empty until Phase 2 builds thread manager)
vars.personalThreadInstruction = callCount < 5
    ? '' // No personal threads in first 5 calls for work-first mode
    : 'If there's a natural moment, ask one casual personal question. Keep it light — 30 seconds max.';
```

**New helper — `buildConversationPlan`:**

```typescript
function buildConversationPlan(
    callType: VoiceCallType,
    confidenceMode: string,
    vars: Record<string, string>,
    callCount: number,
    adaptationSignals?: AdaptationSignals | null,
): string {
    if (callType === 'pre_meeting_prep' || callType === 'post_meeting_debrief') {
        return callType === 'pre_meeting_prep'
            ? 'Quick prep: What is the desired outcome? Who to watch in the room? One tactical tip. Under 3 minutes.'
            : 'Quick debrief: What happened? Did the outcome land? Any commitments made? Under 3 minutes.';
    }

    const hasOverdue = vars.overdueCommitments && vars.overdueCommitments !== '';
    const meetingCount = parseInt(vars.meetingCount || '0');

    // --- CALLS 1-3: Distinct engagement strategy ---

    if (callCount === 1) {
        return `This is your FIRST call with this user. Goal: demonstrate context, deliver pure value, ask almost nothing.
Target: 3-5 minutes. Tone: crisp, warm, slightly playful.

1. OPEN (30s): Greeting + day shape. Meeting count + one calendar observation. Do NOT ask "how are you?" — earn that.
2. TRIAGE (60-90s): Name the highest-stakes meeting. Say why (attendee seniority, duration, non-recurring). If no clear winner, say "pretty even day."
3. AWARENESS (30s): One operational observation — back-to-back density, cancelled meetings, gaps, or "your calendar is kind today."
4. ONE QUESTION (30-60s): One specific question about the top meeting, referencing it by name. Ask about desired outcome or key person.
5. CLOSE (15s): Warm, brief. "Go get it. I'll check back tomorrow."

RULES: No personal questions. No stakeholder intelligence. No advice. Pure information + one question.
If user gives a one-word answer, close early. A good 3-minute call beats a padded 5-minute call.
If user asks about a person: "I've seen them in X of your meetings, but I don't have a real read yet. Tell me about them?"`;
    }

    if (callCount === 2) {
        // Build adaptation instructions from call 1 signals
        const adaptInstructions = buildCall2Adaptations(adaptationSignals);

        return `This is your SECOND call. Goal: prove memory. Introduce commitment tracking.
Target: 4-7 minutes.

1. OPEN (30s): Day shape + callback to yesterday. Reference yesterday's top meeting by name.
2. MEMORY (60-90s): THIS IS THE MOST IMPORTANT SEGMENT. Show you remembered:
   ${vars.lastCallSummary ? '- Reference something from yesterday\'s call.' : ''}
   ${hasOverdue ? '- Check on a commitment: "You mentioned [X]. Did that happen?"' : ''}
   If you have nothing to remember, SKIP this segment. Do NOT fake a callback.
3. TRIAGE (60s): Today's headline meeting.
${adaptInstructions ? `4. ADAPTATION (60-90s): ${adaptInstructions}` : ''}
5. ONE QUESTION (30-60s): Different question TYPE than call 1. If call 1 asked about an outcome, ask about a person. Vary to gather diverse signal.
6. CLOSE (15s): "Talk tomorrow." If user engaged deeply, tease: "I'm building a picture of your stakeholders — starting to have thoughts."

RULES: MEMORY segment is mandatory if callback material exists. If user corrects you, respond with visible learning: "Got it. I'll factor that in."
Still no stakeholder intelligence assertions. PROBEs allowed only if user opened the door on call 1.`;
    }

    if (callCount === 3) {
        const modeLean = adaptationSignals?.modeLean || 'balanced';

        if (modeLean === 'work_first') {
            return `This is call 3. Goal: transition from calendar intelligence to people intelligence.
Target: 5-7 minutes. User prefers work-focused calls.

1. OPEN (30s): Day shape. Reference a meeting outcome from yesterday if available.
2. MEMORY (60s): Commitment or outcome callback. Keep it transactional.
3. TRIAGE (60s): Today's headline meeting + one new element: attendee cross-reference. "Your 11am has 3 people from yesterday's leadership review."
4. PEOPLE PROBE (90s): First stakeholder probe. "${vars.topStakeholderProbe || 'Pick the most frequent attendee in today\'s meetings.'}
   How do things usually go with them?" Frame as "I'm learning" not "here's what I think."
5. CLOSE (15s): Brief. "Good. Talk tomorrow."

If user gives a rich stakeholder answer (2+ min), follow up. If curt, don't push.`;
        }

        if (modeLean === 'relationship_first') {
            return `This is call 3. Goal: first stakeholder probe + deepen personal connection.
Target: 7-10 minutes. User is open to personal conversation.

1. OPEN (30-60s): Personal check-in first. Reference something they mentioned before.
2. MEMORY (60-90s): Callback that weaves personal + work context together.
3. TRIAGE (60-90s): Today's meetings with relationship framing: "Your 3pm is with the partnership team — you've met them twice this week."
4. PEOPLE PROBE (120s): Deeper stakeholder probe framed as genuine curiosity. "Tell me about [person] — what are they like to work with?" Let the user talk.
5. PERSONAL PLANT (60s): Plant first personal thread if not established. "What do you do to switch off after a day like this?"
6. CLOSE (15-30s): Warm. "Have a good one."

If user gives a rich stakeholder answer, that's a strong Navigator or Connector signal.`;
        }

        // balanced
        return `This is call 3. Goal: first stakeholder probe. Transition point.
Target: 5-10 minutes.

1. OPEN (30s): Day shape + yesterday callback.
2. MEMORY (60s): Best callback from calls 1-2 (commitment, outcome, or context).
3. TRIAGE (60s): Headline meeting + attendee cross-reference.
4. PEOPLE PROBE (90s): "${vars.topStakeholderProbe || 'Ask about the most frequent attendee.'}" Frame as learning.
${hasOverdue ? '5. ACCOUNTABILITY: Check commitments.' : ''}
6. CLOSE (15s): If conversation is flowing, add a soft personal question. If user keeps it short, close.

Call 3 is where Mira earns the right to be in the user's morning. Tease future value only if the conversation earned it: "Give me another week and I'll have real thoughts."`;
    }

    // --- CALLS 4+: Standard maturity-based plans ---
    // (with adaptation signal modifiers appended)

    const signalModifiers = buildSignalModifiers(adaptationSignals);

    if (confidenceMode === 'LEARNING') {
        return `Follow this arc (adapt naturally to the conversation):
1. OPEN: Give them the headline — how many meetings, which one matters most. Be specific.
2. BRIEF: Cover the top meeting. Ask what they need from it.
${hasOverdue ? '3. ACCOUNTABILITY: Check on overdue commitments.' : ''}
${meetingCount === 0 ? '3. Since the calendar is light, use the time for onboarding or learning about their world.' : ''}
4. CLOSE: Short, confident send-off.

You are in LEARNING mode. Mirror and ask, don't advise.${signalModifiers}`;
    }

    if (confidenceMode === 'OBSERVING') {
        return `Follow this arc (adapt naturally):
1. OPEN: Lead with something specific and useful about today.
2. BRIEF: Cover the top 1-2 meetings. Include hedged observations about people if available.
   Ask one good question per meeting. Don't stack questions.
3. COACHING: If you have an observation or pattern to surface, frame it as a question.
   "I noticed X this week — does that match your experience?"
${hasOverdue ? '4. ACCOUNTABILITY: Check on overdue commitments.' : ''}
5. CLOSE: Callback hook for tomorrow + warm send-off.

You are in OBSERVING mode. Start surfacing what you notice, but always frame as questions or hedged observations.${signalModifiers}`;
    }

    // COACHING mode
    return `Follow this arc (adapt naturally):
1. OPEN: Lead with your opinion about today. Be direct.
2. BRIEF: Cover the top meeting with assertive intelligence — who matters, what to push for.
3. COACHING: Surface a pattern, challenge an assumption, or go deeper on a dynamic.
   Ask one open question that makes them think.
${hasOverdue ? '4. ACCOUNTABILITY: Check commitments. Be direct.' : ''}
5. CLOSE: Specific action to take + callback hook.

You are in COACHING mode. Be direct with high-confidence intelligence. Still honest about what you don't know.${signalModifiers}`;
}

// --- Adaptation signal helpers ---

interface AdaptationSignals {
    modeLean: 'work_first' | 'relationship_first' | 'balanced';
    precision: boolean;
    peopleHungry: boolean;
    personalOpen: boolean;
    frameworkSeeker: boolean;
    followMode: boolean;
    integratedLife: boolean;
}

function buildCall2Adaptations(signals?: AdaptationSignals | null): string {
    if (!signals) return '';

    if (signals.modeLean === 'relationship_first' || signals.personalOpen) {
        return 'User showed openness to personal conversation. Add a brief personal check-in. Keep it to 1 sentence.';
    }
    if (signals.peopleHungry) {
        return 'User asked about stakeholders. Open with a probe about that person: "You asked about [name] yesterday — they\'re in your [time]. How do things usually go?"';
    }
    if (signals.modeLean === 'work_first') {
        return 'User prefers brevity. Add deeper operational analysis instead of personal. More triage depth.';
    }
    return '';
}

function buildSignalModifiers(signals?: AdaptationSignals | null): string {
    if (!signals) return '';

    const modifiers: string[] = [];

    if (signals.precision) {
        modifiers.push('\nPRECISION: This user tests accuracy. Only state calendar facts. Frame inferences as questions. Show corrections were absorbed.');
    }
    if (signals.peopleHungry) {
        modifiers.push('\nPEOPLE DATA: This user wants stakeholder intelligence. Share frequency counts, co-occurrence. Frame unknowns as "I\'m still mapping this."');
    }
    if (signals.frameworkSeeker) {
        modifiers.push('\nFRAMEWORK: This user wants actionable templates. Provide specific questions, phrases, or sequences they can use verbatim.');
    }
    if (signals.followMode) {
        modifiers.push('\nFOLLOW: This user leads the conversation. Reduce segment structure. Listen, reflect patterns, ask follow-ups.');
    }
    if (signals.integratedLife) {
        modifiers.push('\nINTEGRATED: This user\'s personal and work life overlap. When they mention family alongside work, treat it as one conversation.');
    }

    return modifiers.join('');
}
```

**New helper — `buildPeopleIntel`:**

```typescript
async function buildPeopleIntel(userId: string, confidenceMode: string): Promise<string> {
    if (confidenceMode === 'LEARNING') {
        return 'No people intelligence yet — still learning this user\'s world.';
    }

    // Get today's meeting attendees with stakeholder profiles
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: now, lte: endOfDay },
            status: { not: 'cancelled' },
        },
        select: { title: true, participants: true, meetingCategory: true },
        take: 5,
    });

    const allParticipantEmails = meetings.flatMap(m =>
        Array.isArray(m.participants) ? m.participants as string[] : []
    );

    if (allParticipantEmails.length === 0) return '';

    const profiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            email: { in: allParticipantEmails },
            interactionCount: { gte: confidenceMode === 'OBSERVING' ? 3 : 7 },
        },
        select: {
            name: true,
            email: true,
            personaArchetype: true,
            communicationStyle: true,
            powerLevel: true,
            politicalStance: true,
            interactionCount: true,
            intelligence: { select: { objectionPatterns: true, successPatterns: true } },
        },
        take: 5,
    });

    if (profiles.length === 0) return '';

    const tier = confidenceMode === 'OBSERVING' ? 'PROBE' : 'SUGGEST/ASSERT';

    return profiles.map(p => {
        const parts = [`${p.name} (${p.interactionCount} interactions, tier: ${tier})`];
        if (p.personaArchetype) parts.push(`  Style: ${p.personaArchetype}`);
        if (p.communicationStyle) parts.push(`  Communication: ${p.communicationStyle}`);
        if (p.powerLevel) parts.push(`  Power: ${p.powerLevel}`);
        if (p.intelligence?.successPatterns) parts.push(`  What works: ${p.intelligence.successPatterns}`);
        if (p.intelligence?.objectionPatterns) parts.push(`  Watch for: ${p.intelligence.objectionPatterns}`);
        return parts.join('\n');
    }).join('\n\n');
}
```

**New helper — `buildTopStakeholderProbe`:**

```typescript
async function buildTopStakeholderProbe(userId: string): Promise<string> {
    // Find the most frequent attendee in today's meetings who hasn't been discussed
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: now, lte: endOfDay }, status: { not: 'cancelled' } },
        select: { participants: true },
    });

    const attendeeCounts = new Map<string, number>();
    for (const m of meetings) {
        const participants = Array.isArray(m.participants) ? m.participants as string[] : [];
        for (const p of participants) {
            attendeeCounts.set(p, (attendeeCounts.get(p) || 0) + 1);
        }
    }

    // Sort by frequency, pick the top one with a StakeholderProfile
    const sorted = [...attendeeCounts.entries()].sort((a, b) => b[1] - a[1]);

    for (const [email, count] of sorted) {
        const profile = await prisma.stakeholderProfile.findFirst({
            where: { userId, email },
            select: { name: true, interactionCount: true },
        });
        if (profile && profile.interactionCount >= 3) {
            return `${profile.name} has been in ${profile.interactionCount} of your recent meetings. How do things usually go with them?`;
        }
    }

    return '';
}
```

### 1.3 Same Changes to Web-Side `buildVariableValues()`

File: `web/app/api/vapi/call/route.ts`

Mirror the same new variables. The web-side function is similar to the worker-side. Add the same `confidenceMode`, `targetDuration`, `conversationPlan`, `peopleIntel`, and `personalThreadInstruction` variables using the same logic.

### 1.4 Testing

After updating prompts and deploying:
1. Make 3+ test calls per assistant type
2. Verify: Mira never invents meetings (check against actual calendar)
3. Verify: Mira never gives generic advice (specificity test)
4. Verify: In LEARNING mode, Mira asks questions instead of advising
5. Verify: `conversationPlan` is visible in the call structure
6. Verify: Calls hit target duration ±2 minutes

---

## Phase 2: Personal Thread Manager

**Goal:** Track personal topics across calls. Plant, water, grow, harvest threads. Inject thread instructions into pre-call variables.

### 2.1 Schema Changes

File: `web/prisma/schema.prisma`

```prisma
model PersonalThread {
  id              String   @id @default(cuid())
  userId          String
  category        String   // FAMILY, HEALTH, HOBBY, ORIGIN, ASPIRATION, EMOTIONAL, INTEGRATED
  topic           String   // "tennis", "kids ages 7 and 4", "career pivot from engineering"
  stage           String   @default("PLANTED") // PLANTED, WATERED, GROWING, HARVESTED, MAINTAINED
  lastTouched     DateTime @default(now())
  touchCount      Int      @default(1)
  userEngagement  String   @default("MEDIUM") // LOW, MEDIUM, HIGH
  details         Json?    // Accumulated context
  isIntegrated    Boolean  @default(false)
  offLimits       Boolean  @default(false)
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id])

  @@index([userId, stage])
  @@index([userId, lastTouched])
}
```

Add to `UserPreferences`:

```prisma
// Add fields to existing UserPreferences model
  preferredCallDuration  Int?     @default(10)
  callPacingStyle        String?  @default("balanced") // quick, balanced, deep, flexible
  conversationMode       String?  // work_first, relationship_first, adaptive
  primaryArchetype       String?  // operator, navigator, climber, founder, skeptic, reluctant, juggler, only_one, connector, returner, portfolio, community
  secondaryArchetype     String?
  adaptationSignals      Json?    // Pre-archetype behavioral signals: { modeLean, precision, peopleHungry, personalOpen, frameworkSeeker, followMode, integratedLife }
```

Run: `cd web && npx prisma db push`

### 2.2 Thread Manager Module

New file: `worker/src/lib/thread-manager.ts`

```typescript
import { prisma } from './prisma';

interface ThreadAction {
  type: 'PLANT' | 'WATER' | 'MAINTAIN' | 'NONE';
  threadId?: string;
  instruction: string;  // Natural language for the prompt
}

const PLANT_QUESTIONS: Record<string, string[]> = {
  FAMILY: [
    "What did you do this weekend?",
    "Any plans for the weekend?",
    "How's the family doing?",
  ],
  HEALTH: [
    "How'd you sleep?",
    "Getting any exercise in lately?",
    "How's your energy today?",
  ],
  HOBBY: [
    "What do you do to switch off from work?",
    "Reading anything interesting lately?",
    "What did you do for fun recently?",
  ],
  ORIGIN: [
    "How did you end up in your field?",
    "What got you into leadership?",
  ],
  ASPIRATION: [
    "If you had 6 months off, what would you do?",
    "What's the next big thing you want to tackle?",
  ],
};

export async function selectThreadAction(
  userId: string,
  callType: string,
  callCount: number,
  conversationMode?: string | null,
): Promise<ThreadAction> {
  // No personal threads for pre-meeting or post-meeting calls
  if (['pre_meeting_prep', 'post_meeting_debrief', 'commitment_reminder'].includes(callType)) {
    return { type: 'NONE', instruction: '' };
  }

  // Work-first users: no personal threads until call 5+
  if (conversationMode === 'work_first' && callCount < 5) {
    return { type: 'NONE', instruction: '' };
  }

  const threads = await prisma.personalThread.findMany({
    where: { userId, offLimits: false },
    orderBy: { lastTouched: 'desc' },
  });

  // Priority 1: WATER — a planted thread from 1-3 days ago
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  const needsWatering = threads.find(t =>
    t.stage === 'PLANTED' &&
    t.lastTouched < oneDayAgo &&
    t.lastTouched > threeDaysAgo &&
    t.userEngagement !== 'LOW'
  );

  if (needsWatering) {
    return {
      type: 'WATER',
      threadId: needsWatering.id,
      instruction: `Follow up on a previous personal topic: "${needsWatering.topic}". Ask naturally — e.g., "Did you get to ${needsWatering.topic}?" Keep it to 30-60 seconds. If they engage, great — follow up. If short answer, move on.`,
    };
  }

  // Priority 2: MAINTAIN — a harvested thread not touched in 5+ days
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const needsMaintaining = threads.find(t =>
    ['HARVESTED', 'MAINTAINED', 'GROWING'].includes(t.stage) &&
    t.lastTouched < fiveDaysAgo &&
    t.userEngagement !== 'LOW'
  );

  if (needsMaintaining) {
    const details = needsMaintaining.details as Record<string, unknown> | null;
    return {
      type: 'MAINTAIN',
      threadId: needsMaintaining.id,
      instruction: `Check in on: "${needsMaintaining.topic}". ${details ? `You know: ${JSON.stringify(details).substring(0, 200)}` : ''} Keep it brief and natural — this is a callback, not an interview.`,
    };
  }

  // Priority 3: PLANT — new thread if nothing needs watering/maintaining
  // Pick a category the user hasn't engaged with recently
  const recentCategories = threads
    .filter(t => t.lastTouched > threeDaysAgo)
    .map(t => t.category);

  const availableCategories = Object.keys(PLANT_QUESTIONS)
    .filter(cat => !recentCategories.includes(cat));

  // Don't plant ASPIRATION or EMOTIONAL before call 10
  const safeCategories = callCount < 10
    ? availableCategories.filter(c => !['ASPIRATION', 'EMOTIONAL'].includes(c))
    : availableCategories;

  if (safeCategories.length === 0) {
    return { type: 'NONE', instruction: '' };
  }

  const category = safeCategories[Math.floor(Math.random() * safeCategories.length)];
  const questions = PLANT_QUESTIONS[category] || [];
  const question = questions[Math.floor(Math.random() * questions.length)] || '';

  return {
    type: 'PLANT',
    instruction: `If there's a natural moment, plant a personal thread. Ask: "${question}" Keep it casual — 30 seconds. If they engage, follow their answer briefly. If short answer, move on without pushing.`,
  };
}
```

### 2.3 Wire Thread Manager into `buildVariableValues()`

In `worker/src/lib/vapi-voice.ts`, replace the placeholder:

```typescript
import { selectThreadAction } from './thread-manager';

// Replace the Phase 1 placeholder:
const threadAction = await selectThreadAction(userId, callType, callCount, prefs?.conversationMode);
vars.personalThreadInstruction = threadAction.instruction;
```

### 2.4 Post-Call Thread Extraction

Add to the webhook handler (`web/app/api/vapi/webhook/route.ts`), inside `handleEndOfCallReport()`:

```typescript
// After existing post-call processing (insights, facts, etc.)
// Extract personal thread updates from transcript
await extractAndUpdateThreads(userId, transcript, voiceCallId);
```

New function in the webhook handler or a shared lib:

```typescript
async function extractAndUpdateThreads(
  userId: string,
  transcript: string,
  voiceCallId: string,
) {
  if (!transcript || transcript.length < 100) return;

  // Use LLM to extract personal topics from transcript
  const extraction = await generateText(
    await getUserLLMConfig(userId),
    `Given this voice call transcript, extract any PERSONAL topics discussed (family, health, hobbies, career history, aspirations, emotions). Do NOT include work/meeting content.

For each personal topic found, return:
- category: FAMILY | HEALTH | HOBBY | ORIGIN | ASPIRATION | EMOTIONAL | INTEGRATED
- topic: short description (e.g., "tennis", "daughter's recital", "career pivot from engineering")
- newDetails: any new information learned (e.g., "plays tennis on weekends, has a regular group")
- userEngagement: LOW (one-word answer) | MEDIUM (a sentence or two) | HIGH (told a story or elaborated)
- isIntegrated: true if the personal topic was intertwined with work context

If no personal topics were discussed, return an empty array.

Return JSON array only. No explanation.

TRANSCRIPT:
${transcript.substring(0, 4000)}`,
  );

  try {
    const topics = JSON.parse(extraction);
    if (!Array.isArray(topics)) return;

    for (const topic of topics) {
      // Check if this matches an existing thread
      const existing = await prisma.personalThread.findFirst({
        where: {
          userId,
          topic: { contains: topic.topic.substring(0, 20) },
          offLimits: false,
        },
      });

      if (existing) {
        // Advance the thread
        const nextStage = advanceStage(existing.stage);
        const mergedDetails = {
          ...(existing.details as Record<string, unknown> || {}),
          ...(topic.newDetails ? { [`call_${voiceCallId}`]: topic.newDetails } : {}),
        };

        await prisma.personalThread.update({
          where: { id: existing.id },
          data: {
            stage: nextStage,
            lastTouched: new Date(),
            touchCount: { increment: 1 },
            userEngagement: topic.userEngagement || existing.userEngagement,
            details: mergedDetails,
            isIntegrated: topic.isIntegrated || existing.isIntegrated,
          },
        });
      } else if (topic.userEngagement !== 'LOW') {
        // Create a new thread (only if user actually engaged)
        await prisma.personalThread.create({
          data: {
            userId,
            category: topic.category,
            topic: topic.topic,
            stage: 'PLANTED',
            lastTouched: new Date(),
            userEngagement: topic.userEngagement,
            details: topic.newDetails ? { initial: topic.newDetails } : undefined,
            isIntegrated: topic.isIntegrated || false,
          },
        });
      }
    }
  } catch {
    console.error('[Thread Extraction] Failed to parse LLM output');
  }
}

function advanceStage(current: string): string {
  const progression: Record<string, string> = {
    PLANTED: 'WATERED',
    WATERED: 'GROWING',
    GROWING: 'HARVESTED',
    HARVESTED: 'MAINTAINED',
    MAINTAINED: 'MAINTAINED',
  };
  return progression[current] || current;
}
```

### 2.5 Post-Call Adaptation Signal Extraction

For calls 1–3, extract behavioral signals from the transcript to build adaptation signals before formal archetype detection. Add to `handleEndOfCallReport()`:

```typescript
async function extractAndUpdateAdaptationSignals(
  userId: string,
  transcript: string,
  durationSeconds: number,
  callCount: number,
) {
  if (callCount > 5) return; // Only needed for early calls

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { adaptationSignals: true },
  });

  const current = (prefs?.adaptationSignals as AdaptationSignals | null) || {
    modeLean: 'balanced',
    precision: false,
    peopleHungry: false,
    personalOpen: false,
    frameworkSeeker: false,
    followMode: false,
    integratedLife: false,
  };

  // Duration-based mode lean
  if (durationSeconds < 180) {
    current.modeLean = 'work_first';
  } else if (durationSeconds > 420) {
    current.modeLean = 'relationship_first';
  }

  // Use LLM to detect behavioral signals from transcript
  const extraction = await generateText(
    await getUserLLMConfig(userId),
    `Analyze this voice call transcript between Mira (AI coach) and the user. Detect these behavioral signals:

1. precision: Did the user correct Mira or test accuracy? (true/false)
2. peopleHungry: Did the user ask about stakeholder dynamics proactively? (true/false)
3. personalOpen: Did the user share personal context (family, hobbies, feelings) unprompted? (true/false)
4. frameworkSeeker: Did the user ask for specific scripts, templates, or phrases? (true/false)
5. followMode: Did the user go on tangents, lead the conversation, talk past expected duration? (true/false)
6. integratedLife: Did the user mention family/personal logistics in work context? (true/false)

Return JSON only: { precision: bool, peopleHungry: bool, personalOpen: bool, frameworkSeeker: bool, followMode: bool, integratedLife: bool }

TRANSCRIPT:
${transcript.substring(0, 3000)}`,
  );

  try {
    const signals = JSON.parse(extraction);
    // Signals are additive — once true, stay true
    if (signals.precision) current.precision = true;
    if (signals.peopleHungry) current.peopleHungry = true;
    if (signals.personalOpen) current.personalOpen = true;
    if (signals.frameworkSeeker) current.frameworkSeeker = true;
    if (signals.followMode) current.followMode = true;
    if (signals.integratedLife) current.integratedLife = true;

    // Refine mode lean based on accumulated signals
    if (current.personalOpen || current.integratedLife) {
      current.modeLean = 'relationship_first';
    }

    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, adaptationSignals: current },
      update: { adaptationSignals: current },
    });
  } catch {
    console.error('[Adaptation Signals] Failed to parse extraction');
  }
}
```

Wire into the webhook handler alongside thread extraction:

```typescript
// In handleEndOfCallReport(), after existing pipeline:
await extractAndUpdateThreads(userId, transcript, voiceCallId);
await extractAndUpdateAdaptationSignals(userId, transcript, durationSeconds, callCount);
```

---

## Phase 3: Confidence Engine

**Goal:** Compute per-stakeholder confidence scores. Gate people intelligence by tier. Adjust based on user confirmations/corrections.

### 3.1 Confidence Computation

New file: `worker/src/lib/confidence-engine.ts`

```typescript
import { prisma } from './prisma';

type ConfidenceTier = 'SILENT' | 'PROBE' | 'SUGGEST' | 'ASSERT';

interface StakeholderConfidence {
  stakeholderId: string;
  name: string;
  score: number;
  tier: ConfidenceTier;
}

// Default thresholds — can be overridden per archetype
const DEFAULT_THRESHOLDS = {
  SILENT: 0,
  PROBE: 0.3,
  SUGGEST: 0.6,
  ASSERT: 0.8,
};

const ARCHETYPE_THRESHOLDS: Record<string, typeof DEFAULT_THRESHOLDS> = {
  skeptic: { SILENT: 0, PROBE: 0.4, SUGGEST: 0.7, ASSERT: 0.9 },
  navigator: { SILENT: 0, PROBE: 0.2, SUGGEST: 0.5, ASSERT: 0.7 },
  // Others use defaults
};

export async function computeStakeholderConfidence(
  userId: string,
  archetype?: string | null,
): Promise<StakeholderConfidence[]> {
  const thresholds = archetype && ARCHETYPE_THRESHOLDS[archetype]
    ? ARCHETYPE_THRESHOLDS[archetype]
    : DEFAULT_THRESHOLDS;

  const profiles = await prisma.stakeholderProfile.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      email: true,
      interactionCount: true,
      lastInteraction: true,
      enrichmentSource: true,
      communicationStyle: true,
      personaArchetype: true,
      intelligence: { select: { evidenceCount: true } },
    },
  });

  // Count user-stated facts per stakeholder from knowledge graph
  const userStatedFacts = await prisma.knowledgeFact.groupBy({
    by: ['subjectId'],
    where: {
      subject: { userId, entityType: 'PERSON' },
      source: 'USER_STATED',
    },
    _count: true,
  });
  const userStatedMap = new Map(userStatedFacts.map(f => [f.subjectId, f._count]));

  // Count corrections per stakeholder
  const corrections = await prisma.userCorrection.findMany({
    where: { userId, entityType: { startsWith: 'stakeholder' } },
    select: { context: true },
  });

  return profiles.map(p => {
    // Source score
    const hasCalendar = p.interactionCount > 0;
    const hasEmail = p.enrichmentSource === 'web_search' || (p.intelligence?.evidenceCount ?? 0) > 0;
    const hasUserStatement = (userStatedMap.get(p.id) || 0) > 0;
    const sourceScore = hasUserStatement ? 0.7
      : (hasCalendar && hasEmail) ? 0.5
      : hasCalendar ? 0.3
      : 0.1;

    // Interaction density
    const count = p.interactionCount;
    const densityScore = count < 3 ? 0.5
      : count < 7 ? 0.7
      : count < 15 ? 0.9
      : 1.0;

    // Recency
    const daysSinceInteraction = p.lastInteraction
      ? (Date.now() - p.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const recencyScore = daysSinceInteraction < 7 ? 1.0
      : daysSinceInteraction < 30 ? 0.8
      : daysSinceInteraction < 90 ? 0.6
      : 0.4;

    const score = Math.min(1, sourceScore * densityScore * recencyScore);

    // Determine tier
    const tier: ConfidenceTier = score >= thresholds.ASSERT ? 'ASSERT'
      : score >= thresholds.SUGGEST ? 'SUGGEST'
      : score >= thresholds.PROBE ? 'PROBE'
      : 'SILENT';

    return { stakeholderId: p.id, name: p.name, score, tier };
  });
}
```

### 3.2 Wire Confidence into `buildPeopleIntel()`

Update the existing `buildPeopleIntel` function (from Phase 1) to use the confidence engine:

```typescript
import { computeStakeholderConfidence } from './confidence-engine';

async function buildPeopleIntel(userId: string, confidenceMode: string, archetype?: string | null): Promise<string> {
  if (confidenceMode === 'LEARNING') {
    return '';
  }

  const confidences = await computeStakeholderConfidence(userId, archetype);

  // Get today's meeting attendees
  // ... (existing meeting query) ...

  // Filter to attendees who are above SILENT tier
  const relevantProfiles = confidences
    .filter(c => c.tier !== 'SILENT' && attendeeEmails.includes(c.name))
    .slice(0, 5);

  return relevantProfiles.map(c => {
    const profile = profiles.find(p => p.name === c.name);
    if (!profile) return '';

    const tierLabel = c.tier === 'PROBE'
      ? '(still learning — ask to confirm)'
      : c.tier === 'SUGGEST'
      ? '(moderate confidence — hedge when stating)'
      : '(high confidence — can state directly)';

    const parts = [`${c.name} ${tierLabel}`];
    if (profile.communicationStyle) parts.push(`  Style: ${profile.communicationStyle}`);
    if (profile.intelligence?.successPatterns) parts.push(`  What works: ${profile.intelligence.successPatterns}`);
    if (profile.intelligence?.objectionPatterns) parts.push(`  Watch for: ${profile.intelligence.objectionPatterns}`);
    return parts.join('\n');
  }).filter(Boolean).join('\n\n');
}
```

### 3.3 Post-Call Confidence Updates

Add to the post-call extraction pipeline (in webhook handler):

```typescript
async function extractConfidenceSignals(userId: string, transcript: string) {
  const extraction = await generateText(
    await getUserLLMConfig(userId),
    `Given this voice call transcript between Mira (AI coach) and the user, identify moments where:
1. Mira stated something about a person and the user CONFIRMED it ("yeah exactly", "that's right", "spot on")
2. Mira stated something about a person and the user CORRECTED it ("no actually", "that's not right", "it's more like")

For each, return:
- personName: who was being discussed
- claim: what Mira said
- response: CONFIRMED | CORRECTED
- correction: if corrected, what the user said instead

Return JSON array. Empty array if no confirmations/corrections found.

TRANSCRIPT:
${transcript.substring(0, 4000)}`,
  );

  try {
    const signals = JSON.parse(extraction);
    for (const signal of signals) {
      if (signal.response === 'CORRECTED' && signal.correction) {
        // Store as CorrectionLearning
        await prisma.userCorrection.create({
          data: {
            userId,
            entityType: 'stakeholder_intelligence',
            field: signal.claim,
            aiValue: signal.claim,
            userValue: signal.correction,
            context: { personName: signal.personName, source: 'voice_call' },
          },
        });
      }
      // Confirmation/correction will be used by confidence engine
      // on next computation (higher/lower interaction quality)
    }
  } catch {
    console.error('[Confidence Extraction] Failed to parse');
  }
}
```

---

## Phase 4: Archetype Detection + Duration Inference

**Goal:** Detect user archetype from behavior. Auto-adjust call duration. Switch conversation mode.

### 4.1 Archetype Detection

New file: `worker/src/lib/archetype-detector.ts`

Runs after call 5 and re-evaluates monthly.

```typescript
export async function detectArchetype(userId: string): Promise<{
  primary: string;
  secondary?: string;
  conversationMode: string;
}> {
  // Gather signals
  const calls = await prisma.voiceCall.findMany({
    where: { userId, status: 'ended', durationSeconds: { gt: 30 } },
    select: { transcript: true, durationSeconds: true, callType: true },
    orderBy: { endedAt: 'desc' },
    take: 10,
  });

  const threads = await prisma.personalThread.findMany({
    where: { userId },
    select: { userEngagement: true, category: true, touchCount: true },
  });

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { primaryArchetype: true },
  });

  // If manually set, don't override
  if (prefs?.primaryArchetype) {
    return {
      primary: prefs.primaryArchetype,
      conversationMode: getMode(prefs.primaryArchetype),
    };
  }

  // Compute signals
  const avgDuration = calls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / (calls.length || 1);
  const personalEngagement = threads.filter(t => t.userEngagement === 'HIGH').length;
  const totalThreadTouches = threads.reduce((s, t) => s + t.touchCount, 0);

  // Use LLM to classify based on transcript patterns
  const transcriptSample = calls
    .slice(0, 5)
    .map(c => c.transcript?.substring(0, 500))
    .filter(Boolean)
    .join('\n---\n');

  const classification = await generateText(
    await getSystemLLMConfig(),
    `Based on these voice call transcript excerpts between an AI coach and a user, classify the user into ONE primary archetype:

ARCHETYPES:
- operator: Action-oriented, impatient, short answers, values efficiency
- navigator: Strategic about stakeholders, asks about dynamics, reads rooms
- climber: Eager, asks questions, open to coaching, growth mindset
- founder: Chaotic topics, switches subjects, thinks out loud, lonely at top
- skeptic: Tests accuracy, measured, precise, high bar for quality
- reluctant: Technical, prefers frameworks, uncomfortable with soft skills
- juggler: Mentions kids/family during work context, stretched thin, guilt signals
- only_one: References being the only woman, navigating gendered dynamics
- connector: Naturally relational, many names mentioned, tracks people
- returner: References career break, rebuilding confidence, imposter signals
- portfolio: Multiple work contexts, different clients/roles
- community: Mission-driven, impact language, over-extends

Also determine: conversation_mode (work_first | relationship_first | adaptive)

Consider:
- Average call duration: ${Math.round(avgDuration / 60)} minutes
- Personal thread engagement: ${personalEngagement} high-engagement threads
- Total personal thread touches: ${totalThreadTouches}

TRANSCRIPTS:
${transcriptSample}

Return JSON: { primary: "archetype_key", secondary: "archetype_key" | null, conversationMode: "work_first" | "relationship_first" | "adaptive" }`,
  );

  try {
    const result = JSON.parse(classification);
    // Save to user preferences
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, primaryArchetype: result.primary, conversationMode: result.conversationMode },
      update: { primaryArchetype: result.primary, secondaryArchetype: result.secondary, conversationMode: result.conversationMode },
    });
    return result;
  } catch {
    return { primary: 'climber', conversationMode: 'adaptive' };
  }
}

function getMode(archetype: string): string {
  const workFirst = ['operator', 'skeptic', 'reluctant'];
  const relationshipFirst = ['juggler', 'connector', 'community', 'returner', 'climber'];
  if (workFirst.includes(archetype)) return 'work_first';
  if (relationshipFirst.includes(archetype)) return 'relationship_first';
  return 'adaptive';
}
```

### 4.2 Duration Inference

Add to post-call processing — after 5 calls, compute average and auto-adjust:

```typescript
async function inferPreferredDuration(userId: string) {
  const calls = await prisma.voiceCall.findMany({
    where: { userId, status: 'ended', callType: { in: ['morning_brief', 'daily_checkin'] } },
    select: { durationSeconds: true },
    orderBy: { endedAt: 'desc' },
    take: 5,
  });

  if (calls.length < 5) return; // Not enough data

  const avgSeconds = calls.reduce((s, c) => s + (c.durationSeconds || 0), 0) / calls.length;
  const avgMinutes = Math.round(avgSeconds / 60);

  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { preferredCallDuration: true },
  });

  const current = prefs?.preferredCallDuration ?? 10;

  // Only adjust if consistently different by 2+ minutes
  if (Math.abs(avgMinutes - current) >= 2) {
    await prisma.userPreferences.update({
      where: { userId },
      data: { preferredCallDuration: avgMinutes },
    });
    console.log(`[Duration] Auto-adjusted ${userId} from ${current} to ${avgMinutes} min`);
  }
}
```

### 4.3 Trigger Points

- **Archetype detection:** Triggered by a cron or post-call check when `callCount === 5` and `primaryArchetype` is null. Re-evaluate monthly.
- **Duration inference:** Run in post-call pipeline after every daily/morning call once `callCount >= 5`.

---

## Phase 5: Maturity Transitions

**Goal:** Upgrade maturity level (LEARNING → OBSERVING → COACHING) based on data signals, not just call count.

### 5.1 Maturity Computation

Add to `conversation-engine.ts`:

```typescript
type MaturityLevel = 'LEARNING' | 'OBSERVING' | 'COACHING';

async function computeMaturityLevel(userId: string): Promise<MaturityLevel> {
  const [personalCtx, confidences, corrections, prefs] = await Promise.all([
    prisma.personalContext.findUnique({ where: { userId }, select: { callCount: true } }),
    computeStakeholderConfidence(userId),
    prisma.userCorrection.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.userPreferences.findUnique({ where: { userId }, select: { primaryArchetype: true } }),
  ]);

  const callCount = personalCtx?.callCount || 0;
  const probeOrHigher = confidences.filter(c => c.tier !== 'SILENT').length;
  const suggestOrHigher = confidences.filter(c => ['SUGGEST', 'ASSERT'].includes(c.tier)).length;
  const recentCorrections = corrections.length;

  // COACHING requires: 15+ calls, 5+ stakeholders at SUGGEST+, low correction rate
  if (
    callCount >= 15 &&
    suggestOrHigher >= 5 &&
    recentCorrections <= 2  // max 2 corrections in last 2 weeks
  ) {
    return 'COACHING';
  }

  // OBSERVING requires: 5+ calls, 3+ stakeholders above SILENT, at least some confirmation
  if (
    callCount >= 5 &&
    probeOrHigher >= 3
  ) {
    return 'OBSERVING';
  }

  return 'LEARNING';
}
```

### 5.2 Wire into Pre-Call Pipeline

Replace the simple heuristic in `buildVariableValues()`:

```typescript
// Replace:
//   const confidenceMode = callCount < 5 ? 'LEARNING' : ...
// With:
const confidenceMode = await computeMaturityLevel(userId);
vars.confidenceMode = confidenceMode;
```

### 5.3 Maturity Regression

When a user hasn't called in 2+ weeks, drop maturity on next call:

```typescript
// In buildVariableValues(), after loading personalCtx:
const daysSinceLastCall = personalCtx?.lastCallDate
  ? (Date.now() - personalCtx.lastCallDate.getTime()) / (1000 * 60 * 60 * 24)
  : 999;

if (daysSinceLastCall > 14) {
  // Override maturity down one level
  const computed = await computeMaturityLevel(userId);
  const regressed = computed === 'COACHING' ? 'OBSERVING'
    : computed === 'OBSERVING' ? 'LEARNING'
    : 'LEARNING';
  vars.confidenceMode = regressed;
}
```

---

## Dynamic Voice Parameters

**Goal:** Override Vapi call parameters (speed, temperature, silence timeout, max duration) per call based on context, archetype, and call type. Voice identity (Priyanka Sogum, female, 11labs) stays fixed — these are Mira's identity.

### Fixed vs. Dynamic

| Parameter | Fixed? | Notes |
|-----------|--------|-------|
| Voice provider | Fixed | 11labs |
| Voice ID | Fixed | Priyanka Sogum |
| Gender | Fixed | Female — Mira's identity |
| Language | Fixed | English (Hindi code-switching via prompt) |
| Speed | **Dynamic** | 0.8–1.1 based on call type, mood, archetype |
| Temperature | **Dynamic** | 0.5–0.8 based on call type, confidence mode |
| Silence timeout | **Dynamic** | 30–90s based on call type, archetype |
| Max duration | **Dynamic** | Based on call type, user preference, archetype |

### Speed Rules

| Context | Speed | Rationale |
|---------|-------|-----------|
| Default | 0.9 | Slightly slower than normal — coaching cadence |
| Pre-meeting prep | 1.0 | Quick, efficient — user is about to walk in |
| Heavy meeting day (10+) | 0.85 | Slow down for a packed day — gravitas matters |
| Founder archetype | 0.85 | Match their reflective pace |
| Operator archetype | 1.0 | Match their efficiency preference |
| Post-meeting debrief | 0.9 | Default — match user's energy |

### Temperature Rules

| Context | Temperature | Rationale |
|---------|------------|-----------|
| Default | 0.7 | Balanced creativity/consistency |
| Pre-meeting prep | 0.5 | Factual, no hallucination risk |
| LEARNING confidence mode | 0.6 | More conservative when still calibrating |
| Founder archetype | 0.8 | Allow more creative, exploratory responses |
| Skeptic archetype | 0.5 | Precision over creativity |
| Coaching/personal segment | 0.75 | Slightly warmer for personal conversation |

### Silence Timeout Rules

| Context | Timeout | Rationale |
|---------|---------|-----------|
| Default | 60s | Standard conversational pause |
| Pre-meeting prep | 30s | User is busy, end quickly if silent |
| Founder archetype | 90s | They think out loud — long pauses are normal |
| Deep coaching moment | 75s | Give space for reflection |
| Post-meeting debrief | 45s | Shorter — user may be walking between meetings |

### Max Duration Rules

| Call Type | Max Duration | Notes |
|-----------|-------------|-------|
| Pre-meeting prep | 5 min (300s) | Hard ceiling |
| Post-meeting debrief | 5 min (300s) | Hard ceiling |
| Commitment reminder | 3 min (180s) | Quick check |
| Morning brief / Daily | `(preferredDuration × 60) + 120s` buffer | User-controlled with 2-min grace |
| Onboarding | 15 min (900s) | First calls are longer |

### Implementation: `computeVoiceOverrides()`

Add to `worker/src/lib/vapi-voice.ts`:

```typescript
interface VoiceOverrides {
  voice: { speed: number };
  model: { temperature: number };
  maxDurationSeconds: number;
  silenceTimeoutSeconds: number;
}

const DURATION_MAP: Record<string, number> = {
  pre_meeting_prep: 300,
  post_meeting_debrief: 300,
  commitment_reminder: 180,
  onboarding: 900,
};

function computeVoiceOverrides(
  callType: string,
  confidenceMode: string,
  callCount: number,
  meetingCount: number,
  archetype?: string | null,
  preferredDuration?: number | null,
): VoiceOverrides {
  // --- Speed ---
  let speed = 0.9;
  if (callType === 'pre_meeting_prep') speed = 1.0;
  if (meetingCount > 10) speed = 0.85;
  if (archetype === 'founder') speed = 0.85;
  if (archetype === 'operator') speed = 1.0;

  // --- Temperature ---
  let temperature = 0.7;
  if (callType === 'pre_meeting_prep') temperature = 0.5;
  if (confidenceMode === 'LEARNING') temperature = 0.6;
  if (archetype === 'founder') temperature = 0.8;
  if (archetype === 'skeptic') temperature = 0.5;

  // --- Max Duration ---
  const maxDuration = DURATION_MAP[callType]
    ?? ((preferredDuration ?? 10) * 60 + 120);

  // --- Silence Timeout ---
  let silenceTimeout = 60;
  if (callType === 'pre_meeting_prep') silenceTimeout = 30;
  if (callType === 'post_meeting_debrief') silenceTimeout = 45;
  if (archetype === 'founder') silenceTimeout = 90;

  return {
    voice: { speed },
    model: { temperature },
    maxDurationSeconds: maxDuration,
    silenceTimeoutSeconds: silenceTimeout,
  };
}
```

### Integration into `triggerVoiceCall()`

The overrides are spread into the Vapi API call payload via `assistantOverrides`:

```typescript
// In triggerVoiceCall(), after building variableValues:

const overrides = computeVoiceOverrides(
  callType,
  vars.confidenceMode,
  callCount,
  parseInt(vars.meetingCount || '0'),
  prefs?.primaryArchetype,
  prefs?.preferredCallDuration,
);

const payload = {
  assistantId,
  assistantOverrides: {
    variableValues: vars,
    voice: {
      ...existingVoiceConfig,
      speed: overrides.voice.speed,
    },
    model: {
      ...existingModelConfig,
      temperature: overrides.model.temperature,
    },
    maxDurationSeconds: overrides.maxDurationSeconds,
    silenceTimeoutSeconds: overrides.silenceTimeoutSeconds,
  },
  customer: { number: phoneNumber },
};
```

### Testing — Voice Parameters

1. Pre-meeting prep call → verify speed=1.0, temperature=0.5, silenceTimeout=30s, maxDuration=300s
2. Daily call for founder archetype → speed=0.85, temperature=0.8, silenceTimeout=90s
3. Daily call for skeptic archetype → temperature=0.5
4. User with preferredCallDuration=7 → maxDuration=540s (7×60+120)
5. Heavy meeting day (12 meetings) → speed=0.85
6. Verify in Vapi dashboard that overrides are applied to the call

---

## File Change Summary

| File | Change Type | Phase |
|------|------------|-------|
| `scripts/setup-vapi-assistants.ts` | Major rewrite of prompts | 1 |
| `worker/src/lib/vapi-voice.ts` | Extend `buildVariableValues()` + `computeVoiceOverrides()` + `triggerVoiceCall()` | 1, 2, 3, Voice |
| `web/app/api/vapi/call/route.ts` | Extend `buildVariableValues()` | 1, 2, 3 |
| `web/app/api/vapi/webhook/route.ts` | Add thread extraction + confidence signals + adaptation signals to post-call | 1, 2, 3 |
| `web/prisma/schema.prisma` | Add `PersonalThread` model + `UserPreferences` fields (incl. `adaptationSignals`) | 1, 2 |
| `worker/src/lib/thread-manager.ts` | **New** — thread selection logic | 2 |
| `worker/src/lib/confidence-engine.ts` | **New** — per-stakeholder confidence scoring | 3 |
| `worker/src/lib/archetype-detector.ts` | **New** — LLM-based archetype classification | 4 |
| `worker/src/lib/conversation-engine.ts` | **New** — maturity computation, orchestration | 5 |

---

## Testing Strategy

### Per-Phase Smoke Tests

**Phase 1 (Prompt Engineering):**
- Make a call with 0 meetings → Mira should NOT invent meetings
- Make a call with callCount=2 → Mira should NOT give advice (LEARNING mode)
- Make a call with callCount=20 → Mira should be more direct
- Check that `conversationPlan` variable is populated in Vapi logs

**Phase 2 (Threads):**
- Make call → mention tennis → check PersonalThread created in DB
- Next call → verify `personalThreadInstruction` includes tennis follow-up
- Give a one-word answer to personal question → check thread marked LOW engagement
- Next call → verify that LOW engagement thread is NOT followed up

**Phase 3 (Confidence):**
- View a stakeholder with 1 meeting → should be SILENT tier
- View a stakeholder with 10 meetings + user statement → should be SUGGEST or ASSERT
- Correct Mira about a stakeholder → check UserCorrection created
- Next call → verify corrected stakeholder has lower confidence

**Phase 4 (Archetype):**
- After 5 calls → check that primaryArchetype is set on UserPreferences
- Verify conversation mode matches archetype (operator → work_first)
- After 5 daily calls → check preferredCallDuration auto-adjusted

**Phase 5 (Maturity):**
- User with 3 calls → should be LEARNING
- User with 8 calls + 3 confirmed probes → should be OBSERVING
- User with 20 calls + 5 high-confidence stakeholders → should be COACHING
- User inactive for 3 weeks → maturity should regress one level

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| LLM ignores prompt structure | Calls feel unstructured | Keep prompts short. Test each template with 10+ calls. Remove instructions that are consistently ignored. |
| Thread extraction misparses transcripts | Wrong threads created, wrong engagement scores | Validate extraction output against schema. Discard malformed results. |
| Confidence scores too conservative | Mira stays in LEARNING mode too long | Start with loose thresholds, tighten if correction rate is high. Monitor maturity distribution. |
| Archetype detection wrong | User gets wrong conversation mode | Allow manual override in settings. Re-evaluate monthly. Default to "adaptive" when unsure. |
| Post-call LLM extraction cost | ₹10-20 per call in LLM costs (thread + confidence extraction) | Use the user's own LLM config. Extract both in a single prompt to halve costs. |
| Vapi variable value size limits | Too much context → truncated | Monitor payload size. Truncate people intel to top 3 stakeholders. Cap conversation plan at 500 chars. |
