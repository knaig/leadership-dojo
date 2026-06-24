# Mira V2 — Comprehensive Requirements Document

**Status:** Requirements
**Last Updated:** 2026-03-14
**Author:** Product + Engineering

---

## Executive Summary

Mira V2 transforms the platform from a daily voice call companion into a deeply intelligent executive coaching system. The core thesis: Mira should know the user's professional world — projects, stakeholders, political dynamics, communication patterns — and use that knowledge to deliver coaching advice grounded in real data and domain expertise.

This document captures 11 workstreams that collectively address three systemic problems:

1. **Silent failures** — Agents run daily but produce nothing. No alerting, no dashboards, no way to know.
2. **No feedback loop** — Calls happen, transcripts are saved, but nothing is learned or adapted.
3. **Shallow intelligence** — Stakeholder profiles exist but are empty. Project structure is fragmented. Mira gives generic advice because she has no real data to ground it in.

---

## Table of Contents

1. [Silent Failure Detection & Observability](#1-silent-failure-detection--observability)
2. [Coaching Intelligence System](#2-coaching-intelligence-system)
3. [Conversation Engine](#3-conversation-engine)
4. [Multi-Signal Stakeholder Personality Profiling](#4-multi-signal-stakeholder-personality-profiling)
5. [Project as First-Class Entity](#5-project-as-first-class-entity)
6. [Onboarding Restructuring](#6-onboarding-restructuring)
7. [GitHub Connector per Project](#7-github-connector-per-project)
8. [Unknown Entity Curiosity](#8-unknown-entity-curiosity)
9. [Real Tool Calling in Voice](#9-real-tool-calling-in-voice)
10. [Pipe Stakeholder Intelligence into Calls](#10-pipe-stakeholder-intelligence-into-calls)
11. [Domain Expertise Grounding](#11-domain-expertise-grounding)

---

## Priority Matrix

| Priority | Workstream | Rationale |
|----------|-----------|-----------|
| **P0** | 1. Silent Failure Detection | Cannot build reliably without observability. Every other workstream depends on knowing when things break. |
| **P0** | 2. Coaching Intelligence System | Closes the feedback loop. Without evaluation and adaptive planning, calls never improve. |
| **P1** | 3. Conversation Engine | Makes calls structurally better — guardrails, confidence gating, personal threads, call-specific strategies. |
| **P1** | 4. Multi-Signal Stakeholder Profiling | Makes intelligence deep and useful. Transforms empty profiles into actionable coaching whispers. |
| **P1** | 5. Project as First-Class Entity | Foundation for organized coaching. Unifies three fragmented representations. |
| **P2** | 6. Onboarding Restructuring | Better first impressions. Probes for project structure and power maps. |
| **P2** | 7. GitHub Connector | Enriches project knowledge with code-level signals. |
| **P2** | 8. Unknown Entity Curiosity | Prompt + tool improvement. Mira asks about unknowns instead of guessing. |
| **P2** | 9. Real Tool Calling | Add actual tools to onboarding assistant. Stop faking data lookups. |
| **P3** | 10. Pipe Stakeholder Intelligence into Calls | Requires #4 to produce data first. Upgrade `knownStakeholders` variable. |
| **P3** | 11. Domain Expertise Grounding | Ongoing refinement. Embed leadership frameworks into coaching output. |

---

## 1. Silent Failure Detection & Observability

**Priority:** P0
**Problem:** The #1 systemic issue. Agents run daily and produce zero results with no alerting. The stakeholder enrichment agent (13:00 UTC daily) and stakeholder synthesis agent (12:15 UTC daily) both execute without creating any records. Voice fact extraction runs but its output is unverified. There is no way to know agents are failing silently.

### 1.1 Structured Agent Logging

Every background agent must log a structured lifecycle:

```
[agent:stakeholder-enrichment] START  | userId=cuid123 | trigger=cron
[agent:stakeholder-enrichment] LOAD   | stakeholders=12 | withEmail=8 | eligible=5
[agent:stakeholder-enrichment] PROCESS| enriched=3 | skipped=2 (already enriched <7d)
[agent:stakeholder-enrichment] SAVE   | factsCreated=7 | profilesUpdated=3
[agent:stakeholder-enrichment] END    | duration=4200ms | status=success
```

When an agent produces zero results, it must log **why**:
- No data to process (e.g., no stakeholders with emails)
- LLM call failed (with error)
- Query returned empty (e.g., web search found nothing)
- Auth issue (e.g., expired Google token)
- Rate limited
- Input data malformed

**Acceptance Criteria:**
- [ ] Every agent in `worker/src/agents/` emits structured JSON logs for START, LOAD, PROCESS, SAVE, END
- [ ] Zero-result runs include a `reason` field explaining why nothing was produced
- [ ] Logs are parseable by any log aggregation tool (structured JSON, not free-text)

**Existing files to modify:**
- `worker/src/agents/stakeholder-enrichment-agent.ts`
- `worker/src/agents/knowledge/voice-fact-extractor.ts`
- `worker/src/agents/knowledge/calendar-fact-extractor.ts`
- `worker/src/agents/knowledge/email-fact-extractor.ts`
- `worker/src/agents/knowledge/document-fact-extractor.ts`
- `worker/src/agents/daily-call-scheduler.ts`
- `worker/src/agents/proactive-agent.ts`
- `worker/src/agents/calendar-sync.ts`
- `worker/src/agents/email-sync.ts`
- `worker/src/agents/meeting-champion.ts`

### 1.2 Agent Health Dashboard

New Prisma model to track agent executions:

```prisma
model AgentRun {
  id          String   @id @default(cuid())
  agentName   String   // "stakeholder-enrichment", "voice-fact-extractor", etc.
  userId      String?  // null for system-wide agents
  status      String   // "success", "partial", "zero_output", "error"

  // Metrics
  inputCount     Int   @default(0)  // records loaded
  outputCount    Int   @default(0)  // records created/updated
  errorCount     Int   @default(0)
  durationMs     Int   @default(0)

  // Diagnostics
  zeroOutputReason String?  // why nothing was produced
  errorMessage     String?  @db.Text
  metadata         Json?    // agent-specific details

  startedAt   DateTime @default(now())
  completedAt DateTime?

  @@index([agentName, startedAt])
  @@index([status])
}
```

**Acceptance Criteria:**
- [ ] Every agent run creates an `AgentRun` record
- [ ] Admin can query: "Show me all runs of stakeholder-enrichment in the last 7 days"
- [ ] Dashboard shows per-agent: last run time, success rate, avg output count, error rate

### 1.3 Zero-Output Alerting

When an agent produces zero output 3 consecutive runs, trigger an alert:

- Store alert in `SystemAlert` model (or push via Pusher to admin channel)
- Include: agent name, last 3 run timestamps, zero-output reasons, suggested remediation
- Admin receives via Pusher `publishSystemEvent()` to admin channel (existing pattern)

**Acceptance Criteria:**
- [ ] Alert fires after 3 consecutive zero-output runs
- [ ] Alert includes actionable context (not just "agent failed")
- [ ] Alerts are visible in admin dashboard and delivered via Pusher

### 1.4 Data Pipeline Monitoring

Track the full data flow for stakeholder intelligence:

```
Emails synced → Facts extracted → Profiles enriched → Intelligence synthesized → Piped to calls
```

Each stage should report its throughput. A pipeline health view shows:
- Stage 1: X emails synced (last run: timestamp)
- Stage 2: Y facts extracted from X emails (last run: timestamp)
- Stage 3: Z profiles enriched (last run: timestamp)
- Stage 4: W intelligence records created (last run: timestamp)
- Stage 5: V calls included stakeholder intel (last run: timestamp)

Gaps between stages are immediately visible: "12 emails synced, 0 facts extracted" reveals the bottleneck.

### 1.5 Dead Letter Queue

Failed pg-boss jobs should be queryable, not silently dropped.

- New API route: `GET /api/admin/failed-jobs` — lists failed jobs with error details, retry count, original payload
- Admin can retry individual jobs from the dashboard
- pg-boss already has `failedOn` — surface it through the admin API

**Existing file:** `worker/src/index.ts` (pg-boss configuration)

### 1.6 Health Check API

**New route:** `GET /api/admin/system-health`

Returns:
```json
{
  "agents": {
    "stakeholder-enrichment": {
      "lastRun": "2026-03-14T13:00:00Z",
      "lastStatus": "zero_output",
      "successRate7d": 0.0,
      "avgOutputCount7d": 0,
      "consecutiveZeroOutput": 14,
      "alert": "14 consecutive zero-output runs"
    },
    "voice-fact-extractor": {
      "lastRun": "2026-03-14T08:15:00Z",
      "lastStatus": "success",
      "successRate7d": 0.85,
      "avgOutputCount7d": 3.2
    }
  },
  "pipelines": {
    "stakeholder-intelligence": {
      "stages": [...],
      "bottleneck": "fact-extraction (0 output from 12 inputs)"
    }
  },
  "queues": {
    "pending": 3,
    "failed": 7,
    "completed24h": 42
  }
}
```

### 1.7 End-to-End Call Trace

For a given `VoiceCall`, show the complete trace:
1. What context was available (knowledge facts, stakeholder profiles, calendar events)
2. What was sent to Vapi (`sentVariables` — already stored on `VoiceCall`)
3. What Mira said (transcript — already stored)
4. How the call was evaluated (CallEvaluation — from Coaching Intelligence System)

**New route:** `GET /api/admin/calls/[callId]/trace`

This is critical for debugging: when a call goes poorly, the admin can see exactly what data Mira had and what she did with it.

### 1.8 Self-Diagnosis

When an agent produces zero results, it should attempt to diagnose itself:

```typescript
if (outputCount === 0) {
  if (inputCount === 0) reason = 'NO_INPUT_DATA';
  else if (llmCallFailed) reason = 'LLM_FAILURE';
  else if (queryReturnedEmpty) reason = 'EMPTY_QUERY_RESULTS';
  else if (authError) reason = 'AUTH_EXPIRED';
  else reason = 'UNKNOWN_ZERO_OUTPUT';
}
```

Store `zeroOutputReason` on every `AgentRun` with `outputCount === 0`.

---

## 2. Coaching Intelligence System

**Priority:** P0
**Depends on:** None (standalone)
**Design doc:** `/Users/karthiknaig/.claude/plans/adaptive-growing-panda.md`

This system closes the feedback loop: evaluate every call, learn from it, plan the next one, show the admin what's happening. Currently calls happen and transcripts are saved, but nothing is learned or adapted.

### 2.1 New Schema Models

Three new models:

**`CallEvaluation`** (one per VoiceCall):
- 6 KPI scores (1-10): `newGroundScore`, `depthOfSharingScore`, `valueAddScore`, `contextUtilScore`, `repetitionScore`, `engagementScore`
- Weighted `overallScore` (valueAdd 0.25, newGround 0.2, depth 0.2, context 0.15, repetition 0.1, engagement 0.1)
- Qualitative: `whatWorked[]`, `whatToImprove[]`, `commitmentsExtracted[]`, `newInfoLearned[]`, `recommendedTopics[]`
- Linked to `VoiceCall` via `voiceCallId` (unique)

**`CoachingRelationshipPlan`** (one per User):
- `phase`: discovery (calls 1-5) / building_trust (6-15) / deep_coaching (16-30) / sustained_partnership (31+)
- `coachingThemes` (JSON): themes with first/last seen, call count, status (active/resolved/parked)
- `communicationProfile` (JSON): pace, depth, humor, directness, preferred topic entry, avoid patterns
- `personalityProfile` (JSON): Big Five scores with evidence, communication style, emotional triggers, decision-making style, coaching adaptations (see design doc for full schema)
- `commitments` (JSON): commitment tracking with status lifecycle
- `avoidTopics` (String[])

**`CoachingTrajectory`** (weekly snapshots per User):
- `weekStart` (unique with userId)
- KPIs: `avgCallQuality`, `relationshipDepthRate`, `trustVelocity`, `knowledgeGraphGrowth`, `coachingActivationRate`, `callRetentionRate`, `onboardingVelocity`
- Aggregates: `callsCompleted`, `totalMinutes`, `commitmentsTracked`, `commitmentsCompleted`

**File to modify:** `web/prisma/schema.prisma`

### 2.2 Post-Call Evaluation Agent

**New file:** `worker/src/agents/call-evaluation-agent.ts`

Triggered after every call (queued from webhook after VoiceCall is saved). Process:
1. Load VoiceCall (transcript, summary, callType, sentVariables)
2. Load last 5 CallEvaluations (for repetition detection)
3. Load CoachingRelationshipPlan (for phase context)
4. LLM call: score 6 KPIs + extract qualitative outputs (structured JSON)
5. Compute weighted overallScore
6. Save CallEvaluation
7. Call `updateRelationshipPlan()` to update themes, commitments, communication profile

**Trigger mechanism:** The webhook already queues `knowledge-extract-voice` via a direct Prisma job insert. Use the same pattern for `call-evaluation`.

**Existing files to modify:**
- `web/app/api/vapi/webhook/route.ts` — queue `call-evaluation` job after VoiceCall save
- `worker/src/index.ts` — register `call-evaluation` queue handler

**Acceptance Criteria:**
- [ ] Every completed VoiceCall gets a CallEvaluation within 60 seconds of call end
- [ ] 6 KPI scores are populated with values 1-10
- [ ] Commitments are extracted from transcript and tracked
- [ ] Repetition detection flags when Mira covers the same ground 3+ times

### 2.3 Coaching Relationship Agent

**New file:** `worker/src/agents/coaching-relationship-agent.ts`

Two functions:

`updateRelationshipPlan(userId, evaluation)` — called after each evaluation:
- Upsert CoachingRelationshipPlan
- Phase detection based on call count + data signals (not just count — see maturity transitions in Section 3)
- Merge new commitments from evaluation
- Update avoidTopics from repetition feedback

`deepAnalyzeRelationship(userId)` — weekly LLM analysis (Wednesdays 13:00 UTC):
- Load last 2 weeks of CallEvaluations + transcripts
- LLM: identify through-line coaching themes
- LLM: update communication profile from engagement patterns
- LLM: refine personality profile (Big Five, communication style, emotional triggers, archetype detection)
- Mark stale commitments (>7 days, never followed up) as "dropped"

**Personality dimensions tracked:**
- Big Five (openness, conscientiousness, extraversion, agreeableness, neuroticism) with scores and evidence
- Communication style (pace, depth preference, humor response, directness, topic entry style, challenge tolerance, emotional expression)
- Emotional triggers (energizers, drainers, stress responses, trust signals)
- Decision-making style (primary, under pressure, blind spots)
- Coaching adaptations (what works, what doesn't, recommended Mira tones)
- Confidence level: low (<5 calls), moderate (5-15), high (15+)

### 2.4 Pre-Call Planning Agent

**New file:** `worker/src/agents/call-planning-agent.ts`

`buildCallDirective(userId, callType)` returns a structured string:

```
PHASE: deep_coaching (call 22)
EXPLORE TODAY: 1) Follow up on delegation concern, 2) Board meeting prep
AVOID: Morning routine (discussed 3x), team hiring (user parked)
COMMITMENTS TO CHECK: "Talk to Raj about timeline" (2 days ago)
PERSONALITY-ADAPTED STYLE: Direct entry — skip pleasantries. High challenge
tolerance — you can be direct about blind spots. Let silences breathe.
```

This is **deterministic** — no LLM call. Just database reads + template assembly. Zero latency concern.

**Integration point:** `worker/src/lib/vapi-voice.ts` in `buildVariableValues()`:
```typescript
vars.callDirective = await buildCallDirective(userId, callType).catch(() => '');
```

Update Vapi assistant prompts (via dashboard or `scripts/setup-vapi-assistants.ts`) to include `{{callDirective}}`.

**Acceptance Criteria:**
- [ ] `buildCallDirective()` completes in <100ms (no LLM calls)
- [ ] Directive includes phase, topics to explore, topics to avoid, open commitments
- [ ] Personality-adapted style section reads from `CoachingRelationshipPlan.personalityProfile`
- [ ] Directive is present in `sentVariables` on every call after the system is enabled

### 2.5 Trajectory Computation

**New file:** `worker/src/agents/coaching-trajectory-agent.ts`

Weekly cron (Sundays 11:00 UTC, before weekly reflection at 12:00 UTC):
- Aggregate CallEvaluations for the week
- Count KnowledgeFact growth
- Compute call retention (scheduled vs completed)
- Compute commitment completion rate
- Upsert CoachingTrajectory record

### 2.6 Admin Visibility

Three new API routes (all require `User.role === 'ADMIN'`):

1. **`GET /api/admin/coaching-intelligence`** — Per-user summary: phase, avgQuality, qualityTrend, activeThemes, openCommitments, alerts
2. **`GET /api/admin/coaching-intelligence/[userId]`** — Full detail: call history with scores, relationship plan, personality profile with evidence, trajectory time series, commitment timeline
3. **`GET /api/admin/coaching-intelligence/daily-brief`** — Today's calls with quality scores, notable moments, commitment tracking summary

**Daily brief delivery:** Cron at 16:00 UTC (~9:30 PM IST), delivered via Pusher `publishSystemEvent()`.

**Existing pattern:** Admin auth from `web/app/api/admin/dashboard/route.ts`

---

## 3. Conversation Engine

**Priority:** P1
**Depends on:** #2 Coaching Intelligence System (evaluation data feeds into conversation planning)
**Design doc:** `docs/requirements/conversation-engine-design.md`
**Implementation plan:** Folded into Coaching Intelligence System plan (Steps 9-13)

The Conversation Engine makes calls structurally better through guardrails, confidence gating, personal depth, and adaptive planning.

### 3.1 Guardrails & Prompt Overhaul

Rewrite Vapi assistant prompts with new shared blocks added to `scripts/setup-vapi-assistants.ts`:

**Closed-world rules:**
- Never invent meetings, people, or commitments that aren't in the injected data
- Never give generic advice about a person Mira doesn't have data on
- If uncertain, say so: "I don't have enough on [person] yet"

**Anti-generic rules:**
- No corporate platitudes ("align stakeholders", "drive synergies")
- Advice must reference specific data: "Based on your last 3 meetings with Raj..."
- If Mira can't ground advice in data, she asks a question instead

**Confidence mode gating:**
- LEARNING (calls 1-5): Mirror and ask. Don't assert stakeholder intelligence.
- OBSERVING (calls 6-15): Hedge and surface. "I've noticed that..."
- COACHING (calls 16+): Direct assertions. "Raj responds well to..."

**Call-specific strategies (calls 1-3):**
- Call 1: Demonstrate context awareness. Pure value delivery. Ask almost nothing. 3-5 min.
- Call 2: Prove memory. Reference yesterday's conversation. Introduce commitment tracking. 4-7 min.
- Call 3: First stakeholder probe. Transition point. 5-10 min. Mode-lean aware.

**Acceptance Criteria:**
- [ ] All 3 Vapi assistants (onboarding, daily, meeting) updated with guardrail blocks
- [ ] `{{confidenceMode}}` variable injected per call
- [ ] `{{conversationPlan}}` variable injected per call (call-specific for 1-3, maturity-based for 4+)
- [ ] Test: Mira does not invent meetings or stakeholders that aren't in the data

### 3.2 Personal Thread Manager

**New Prisma model:** `PersonalThread`

```prisma
model PersonalThread {
  id       String @id @default(cuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  category String  // FAMILY, HEALTH, HOBBY, ORIGIN, ASPIRATION, EMOTIONAL, INTEGRATED
  topic    String  // "tennis", "daughter's recital"
  stage    String  @default("PLANTED") // PLANTED → WATERED → GROWING → HARVESTED → MAINTAINED

  lastTouched    DateTime?
  touchCount     Int     @default(0)
  userEngagement String  @default("MEDIUM") // LOW, MEDIUM, HIGH
  details        Json    @default("{}") // accumulated context per call
  isIntegrated   Boolean @default(false) // personal topic intertwined with work
  offLimits      Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, stage])
}
```

**New file:** `worker/src/lib/thread-manager.ts`

`selectThreadAction(userId, callType, callCount, conversationMode)` returns a thread action (PLANT/WATER/MAINTAIN/NONE) + natural language instruction for injection into `{{personalThreadInstruction}}`.

Priority: WATER recent planted thread > MAINTAIN old harvested thread > PLANT new category.

Boundaries: No personal threads for meeting calls. No ASPIRATION/EMOTIONAL before call 10. No threads for work_first users before call 5.

**Post-call extraction:** LLM extracts personal topics from transcript, creates/advances threads with engagement level.

### 3.3 Confidence Engine

**New file:** `worker/src/lib/confidence-engine.ts`

Per-stakeholder confidence scores (0-1) computed from:
- Interaction density (calendar meetings, email exchanges)
- Recency (exponential decay for stale data)
- Source quality (USER_STATED facts weighted highest, inferred facts weighted lowest)
- User confirmations/corrections (corrections lower confidence, confirmations raise it)

**Confidence tiers gate output:**

| Tier | Score Range | Mira's Behavior |
|------|------------|-----------------|
| SILENT | 0.0-0.3 | Don't mention this person's characteristics |
| PROBE | 0.3-0.6 | "I see X's name in your calendar. How do things usually go?" |
| SUGGEST | 0.6-0.8 | "Based on what I've seen, X tends to..." (hedged language) |
| ASSERT | 0.8-1.0 | "X responds well to data-driven arguments" (direct) |

Archetype-aware thresholds: Skeptic users get higher thresholds (more conservative). Navigator users get lower thresholds (want intel faster).

**Integration:** `buildPeopleIntel(userId, confidenceMode)` in `worker/src/lib/vapi-voice.ts` queries today's meeting attendees, filters by confidence tier, formats tier-appropriate text for `{{peopleIntel}}`.

### 3.4 Adaptation Signals

Behavioral signals extracted post-call from early transcripts (calls 1-5):

| Signal | Meaning | Effect on Calls |
|--------|---------|----------------|
| `modeLean` | work_first / relationship_first / balanced | Controls personal thread injection |
| `precision` | User tests accuracy | Show corrections were absorbed |
| `peopleHungry` | User asks about stakeholders | Prioritize people intel |
| `personalOpen` | User shares personal context | Add personal check-ins |
| `frameworkSeeker` | User wants scripts/templates | Provide actionable phrases |
| `followMode` | User leads conversation | Reduce structure, listen more |
| `integratedLife` | Personal/work overlap | Treat as one conversation |

Stored in `UserPreferences.adaptationSignals` (new JSON field).

### 3.5 Maturity Transitions

Upgrade from call-count-based confidence mode to data-driven transitions:

**LEARNING to OBSERVING** when:
- 5+ calls completed AND
- PersonalContext populated AND
- 3+ stakeholders have confidence score > 0.3

**OBSERVING to COACHING** when:
- 15+ calls completed AND
- User has confirmed/not-corrected 3+ stakeholder assertions AND
- CallEvaluation avg `valueAddScore` > 6 (Mira's suggestions are landing)

**Regression:** No calls for 7+ days = step back one level. Spike in user corrections = step back.

Stored in `CoachingRelationshipPlan.phase`.

**Existing files to modify:**
- `worker/src/lib/vapi-voice.ts` — major expansion of `buildVariableValues()`
- `web/app/api/vapi/call/route.ts` — mirror new variables on web-side
- `scripts/setup-vapi-assistants.ts` — complete prompt rewrite
- `web/app/api/vapi/webhook/route.ts` — queue thread extraction + adaptation signal extraction

---

## 4. Multi-Signal Stakeholder Personality Profiling

**Priority:** P1
**Depends on:** #1 Observability (must know when pipeline fails)
**Problem:** The current stakeholder pipeline runs daily but produces nothing. StakeholderProfile records exist but personality fields are empty. StakeholderIntelligence records are not being created.

### 4.1 Signal Sources (Ordered by Richness)

#### a. Emails (Richest Signal)

Email sync already exists (`worker/src/agents/email-sync.ts`) but only stores metadata — subject, sender, recipient, date. Needs content analysis.

**Requirements:**
- Upgrade email sync to fetch message bodies (`format: 'full'` instead of `format: 'metadata'`)
- Extract communication patterns per stakeholder: tone (formal/informal), response time, formality shifts over time, power dynamics (who initiates, who defers)
- Psychological profiling from email patterns: DIRECT vs DIPLOMATIC vs DATA_DRIVEN communication
- Privacy: Store extracted insights as KnowledgeFacts, NOT raw email content. Never persist email bodies.
- Email fact extractor (`worker/src/agents/knowledge/email-fact-extractor.ts`) must be extended for relationship dynamics extraction

**Knowledge facts created:**
- `communicates_formally_with` / `communicates_informally_with`
- `responds_quickly_to` (avg response time)
- `defers_to` / `directs_to` (power dynamics)
- `tone_shifted_with` (detected formality changes over time)

#### b. Meeting Transcripts

Calendar event descriptions and voice call transcripts provide behavioral signals in group settings.

**Requirements:**
- Extract stakeholder behaviors from meeting debriefs (who dominated, who was quiet, who agreed/disagreed)
- Cross-reference with calendar data: who attends the same meetings repeatedly
- Identify behavioral patterns: "Raj always pushes back on timelines in group settings but agrees in 1:1s"

#### c. Web Search (Existing)

Stakeholder enrichment agent (`worker/src/agents/stakeholder-enrichment-agent.ts`) already performs web search for LinkedIn profiles and public bios. Currently produces zero output — debug and fix as part of Observability (#1).

#### d. Voice Calls (User-Stated)

Voice fact extractor (`worker/src/agents/knowledge/voice-fact-extractor.ts`) creates knowledge facts from what the user says about stakeholders. USER_STATED facts should receive highest confidence weight.

**Requirements:**
- Ensure voice fact extractor reliably creates `relationship_with`, `archetype_indicator`, `communication_preference` facts
- Tag all voice-extracted facts with `source: 'USER_STATED'` for confidence scoring

#### e. Calendar Patterns

Calendar sync (`worker/src/agents/calendar-sync.ts`) already tracks frequency, recency, 1:1 vs group meetings.

**Requirements:**
- Compute relationship signals: meeting frequency trend (increasing/decreasing), ratio of 1:1 to group meetings, time since last interaction
- Feed these signals into confidence scoring (Section 3.3)

### 4.2 Profiling Depth

Each stakeholder should have a rich personality profile built incrementally from multiple signals:

**Archetype (11 types):**

| Archetype | Description |
|-----------|------------|
| DRIVER | Results-oriented, impatient, direct |
| ANALYST | Data-driven, cautious, thorough |
| COLLABORATOR | Consensus-seeking, inclusive, sometimes indecisive |
| VISIONARY | Big-picture, future-focused, may dismiss details |
| GUARDIAN | Risk-averse, process-oriented, stability-focused |
| POLITICIAN | Politically savvy, relationship-focused, agenda-driven |
| CHAMPION | Enthusiastic advocate, can be over-promising |
| PRAGMATIST | Practical, execution-focused, "what works" mentality |
| SKEPTIC | Cautious, questioning, needs evidence |
| CONSERVATIVE | Change-resistant, precedent-focused, incremental |
| OPERATOR | Execution machine, detail-oriented, may miss strategy |

**Communication Style:** DIRECT, DIPLOMATIC, DATA_DRIVEN, NARRATIVE, COLLABORATIVE, FORMAL, RELATIONSHIP

**Decision-Making Style:** ANALYTICAL, INTUITIVE, COLLABORATIVE, DIRECTIVE

**Risk Tolerance:** HIGH, MODERATE, LOW

**Primary Motivations & Fears:** Evidence-backed only. Never asserted without data.

**Power Level & Influence Role:**
- Power level: HIGH, MEDIUM, LOW (already on `StakeholderProfile`)
- Influence role: DECISION_MAKER, INFLUENCER, GATEKEEPER, END_USER (already on `StakeholderProfile`)

**Relationship Dynamics:**
- Alliances (who supports whom)
- Tensions (who conflicts with whom)
- Reporting lines (who reports to whom)
- Stored as KnowledgeFacts: `allies_with`, `tensions_with`, `reports_to`

### 4.3 Profiling Output

The profiling system produces two things:

**1. Stakeholder Intelligence Records:**

Extend existing `StakeholderIntelligence` model with:
- `archetype` — detected archetype with confidence score
- `communicationStyle` — detected style with evidence
- `decisionMakingStyle` — detected style with evidence
- `riskTolerance` — detected level with evidence
- `motivations` / `fears` — evidence-backed only
- `doPlaybook` — what works with this person (derived from archetype + data)
- `dontPlaybook` — what to avoid (derived from archetype + data)

**2. Coaching Whispers (for voice calls):**

Format for Mira's consumption:
```
Based on 8 email exchanges, Raj tends to respond better when you lead with data.
He's pushed back on timeline estimates in 3 of your last 5 meetings — come prepared with specific dates.
In 1:1 settings he's more flexible than in group meetings.
```

NOT:
```
Raj might be an analytical decision-maker. Consider using data-driven arguments.
```

**Acceptance Criteria:**
- [ ] At least 3 signal sources contribute to each stakeholder profile
- [ ] Every personality assertion has an evidence trail (source fact IDs)
- [ ] Coaching whispers reference specific data points ("Based on 8 emails", "In 3 of 5 meetings")
- [ ] Archetype detection requires minimum 3 data points before asserting
- [ ] Empty/low-confidence profiles output "I don't have enough on [person] yet" instead of generic advice

### 4.4 Relationship Dynamics

Track inter-stakeholder relationships, not just user-to-stakeholder:

- Alliances: "Sarah and Raj typically align on budget decisions"
- Tensions: "Sarah and CFO have conflicting priorities on timeline"
- Reporting lines: "Sarah reports to CTO David"
- Coalition patterns: "When Sarah and Raj both agree, the decision passes"

**Source:** Calendar co-attendance patterns, email threads with multiple recipients, user-stated facts from voice calls.

**Output:** Feed into Ground Game (existing `docs/requirements/ground-game.md`) for Room Read and influence planning.

---

## 5. Project as First-Class Entity

**Priority:** P1
**Problem:** Three disconnected project representations exist:
1. `UserProject` (schema line 626) — name, description, driveLink, AI-generated risks/status
2. `ProfessionalProject` (schema line 2733) — name, context, status, dates, linked to Organization and StrategicObjective
3. `KnowledgeEntity(type=PROJECT)` — knowledge graph entity with facts

These are never linked. A project mentioned in a voice call creates a KnowledgeEntity. A project in onboarding creates a UserProject. A project from professional context creates a ProfessionalProject. Mira doesn't know they're the same thing.

### 5.1 Unified Project Model

Replace `UserProject` and `ProfessionalProject` with a single `Project` model:

```prisma
model Project {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Identity
  name        String
  description String? @db.Text
  status      String  @default("ACTIVE") // ACTIVE, ON_HOLD, COMPLETED, ARCHIVED

  // Organization context
  orgId  String?
  org    Organization? @relation(fields: [orgId], references: [id])

  // Dates
  startDate DateTime?
  endDate   DateTime?

  // AI Analysis
  risks       Json?     // ["Stakeholder Misalignment", "Tech Debt"]
  aiStatus    String?   // AI perception: "At Risk", "Healthy", "Needs Attention"

  // Links
  driveLink   String?   // URL to GDrive folder/doc
  context     String?   @db.Text // User-provided context
  userNotes   String?   @db.Text // User corrections/notes

  // Knowledge Graph bridge
  knowledgeEntityId String? @unique
  knowledgeEntity   KnowledgeEntity? @relation(fields: [knowledgeEntityId], references: [id])

  // Relations
  stakeholders      ProjectStakeholder[]
  repositories      ProjectRepository[]
  objectives        StrategicObjective[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])
}
```

### 5.2 Project-Stakeholder Mapping

```prisma
model ProjectStakeholder {
  id            String @id @default(cuid())
  projectId     String
  project       Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  stakeholderId String
  stakeholder   StakeholderProfile @relation(fields: [stakeholderId], references: [id], onDelete: Cascade)

  role          String? // "Sponsor", "Tech Lead", "Blocker", "Champion"
  influenceRole InfluenceRole @default(UNKNOWN) // DECISION_MAKER, INFLUENCER, GATEKEEPER, END_USER
  notes         String? @db.Text

  createdAt DateTime @default(now())

  @@unique([projectId, stakeholderId])
}
```

### 5.3 Project-Repository Mapping

```prisma
model ProjectRepository {
  id        String @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  platform  String @default("github") // github, gitlab, bitbucket
  owner     String // org or user
  repo      String // repo name
  fullName  String // "owner/repo"

  installationId String?
  installation   GitHubInstallation? @relation(fields: [installationId], references: [id])

  createdAt DateTime @default(now())

  @@unique([projectId, fullName])
}
```

### 5.4 Knowledge Entity Linking

When a `KnowledgeEntity(type=PROJECT)` is created (from voice calls, email parsing, etc.), attempt to match it to an existing `Project`:
- Match by normalized name
- If matched: set `Project.knowledgeEntityId` to link them
- If no match: create a candidate for user confirmation ("Mira heard you mention 'Q3 Migration' — is this a new project?")

### 5.5 Migration

- Migrate existing `UserProject` records to new `Project` model
- Migrate existing `ProfessionalProject` records to new `Project` model (merge if same name for same user)
- Update `StrategicObjective` foreign key from `ProfessionalProject` to `Project`
- Deprecate old models (keep in schema with `@@map` for backward compat during transition)

### 5.6 Surface Projects

Projects should appear in:
- **Onboarding:** "Tell me about the projects you're working on" (see Section 6)
- **Coaching conversations:** Mira references projects by name, knows stakeholders per project
- **Admin dashboard:** Project list per user with status, stakeholder count, risk assessment
- **`buildVariableValues()`:** Include active projects with their stakeholders in call context

**Acceptance Criteria:**
- [ ] Single `Project` model replaces `UserProject` and `ProfessionalProject`
- [ ] Each project has a stakeholder list via `ProjectStakeholder`
- [ ] KnowledgeEntity(PROJECT) records can be linked to Project records
- [ ] Existing data migrated without loss
- [ ] Projects injected into Vapi `variableValues` for voice calls

---

## 6. Onboarding Restructuring

**Priority:** P2
**Depends on:** #5 Project as First-Class Entity
**Existing model:** `OnboardingProgress` (schema line 3213) — 9 boolean topic flags across 3 layers

### 6.1 Problem

Current onboarding has 9 boolean topic flags but doesn't probe deeply. It asks about stakeholders but doesn't build a power map. It doesn't know about projects at all. The questions are broad ("tell me about your role") instead of structured ("who is the real decision maker on your budget?").

### 6.2 Extended Onboarding Topics

Add project and stakeholder depth to `OnboardingProgress`:

```prisma
// Add to OnboardingProgress:
coveredProjects       Boolean @default(false) // What projects are you working on?
coveredPowerMap       Boolean @default(false) // Who are the decision makers? Influencers? Blockers?
coveredPolitics       Boolean @default(false) // What are the political dynamics?
projectDepthScore     Float?  // 0-1, how much we know about project structure
stakeholderDepthScore Float?  // 0-1, how much we know about the power map
```

### 6.3 Probing Strategy

Onboarding should follow a structured probing pattern:

**Project discovery:**
1. "Tell me about the projects you're working on right now."
2. For each project: "Who else is involved in [project]?"
3. "Which project is the highest stakes for you right now?"

**Power map construction:**
1. "Who makes the final decision on [key project]?"
2. "Who has the most influence even if they're not the decision maker?"
3. "Is there anyone who could block this? Someone who's skeptical?"
4. "Who's your strongest advocate on this?"

**Political dynamics:**
1. "How do [person A] and [person B] work together?"
2. "Are there any tensions I should know about?"
3. "Who do you need to get on board before the group meeting?"

These are leading questions designed to surface the information that makes Mira useful later. The onboarding assistant prompt must be rewritten to include this probing strategy.

### 6.4 Data Flow

As the user answers onboarding questions:
1. Extract project names → create `Project` records
2. Extract stakeholder names → create/update `StakeholderProfile` records
3. Extract project-stakeholder relationships → create `ProjectStakeholder` records
4. Extract inter-stakeholder dynamics → create KnowledgeFacts (allies_with, tensions_with, reports_to)
5. Update `OnboardingProgress` topic flags as areas are covered

**Acceptance Criteria:**
- [ ] Onboarding prompts specifically ask about projects, stakeholders, and political dynamics
- [ ] Project records are created from onboarding conversation
- [ ] Power map (decision makers, influencers, blockers) is captured per project
- [ ] Inter-stakeholder dynamics are extracted and stored as KnowledgeFacts
- [ ] Onboarding depth scores track how much is known about project structure and stakeholder landscape

---

## 7. GitHub Connector per Project

**Priority:** P2
**Depends on:** #5 Project as First-Class Entity

### 7.1 Integration Type

GitHub App (not OAuth App). GitHub Apps provide:
- Fine-grained repository permissions
- Installation-level access (per org/repo)
- Webhook events for real-time updates
- Higher rate limits

### 7.2 Schema

```prisma
model GitHubInstallation {
  id               String @id @default(cuid())
  userId           String
  user             User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  installationId   Int    @unique  // GitHub installation ID
  accountLogin     String // org or user login
  accountType      String // "Organization" or "User"

  accessToken      String? @db.Text // encrypted, short-lived
  tokenExpiresAt   DateTime?

  repositories     ProjectRepository[]
  syncRecords      GitHubSyncRecord[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

model GitHubSyncRecord {
  id               String @id @default(cuid())
  installationId   String
  installation     GitHubInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  repoFullName     String
  syncType         String // "prs", "issues", "contributors", "codeowners"

  status           String @default("pending") // pending, syncing, completed, failed
  lastSyncedAt     DateTime?
  recordsProcessed Int    @default(0)
  factsCreated     Int    @default(0)
  errorMessage     String?

  createdAt DateTime @default(now())

  @@index([installationId, repoFullName])
}
```

### 7.3 Sync Pipeline

**What to sync:**
- PRs: author, reviewers, approval patterns, merge velocity
- Issues: assignees, labels, resolution time
- CODEOWNERS: who owns what areas of the codebase
- Contributor stats: who commits most, review patterns

**Knowledge facts created:**

| Fact Type | Example | Source |
|-----------|---------|--------|
| `contributes_to` | "Raj contributes to api-gateway repo" | Contributor stats |
| `owns_code_area` | "Raj owns /src/auth/**" | CODEOWNERS |
| `reviews_for` | "Raj reviews Sarah's PRs" | PR review patterns |
| `pr_velocity` | "Raj averages 2 PRs/week" | PR stats |
| `collaborates_with` | "Raj and Sarah co-author changes in /src/api" | Co-authorship |

**Sync frequency:** Daily cron for active repositories. On-demand for initial sync after connecting a repo.

### 7.4 User Flow

1. User goes to Project settings → "Connect Repository"
2. Redirected to GitHub App installation flow
3. Selects repositories to grant access to
4. App receives installation webhook → creates `GitHubInstallation`
5. User maps repos to projects in UI
6. Initial sync triggered immediately
7. Daily sync thereafter

**Acceptance Criteria:**
- [ ] GitHub App created and deployable
- [ ] Users can connect repos per project
- [ ] PRs, issues, CODEOWNERS, contributor stats synced
- [ ] Knowledge facts created from GitHub data
- [ ] Mira can reference code-level context: "Raj owns the auth module and reviews most of Sarah's PRs"

---

## 8. Unknown Entity Curiosity

**Priority:** P2
**Problem:** When the user mentions someone or something Mira doesn't know about, she currently either ignores it or gives generic advice. She should show curiosity.

### 8.1 Detection

During voice calls, the Vapi assistant receives `{{knownStakeholders}}` and `{{knownTopics}}` in variable values. The prompt must instruct Mira to:

1. Notice when the user mentions a name not in `{{knownStakeholders}}`
2. Notice when the user mentions a project/topic not in `{{knownTopics}}`
3. Respond with curiosity, not advice

### 8.2 Response Pattern

**When an unknown person is mentioned:**
> "I haven't heard about Professor Rajagopalan before — what's their role in your work?"

**When an unknown project/topic is mentioned:**
> "You mentioned the Bangalore migration — I don't have context on that yet. Can you tell me more?"

**What Mira must NOT do:**
- Give generic advice about an unknown entity
- Pretend to know about them
- Ignore the mention

### 8.3 Learning from the Response

After the user explains the unknown entity:
1. Post-call: voice fact extractor creates KnowledgeEntity + KnowledgeFacts
2. Next call: entity appears in `{{knownStakeholders}}` or `{{knownTopics}}`
3. Mira can now reference it with appropriate confidence tier

### 8.4 Implementation

This is primarily a **prompt engineering** change:

- Add to Vapi assistant system prompts: a section on "unknown entity detection" with example responses
- Add to `buildVariableValues()`: a `{{knownEntities}}` variable listing all known people and topics (already partially exists as `knownStakeholders` and `knownTopics`)
- Ensure voice fact extractor handles entity creation from new mentions

**Existing files to modify:**
- `scripts/setup-vapi-assistants.ts` — add unknown entity detection to prompts
- `worker/src/lib/vapi-voice.ts` — ensure known entities are comprehensive
- `worker/src/agents/knowledge/voice-fact-extractor.ts` — ensure new entity creation works

**Acceptance Criteria:**
- [ ] Mira asks about unknown people/topics instead of ignoring or giving generic advice
- [ ] Unknown entities are created as KnowledgeEntities post-call
- [ ] Next call includes the newly learned entity in context

---

## 9. Real Tool Calling in Voice

**Priority:** P2
**Problem:** The onboarding assistant currently has NO tools. When Mira says "give me a second to check," she is faking it — there is no actual data lookup happening. The daily and meeting assistants have a semantic tool (`MIRA_TOOLS`), but onboarding does not.

### 9.1 Requirements

- Add `MIRA_TOOLS` to the onboarding assistant (same tool as daily/meeting)
- When Mira says "let me check your calendar" or "let me look that up," she must actually invoke the tool
- Tool results should be naturally woven into conversation — not dumped as a list

### 9.2 Implementation

In `scripts/setup-vapi-assistants.ts`, the onboarding assistant configuration needs the same `tools` array as the daily and meeting assistants.

The semantic tool (`MIRA_TOOLS`) routes to the existing API endpoint that handles lookups:
- Calendar queries
- Knowledge graph queries
- Stakeholder profile queries
- Meeting history queries

**Existing files to modify:**
- `scripts/setup-vapi-assistants.ts` — add tools to onboarding assistant config
- Run `npx ts-node scripts/setup-vapi-assistants.ts --update` to update Vapi

**Acceptance Criteria:**
- [ ] Onboarding assistant has `MIRA_TOOLS` configured
- [ ] "Let me check" statements result in actual tool calls (visible in Vapi logs)
- [ ] Tool results are woven naturally into Mira's response

---

## 10. Pipe Stakeholder Intelligence into Calls

**Priority:** P3 (requires #4 to produce data first)
**Problem:** `knownStakeholders` variable currently sends just name lists. Should include personality profiles, communication patterns, and relationship dynamics formatted as coaching whispers.

### 10.1 Current State

`buildVariableValues()` in `worker/src/lib/vapi-voice.ts` builds `knownStakeholders` as a simple list of names with basic attributes. This gives Mira nothing to work with for personalized advice.

### 10.2 Target State

Replace flat stakeholder list with rich coaching whispers, gated by confidence (Section 3.3):

**SILENT tier (confidence < 0.3):** Name only, no characteristics.

**PROBE tier (0.3-0.6):**
```
Sarah Chen (VP Engineering) — Limited data. Ask about working relationship if natural.
```

**SUGGEST tier (0.6-0.8):**
```
Sarah Chen (VP Engineering) — Based on 8 email exchanges: tends to be data-driven and cautious.
She's pushed back on timelines in your last 3 meetings. In 1:1s she's more flexible than group settings.
Approach: Lead with specific dates and data. Don't surprise her in group settings.
```

**ASSERT tier (0.8-1.0):**
```
Sarah Chen (VP Engineering, ANALYST archetype) — Data-driven decision maker. Risk-averse.
DO: Lead with data, give her processing time, reference past precedents.
DON'T: Surprise in groups, use vague timelines, go over her head to CTO David.
Recent: Mentioned budget concerns in ops meeting (3 days ago). Stance: Skeptic on Q2 budget.
```

### 10.3 Format Rules

- Coaching whispers, not CRM records
- Reference specific data: "Based on 8 interactions" not "she might be"
- Actionable: DO/DON'T playbook per person
- Concise: Max 3-4 lines per stakeholder
- Only include stakeholders relevant to today's context (today's meetings, active projects)
- Gate by confidence: never assert things Mira isn't sure about

**Existing files to modify:**
- `worker/src/lib/vapi-voice.ts` — rewrite `knownStakeholders` building logic
- `web/app/api/vapi/call/route.ts` — mirror changes on web side

**Acceptance Criteria:**
- [ ] Stakeholder intelligence piped into calls with confidence gating
- [ ] Coaching whispers reference specific data points
- [ ] No assertions without sufficient evidence
- [ ] Mira's advice changes based on who she's talking about (not generic)

---

## 11. Domain Expertise Grounding

**Priority:** P3 (ongoing refinement)
**Problem:** Mira's advice should be grounded in actual leadership and management domain expertise, not generic AI platitudes.

### 11.1 Expertise Areas

**Relationship Building:**
- Influence without authority frameworks
- Trust equation (credibility + reliability + intimacy / self-orientation)
- Stakeholder mapping methodologies

**Communication Frameworks:**
- Radical Candor (care personally + challenge directly)
- Crucial Conversations (safety, shared pool of meaning)
- Nonviolent Communication (observation, feeling, need, request)
- Situation-Behavior-Impact feedback model

**Political Navigation:**
- Stakeholder mapping (power vs interest grid)
- Coalition building
- Pre-meeting socialization tactics
- Reading the room (stance assessment)

**Leadership Models:**
- Situational leadership (directing, coaching, supporting, delegating)
- Servant leadership
- Adaptive leadership (Heifetz — technical vs adaptive challenges)

### 11.2 How Expertise Surfaces

Domain expertise should NOT be delivered as lectures. It should be:

1. **Woven into coaching whispers:** "Raj is risk-averse — leading with data (Radical Candor: challenge directly) will land better than building rapport first."
2. **Referenced when relevant:** "This sounds like an adaptive challenge — the problem isn't technical, it's getting alignment."
3. **Connected to user's real data:** "Based on your last meeting with the board, you were in 'directing' mode but this group might respond better to 'supporting' — they have the expertise, they need space."

### 11.3 Implementation

Primarily a prompt engineering effort:

- Add domain knowledge blocks to Vapi assistant system prompts
- Include relevant frameworks in `{{callDirective}}` when the situation matches
- The pre-call planning agent should identify which frameworks are relevant based on upcoming meetings and active challenges

**Acceptance Criteria:**
- [ ] Mira references recognized leadership/communication frameworks when relevant
- [ ] Frameworks are connected to the user's specific situation, not lectured generically
- [ ] User should feel like they're talking to a coach who has read the same books they have

---

## Cross-Cutting Concerns

### Privacy

- Email content analysis must respect privacy. Store insights as KnowledgeFacts, not raw email bodies.
- Voice transcripts are already stored (Vapi). No additional raw content storage.
- GitHub data: store computed facts (contribution patterns, review relationships), not code.
- All personal data scoped to userId. No cross-user data leakage.

### Performance

- Pre-call planning (`buildCallDirective()`) must be deterministic — database reads + template assembly, no LLM calls. Target: <100ms.
- LLM work happens post-call (evaluation, thread extraction, adaptation signals) and weekly (relationship analysis, personality profiling).
- Stakeholder confidence scoring is pre-computed and cached, not computed per-call.

### LLM Provider

- NEVER hardcode a specific LLM provider.
- Web side: `web/lib/llm/user-config.ts` via `getUserLLMConfig(userId)`
- Worker side: `worker/src/lib/user-llm.ts` via `getUserLLMConfig(userId)` + `generateText(config, prompt)` + `withLLMRetry()`
- Both decrypt API keys via `ENCRYPTION_SECRET` and fall back to env vars.

### Error Handling

- NEVER return fake/hardcoded content as a fallback when an LLM call fails.
- If generation fails, log the error, record it in `AgentRun`, and surface to admin.
- For voice calls: if pre-call planning fails, the call still proceeds with whatever context is available — it degrades gracefully, not catastrophically.

### Testing

- Each new agent should have unit tests with mocked LLM calls
- Integration tests: trigger a call → verify evaluation created → verify directive in next call
- Pipeline tests: insert test data at stage 1 → verify it flows through to stage 5

---

## Implementation Sequence

### Phase 1: Foundation (Weeks 1-2)
- **1.1-1.8:** Observability system (AgentRun model, structured logging, health check API)
- **2.1:** Schema for CallEvaluation, CoachingRelationshipPlan, CoachingTrajectory
- **5.1-5.3:** Unified Project model + migration

### Phase 2: Feedback Loop (Weeks 2-4)
- **2.2:** Post-call evaluation agent
- **2.3:** Coaching relationship agent
- **2.4:** Pre-call planning agent (buildCallDirective)
- **2.5:** Trajectory computation
- **2.6:** Admin coaching intelligence API + daily brief

### Phase 3: Conversation Quality (Weeks 4-6)
- **3.1:** Guardrails + prompt overhaul
- **3.2:** Personal thread manager
- **3.3:** Confidence engine
- **3.4-3.5:** Adaptation signals + maturity transitions
- **8:** Unknown entity curiosity (prompt change)
- **9:** Real tool calling in onboarding

### Phase 4: Deep Intelligence (Weeks 6-8)
- **4.1:** Email content analysis pipeline
- **4.2-4.3:** Multi-signal stakeholder profiling + coaching whisper generation
- **4.4:** Relationship dynamics extraction
- **10:** Pipe intelligence into calls with confidence gating

### Phase 5: Extensions (Weeks 8+)
- **6:** Onboarding restructuring (project + power map probing)
- **7:** GitHub connector
- **11:** Domain expertise grounding (ongoing)

---

## Reference Documents

| Document | Location | Relevance |
|----------|----------|-----------|
| Conversation Engine Design | `docs/requirements/conversation-engine-design.md` | Full technical design for guardrails, threads, confidence, archetypes, maturity |
| Coaching Intelligence Plan | `.claude/plans/adaptive-growing-panda.md` | Step-by-step implementation plan for evaluation + relationship + trajectory |
| Ground Game PRD | `docs/requirements/ground-game.md` | Relationship intelligence, room reads, influence planning |
| Product Gap Tracker | `docs/requirements/mira-product-gaps.md` | Current state of what's built vs missing |
| Admin Dashboard PRD | `docs/requirements/admin-dashboard-prd.md` | Admin visibility requirements |
| Voice Strategy | `docs/requirements/voice-strategy.md` | Voice system architecture |

## Key Existing Files

| File | Relevance |
|------|-----------|
| `web/prisma/schema.prisma` | Schema (81+ models). UserProject (line 626), ProfessionalProject (line 2733), StakeholderProfile (line 1138), OnboardingProgress (line 3213), KnowledgeEntity (line 3352) |
| `worker/src/lib/vapi-voice.ts` | `buildVariableValues()` — where call context is assembled. Primary integration point for intelligence piping. |
| `worker/src/lib/user-llm.ts` | `getUserLLMConfig()` + `generateText()` — provider-agnostic LLM wrapper |
| `worker/src/agents/knowledge/voice-fact-extractor.ts` | Extracts knowledge facts from voice call transcripts |
| `worker/src/agents/stakeholder-enrichment-agent.ts` | Web search enrichment (currently produces zero output) |
| `worker/src/agents/daily-call-scheduler.ts` | Cron-based call scheduling |
| `worker/src/agents/email-sync.ts` | Email sync (currently metadata only, needs content analysis) |
| `worker/src/agents/calendar-sync.ts` | Calendar sync with stakeholder extraction |
| `worker/src/index.ts` | Worker entry point — pg-boss queue registration |
| `web/app/api/vapi/webhook/route.ts` | Post-call webhook handler — trigger point for evaluation |
| `web/app/api/vapi/call/route.ts` | Web-side call builder with `buildVariableValues()` |
| `scripts/setup-vapi-assistants.ts` | Creates/updates Vapi assistant configurations |
