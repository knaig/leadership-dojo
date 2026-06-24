# Mira — New User Experience (First 30 Minutes to First 30 Days)

**Status:** Implementation In Progress
**Priority:** P0 — This is the product. Everything else is infrastructure.
**Last Updated:** 2026-03-22

---

## Philosophy

Mira is a **data-connected coaching relationship**. Not a dashboard. Not a calendar app. Not a chatbot. The product is the feeling of having someone sharp in your corner who actually knows your world.

The new user experience has one job: **get the user to that feeling as fast as possible.**

Every design decision flows from this:
- Don't ask questions that data can answer
- Don't front-load forms — earn the right to ask
- Show value before asking for trust
- Make connections feel like upgrades, not requirements

---

## The First 90 Seconds: Onboarding

### Step 1: "Tell Mira about you" (30 sec)

Mira needs exactly four things to start:

| Field | Why |
|---|---|
| Name | So she can address you |
| Job title | Shapes what coaching looks like |
| Company | Triggers domain intelligence (Perplexity researches your company, industry, competitors in the background) |
| Text or voice | Determines how Mira shows up |

If voice: phone number field appears (+91 default for India).

**What Mira does NOT ask:**
- Responsibilities, KPIs, org structure — she'll learn these from data and conversation
- Stakeholder names — she'll discover them from calendar, email, WhatsApp
- Goals and outcomes — she'll ask when she's earned the right (call 3-4)

**What happens in the background:** The moment company name is entered, Perplexity Sonar fires a domain intelligence query. By the time the user finishes onboarding, Mira knows: what the company does, the industry dynamics, competitors, company stage, funding model. This costs $0.005 and takes 3 seconds.

### Step 2: "Connect your work" (30 sec)

**Auto-detection:** If the user signed up with a Gmail address, Google is highlighted. If Outlook/Hotmail, Microsoft is highlighted. Both are always shown.

Two large cards, side by side:

**Google Workspace**
- Calendar + Gmail + Drive
- One click → one OAuth → three connections
- "Connect Google"

**Microsoft 365**
- Outlook Calendar + Mail + OneDrive
- One click → one OAuth → three connections
- "Connect Microsoft"

Below: expandable "More sources" with Slack, Zoom, Dropbox, Notion, Linear, Jira, Trello, Asana. Not hidden, but not in the way.

Below that: "Skip for now →" — always available, never guilt-tripping.

**What this unlocks immediately:**
- Calendar sync starts (stakeholders auto-discovered from attendees)
- Email sync starts (communication patterns, more stakeholders)
- Drive sync starts (document context)
- Mira can see the user's day, their people, their world

### Step 3: "Connect WhatsApp" (30 sec) — India users

Shown only for users with +91 country code or .in email domain.

**The pitch:** "Most of your real conversations happen on WhatsApp, not email. Connect it and Mira understands your network 10x faster. She only reads — never sends messages."

QR code displayed inline. User scans with phone (WhatsApp → Linked Devices → Scan). Connection established in seconds.

**For non-India users:** This step becomes "You're all set! Mira is getting to know your world." with a "Get Started" button.

### After onboarding → First interaction

**If voice selected:** Mira's first call happens within 5 minutes. She's already done her homework — calendar synced, domain intelligence gathered.

**If text selected:** Mira sends a chat message immediately:
> "Hey [name]! I've been looking through your calendar. You've got X meetings today. The one I'd prep for is your [time] with [person]. Want to talk through it?"

**If nothing connected (user skipped step 2):** Mira adapts:
> "Hey [name]! I'd love to help with your day but I can't see your calendar yet. Want to connect it? Takes 10 seconds."

---

## The First Call (Minutes 5-10)

Mira is in **Listener stage** (see voice-strategy.md). She does not give advice. She notices, asks, and mirrors.

**What Mira knows before calling:**
- User's name, title, company
- Domain intelligence (industry, competitors, company stage) — from Perplexity
- Today's calendar (meetings, attendees, timing) — from sync
- Email patterns (who they communicate with most) — from sync
- WhatsApp contacts (if connected) — from listener

**Call structure (2-3 minutes):**

