# Call Intelligence: When to Call and About What

**Status:** Design
**Priority:** P0 — Determines whether users anticipate Mira or mute her
**Depends on:** Voice Strategy (Phase 1 Complete), Conversation Engine, Knowledge Graph
**Last Updated:** 2026-03-16

---

## Problem Statement

Mira currently calls based on **clock and calendar**: morning at 7:45 AM, pre-meeting at T-15 minutes, retry after 60 minutes. This is a notification schedule, not a coaching relationship.

A great coach doesn't call because it's 7:45 AM. They call because they have something worth saying, they know how to say it, and they know the person wants to hear it right now. Some days that's three calls. Some days that's one quiet check-in. Some days it's a 30-second "you crushed it."

**The goal:** Users should think "I wonder what Mira noticed today" — not "Mira's calling again."

### Two Metrics That Matter

1. **Anticipation** — user picks up because they expect value, not obligation
2. **Fatigue resistance** — user never feels "too many calls" because every call earns its place

### What Changes

Replace: `schedule(time) → build_agenda(meetings + nudges) → call`

With: `assess_signals() → decide_posture(person + moment) → decide_if_call_worthy() → optimize_timing() → call`

---

## The Signal Model

Every potential call moment is evaluated against signals across 6 dimensions. Each signal has a **strength** (0–1) and a **posture affinity** (which coaching posture it points toward).

### 1. Calendar Signals (available from day 1)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| High-stakes meeting in next 2 hours | 0.7–0.9 | Prepare | MeetingSyncRecord (needleMover, attendee seniority, duration) |
| Meeting just ended (15–45 min ago) | 0.5–0.8 | Debrief | Calendar + time check |
| Back-to-back day (6+ meetings) | 0.4–0.6 | Uplift | Calendar density analysis |
| Light day (0–2 meetings) | 0.3–0.5 | Connect / Advise | Calendar + normal baseline |
| Meeting cancelled (was high-stakes) | 0.4–0.6 | Connect | Calendar diff from yesterday |
| New attendee added to important meeting | 0.5–0.7 | Prepare | Calendar change detection |
| No meetings today but had 8 yesterday | 0.4 | Debrief (yesterday) | Cross-day pattern |

### 2. Coaching Signals (builds over time)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| Commitment going stale (>3 days, no follow-up) | 0.6–0.8 | Nudge | MeetingCommitment.status + dueDate |
| Coaching theme recurring (3+ calls, unresolved) | 0.5–0.7 | Advise / Challenge | CoachingRelationshipPlan.coachingThemes |
| Hypothesis ready to test | 0.4–0.6 | Advise | HypothesisEngine output |
| Onboarding topic gap (uncovered topic, user ready) | 0.5–0.7 | Connect / Listen | OnboardingProgress gaps |
| Goal milestone approaching | 0.5–0.7 | Nudge / Prepare | Goal.targetDate proximity |
| Pattern detected (negative: skipping prep, avoiding someone) | 0.5–0.7 | Challenge | Weekly analysis output |

### 3. Outcome Signals (post-meeting intelligence)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| Outcome LANDED on high-stakes meeting | 0.7–0.9 | Celebrate | ConversationOutcome / post-meeting nudge |
| Outcome MISSED | 0.6–0.8 | Debrief / Uplift | ConversationOutcome |
| Consecutive wins (3+ outcomes landed this week) | 0.6–0.8 | Celebrate | Outcome trend |
| Consecutive misses (2+ outcomes missed) | 0.6–0.8 | Uplift / Listen | Outcome trend |
| Desired outcome was set pre-call but no debrief yet | 0.5–0.7 | Debrief | MeetingSyncRecord.desiredOutcome exists, no outcome |

