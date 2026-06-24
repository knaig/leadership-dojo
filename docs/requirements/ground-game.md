# Ground Game: Relationship Intelligence & Pre-Meeting Influence

**Status:** Requirements
**Priority:** P1 — Value-added feature (not all orgs need this)
**Codename:** Ground Game

## The Insight

The outcome of important meetings is rarely decided in the meeting itself. Consultants, lobbyists, and seasoned executives know this: you win the room *before* you walk in.

But it goes deeper than meeting prep. The best executives:
1. **Know who matters** — and invest in those relationships proactively, not reactively
2. **Gather outside intelligence** — LinkedIn, industry news, organizational signals
3. **Create the right forums** — suggest meetings that should exist, not just prep for ones on the calendar
4. **Socialize ideas** — 1:1 pre-conversations to shape positions before the group convenes
5. **Track relationship health** — know when a relationship is weakening and needs investment

Mira should be the executive's political strategist. Not just prepping for meetings, but orchestrating the relationship landscape that makes everything easier.

## Value-Added Feature

This is not critical for every user. It's most valuable for:
- Executives in large organizations with complex stakeholder landscapes
- People navigating cross-functional decisions requiring buy-in
- Leaders in politically complex environments (boards, investors, partners)
- Anyone preparing for high-stakes presentations, approvals, or negotiations

For a solo founder or small team leader, this is overkill. Gate behind premium or enable on demand.

---

## Core Capabilities

### 1. Relationship Intelligence (Always-On)

Mira continuously builds and maintains a **Relationship Health Dashboard** for every stakeholder the user interacts with.

**What Mira tracks:**
| Signal | Source | What it means |
|--------|--------|--------------|
| Interaction frequency | Calendar, email | How often you meet/talk |
| Last contact | Calendar | When you last met — stale relationships surface |
| Interaction quality | Post-meeting debriefs, email sentiment | Building or deteriorating? |
| Influence level | Org chart, meeting patterns | Decision-maker, influencer, or observer |
| Stance on user | Meeting outcomes, email tone, debrief data | Champion → Supportive → Neutral → Skeptic → Opposed |
| Political dynamics | Knowledge graph, community detection | Who influences whom, faction lines |
| Communication style | Stakeholder profile | How to approach them (DRIVER, ANALYST, etc.) |

**What Mira enriches from outside (outward-bound):**
| Signal | Source | What it means |
|--------|--------|--------------|
| Professional background | LinkedIn (via web search/scraping) | Career history, education, expertise |
| Recent activity | LinkedIn posts, articles | What they're thinking about publicly |
| Company/industry news | Web search, AI search | Org changes, layoffs, wins, regulatory shifts |
| Domain intelligence | Industry databases, news | Market trends relevant to the relationship |
| Country/cultural context | AI search | Business norms, negotiation styles, communication expectations |
| Mutual connections | LinkedIn, org data | Who else knows them — warm intro paths |

**Enrichment approach:**
- On stakeholder creation: queue background enrichment job
- Periodic refresh: re-enrich top stakeholders monthly
- Before high-stakes meetings: trigger fresh enrichment for all attendees
- User can trigger manually: "Tell me everything about [person]"
- Sources: LinkedIn public profiles (via web search), Google News, company websites, industry reports
- All enrichment is transparent: "Here's what I found about [person] from public sources"

### 2. High-Stakes Meeting Detection

Mira auto-detects meetings that warrant Ground Game attention:

**Detection signals:**
- Multiple senior attendees (3+ people with `powerLevel: HIGH`)
- User set a desired outcome (especially if it's ambitious)
- Meeting category is NEEDLE_MOVER
- Recurring meeting with repeated missed outcomes
- Large cross-functional group (5+ teams represented)
- User explicitly flags it: "This one matters"
- New/unknown attendees in a critical meeting

**What Mira does when she detects a high-stakes meeting:**
1. Enriches all attendee profiles (background, recent activity)
2. Builds a "Room Read" — who matters, who's the blocker, who's the ally
3. Surfaces relationship gaps: "You haven't met with [person] in 6 weeks"
4. Suggests pre-meetings: "Book a 1:1 with [person] before this"
5. Builds an influence plan for meetings 2+ weeks out

### 3. Meeting Suggestion Engine

Mira doesn't just prep for existing meetings — she suggests meetings that *should* exist.

**Triggers for suggested meetings:**
- Relationship going stale (no contact with important stakeholder in 3+ weeks)
- New stakeholder discovered (attendee in a meeting but no prior interaction)
- Intel suggests a pre-meeting is needed ("Sarah raised concerns in the team standup")
- Coalition building: "You need [person]'s support before the group meeting"
- Follow-up gap: commitment made but no meeting scheduled to review it

**Format:** "I'd suggest a 30-min 1:1 with Sarah this week. She's in your Thursday planning review and you haven't spoken since the Q3 meeting. Her concern last time was timeline — lead with the updated dates."

### 4. Influence Planning (for meetings 2+ weeks out)

When a high-stakes meeting is far enough out, Mira builds a sequenced influence plan:

**Week -2 to -3: RECONNAISSANCE**
- Enrich all attendees (LinkedIn, web search, knowledge graph)
- Identify the 2-3 people whose position determines the outcome
- Flag unknowns: "You haven't met with [person] — their stance is unclear"
- Build a room map: Champion / Supportive / Neutral / Skeptic / Opposed

**Week -1 to -2: SOCIALIZING**
- Suggest 1:1 pre-meetings with key decision-makers and blockers
- For each: talking points, what to lead with, what NOT to say (based on archetype)
- Track: did the pre-meeting happen? What was the outcome?

**Week 0: EXECUTION**
- Updated room map (reflects any stance shifts from pre-meetings)
- Tactical playbook: who to address first, what to open with
- Pre-meeting voice call: 3-minute huddle with Mira

---

## User Experience Design

### UX Principle: Intelligence-First, Not Task-First

Mira leads with *insights* ("Sarah is worried about the timeline"), not *tasks* ("Schedule meeting with Sarah"). The user should feel like they have an intelligence analyst, not a project manager.

### Where Ground Game Surfaces

#### 1. Today Brief (Level 0 — Dashboard)

**"Relationships to Watch" section** in the Today Brief:

```
┌─────────────────────────────────────────┐
│ 👁 Relationships to Watch               │
│                                         │
│ Sarah Chen  ▼ Skeptic → Neutral         │
│ "She mentioned budget concerns in       │
│  yesterday's ops meeting. Your planning │
│  review with her is Thursday."          │
│  [Book 1:1] [View Profile]             │
│                                         │
│ Rajesh Kumar  ● Stale (18 days)         │
│ "Key decision-maker on your Q2 budget.  │
│  No contact since Feb 20. He's in your  │
│  Thursday meeting."                     │
│  [Ping] [Book 1:1]                     │
│                                         │
│ NEW: VP Sales (Lisa Park)               │
│ "Added to Thursday planning review.     │
│  No prior interaction. LinkedIn: 15yr   │
│  enterprise sales, joined 6 months ago."│
│  [View Intel] [Book Intro]             │
└─────────────────────────────────────────┘
```

**Rules:**
- Max 3 relationships shown (most actionable)
- Each card: name, signal, one-sentence narrative, action button
- Only show when there's something actionable (not every day)

#### 2. Meeting Card (Level 1 — Meeting Context)

Every meeting card in the Hub gets a **Room Read** section:

```
┌─────────────────────────────────────────┐
│ Q2 Planning Review  •  Thu 2:00 PM      │
│ ★ Needle Mover                          │
│                                         │
│ 🎯 Your goal: Get Q2 budget approved    │
│                                         │
│ Room Read:                              │
│ ✅ Rajesh — Champion (will advocate)     │
│ ⚠️ Sarah — Skeptic (timeline concerns)   │
│ ❓ Lisa Park — Unknown (new, no read)    │
│ Temperature: 🟡 50/50                    │
│                                         │
│ Mira says: "Sarah's your blocker. Meet  │
│ her before Thursday. Lead with the       │
│ updated timeline — that's what she       │
│ pushed back on last time."              │
│                                         │
│ [Prep Call] [View Full Plan] [Book 1:1] │
└─────────────────────────────────────────┘
```

**Rules:**
- Only show Room Read for meetings with 3+ attendees AND known stakeholders
- Color-code stances: green (champion), blue (supportive), gray (neutral), orange (skeptic), red (opposed)
- "Temperature" is aggregate confidence (how likely you are to win)
- "Mira says" is ONE sentence of tactical advice

#### 3. Stakeholder Profile (Level 2 — Deep Dive)

The existing stakeholder page gets enriched with:

**Relationship section:**
```
┌─────────────────────────────────────────┐
│ Sarah Chen                              │
│ VP Engineering, Acme Corp               │
│                                         │
│ Relationship Strength: ●●●○○ (60%)      │
│ Last contact: 18 days ago (going stale) │
│ Interactions: 12 meetings, 24 emails    │
│ Trend: ↘ declining (was 75% 3 months)  │
│                                         │
│ What works with Sarah:                  │
│ • Lead with data, then narrative        │
│ • Give her time to process — don't push │
│   for immediate decisions               │
│ • Reference past precedents she cares   │
│   about                                 │
│                                         │
│ What to avoid:                          │
│ • Don't surprise her in group settings  │
│ • Avoid vague timelines — she needs     │
│   specific dates                        │
│ • Don't go over her head to her boss    │
│                                         │
│ Recent Intel:                           │
│ • Mentioned budget concerns in ops mtg  │
│ • Supported your proposal in Q3 review  │
│ • Published article on eng efficiency   │
│   (LinkedIn, 2 weeks ago)               │
│                                         │
│ Influence Map:                          │
│ Reports to: CTO (David)                 │
│ Influences: Engineering leads, QA       │
│ Influenced by: CFO on budget decisions  │
│                                         │
│ [Suggest Meeting] [Enrich Profile]      │
└─────────────────────────────────────────┘
```

#### 4. Influence Plan View (Level 3 — Campaign Mode)

When a meeting has a full influence plan, users can view it:

```
┌─────────────────────────────────────────────────────────┐
│ Influence Plan: Q2 Budget Approval (Mar 20)             │
│ Temperature: 🟡 50/50 → Trend: Improving                │
│                                                         │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│ │ Week -3     │ │ Week -2     │ │ Week -1     │        │
│ │ RECON       │ │ SOCIALIZE   │ │ EXECUTE     │        │
│ │             │ │             │ │             │        │
│ │ ✅ Enriched  │ │ ✅ Met Sarah │ │ ⏳ Prep call │        │
│ │    all 6    │ │ ⏳ Meet Lisa │ │ ⏳ Brief     │        │
│ │ ✅ ID'd key │ │ ✅ Rajesh    │ │   Rajesh    │        │
│ │    people   │ │    briefed  │ │             │        │
│ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                         │
│ Stakeholder Map:                                        │
│ 🟢 Rajesh (Champion) — will speak first                 │
│ 🔵 David (Supportive) — aligned on vision               │
│ 🟡 Sarah (Neutral→) — met 3/12, timeline resolved       │
│ ❓ Lisa (Unknown) — meeting scheduled 3/15               │
│ 🟠 CFO (Skeptic) — needs ROI numbers                    │
│                                                         │
│ Next action: Meet Lisa before Thursday                   │
│ [View Full Brief] [Voice Prep Call]                     │
└─────────────────────────────────────────────────────────┘
```

#### 5. Proactive Nudges (Level 4 — Push)

Ground Game generates push notifications and voice calls:

**Push notifications (text):**
- "Sarah mentioned budget concerns in an email thread. Your meeting is Thursday."
- "You planned to meet Lisa by Wednesday. No meeting booked yet."
- "New: VP of Sales added to Thursday review. No prior interaction."
- "3 days out. You've spoken to 4 of 6 attendees. Still need: Lisa, CFO."

**Voice calls (Mira):**
- Pre-1:1 coaching: "You're meeting Sarah in 30 minutes. Your goal is to surface her timeline concerns. Lead with the updated dates. Don't push for a commitment — just get her concerns on the table."
- Post-1:1 debrief: "How'd it go with Sarah? Did she soften on the timeline?"
- Campaign check-in (weekly): "Three days until the budget meeting. Here's where everyone stands."
- Intel alert: "Quick heads up — the CFO shared a cost optimization doc. May signal pushback on new spend."

---

## Voice Integration

### Reactive (User-Initiated)

When the user asks Mira about a stakeholder or meeting:
- "Tell me about Sarah" → Full dossier including external intel
- "How's my relationship with Rajesh?" → Relationship strength + trend + suggestion
- "Prep me for Thursday's meeting" → Room Read + tactical advice + influence plan status
- "Who should I talk to before the board meeting?" → Prioritized list with talking points

### Proactive (Mira-Initiated)

Mira weaves Ground Game intel into regular calls:

**Morning brief:**
> "One more thing — your planning review is Thursday. You've talked to 3 of 5 key people. Sarah's still a question mark. Want me to suggest a time for a quick 1:1?"

**Pre-meeting prep:**
> "Quick intel — Lisa Park was just added to this meeting. She's VP Sales, joined 6 months ago. Enterprise background. I don't have a read on her stance yet. Might be worth a quick intro before the meeting starts."

**Post-meeting debrief:**
> "Did Sarah's position change? Last time she was skeptical about the timeline. If she came around, that's a big shift I should track."

**The Walk (thinking partner):**
> "You've been thinking about the Q2 budget a lot. Want to talk through the room? I can tell you where I think the weak spots are."

### How Mira Learns

Mira builds Ground Game intelligence from:
1. **Voice debriefs** — "How'd it go with Sarah?" → Stance update
2. **Calendar patterns** — Meeting frequency, who gets 1:1 time
3. **Email sentiment** — Tone shifts, responsiveness changes
4. **Meeting outcomes** — Who supported/opposed in group settings
5. **User corrections** — "Actually, Sarah's on board now" → Direct update
6. **External signals** — LinkedIn activity, company news, role changes
7. **Knowledge graph** — Facts about decisions, objections, positions

---

## Data Model

### Leverage Existing Models (Don't Overengineer)

Instead of creating a full Campaign/Milestone system, use what exists:

**StakeholderProfile** — Already has `relationshipStrength`, `lastInteraction`, `politicalStance`, `personaArchetype`, `intelligence`

**StakeholderIntelligence** — Already has `successPatterns`, `failurePatterns`, `objectionPatterns`, `recentTopics`

**StakeholderInteraction** — Already tracks individual meetings with quality assessment

### New: Add to StakeholderProfile

```prisma
// External intelligence
linkedinHeadline    String?          // Current role/headline from LinkedIn
linkedinSummary     String?  @db.Text // Profile summary
recentPublicActivity String? @db.Text // Recent posts, articles, speaking
lastEnrichedAt      DateTime?        // When external data was last refreshed
externalIntel       Json?            // Structured external intelligence
```

### New: InfluencePlan (lightweight, per meeting)

```prisma
model InfluencePlan {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Target meeting
  meetingId         String   @unique
  meeting           MeetingSyncRecord @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  // Plan
  roomTemperature   Float    @default(0.5) // 0-1 confidence
  roomRead          Json?    // Per-attendee stance assessment
  tacticalAdvice    String?  @db.Text // LLM-generated one-liner
  influenceSteps    Json?    // Sequenced actions [{action, stakeholder, status, dueDate}]
  suggestedMeetings Json?    // [{stakeholderId, reason, talkingPoints, status}]

  // Status
  status            String   @default("active") // active, completed, abandoned
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId])
  @@index([meetingId])
}
```

### New: StakeholderEnrichmentJob

```prisma
model StakeholderEnrichmentJob {
  id              String   @id @default(cuid())
  userId          String
  stakeholderId   String
  status          String   @default("pending") // pending, enriching, completed, failed
  source          String   @default("auto")    // auto, manual, pre_meeting
  results         Json?    // Structured enrichment results
  createdAt       DateTime @default(now())
  completedAt     DateTime?

  @@index([userId])
  @@index([stakeholderId])
}
```

---

## API Design

### Endpoints

```
GET  /api/meetings/[id]/room-read     — Room Read for a meeting (attendee stances, intel, tactical advice)
POST /api/meetings/[id]/influence-plan — Generate/refresh influence plan for a meeting
GET  /api/meetings/[id]/influence-plan — Get existing plan

GET  /api/stakeholders/[id]/intel      — Full intelligence dossier (internal + external)
POST /api/stakeholders/[id]/enrich     — Trigger external enrichment (LinkedIn, web search)
GET  /api/stakeholders/relationships   — Relationship health dashboard (all stakeholders)

GET  /api/ground-game/suggestions      — Active suggestions (meetings to book, relationships to invest in)
POST /api/ground-game/suggestions/[id]/dismiss — Dismiss a suggestion
```

---

## Implementation Phases

### Phase 1: Room Read (Week 1)
- Auto-detect high-stakes meetings (3+ senior attendees OR needle mover)
- Build Room Read from existing stakeholder data (stance, archetype, patterns)
- Surface on meeting cards in Meeting Hub
- Add "Room Read" to pre-meeting voice call context
- Add "Mira says" tactical one-liner (LLM-generated from attendee data)

### Phase 2: Outward-Bound Intelligence (Week 2)
- Stakeholder enrichment pipeline: web search → LLM extraction → profile update
- LinkedIn public profile parsing (via web search, not API)
- Company/industry news aggregation
- "Enrich Profile" button on stakeholder pages
- Auto-enrich before high-stakes meetings
- Surface external intel in Room Read and voice calls

### Phase 3: Relationship Health (Week 2-3)
- "Relationships to Watch" section in Today Brief
- Stale relationship detection (no contact > threshold based on importance)
- Relationship trend tracking (improving/declining)
- Meeting suggestion engine (suggest 1:1s based on relationship gaps)
- Relationship health dashboard (all stakeholders, sortable by health)

### Phase 4: Influence Planning (Week 3-4)
- InfluencePlan model and API
- Influence plan generation (LLM) for meetings 2+ weeks out
- Pre-meeting 1:1 coaching (reuse meeting prep with campaign-specific context)
- Post-1:1 stance tracking (did they move?)
- Influence plan view in meeting detail page
- Voice integration: campaign check-in calls

### Phase 5: Smart Suggestions (Week 4+)
- Auto-suggest meetings to create (not just prep for existing)
- Cross-stakeholder pattern recognition
- Learn from past influence plans (what strategies worked)
- Integration with calendar availability for meeting suggestions

---

## Integration Points

| System | How it feeds Ground Game |
|--------|------------------------|
| Knowledge Graph | Past decisions, objections, positions per stakeholder |
| Stakeholder Intelligence | Archetype, communication style, success/failure patterns |
| Meeting Sync | Upcoming meetings, past outcomes, attendees |
| Email Sync | Sentiment signals, topic threads, responsiveness |
| Post-Meeting Reviews | What worked/failed with each person, stance shifts |
| Community Detection | Influence networks, faction analysis |
| Domain Context | Organizational politics, team dynamics |
| Calendar | Availability for suggested meetings, last contact dates |
| Web Search / LinkedIn | External professional context, public activity |
| Voice Calls | Debrief data, relationship updates, user corrections |

---

## Success Metrics

- **Relationship health improvement:** Do stakeholder relationship scores improve over time?
- **Meeting suggestions acted on:** Do users book suggested 1:1s?
- **Outcome hit rate for planned meetings:** Meetings with influence plans vs. without
- **Pre-meeting 1:1 completion rate:** Did user follow through on socializing?
- **Enrichment accuracy:** Was external intel useful? (user feedback)
- **Voice engagement on Ground Game:** Do users take campaign check-in calls?

---

## UX Principles

- **Intelligence-first, not task-first** — Lead with insights, not to-do items
- **Narrative, not data** — "Sarah is worried about the timeline" not "Stance: SKEPTIC"
- **Surface the right amount** — 3 people max on dashboard, full dossier on demand
- **Proactive but not noisy** — Nudge when actionable, not every day
- **Transparent intelligence** — "Here's what I found from public sources" not "I know everything"
- **Coach, not command** — "You might want to..." not "You must..."
- **Value-added, not mandatory** — Feature works passively (enrichment, tracking) even if user never opens the plan view