1. **Sharp opener (15 sec):** "Hey [name], I'm Mira. I've been looking at your week — you've got [X] meetings today and your [time] with [person] looks like the one that matters."

2. **One observation (30 sec):** Something specific from the data. Not advice — an observation. "I notice you're in back-to-back meetings from 2 to 5 with no break." Or: "You meet with [person] three times this week — more than anyone else."

3. **One Socratic question (30 sec):** "For that [meeting] — what do you need to walk out with?"

4. **Listen (60 sec):** Let them answer. Mirror back what they say.

5. **Close (15 sec):** "That's all for today. I'll be sharper tomorrow. Talk soon."

**What this achieves:**
- Mira proved she did her homework (calendar observation)
- User felt seen, not lectured
- Mira learned something (the answer to her question)
- User wants to come back (she was brief, useful, and left them wanting more)

---

## Days 1-3: Proving Value

Mira's job in the first 3 days: **be so useful that the user looks forward to hearing from her.**

### Daily rhythm (voice or text):

**Morning:** Quick day overview + one sharp observation
- "3 meetings today. Your 2pm is the one I'd prep for — [person] is someone you haven't met with 1:1 since last month."
- NOT: "Make sure to prepare for your meetings" (generic, worthless)

**Pre-meeting (if enabled):** 2 minutes before a high-stakes meeting
- "You're on in 10. [Person] and [person] are in this one. Last time you met, [factual observation from calendar pattern]."

**Post-meeting (if enabled):** Quick check-in after key meetings
- "How'd the [meeting] go? Did you get what you needed?"

### What Mira learns (invisible to user):

- Communication style (do they give long answers or short? formal or casual?)
- Stakeholder dynamics (who do they mention? what tone?)
- Onboarding topics (which of the 9 layers are covered?)
- Adaptation signals (work-first or relationship-first? precision or narrative?)

### Connections that surface naturally:

If Mira notices gaps, she suggests — but only when the value is obvious:

| Day | Trigger | What Mira says |
|---|---|---|
| Day 1 | No calendar connected | "I'd love to help with your day but I'm flying blind. Want to connect your calendar?" |
| Day 2 | User mentions someone not in data | "You mentioned Priya — she's not in your calendar. Do you mostly talk on WhatsApp?" |
| Day 3 | Meeting with no follow-up data | "How was the 3pm? If you connect Zoom, I can read the transcript next time." |

---

## Days 4-7: Building the Picture

Mira is approaching the **Mirror stage** gate (needs 4+ onboarding topics, 3+ user-stated stakeholders, 3+ completed calls).

### What changes:

- Calls get slightly longer (3-4 minutes)
- Mira starts connecting dots: "Last time you mentioned X. Today you said Y. What's the thread?"
- Mira shows memory: "You told me your 2pm was important. How'd it go?"
- Learning transparency: "I'm starting to see your pattern. Tell me if I'm off."

### The "aha moment":

Somewhere in days 4-7, Mira says something that makes the user think: **"She noticed something I hadn't articulated."**

This could be:
- "You spend 40% of your week in meetings with [team] but none are 1:1s. Intentional?"
- "You prep heavily for meetings with [person] but never for [other person]. What's the difference?"
- "You've mentioned [topic] in 4 of our 5 conversations. It's clearly on your mind."

This is the retention moment. If this lands, the user stays.

---

## Days 8-14: Testing Hypotheses

Mira has likely reached **Mirror stage** by now. She's connecting dots and testing observations.

### What changes:

- Mira presents hypotheses as questions: "I get the sense that [person] is your main sounding board. Is that right?"
- Mira asks permission: "I have a read on something — want to hear it?"
- Calls extend to 4-5 minutes as the user leans in
- Commitment tracking begins (if user volunteers something: "Want me to hold you to that?")

### Connections that surface:

| Trigger | Suggestion |
|---|---|
| User talks about project status frequently | "If you connect Linear/Jira, I can see the board instead of guessing." |
| User mentions documents | "Want to connect Drive/Dropbox so I can read the strategy doc?" |
| Stakeholder gaps persist | "I think there are people in your world I'm missing. WhatsApp would fill in the gaps." |

