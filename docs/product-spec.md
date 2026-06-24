# Mira — Product Specification

**Version:** 1.1
**Last Updated:** 2026-03-10
**Status:** Live (private beta)

---

## Executive Summary

Mira is an AI chief of staff focused on meeting effectiveness. She syncs your calendar and email, learns who you work with, preps you before every important meeting, debriefs you after, and tracks whether you're landing outcomes. A knowledge graph runs underneath — learning about your stakeholders, org dynamics, and projects — so that Mira's coaching gets sharper with every interaction.

**One-liner:** The AI chief of staff who makes every meeting count.

**Today:** Meeting effectiveness — prep, debrief, track, improve.

**Vision:** A true business-outcome-focused chief of staff, where meetings are one input into broader outcome tracking, stakeholder orchestration, and strategic decision support.

**Target user:** Mid-to-senior leaders (VP, Director, Sr. Manager) with 8-15 meetings per day who manage people and stakeholders across functions.

**Anti-user:** Individual contributors with few meetings, or anyone who wants a meeting transcription/notes tool.

---

## Core Value Proposition

Most professionals spend 40-60% of their work hours in meetings. Yet almost nobody treats meetings as a skill. They prepare for presentations but walk into their most important meetings with no outcome in mind, no awareness of room dynamics, and no system to improve.

Mira makes meeting effectiveness a visible, improvable skill — without turning it into homework.

### What Mira Is NOT
- Not a meeting notes tool (Otter, Fireflies)
- Not a scheduling optimizer (Clockwise, Reclaim)
- Not a meeting analytics dashboard with charts and scores
- Not a standalone people analytics or CRM tool
- Not a gamified productivity app with badges and streaks

### What Mira IS
An AI chief of staff embedded in your calendar flow who:
1. Preps you before meetings: who to watch, what to push for, what's your play
2. Debriefs you after: did you get what you wanted?
3. Tracks commitments so nothing falls through
4. Builds stakeholder profiles that make every prep sharper than the last
5. Notices your patterns and coaches at the right moment
6. Optionally calls your phone — morning check-ins, pre-meeting prep, debriefs

---

## How It Works

### The Core Loop: Meeting Effectiveness

This is Mira's center of gravity. Everything else — stakeholder profiles, knowledge graph, voice calls — exists to make this loop sharper.

```
SYNC → CLASSIFY → PREP → ATTEND → DEBRIEF → TRACK → IMPROVE
```

1. **Sync** — Google Calendar events auto-synced every 30 min + webhook push
2. **Classify** — Auto-categorized: Needle Mover, Operational, Growth, Tactical (keyword-based today; LLM-based planned)
3. **Prep** — Pre-meeting brief with attendee intel, desired outcome prompt, tactical edge tips
4. **Attend** — User attends meeting (no in-meeting support yet)
5. **Debrief** — "How'd it go?" — LANDED / PARTIAL / MISSED + optional note
6. **Track** — Commitments extracted, follow-ups tracked, weekly patterns analyzed
7. **Improve** — Pattern detection flags overload, drift, neglect. Mira coaches at the right moment.

#### Meeting Classification
| Category | Signal | Examples |
|----------|--------|----------|
| NEEDLE_MOVER | Decision-oriented, senior attendees, strategy keywords | Board review, roadmap alignment |
| OPERATIONAL | Recurring, status/sync keywords, team-level | Daily standup, sprint review |
| GROWTH | 1:1 with report, mentoring keywords | 1:1s, performance reviews |
| TACTICAL | Short-term problem solving, coordination | Bug triages, incident response |
| UNCLASSIFIED | Not enough signal | Default for ambiguous meetings |

User can override classification inline. The 50/25/25 rule (needle movers vs operational vs growth) is the framework Mira coaches toward.

#### Outcome Tracking
- **Pre-meeting**: Mira asks "What do you want to walk out with?" (via push notification, chat, or voice call)
- **Post-meeting**: "Did you get it?" — three buttons: Landed / Partial / Missed
- **Review window**: 24 hours (meetings show "needs review" on dashboard until reviewed or skipped)
- **Voice debrief**: User can call Mira for a conversational debrief instead of button-tapping

#### Pattern Detection
Weekly `MeetingPatternSnapshot` plus daily pattern detection captures:
- Outcome set rate and hit rate
- Follow-through on commitments
- Category distribution (time allocation)
- Recurring meetings with no value set
- Stakeholder coverage gaps
- Meeting overload (6+/day for 3+ days)
- Commitment drift, relationship neglect, outcome avoidance

Patterns surface through Mira's natural language coaching, not dashboards with charts.

---

### Stakeholder Intelligence (Serves the Core Loop)

