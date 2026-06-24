# Meeting Champion — Product Requirements Document

## Vision

Transform leaders from passive meeting attendees into deliberate meeting orchestrators. Not by adding more tools or dashboards, but by embedding coaching into the moments that matter — right before and right after every meeting.

Mira becomes a meeting coach who watches, learns, and speaks up only when she has something worth saying.

---

## Core Belief

Most professionals spend 40-60% of their work hours in meetings. Yet almost nobody treats meetings as a skill to develop. They prepare for presentations, practice for interviews, but walk into their most important meetings with no outcome in mind, no awareness of their patterns, and no system to improve.

The opportunity: make meeting effectiveness a visible, improvable skill — without turning it into homework.

---

## What This Is NOT

- Not a meeting notes tool (Otter, Fireflies)
- Not a scheduling optimizer (Clockwise, Reclaim)
- Not a meeting analytics dashboard with charts and scores
- Not a gamified productivity app with badges and streaks

## What This IS

A coach embedded in your calendar flow who:
1. Asks one question before: "What do you want from this?"
2. Asks one question after: "Did you get it?"
3. Tracks commitments so nothing falls through
4. Notices your patterns and coaches at the right moment
5. Suggests meetings you should be having but aren't

---

## Users

**Primary:** Mid-to-senior leaders (VP, Director, Sr. Manager) who:
- Have 8-15 meetings per day
- Manage people and stakeholders across functions
- Know their meetings could be better but don't have a system
- Value their time and will abandon anything that adds friction

**Anti-user:** Individual contributors with few meetings, or anyone who wants a meeting transcription/notes tool.

---

## Design Principles

1. **One question in, one question out.** Before: "What do you want?" After: "Did you get it?" That's the maximum friction budget.

2. **Coach, don't score.** No numerical ratings shown to the user. No report cards. Observations in natural language: "I noticed X" not "Your score is Y."

3. **Benchmark against yourself, not others.** "You're doing X better than last month" not "Top executives do Y." Self-comparison motivates. External comparison preaches.

4. **Dismissing is always fine.** Every nudge can be ignored without guilt, follow-up, or passive-aggressive reminders. Silent respect for the user's attention.

5. **Value before questions.** Deliver something useful (intel, reminder, pattern) before asking for anything. Earn the right to ask.

6. **Invisible progression.** The user never sees levels, phases, or unlock screens. They just notice Mira getting sharper over time. Internally, Mira adapts her coaching to the user's maturity.

7. **Less is more.** On a day with 8 meetings, don't nudge before each one. Pick the 1-2 that matter most. High signal, low noise.

---

## Feature Breakdown

### F1: Outcome Capture (The Foundation)

**What:** Before every meeting, Mira asks what the user wants to walk out with. After every meeting, Mira asks if they got it.

**Pre-meeting (90 minutes before):**

| Element | Detail |
|---------|--------|
| Trigger | Pre-meeting prep cron (already exists, runs every 15 min) |
| Delivery | Toast notification on any page + Pusher message in chat |
| Content | "You have [meeting] with [people] in [time]. What do you want to walk out with?" |
| Quick options | 2-3 AI-generated options based on meeting title, recent emails, last meeting's open items |
| User input | Tap a quick option or type their own |
| Storage | `MeetingSyncRecord.desiredOutcome` (field already exists) |
| Time budget | 15 seconds for the user |

**Post-meeting (15 minutes after end time):**