---

## Days 15-21: Earned Coaching

Mira may reach **Thought Partner stage** — she asks permission before offering perspective.

### What changes:

- "Based on what you've told me about [person]'s style, one approach that might work..."
- Soft challenges: "Can I push back on something?"
- Reframes: takes what the user said and shows a different angle
- Accountability: "You said you'd talk to [person] about [thing]. Did you?"

### The value is now undeniable:

The user has a thinking partner who:
- Knows their calendar, their people, their patterns
- Remembers every conversation
- Notices things they missed
- Asks better questions than their colleagues
- Never judges, always shows up

---

## Days 22-30: The Coach Emerges

Mira reaches **Coach stage** for users who engage deeply.

### What changes:

- Direct coaching: "You're avoiding the conversation with [person]. Here's why I think that's happening."
- Pattern interruption: "You're doing that thing again — taking on work that should be [person]'s."
- Full posture range: celebrate wins, challenge avoidance, debrief meetings, prep for stakes
- Forward-looking: "Next week you have [situation]. Let's prep."

### The retention equation:

By day 30, Mira knows:
- Their stakeholder map (auto-discovered + user-enriched)
- Their communication style and preferences
- Their meeting patterns and rhythms
- Their coaching themes and growth edges
- Their personal context (what they chose to share)

**Switching to a competitor means starting from zero.** That's the moat — not features, not pricing. Context depth.

---

## In-Context Connection Surfacing (Ongoing)

After onboarding, Mira never stops looking for ways to get better context. But she does it naturally, not through a settings page.

### Rules:
- Maximum one connection suggestion per call
- Never suggest in the first 2 calls (earn trust first)
- Don't repeat the same suggestion within a week
- Always frame as value: "I could help you better if..." not "Please connect your..."
- If user says no, drop it. Bring it up again in 2 weeks max.

### Priority order:
1. Calendar (if not connected — this is critical, bring it up every other call)
2. Email (usually connected with calendar, but check)
3. WhatsApp (India users — highest incremental value)
4. Slack (if user mentions Slack or seems to have stakeholder gaps)
5. Zoom (after a meeting with no transcript)
6. Documents (when user mentions a doc)
7. Project tools (when user mentions projects/sprints/tickets)

### Dashboard touchpoints:

- **Today Brief empty state:** "I'd love to help with your day, but I can't see your calendar yet. [Connect]"
- **Stakeholder page:** "Mira knows 12 people. Connect WhatsApp to discover more. [Connect]"
- **Post-call summary:** "💡 Mira could have prepped you better with Zoom transcripts. [Connect Zoom]"
- **Chat:** When user asks about something Mira can't see: "I don't have access to your email. Want to connect it? [Connect]"

---

## Metrics That Matter

| Metric | What It Tells Us | Target |
|---|---|---|
| **Onboarding completion** | Is the flow too long? | 90%+ |
| **Calendar connected at onboarding** | Can Mira see the user's day? | 85%+ |
| **WhatsApp connected (India)** | Does Mira know their real network? | 40%+ at day 7 |
| **Time to first value** | How fast does Mira prove useful? | <2 min |
| **Call 2 pickup rate** | Did call 1 earn a return? | 70%+ |
| **Stage progression** | Is Mira advancing or stuck? | 50% reach Mirror by day 7 |
| **Data sources per user (day 7)** | How much context does Mira have? | 2.5+ |
| **"What would you miss?" answer** | PMF signal | Qualitative — read every one |

---

## What This Doc Replaces

This supersedes the time-based "Week 1-2 / Week 2-4 / Month 2+" framing from the old voice strategy. Progression is now **KPI-gated** (see voice-strategy.md) and the onboarding is **3 steps, not 6** (see onboarding-and-surfacing-strategy.md).

The three docs work together:
- **This doc:** The end-to-end user journey (what the user experiences)
- **voice-strategy.md:** How Mira's coaching evolves (4 stages, KPI gates, conversation design)
- **onboarding-and-surfacing-strategy.md:** Technical spec for onboarding flow and connection prompts