Not a standalone people analytics platform. Stakeholder intel exists because good meeting prep requires knowing who's in the room.

Every person the user interacts with gets a profile built from calendar frequency, email patterns, user statements in chat/voice, and LLM synthesis. Top 50 stakeholders by interaction frequency are actively maintained.

#### Profile Components
| Component | Source | Example |
|-----------|--------|---------|
| **Archetype** | Behavior patterns | DRIVER, ANALYST, COLLABORATOR, VISIONARY, etc. |
| **Communication Style** | Interaction analysis | "Prefers data-backed proposals, short meetings" |
| **Decision Style** | Meeting outcomes | "Needs 48h to process, then commits fully" |
| **Political Stance** | Org dynamics | "Ally on technical decisions, neutral on budget" |
| **Success Patterns** | Historical wins | "Responds well to competitive framing" |
| **Objection Patterns** | Historical blocks | "Always asks about timeline feasibility" |

#### How This Shows Up
- **Pre-meeting prep**: "Rajagopalan prefers data-backed proposals. Lead with the numbers, not the narrative."
- **People Radar on dashboard**: Today's people to watch, archetype + one-liner tactical tip
- **Influence mapping**: Power levels, ally/blocker/neutral stance, org grouping (inferred from email domains)

#### What's NOT Built Yet
- Stakeholder playbook doesn't auto-inject into prep chat context (P1 gap)
- No cross-stakeholder orchestration or influence campaign planning
- No stakeholder-to-business-outcome linking

---

### Knowledge Graph (The Engine Under the Hood)

Users never interact with "the graph." They experience Mira knowing things — that Pranab is the decision-maker on VoicERA, that finance meetings consistently stall on budget objections, that a key stakeholder hasn't been met in 2 weeks.

#### What Gets Extracted
From every data source (calendar, email, drive, chat, voice), fact extractors produce:
- **Entities**: People, projects, topics, organizations, concepts
- **Facts**: Directed relationships between entities with confidence scores
- **Communities**: Related entities grouped automatically (e.g., "Q1 Product Launch" team)
- **Domain context**: Org culture, unwritten rules, political landscape (synthesized daily)

#### Entity Resolution
Same person across contexts: "Rajagopalan" in calendar = "Raj" in chat = "rajagopalan@company.com" in email. Canonical name + aliases + email(s) + org affiliation.

#### Confidence & Decay
- Facts start with confidence 0.5-0.95 depending on source (chat/voice highest, calendar-inferred lowest)
- Facts decay over time: 30d → ×0.9, 90d → ×0.7, 180d → ×0.5
- This prevents stale information from dominating coaching

---

### Voice Coaching (Delivery Channel)

Voice is an optional, high-intimacy delivery channel for the same meeting intelligence. It is not a separate product pillar.

| Call Type | Trigger | Duration | Purpose |
|-----------|---------|----------|---------|
| **Morning Check-in** | 8 AM IST (cron) | 3-15 min | Day's priorities, key meeting prep, overdue follow-ups |
| **Pre-Meeting Prep** | 15 min before meeting | 2-3 min | Room dynamics, tactical tip, desired outcome |
| **Post-Meeting Debrief** | After meeting ends | 2-3 min | What happened, commitments made, outcome landed? |
| **Onboarding** | First call + woven into daily calls | 3-5 min | Learn user's role, stakeholders, goals, challenges |

Voice: Priyanka Sogum (Indian English female, ElevenLabs) via Vapi. Personality: Della Street meets Indra Nooyi — warm, sharp, dry wit, never flustered.

Onboarding is conversational (no signup forms), covers 6 topics (role, stakeholders, goals, challenges, work style, company context), and continues across ALL call types until complete.

---

### Proactive Coaching

| Trigger | Schedule | What Gets Delivered |
|---------|----------|-------------------|
| Morning brief | 8:00 AM IST | Today's meetings, active goals, stale relationships, batched overnight nudges |
| Pre-meeting prep | 1 hour before | Attendee intel, communication styles, tactical edge, outcome prompt |
| Post-meeting review | After meeting ends | "How'd it go?" outcome capture |
| Commitment reminders | 9:30 AM IST | Follow-ups coming due |
| Context deepening | 4:30 PM IST | One targeted question to fill knowledge gaps |
| Pattern detection | 8:30 PM IST | Flags overload, drift, neglect, avoidance |
| Friday ritual | Fri 6:30 PM IST | Weekly reflection/celebration |
| Weekly reflection | Sun 5:30 PM IST | Meeting patterns + outcomes review (gated: 5+ meetings + 2+ outcomes) |