### 4. Emotional/Energy Signals (inferred, not measured)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| Calendar fragmentation spike (lots of 15-min meetings, rescheduling) | 0.4–0.6 | Uplift | Calendar pattern deviation from baseline |
| Email velocity spike (sending 2x normal rate) | 0.3–0.5 | Uplift / Listen | Email metadata (if available) |
| Known energy drain time (afternoon for morning people) | 0.3–0.4 | Uplift / Connect | PersonalContext.energyPatterns |
| Post-difficult-stakeholder meeting | 0.5–0.7 | Listen / Debrief | Meeting attendee = known blocker/difficult |
| Friday afternoon (decompression window) | 0.4–0.5 | Connect / Celebrate | Day + time |
| Monday morning (fresh start energy) | 0.3–0.4 | Prepare | Day + time |

### 5. Relationship Signals (Mira ↔ user)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| Personal thread ready to water (planted 2-3 days ago) | 0.4–0.6 | Connect | PersonalThread.lastTouchedAt + stage |
| User hasn't been called in 24h+ | 0.6–0.8 | Any (min 1/day guarantee) | ScheduledCall history |
| User initiated callback ("call me later") | 0.8–1.0 | Listen | Callback request |
| Last call had low engagement score | 0.3–0.5 | Reduce frequency / shorter call | CallEvaluation.engagementScore |
| Last call had high depth-of-sharing | 0.4–0.6 | Connect / Listen (they're opening up) | CallEvaluation.depthOfSharingScore |
| valueAddScore trending down over 3+ calls | 0.5–0.7 | Change approach (Challenge / Connect) | CallEvaluation trend |

### 6. Knowledge Signals (new intel worth sharing)

| Signal | Strength | Posture Affinity | Source |
|--------|----------|-----------------|--------|
| Stakeholder profile newly enriched (crossed confidence tier) | 0.5–0.7 | Advise | StakeholderProfile confidence change |
| New high-confidence fact about key person | 0.4–0.6 | Advise | KnowledgeFact.confidence crossing threshold |
| Community/cluster shift detected | 0.3–0.5 | Advise | Community detection output |
| Document activity on shared project | 0.3–0.5 | Prepare / Advise | Drive sync |

---

## The Call-Worthiness Decision

### Step 1: Signal Aggregation

Every 5 minutes (aligned with existing cron), the system evaluates all active signals for each user. Signals are scored and grouped by posture affinity.

```
For each user:
  signals = collectActiveSignals(userId)

  // Group by posture
  postureScores = {
    celebrate: sum(signals where affinity=celebrate) / count,
    uplift: sum(signals where affinity=uplift) / count,
    prepare: sum(signals where affinity=prepare) / count,
    advise: sum(signals where affinity=advise) / count,
    listen: sum(signals where affinity=listen) / count,
    nudge: sum(signals where affinity=nudge) / count,
    challenge: sum(signals where affinity=challenge) / count,
    connect: sum(signals where affinity=connect) / count,
    debrief: sum(signals where affinity=debrief) / count,
  }

  // Overall call-worthiness
  callWorthiness = max(postureScores) + 0.3 * secondHighest(postureScores)
```

### Step 2: Posture Selection

The top 1-3 postures become the call's coaching mix. Primary posture sets the tone; secondary postures weave in.

```
primaryPosture = argmax(postureScores)
secondaryPostures = top 2 where score > 0.3 AND score > 0.5 * primaryScore
```

**Posture compatibility matrix** (some postures blend well, others clash):

| Primary | Compatible Secondary | Incompatible |
|---------|---------------------|-------------|
| Celebrate | Connect, Prepare (tomorrow) | Nudge, Challenge |
| Uplift | Listen, Connect | Challenge, Nudge |
| Prepare | Advise, Nudge (light) | Listen, Celebrate |
| Advise | Prepare, Nudge | Listen (unless user leads) |
| Listen | Connect, Uplift | Advise, Nudge, Challenge |
| Nudge | Advise, Prepare | Celebrate, Listen |
| Challenge | Advise, Connect | Uplift, Celebrate |
| Connect | Listen, Uplift, Celebrate | Nudge |
| Debrief | Celebrate, Advise, Listen | Prepare |

### Step 3: Fatigue Check

Even if call-worthy, check against fatigue model:

```
callsToday = count(ScheduledCall where userId AND today AND status IN ('completed', 'calling'))
timeSinceLastCall = now - lastCompletedCall.endedAt

// Base threshold rises with each call
fatigueThreshold = 0.4 + (callsToday * 0.15)

// Recency penalty: calling again within 2 hours needs very strong signal
if timeSinceLastCall < 2h: fatigueThreshold += 0.2
if timeSinceLastCall < 1h: fatigueThreshold += 0.3

// User signal adjustments
if lastCallEngagement < 4: fatigueThreshold += 0.1  // low engagement = back off
if userPrefs.callPacingStyle == 'quick': fatigueThreshold += 0.1
if userPrefs.callPacingStyle == 'deep': fatigueThreshold -= 0.1

// Hard limits
if callsToday >= maxCallsPerDay: SKIP (unless callback or critical)
if timeSinceLastCall < 30min: SKIP (unless callback)
```

**The guarantee: min 1 call/day.** If it's past the user's preferred morning time and no call has been made today, force a call with best available posture. If no strong signals, default to a light Connect + day-shape briefing.

### Step 4: Timing Optimization

Once call-worthiness passes the fatigue threshold, optimize WHEN to call:

| Posture | Optimal Timing |
|---------|---------------|
| Prepare | 10-20 min before the relevant meeting |
| Debrief | 15-45 min after the meeting ended |
| Celebrate | ASAP after the win signal (within 1 hour) |
| Uplift | During energy drain window OR after a rough meeting |
| Nudge | Morning (accountability feels natural at day start) |
| Challenge | Mid-day, not first or last call (user has energy, not defensive) |
| Connect | End of day, commute window, light-calendar moments |
| Listen | When user initiated (callback) OR after high depth-of-sharing trend |
| Advise | Before relevant meeting OR during a gap when user can absorb it |

**Never call during:**
- Active meetings (check calendar for in-progress meetings)
- DND/quiet hours
- Within 5 minutes of a meeting start (user is joining)
- Within 5 minutes of a meeting end (user is wrapping up)

---

## Onboarding Acceleration

Onboarding can't wait for organic discovery across daily calls. It must happen fast — ideally 80% of the 9 topics covered in the first 7 days. But it can't feel like an intake form.

### Strategy: Weave Onboarding Into Every Posture

Instead of dedicated "onboarding calls," every call in weeks 1-2 includes a small onboarding component matched to the posture:

| Posture | Onboarding Integration | Topics Best Suited |
|---------|----------------------|-------------------|
| Prepare | "Tell me about your relationship with [attendee]" → stakeholders, leadership_style | stakeholders, leadership_style |
| Debrief | "What were you going for?" → goals, challenges | goals, challenges |
| Connect | "What got you into [field]?" → story, drives_and_values, life | story, drives_and_values, life |
| Uplift | "What recharges you?" → life, drives_and_values | life, drives_and_values |
| Listen | Natural discovery as user talks → any topic | any |
| Advise | "Here's what I'd suggest... but first, how do you usually handle [X]?" → leadership_style | leadership_style, challenges |

### Onboarding Pacing Rules

1. **Calls 1-3:** Max 1 onboarding question per call (earn the right)
2. **Calls 4-7:** Can ask 2 onboarding questions if engagement is high
3. **Never force onboarding into a Celebrate or pure Listen posture** — those are sacred
4. **Track which topics emerged organically** — if the user volunteers their story during a Debrief, don't re-ask it
5. **If user is work_first lean:** Lead onboarding through meeting-context questions (stakeholders, goals, challenges first). Personal topics (story, life, drives) emerge through Connect postures later
6. **If user is relationship_first lean:** Lead through personal curiosity (story, life, drives first). Work topics emerge through Prepare/Debrief postures
7. **Minimum 1 call/day in first 7 days** — the daily guarantee is especially important during onboarding

### Onboarding Completion Criteria

Graduate from accelerated onboarding when:
- 7+ of 9 topics have at least PROBE-depth coverage, OR
- 10+ calls completed, OR
- User explicitly signals "you know me well enough" (detected in transcript)

Post-graduation, remaining gaps become low-priority Connect posture topics — Mira fills them naturally over weeks, not aggressively.

---

## Call Types → Posture Mapping

Existing call types map to postures, but the system now thinks in postures first:

| Old Call Type | Primary Posture | Typical Secondary |
|--------------|----------------|-------------------|
| morning_brief | Prepare + Briefing | Nudge, Connect |
| pre_meeting_prep | Prepare | Advise |
| post_meeting_debrief | Debrief | Celebrate or Listen |
| daily_checkin | Varies by signals | — |
| onboarding | Connect + Listen | Varies |
| callback | Listen | Varies |
| commitment_reminder | Nudge | Advise |
| friday_ritual | Celebrate + Connect | — |
| weekly_reflection | Debrief + Advise | Challenge |

The `callType` field on `ScheduledCall` still exists for analytics and Vapi assistant selection. But the **posture** drives the conversation content, not the call type.

---

## Autoresearch: Continuous Experimentation

The hypothesis engine (already built) extends to call intelligence decisions:

### What We Experiment On

1. **Posture selection accuracy:** Did the posture match the user's need?
   - Measure: engagement score, depth-of-sharing, user talk ratio, call duration vs target
   - If user talked past target → posture resonated
   - If user gave short answers → posture may have been wrong

2. **Timing optimization:** Was this the right moment to call?
   - Measure: pickup rate, time-to-answer, engagement in first 60 seconds
   - If user didn't pick up → timing was off
   - If user said "good timing" or engaged immediately → timing was right

3. **Fatigue calibration:** Are we calling too much or too little?
   - Measure: pickup rate trend, call duration trend, explicit feedback
   - If pickup rate drops over a week → fatigue, raise threshold
   - If user says "call me more" or engagement stays high → can lower threshold

4. **Signal weighting:** Which signals actually predict good calls?
   - Measure: correlation between signal strength and call engagement
   - Weekly analysis: which signal types led to highest-engagement calls?
   - Adjust signal strengths based on per-user outcomes

### How Experiments Run

```
Every call produces:
  - Input: signals that triggered it, posture selected, timing chosen
  - Output: engagement score, duration, depth, user feedback

Weekly autoresearch cycle:
  1. Analyze last 7 days of calls per user
  2. Identify: which posture × signal combinations produced best outcomes?
  3. Identify: which timing windows had highest pickup + engagement?
  4. Identify: fatigue signals (declining engagement, shorter calls, missed pickups)
  5. Generate 2-3 hypotheses: "User X responds best to Debrief posture after meeting with [person]"
  6. Adjust signal weights and fatigue thresholds for next week
  7. Log adjustments in CoachingRelationshipPlan for transparency
```

### Per-User Learning

The system learns each person's calling preferences:

- **Best time windows:** Some people prefer morning, some prefer post-lunch, some prefer commute time
- **Preferred postures:** Some people love Debrief calls, others find them tedious. Some crave Challenge, others resist it
- **Fatigue threshold:** Some people want 3 calls/day, others want exactly 1
- **Posture receptivity by day:** Monday = Prepare energy. Friday = Connect energy. After tough meetings = Listen

This is stored in `UserPreferences` and refined weekly by the autoresearch cycle.

---

## Signal Sources: What Generates Signals

### Passive (no user action needed)
- Calendar sync (meetings, changes, density)
- Email metadata (velocity, frequency patterns)
- Drive activity (document edits, sharing)
- Time of day + day of week
- Knowledge graph confidence changes
- Commitment due dates approaching

### Active (from user interactions)
- Post-meeting nudge responses (LANDED/PARTIAL/MISSED)
- Call transcripts (what they said, how they said it)
- Chat messages
- Callback requests
- Explicit feedback

### Derived (computed from above)
- Outcome trends (winning streak, losing streak)
- Energy/stress proxies (calendar fragmentation, email spikes)
- Engagement trends (call quality trajectory)
- Onboarding progress gaps
- Coaching theme urgency (recurring, unresolved)
- Stakeholder confidence tier changes

---

## Data Model Changes

### New: CallSignal (ephemeral, computed per evaluation cycle)

Not persisted — computed in-memory every 5 minutes. But the RESULT of signal evaluation is stored on ScheduledCall:

```prisma
// Add to ScheduledCall
model ScheduledCall {
  // ... existing fields

  // New: signal-driven scheduling
  primaryPosture     String?   // celebrate|uplift|prepare|advise|listen|nudge|challenge|connect|debrief
  secondaryPostures  Json?     // string[]
  triggerSignals     Json?     // { signalType, strength, source }[] — what triggered this call
  callWorthiness     Float?    // 0-1 score that justified the call
  fatigueThreshold   Float?    // what threshold was applied
}
```

### New fields on UserPreferences

```prisma
model UserPreferences {
  // ... existing fields

  // Call intelligence learning
  preferredCallWindows    Json?  // { morning: [7,9], postLunch: [13,14], evening: [17,19] }
  postureReceptivity      Json?  // { celebrate: 0.8, challenge: 0.4, ... } — learned per user
  fatigueProfile          Json?  // { maxComfortableCalls: 2, minGapMinutes: 90, ... }
  bestSignalTypes         Json?  // ranked list of signal types that predict good calls for this user
}
```

### New fields on CallEvaluation

```prisma
model CallEvaluation {
  // ... existing fields

  // Signal validation
  postureMatch       Float?    // 0-1: did the posture match the user's apparent need?
  timingMatch        Float?    // 0-1: was this a good time to call?
  signalAccuracy     Json?     // per-signal: was this signal predictive of a good call?
}
```

---

## Implementation Phases

### Phase 1: Signal Collection (without changing scheduling)
- Build signal collectors for all 6 dimensions
- Log signals alongside existing scheduled calls (add fields to ScheduledCall)
- Run signal evaluation in shadow mode: compute what WOULD have been scheduled vs what WAS scheduled
- Collect data for 1-2 weeks before switching

### Phase 2: Posture-Driven Call Planning
- Replace `buildDailyCallAgenda()` with posture-based planning
- Map postures to Vapi assistant selection + variable injection
- Keep existing scheduling as fallback (if signal system produces no calls by morning, force one)

### Phase 3: Signal-Driven Scheduling
- Replace time-based scheduling with signal-triggered scheduling
- Implement fatigue model
- Keep min 1/day guarantee
- Keep "never during meetings" guard

### Phase 4: Autoresearch Integration
- Weekly posture-outcome correlation analysis
- Per-user signal weight adjustment
- Fatigue threshold calibration
- PostureReceptivity learning

### Phase 5: Win Detection + Emotional Intelligence
- Build outcome momentum tracking (winning/losing streaks)
- Calendar fragmentation as stress proxy
- Energy pattern matching (time-of-day × known patterns)
- Proactive celebration triggers

---

## Success Metrics

| Metric | Current Baseline | Target |
|--------|-----------------|--------|
| Pickup rate | ~60% (estimated) | 80%+ |
| Average engagement score | Unknown | 7+ / 10 |
| User-initiated callbacks | Rare | 2+ per week per user |
| "Good timing" signals in transcript | Not tracked | 30%+ of calls |
| Calls where user talks past target duration | Not tracked | 50%+ |
| Explicit "stop calling" / fatigue signals | Not tracked | <5% of calls |
| Onboarding 80% complete by day 7 | Not tracked | 70%+ of users |

---

## Depends On

- Conversation Engine (posture → conversation structure)
- Knowledge Graph (stakeholder confidence, fact changes)
- Hypothesis Engine (autoresearch loop)
- Call Evaluation Agent (engagement scoring, posture-match scoring)
- Existing: Calendar sync, Vapi integration, daily scheduler infrastructure

## Blocks

- Conversation posture implementation (needs this doc to know WHAT posture was selected)
- EOD/debrief calls (needs Debrief + Celebrate postures to be schedulable)
- Fatigue-aware scheduling (replaces current fixed scheduling)