| Element | Detail |
|---------|--------|
| Trigger | Post-meeting review cron (already exists, runs every 15 min) |
| Delivery | Toast with inline response options |
| Content | "How did [meeting] go? You wanted to [desiredOutcome]" |
| Options | [Landed] [Partially] [Didn't land] + dismiss |
| On "Landed" | Save outcome, optionally ask "Any follow-ups?" — done |
| On "Partially" / "Didn't land" | Open chat: "What got in the way?" with quick options (ran out of time, got derailed, pushback, wrong forum) |
| Storage | `MeetingSyncRecord.outcome` + `MeetingSyncRecord.outcomeResult` (new enum: LANDED / PARTIAL / MISSED / SKIPPED) |
| Time budget | 5 seconds for landed, 30 seconds for a miss |

**Presentation coaching — when the user is presenting:**

Some meetings aren't conversations — they're performances. When Mira detects a presentation-type meeting (user organized, larger audience, keywords like "review," "proposal," "pitch," "update to leadership"), the pre-meeting coaching deepens:

| Standard meeting | Presentation meeting |
|-----------------|---------------------|
| "What do you want to walk out with?" | "What's the ONE thing you need them to leave believing?" |
| Quick options based on context | "What's the story in 3 sentences? What's broken, what you're proposing, what you need." |
| Brief with attendee intel | Brief with attendee intel + narrative coaching: "Lead with the stake, not the slides" |

The coaching principle: **the narrative should be so strong that slides become optional.** If the user can't walk into a room and make their case in 2 minutes with nothing but their voice, they're not ready. Slides should augment a clear narrative, never carry it. Mira's job is to make the user the presentation, not the deck.

Mira's narrative coaching flow:
1. Ask for the core message in plain language (not slide order)
2. Reflect it back as an opening line they can actually say out loud
3. Flag the key person in the room and what they'll care about
4. Remind: "If you can't say it without slides, the slides won't save you"

This is not a deck-building tool. It's 60 seconds of forcing the user to find their narrative before they hide behind slides. The goal: the user walks in knowing exactly what they want to say, why it matters, and what they need — in their own words. If they nail that, slides become illustrations, not crutches. If they can't articulate it to Mira in 3 sentences, they're not ready for the room.

Detection heuristics for presentation meetings:
- User is the organizer AND attendee count > 4
- Title contains: review, proposal, pitch, update, readout, demo, showcase, kickoff
- Description contains: agenda, deck, slides, presentation
- Meeting is non-recurring AND > 30 minutes

**Smart filtering — which meetings get the ask:**
- Skip: meetings with <2 attendees (blocked time), cancelled, all-day events
- Skip: if user already set outcome via chat or gameplan UI
- Prioritize: meetings with key stakeholders, meetings classified as needle-movers (later), first meeting of the day
- Density cap: max 3 outcome asks per day. Pick the ones that matter most.

**Acceptance criteria:**
- [ ] Pre-meeting toast appears 60-90 min before meeting
- [ ] Quick options are contextual (not generic)
- [ ] User can set outcome in <15 seconds
- [ ] Post-meeting toast appears 10-20 min after end
- [ ] "Landed" is one tap, no follow-up
- [ ] Outcome stored on MeetingSyncRecord
- [ ] Meetings with no attendees or cancelled status are skipped
- [ ] Max 3 outcome asks per day

---

### F2: Follow-Up Tracking

**What:** When a user mentions commitments in post-meeting chat ("He'll send the roadmap by Monday"), Mira extracts them and tracks them automatically.

**Extraction:**
- Source: user's post-meeting chat responses
- Method: LLM extraction during chat fact processing (existing pipeline)
- Extracted fields: who, what, by when
- Storage: `MeetingSyncRecord.followUps` (already exists as string array) + new `MeetingCommitment` model for structured tracking

**Reminder flow:**
- On the due date, Mira checks if the commitment is likely fulfilled (email from that person about that topic)
- If not: toast — "[Person] was going to [do X] today. Haven't seen it come through."
- Options: [Nudge them] [It's done] [Push to next week] [Drop it]
- [Nudge them]: Mira drafts a short nudge message the user can copy/send. We do NOT send on their behalf.

**Schema: MeetingCommitment (new model)**
```
id          String
meetingId   String → MeetingSyncRecord
userId      String → User
owner       String        // who committed (name)
ownerEmail  String?       // if known
description String        // what they committed to
dueDate     DateTime?     // by when
status      PENDING | FULFILLED | OVERDUE | DROPPED
fulfilledAt DateTime?
source      CHAT | MANUAL // how we learned about it
createdAt   DateTime
```

**Acceptance criteria:**
- [ ] Commitments extracted from natural chat language
- [ ] Reminder appears on due date
- [ ] User can mark as done, push, or drop in one tap
- [ ] No automatic sending of messages to anyone

---

### F3: Meeting Classification (Lightweight, Conservative)

**What:** Classify meetings into categories to enable pattern analysis. Done silently — the user never sees "your meeting was classified as operational."

**Categories:**
| Category | Signal | Examples |
|----------|--------|----------|
| NEEDLE_MOVER | Decision-oriented, senior attendees, non-recurring, strategy/review keywords | Board review, roadmap alignment, investor call |
| OPERATIONAL | Recurring, status/sync keywords, team-level | Daily standup, sprint review, weekly sync |
| GROWTH | 1:1 with direct report, mentoring, review keywords | 1:1s, performance reviews, skip-levels |
| UNCLASSIFIED | Not enough signal | Default for first 2 weeks |

**Implementation:**
- Runs on every new synced meeting (calendar sync pipeline)
- Classification based on: title keywords, recurrence, attendee count, attendee seniority (from knowledge graph)
- No LLM call — simple heuristic first. LLM refinement later if needed.
- Storage: `MeetingSyncRecord.meetingCategory` (new field, nullable)
- Confidence threshold: only classify if confidence > 0.7, otherwise leave as UNCLASSIFIED

**Why conservative:** A wrong classification ("your board meeting is operational") destroys trust faster than no classification. Start with obvious cases only.

**Acceptance criteria:**
- [ ] Classification runs automatically on calendar sync
- [ ] Heuristic-based (no LLM cost per meeting)
- [ ] Default is UNCLASSIFIED, not a wrong guess
- [ ] Category stored on MeetingSyncRecord
- [ ] User never sees the classification label directly

---

### F4: Pattern Detection & Coaching Context

**What:** Weekly analysis of meeting patterns that feeds into Mira's coaching. Not a dashboard — patterns surface through Mira's natural language in pre-meeting briefs and weekly reflections.

**Patterns tracked (internal, not shown as metrics):**
| Pattern | How detected | How surfaced |
|---------|-------------|--------------|
| Outcome set rate | count(desiredOutcome != null) / count(meetings) | "You've been setting outcomes more consistently this month" |
| Outcome hit rate | count(outcomeResult = LANDED) / count(outcomeResult != null) | "Your 1:1s consistently land. Team syncs don't — worth examining" |
| Follow-through rate | count(commitments fulfilled) / count(commitments total) | "3 follow-ups from last week are still open" |
| Category distribution | time per category per week | "You spent 6 hours in syncs this week. Any of those could be async?" |
| Meeting density | meetings per day, gaps between meetings | "You had back-to-back meetings for 5 hours yesterday" |
| Recurring meeting value | recurring meetings with outcome never set or never landed | "Your Tuesday standup hasn't produced a decision in 4 weeks" |
| Stakeholder coverage gaps | key stakeholders (from goals) with no recent meeting | "You haven't synced with [person] in 3 weeks" |
| 1:1 frequency with reports | reports (from manages facts) vs 1:1 meeting frequency | "You're meeting [report A] weekly but haven't met [report B] in 2 weeks" |

**Implementation:**
- Weekly cron job (Sunday evening IST)
- Produces a `MeetingPatternSnapshot` stored in DB
- Snapshot data injected into proactive agent context for the coming week
- No separate UI — patterns surface through Mira's messages

**Schema: MeetingPatternSnapshot (new model)**
```
id                    String
userId                String → User
weekStart             DateTime
totalMeetings         Int
outcomesSet           Int
outcomesLanded        Int
outcomesMissed        Int
commitmentsMade       Int
commitmentsFulfilled  Int
categoryBreakdown     Json     // { NEEDLE_MOVER: 3, OPERATIONAL: 8, ... }
totalMeetingHours     Float
avgMeetingsPerDay     Float
recurringWithNoValue  Json     // [{ title, count, lastOutcome }]
stakeholderGaps       Json     // [{ name, lastMet, relationship }]
insights              Json     // LLM-generated observations
createdAt             DateTime
```

**Acceptance criteria:**
- [ ] Weekly snapshot generated automatically
- [ ] Pattern data injected into proactive agent context
- [ ] Patterns surface as natural language in Mira's messages
- [ ] No separate analytics page or dashboard

---

### F5: Meeting Advisory (Recommendations, Not Scheduling)

**What:** Mira proactively suggests meetings the user should set up, based on goals, stakeholder gaps, and follow-up needs.

**Triggers:**
| Signal | Suggestion |
|--------|-----------|
| Goal has key stakeholder with no meeting in 2+ weeks | "You're working on [goal]. You haven't synced with [stakeholder] since [date]. Might be worth a 30-min alignment." |
| Direct report hasn't had a 1:1 in 2+ weeks | "You haven't had a 1:1 with [report] in [X] weeks." |
| Post-meeting "didn't land" | "Want to set up a follow-up to take another run at [outcome]?" |
| Complex follow-up needs multiple people | "This follow-up involves [A], [B], and [C]. Might need its own meeting." |
| Cross-functional dependency from emails/docs | "You and [peer] are both working on [topic]. Worth a sync?" |

**UX:**
- Delivered as a chat message or toast, not a separate page
- Shows: suggested title, attendees, duration, purpose
- Options: [Good idea, I'll set it up] [Not now] [Already handled]
- Mira does NOT create the calendar event. She recommends. User creates.
- If user says "Good idea," Mira can offer to draft a calendar invite description they can copy.

**Implementation:**
- Runs as part of weekly pattern detection (not a separate cron)
- Max 2 recommendations per week. Quality over quantity.
- Filtered through recency: don't suggest if Mira already suggested the same meeting recently

**Acceptance criteria:**
- [ ] Recommendations are specific (person + purpose, not generic)
- [ ] Max 2 per week
- [ ] User can dismiss without consequence
- [ ] No automatic calendar event creation
- [ ] De-duplicated: same suggestion not repeated within 2 weeks

---

### F6: Coaching Progression (Invisible to User)

**What:** Mira adapts her coaching style based on how long the user has been using the system and how consistently they engage with meetings.

**Phases (internal only — user never sees phase names):**

**Phase 1: Awareness (weeks 1-2)**
- Mira is observational, not prescriptive
- Focus: get the user to set outcomes for a few meetings
- Tone: "I noticed..." / "Just flagging..."
- Frequency: light touch, 1-2 nudges per day max
- No pattern analysis yet (not enough data)
- Success signal: user sets outcome for 3+ meetings in a week

**Phase 2: Habit (weeks 3-6)**
- Outcome-setting is becoming regular
- Mira starts gentle challenges: "This sync hasn't had a decision in 3 weeks"
- Follow-up tracking active
- Pattern observations begin: "Your 1:1s land consistently, team meetings less so"
- Meeting advisory starts (1 per week)
- Success signal: outcome set rate > 50%, user responds to post-meeting asks

**Phase 3: Mastery (weeks 6+)**
- User is consistently setting outcomes and closing loops
- Mira shifts to strategic coaching: pre-wiring, meeting portfolio, time reclaimed
- Meeting advisory at full cadence (2 per week)
- Monthly reflections with narrative arc: "Here's how your meetings changed this month"
- Mira challenges more directly: "Do you need this meeting?"
- Success signal: outcome set rate > 70%, follow-through > 60%

**Implementation:**
- Phase determined by: weeks since first meeting outcome set + outcome set rate + engagement rate
- Stored on User model or UserPreferences: `meetingCoachPhase` (enum, nullable)
- Phase transitions are one-way (no demotion) but Mira eases off if engagement drops
- Phase informs: proactive agent prompt context, nudge frequency, coaching tone, which features activate

**Acceptance criteria:**
- [ ] Phase calculated automatically based on usage patterns
- [ ] No phase names, levels, or progression UI shown to user
- [ ] Proactive agent prompt changes based on phase
- [ ] Nudge frequency scales with phase
- [ ] User who stops engaging gets fewer nudges, not more

---

### F7: Weekly Reflection

**What:** Once per week, Mira sends a brief, narrative reflection on the user's meetings. Not a report — a coaching observation.

**Delivery:** Sunday evening or Monday morning (user timezone). Chat message + push notification.

**Content structure:**
1. One sentence summary: "Last week: X meetings, Y had clear outcomes"
2. One specific callout of something that went well (with meeting name and what the user did)
3. One pattern observation (not a criticism — an observation)
4. Forward look: "This week you have X meetings. N look important. Want to set outcomes for those?"
5. Optional: meeting advisory recommendation if relevant

**Tone:** Like a coach after watching game film. Specific, encouraging, actionable. Not a dashboard summary.

**Example:**
> Last week you had 11 meetings. You set outcomes for 7 and landed 5.
>
> Your 1:1 with Kislaya on Thursday stood out — you asked for the roadmap decision and got it in 20 minutes. That's how a 1:1 should work.
>
> One thing I noticed: your three team syncs all ran over time with no clear next steps. Worth asking: could any of those be an async update?
>
> This week you have 13 meetings. Three look like needle-movers. Want to prep for those now?

**Implementation:**
- New cron job: weekly reflection (Sunday 4 PM IST / 10:30 AM UTC)
- Uses MeetingPatternSnapshot from F4
- LLM generates narrative from pattern data + specific meeting outcomes
- Delivered via proactive agent (type: WEEKLY_REFLECTION)

**Acceptance criteria:**
- [ ] Delivered once per week, predictable timing
- [ ] References specific meetings by name, not just aggregates
- [ ] Includes one positive callout (not just problems)
- [ ] Ends with forward-looking action the user can take
- [ ] Skipped if user had <3 meetings that week (not enough to reflect on)

---

## Data Model Changes Summary

**Modified models:**
| Model | Change |
|-------|--------|
| `MeetingSyncRecord` | Add `meetingCategory` (enum, nullable), `outcomeResult` (enum: LANDED/PARTIAL/MISSED/SKIPPED, nullable) |
| `User` or `UserPreferences` | Add `meetingCoachPhase` (enum: AWARENESS/HABIT/MASTERY, nullable) |
| `ProactivePrompt` | Add type value: `WEEKLY_REFLECTION` |

**New models:**
| Model | Purpose |
|-------|---------|
| `MeetingCommitment` | Tracks who committed to what, by when, and whether it was fulfilled |
| `MeetingPatternSnapshot` | Weekly aggregate of meeting patterns for coaching context |

---

## Implementation Sequence

**Phase 1: Outcome Capture (ship first, wait for data)**
- Pre-meeting outcome ask (modify existing pre-meeting prep cron)
- Post-meeting outcome close (modify existing post-meeting review cron)
- Schema: add `outcomeResult` to MeetingSyncRecord
- Toast UX for both flows
- Smart filtering (skip low-value meetings, density cap)
- Timeline: build and ship immediately

**Phase 2: Follow-Up Tracking (ship after 1 week of outcomes data)**
- MeetingCommitment model + extraction from chat
- Due date reminders via proactive agent
- Nudge drafting (copy-paste, not auto-send)

**Phase 3: Classification + Patterns (ship after 2 weeks)**
- Heuristic meeting classification
- Weekly MeetingPatternSnapshot cron
- Pattern context injected into proactive agent
- Weekly reflection message (F7)

**Phase 4: Advisory + Progression (ship after 4 weeks)**
- Meeting recommendations based on gaps
- Coaching phase detection and adaptation
- Monthly narrative reflections

Each phase earns its way in based on data quality and user engagement. Do not ship Phase 3 until Phase 1 has 2 weeks of outcomes data.

---

## Success Metrics (Internal — Not Shown to User)

| Metric | Target | Why it matters |
|--------|--------|---------------|
| Outcome set rate | >50% by week 4 | Core engagement signal |
| Post-meeting response rate | >40% | Shows the loop is working |
| Toast click-through rate | >30% | Delivery mechanism works |
| Weekly reflection open rate | >60% | User values the insight |
| Meeting advisory acceptance | >20% | Recommendations are relevant |
| Retention (weekly active) | >70% at week 8 | The product is sticky |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| User feels surveilled | Abandonment | Every nudge is dismissible. No guilt. No "you missed X" follow-ups. |
| Wrong meeting classification | Trust erosion | Default to UNCLASSIFIED. Only classify obvious cases. Never show labels to user. |
| Too many nudges | Notification fatigue | Density cap: max 3 outcome asks/day, max 2 advisory/week. Respect meeting-heavy days. |
| Generic coaching | "This isn't useful" | All coaching references specific meetings, people, and outcomes by name. No platitudes. |
| Follow-up tracking wrong | User stops trusting extraction | Always confirm: "I heard [X] — is that right?" Never silently track without acknowledgment. |
| User has few meetings | Features feel empty | Skip weekly reflection if <3 meetings. Don't force the framework on light calendars. |

---

## What We're NOT Building (Scope Boundaries)

- No meeting transcription or recording
- No in-meeting assistance or real-time coaching
- No automatic calendar event creation
- No meeting scoring dashboards or analytics pages
- No leaderboards, badges, streaks, or XP
- No integration with Zoom/Teams/Meet for in-meeting data
- No agenda builder or meeting template library
- No email sending on behalf of the user

These are not ruled out forever — they're ruled out for now. The current scope is: outcome capture, pattern detection, and coaching through natural conversation. Everything else is a distraction until this loop is proven.