Delivery channels: in-app (Pusher), browser push (VAPID), email, voice call (if opted in). All respect delivery guard (DND, quiet hours, max calls/day, no calls during meetings).

---

## User Experience

### Dashboard ("Today Brief")

The primary view. Everything the user needs to know, top to bottom:

1. **Greeting + Gauge** — Retro gauge showing day's meeting load
2. **People Radar** — Today's people to watch with archetype playbook
3. **Strategic View** — Meetings organized as Needle Movers vs. Other
4. **Actions** — Meetings needing review (LANDED/PARTIAL/MISSED) + overdue commitments
5. **Relationships to Watch** — Ground Game signals (relationship cooling, influence shifts)
6. **Honest Mirror** — What Mira knows about the user + gaps

### Meetings Hub

Two views:
- **Gameplan** — Today's meetings with edge tips, attendee intel, outcome capture
- **Calendar** — Week/month view of all meetings

Each meeting card shows:
- Category badge, title, time, attendee count
- Edge tip (tactical advice)
- Desired outcome (set/edit inline)
- Voice call button (pre-meeting prep or post-meeting debrief, context-aware)
- Deep prep link

### Chat

Text conversation with Mira. Multi-agent pipeline:
- Router classifies intent and extracts entities
- Context agent retrieves relevant knowledge
- Action agent creates goals, maps relationships, captures outcomes
- Response agent formats with Mira's personality

Supports: goal setting, stakeholder questions, meeting prep, general coaching, "call me" triggers.

### Stakeholders

Full stakeholder profile page:
- Archetype badge + Do/Don't playbook
- Interaction timeline
- Influence map visualization (D3 force graph)
- Inline editing of role, org, archetype, stance, power level
- Enrichment status

### Wins (Effectiveness Dashboard)

- Meeting effectiveness % (hit rate)
- Follow-through rate on commitments
- Recent outcomes log
- Category breakdown (where time goes)
- Weekly trends

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| UI | Radix UI, Lucide icons, Framer Motion, D3, Recharts |
| Backend | Next.js API routes (~95 endpoints) |
| Worker | Node.js + TypeScript, pg-boss queue processing |
| Database | PostgreSQL (Neon), Prisma ORM, 81 models |
| Auth | Clerk |
| Voice | Vapi (outbound calls) + ElevenLabs (TTS) + Deepgram (STT) |
| AI/LLM | Gemini 2.0 Flash (default), GPT-4o (voice), OpenAI, Anthropic |
| Real-time | Pusher WebSocket |
| Payments | Stripe + Razorpay |

### LLM Strategy
Users choose their own provider via settings. Platform never hardcodes a provider:
- Encrypted per-user API keys in `UserApiKey` table
- Falls back to platform env var (Gemini API key)
- Provider-agnostic `generateText()` + `withLLMRetry()` utilities

### Deployment
- **Web**: Vercel (auto-deploy on push to `exec-coach`)
- **Worker**: Render
- **Database**: Neon PostgreSQL

---

## Data Models (Key)

| Category | Models |
|----------|--------|
| **Identity** | User, UserPreferences, UserApiKey, PersonalContext, BusinessContext |
| **Voice** | VoiceCall, ScheduledCall, CallFeedback, OnboardingProgress |
| **Meetings** | MeetingSyncRecord, ConversationOutcome, MeetingCommitment, MeetingPatternSnapshot |
| **Knowledge Graph** | KnowledgeEntity, KnowledgeFact, KnowledgeCommunity, ConversationInsight |
| **Stakeholders** | StakeholderProfile, StakeholderIntelligence, StakeholderInteraction, Organization |
| **Intelligence** | UserIntelligence, DomainContext, DomainLearning |
| **Goals** | Goal, GoalStakeholder, UserKPI |
| **Coaching** | ProactivePrompt, ConversationPrep, SkillObservation |
| **Engagement** | PushSubscription, CorrectionLearning |
| **Billing** | Subscription, Payment |

---

## Current Status (March 2026)

### What's Working End-to-End
- **The meeting loop**: Calendar sync → classification → pre-meeting prep → post-meeting debrief → outcome tracking → commitment reminders → weekly patterns. This is production-solid.
- **Stakeholder profiles**: Per-person intelligence (archetypes, communication style, success/objection patterns) synthesized daily for top 50 stakeholders.
- **Knowledge graph**: Multi-source extraction, entity resolution, community detection, confidence decay — all running on cron.
- **Proactive coaching**: Morning brief, pre-meeting prep, post-meeting review, context deepening, pattern detection — all wired and delivering.
- **Voice coaching**: Morning calls, pre/post meeting, onboarding. Priyanka Sogum voice. Phase 1 complete.
- **Multi-agent chat**: 4-agent pipeline with Mira persona. Handles goals, stakeholder questions, meeting prep, outcome capture.
- **Domain synthesis**: Org culture, unwritten rules, political landscape — inferred daily from graph + user statements.
- **Infrastructure**: Correction learning, admin panel, platform API key provisioning, Stripe + Razorpay, PWA.

