# First 50 Users — The Experience That Must Work

**Premise:** These users are executives or senior professionals. They're busy, skeptical, and will give Mira exactly one chance. If the first session doesn't feel valuable, they won't come back.

**Navigation:** Home | Mira | Meetings | People | Goals — that's it.

---

## The User Journey

### Day 0: Signup + Connect (5 minutes)

**Step 1: Sign up** (Clerk auth — Google or email)

**Step 2: Connect Google** (one-click OAuth)
- Calendar, Email, Drive — single consent screen
- Mira says: "I'm syncing your calendar and email. Give me a few minutes to get to know your world."

**Step 3: Wait for sync** (2-5 minutes)
- Progress indicator in chat: "Syncing calendar... 47 meetings found"
- User can browse — but there's nothing to see yet. Home shows a minimal "syncing" state.

**Step 4: First wow** (as soon as email + calendar sync completes)
Mira sends a proactive message mapping their relationships:

> "I've been looking at who you spend time with. Here's what stands out:
>
> **Your inner circle** — Srikanth, Aarthi. You're in constant contact.
>
> **High-stakes relationships** — Prof. Rajagopalan (monthly, but heavy email threads between meetings — you're actively seeking their input). Pranab Rai (every 2 weeks, always 1:1s).
>
> **Worth checking in on** — Riya Sen (4 meetings scheduled last month, 2 cancelled — might be drifting).
>
> Am I reading this right?"

**Why this works:** It proves Mira sees things the user doesn't notice. It's not generic advice — it's specific to their actual calendar and email. The "Am I reading this right?" invites the user to engage and correct.

---

### Day 0-1: First Conversations

User responds to the wow message. Mira learns from corrections and confirms.

**Context-aware prompts appear** based on their calendar:

If they have a meeting tomorrow:
> [Prep me for my 10am with Prof Rajagopalan]
> [What should I focus on this week?]

If it's evening:
> [What's tomorrow looking like?]
> [Quick recap — what did I commit to today?]

**The chat should never have an empty cursor.** There are always 2-3 contextual suggestions based on time of day + next meeting + recent activity.

---

### Day 1: First Morning Brief

The user opens the app in the morning. **Home** shows:

- Today's meetings with attendee names and any context Mira has
- Any action items or commitments due today
- One coaching observation: "You have back-to-back meetings from 10-3. Your one open slot is 3-3:30 — might want to protect it."

**Meetings page** shows today's schedule. Each meeting card shows:
- Title, time, attendees
- "Prep with Mira" button → opens chat with meeting context
- If Mira has intel on attendees, a one-line preview: "You've met Pranab 6 times — 4 outcomes landed"

---

### Day 1-7: Building the Habit

**Before each meeting** (if user engages):
- Mira offers prep: attendee intel, recent email context, suggested talking points
- Proposes a desired outcome: "Looks like the goal is to get alignment on the AI4I proposal. Track this?"

**After each meeting:**
- Mira asks: "How did the meeting with Prof go?"
- One-tap: Landed / Partial / Missed
- If user responds, Mira logs it and adjusts stakeholder intelligence

**Proactive nudges** (chat only, no calls):
- "You haven't met with Riya in 3 weeks — she's tagged as important. Worth reaching out?"
- "You have 6 meetings tomorrow with no outcomes set. Want to set goals for the big ones?"

**People page** starts to fill:
- Stakeholder profiles with archetypes, relationship strength, last interaction
- Users can star key people, edit roles, add notes
- Mira learns from every edit

---

### Day 7-14: Patterns Emerge

Mira has enough data to start coaching:

- "You've landed 4/5 meetings where you set an outcome beforehand. The one you missed was the only one you didn't prep for."
- "Your meetings with the engineering team run 20% longer than scheduled. Might be worth tightening agendas."
- "Srikanth responds faster when you lead with data. Your last 3 emails that got same-day replies all included spreadsheets."

**Goals page** has content now — goals captured from chat conversations. Each goal shows related stakeholders and recent progress.

---

### Day 14-30: Mira Becomes Indispensable

By now:
- Meeting prep is automatic and accurate
- Stakeholder intelligence is refined from corrections
- Outcome patterns are visible
- The user opens Mira before every important meeting

**The test:** Would the user be annoyed if Mira disappeared?

---

## What Each Page Does for First 50 Users

### Home
- Today's meetings (with attendee context)
- Commitments due today
- One coaching observation
- "Talk to Mira" quick actions

**Not shown:** Weekly patterns, effectiveness metrics, KPI dashboards — too early, not enough data.

### Mira (Chat)
- The primary interaction surface
- Context-aware suggestions (never empty)
- Artifact panel for structured content (meeting notes, action items, stakeholder briefs)
- Stakeholder feedback handling ("yes, Prof is my advisor")

### Meetings
- Today's schedule (default) with date picker
- Each meeting: attendees, prep status, desired outcome
- Post-meeting: outcome logging (Landed/Partial/Missed)
- "Prep with Mira" button per meeting

**Not shown:** Meeting Blueprint, Influence Plans, Room Temperature — too complex for early adopters.

### People
- Grid of stakeholders sorted by importance score
- Each card: name, role, archetype, relationship strength, last interaction
- Click to see profile panel
- "Talk to Mira about this person" button

**Not shown:** Influence Map (force graph), Org Map — cool but not essential for PMF.

### Goals
- Goals captured from chat conversations
- Each goal: title, magnitude, related stakeholders, recent actions
- "Review with Mira" button

**Not shown:** Goal creation form — goals are captured conversationally through Mira.

---

## What's NOT in the First 50 User Experience

| Feature | Why not yet |
|---|---|
| Voice calls | Trust not earned. Re-enable after Day 7+ per user, and only on-demand. |
| KPI tracking | Requires manual input. Too much friction for early users. |
| Coaching simulations / role-play | Niche. Focus on the core daily coaching loop first. |
| Insights / hypothesis validation page | Surface these inline in chat instead of a separate page. |
| Wins / effectiveness dashboard | Needs 2+ weeks of outcome data. Show in Home once available. |
| Projects page | Removed. Not the product direction. |
| Email integration (sending) | Read-only email intel is enough. Don't send on behalf of users. |
| Team features | Single-player only until PMF is proven. |
| Notifications (push/email) | Chat-only delivery. Push notifications add complexity without proven value yet. |

---

## Success Criteria for First 50 Users

| Metric | Target | How to measure |
|---|---|---|
| Day 1 return | 60%+ of signups open the app next day | Analytics |
| Week 1 engagement | 3+ chat sessions in first 7 days | Message count per user |
| Outcome logging | 30%+ of meetings have outcomes logged by Day 14 | DB query |
| Correction rate | <20% of Mira's claims get corrected | Track STAKEHOLDER_FEEDBACK intents |
| "Would miss it" | 5+ users say they'd be upset if Mira went away | User interviews |

---

## The One Thing That Must Work Perfectly

**Meeting prep.** If a user asks "Prep me for my 2pm with Pranab" and Mira delivers a useful, accurate brief with real email context and stakeholder intelligence — that's the moment they decide to keep using the product.

Everything else is secondary. If meeting prep works, users come back. If it doesn't, nothing else matters.