### What's Partially Built
- **Meeting classification** is keyword-based (14 keywords). No semantic understanding. Works for obvious cases, misses nuance.
- **Goals/KPIs** exist but are shallow — mostly manual entry, no automated progress tracking, no link to meeting outcomes.
- **Weekly reflection** is gated (5+ meetings + 2+ outcomes) so most early users never see it.
- **Stakeholder playbook doesn't inject into prep chat context** — PeopleIntelHub is a separate panel, not wired into the conversation pipeline.
- **Edge tips** generated on-the-fly with 4s timeout, not pre-computed or persisted.

### Not Built Yet (Vision Items)
- LLM-based meeting classification (replace keyword matcher)
- Auto-suggest outcomes + one-tap accept (biggest friction reducer)
- Stakeholder playbook → chat context injection
- Live meeting support (agenda, timer, prompts)
- Calendar write-back (suggest times, propose cancellations)
- Cross-stakeholder orchestration / influence campaign planning
- Meeting outcomes → business outcomes linking
- Transcript analysis + auto action item extraction
- Voice memos → intelligence pipeline
- "The Walk" thinking partner mode

---

## Design Principles

1. **Lead with value, not questions.** Tell the user something specific and useful. Then ask for a reaction. Never open with "What's on your mind today?"

2. **Coach, don't score.** No numerical ratings shown to the user. Observations in natural language: "I noticed X" not "Your score is Y."

3. **Never fake content.** If an LLM call fails, surface the error with retry. No hardcoded fallbacks disguised as real AI output.

4. **Meetings are the unit of work.** Everything — stakeholder profiles, knowledge graph, pattern detection — exists to make the next meeting better. Don't build features that aren't in service of the core loop.

5. **Stakeholder intel serves meetings.** Weave people data into prep narrative. Never field dumps — no "Decision: deliberate_analytic" labels. The user should see "Lead with the numbers for Rajagopalan," not a personality type dropdown.

6. **Dismissing is always fine.** Every nudge can be ignored without guilt, follow-up, or passive-aggressive reminders.

7. **Less is more.** On a day with 8 meetings, pick the 1-2 that matter most. High signal, low noise.

8. **Confidence as narrative.** "Based on 8 interactions" not "72% confidence."

9. **One question in, one question out.** Before: "What do you want?" After: "Did you get it?" That's the maximum friction budget.

10. **Benchmark against yourself.** "You're doing X better than last month" not "Top executives do Y."

---

## Monetization

### Philosophy
No psychological lock-in. Mira is upfront:
> "Voice coaching is free while we're building this. At some point, it becomes premium — I'll give you plenty of notice."

### Free Tier
- Morning briefs (text)
- Basic meeting prep (text)
- Dashboard, outcomes, knowledge graph
- 2 voice calls per week

### Premium Tier ($50-100/month)
- Unlimited voice calls (all types)
- Morning brief calls, pre-meeting prep, debriefs
- Weekly reflection & Friday ritual calls
- Voice memos → intelligence
- "The Walk" thinking partner mode
- Proactive intelligence drops

### No Dark Patterns
- Users keep all data on free tier
- Text coaching continues fully
- No degradation of existing features
- Clear comparison, not "what you lose"

---

## Success Metrics (Internal)

| Metric | Target | Why |
|--------|--------|-----|
| Outcome set rate | >50% by week 4 | Core engagement signal |
| Post-meeting response rate | >40% | Debrief loop is working |
| Voice call answer rate | >60% | User values the calls |
| Call duration (morning) | >3 min avg | User is engaging, not hanging up |
| Onboarding completion | 6/6 topics in <7 calls | Onboarding is natural, not tedious |
| Weekly active (voice or chat) | >70% at week 8 | Product is sticky |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| User feels surveilled | Every nudge dismissible. No guilt. Transparent about what Mira tracks. |
| Wrong classification | Default UNCLASSIFIED. Only classify obvious cases. User can override. |
| Too many calls | Delivery guard: DND, quiet hours, max calls/day. Frequency caps. |
| Generic coaching | All coaching references specific meetings, people, outcomes by name. |
| Voice quality | Indian English voice (Priyanka), slow pace (0.9), 60s silence timeout. |
| LLM failures | Surface error with retry. Never fake content. Fall back across providers. |
