# Data Adapter Strategy: Beyond Google

**Status:** Planning
**Priority:** P1 — Required for market expansion beyond Google Workspace users
**Last Updated:** 2026-03-21

---

## The Problem

Mira's value is **data-connected coaching** — she reads your calendar, email, and documents to give specific, contextual advice. Today, that only works for Google Workspace users. This cuts out:

- Microsoft 365 users (the majority of enterprise and mid-market)
- Teams/Outlook-first organizations
- Notion/Linear/Jira users whose work context lives in project tools
- Slack-heavy orgs where the real conversations happen in channels, not email
- Zoom/Teams users whose meeting intelligence is locked in recordings

Every adapter we add expands the addressable market and deepens Mira's context for existing users.

---

## Current State

### What's Built

| Adapter | Data Pulled | Status |
|---|---|---|
| **Google Calendar** | Meetings, attendees, recurring events, watch channels (real-time) | Production |
| **Gmail** | Email threads, summaries, participants, metadata (not bodies) | Production |
| **Google Drive** | Documents, recent edits, shared files | Production |
| **WhatsApp** | Messages via whatsapp-web.js (session-based) | Experimental |
| **GitHub** | PRs, issues, commits via GitHub App installation | Built, limited use |

### Architecture Pattern

All current adapters follow the same pattern:

```
OAuth Connection (Account table)
    → Sync Agent (worker/src/agents/*-sync.ts)
        → Raw Data Storage (MeetingSyncRecord, EmailSummary, etc.)
            → Knowledge Graph Extraction (fact extractors)
                → Coaching Intelligence (synthesis agents)
```

The sync agents are **provider-specific** — `calendar-sync.ts` talks directly to `googleapis`. There's no abstraction layer. To add Microsoft Calendar, you'd write a parallel `microsoft-calendar-sync.ts`.

---

## Adapter Strategy: Build Order

Prioritized by: market expansion × implementation effort × data value for coaching.

### Tier 1: Must Have (next 3 months)

#### 1. Microsoft 365 — Calendar + Mail + OneDrive

**Why first:** Opens the enterprise and mid-market where Google Workspace isn't dominant. India's large companies (TCS, Infosys, banks, government) are overwhelmingly Microsoft. Globally, Microsoft 365 has 400M+ paid users vs Google Workspace's 10M+.

**What to build:**
- OAuth via Microsoft Identity Platform (MSAL)
- Calendar sync via Microsoft Graph API (`/me/calendarview`, `/me/events`)
- Email sync via Microsoft Graph API (`/me/messages`, `/me/mailFolders`)
- OneDrive/SharePoint sync via Graph API (`/me/drive/recent`)
- Webhook subscriptions for real-time updates (Graph subscriptions, like Google watch channels)

**Implementation approach:**
Create an abstraction layer so sync agents are provider-agnostic:

```typescript
// worker/src/lib/adapters/calendar-adapter.ts
interface CalendarAdapter {
    listEvents(start: Date, end: Date): Promise<CalendarEvent[]>;
    watchEvents(webhookUrl: string): Promise<WatchSubscription>;
}

class GoogleCalendarAdapter implements CalendarAdapter { ... }
class MicrosoftCalendarAdapter implements CalendarAdapter { ... }
```

The sync agent (`calendar-sync.ts`) calls the adapter interface, not the provider directly. Same for email and drive.

**Effort:** 2-3 weeks. Microsoft Graph API is well-documented and REST-based. The hard part is OAuth token management (Microsoft tokens expire differently from Google).

**Data mapping:**

| Google | Microsoft | Mira Model |
|---|---|---|
| Calendar Event | Event | MeetingSyncRecord |
| Gmail Thread | Outlook Conversation | EmailSummary |
| Drive File | OneDrive Item | UploadedDocument |
| Attendee | Attendee | StakeholderProfile |

#### 2. Slack — Messages + Channels

**Why:** In many orgs, the real decisions happen in Slack, not email. Gmail shows you formal communication. Slack shows you the informal dynamics — who's aligned, who's frustrated, what's actually being discussed. For coaching, this is gold.

**What to build:**
- Slack App (OAuth, bot token)
- Channel history sync (public channels the user is in)
- DM sync (with user consent — sensitive)
- Real-time events via Slack Events API (message posted, reaction added)
- Fact extraction from Slack messages (new: `slack-fact-extractor.ts`)

**What Mira learns from Slack that she can't get from email:**
- Informal stakeholder dynamics (who @mentions whom, who reacts to whom)
- Real-time sentiment (emoji reactions as signals)
- Speed of communication (Slack response times vs email response times)
- Topics people discuss informally vs formally
- Who the user turns to when they're stuck (DM patterns)

**Privacy design:** User must explicitly opt in per channel. Mira reads messages the user can already see — never private channels they're not in. DM access requires separate consent. Content is extracted into facts, not stored raw.

**Effort:** 2 weeks. Slack API is straightforward. The harder part is the fact extraction prompt — Slack messages are short, noisy, and context-dependent.

### Tier 2: High Value (3-6 months)

#### 3. Zoom / Google Meet / Microsoft Teams — Meeting Intelligence

**Why:** Meeting recordings and transcripts are the richest coaching data source. A 30-minute meeting transcript tells Mira more about stakeholder dynamics than a month of calendar metadata.

**What to build:**
- Zoom: OAuth + Recording API + Transcript retrieval
- Google Meet: Already partially available via Calendar (meeting URLs); transcript via Google Cloud Speech-to-Text or Otter.ai integration
- Microsoft Teams: Graph API meeting transcripts

**What this unlocks:**
- Post-meeting debrief with actual quotes: "When Rajesh said X, you went quiet. What was going on?"
- Speaking time analysis: "You talked 70% of the time in that 1:1. Want to flip that?"
- Action item extraction from actual conversation
- Stakeholder communication style analysis (data-driven, narrative, aggressive, passive)

**Privacy:** Same as Slack — user opt-in per meeting. Transcripts processed for facts, not stored verbatim.

**Effort:** 3-4 weeks. Zoom API is mature. The challenge is transcript quality and extraction prompt design.

#### 4. Notion / Linear / Jira — Project Context

**Why:** For product/engineering leaders, their work context lives in project tools, not email. A VP of Engineering's calendar shows meetings, but their Jira board shows what's actually at stake.

**What to build:**
- Notion: OAuth + Database API (read pages, databases the user has access to)
- Linear: OAuth + GraphQL API (issues, projects, cycles, team members)
- Jira: OAuth + REST API (issues, sprints, boards, assignees)

**What Mira learns:**
- What projects the user is responsible for (beyond what's in their calendar)
- Who's blocked and on what
- Sprint velocity and delivery patterns
- Cross-team dependencies

**Implementation note:** These are read-only integrations. Mira observes but doesn't create/update issues.

**Effort:** 2 weeks each. Well-documented APIs. The abstraction is simpler — these are all "list of items with metadata" patterns.

### Tier 3: Differentiators (6-12 months)

#### 5. LinkedIn — Professional Network Intelligence

**Why:** LinkedIn data would give Mira context about stakeholders that no other source provides — career history, connections, endorsements, recent posts. This feeds directly into the people intelligence system.

**Challenge:** LinkedIn has no public API for profile data. Options:
- User pastes LinkedIn URLs → Mira enriches via Perplexity/Tavily search (already built)
- LinkedIn OAuth for the user's own profile + connections (limited API)
- Browser extension that reads LinkedIn profile pages the user visits

**Realistic approach:** Don't build a LinkedIn adapter. Use the existing Tavily/Perplexity enrichment waterfall to find LinkedIn data. When the user mentions someone, Mira searches for them. This is already working.

#### 6. Financial Data — Stripe / QuickBooks / Banking

**Why:** For founders and small business owners, financial stress is the #1 source of overwhelm. If Mira knows "revenue dropped 20% this month" she can coach very differently than if she's guessing.

**What to build:**
- Stripe: OAuth + Revenue/MRR/churn metrics
- QuickBooks/Zoho Books: OAuth + P&L, cash flow, outstanding invoices

**Privacy:** Extremely sensitive. Requires explicit opt-in, clear data handling policy, and probably a separate premium tier.

**Effort:** 2-3 weeks each. APIs are mature.

#### 7. Health / Wearable Data — Apple Health / Fitbit / Oura

**Why:** The "whole person" coaching angle. Sleep quality, activity, heart rate variability all correlate with decision-making quality. Mira could say: "You slept 4 hours last night and have a board meeting at 2pm. Let's prep you differently."

**Challenge:** Apple Health has no cloud API (HealthKit is on-device only). Fitbit/Oura have cloud APIs.

**Realistic approach:** Start with Oura (popular with execs, has a clean API). This is a premium differentiator, not a core feature.

---

## Abstraction Layer Design

To avoid writing parallel sync agents for every provider, build an adapter abstraction:

```
worker/src/lib/adapters/
├── types.ts              # Shared interfaces (CalendarEvent, EmailThread, Document)
├── calendar-adapter.ts   # CalendarAdapter interface
├── email-adapter.ts      # EmailAdapter interface
├── document-adapter.ts   # DocumentAdapter interface
├── messaging-adapter.ts  # MessagingAdapter interface (Slack, WhatsApp, Teams chat)
├── google/
│   ├── google-calendar.ts
│   ├── google-email.ts
│   └── google-drive.ts
├── microsoft/
│   ├── microsoft-calendar.ts
│   ├── microsoft-email.ts
│   └── microsoft-onedrive.ts
├── slack/
│   └── slack-messaging.ts
└── zoom/
    └── zoom-meetings.ts
```

**Key principle:** The sync agents (`calendar-sync.ts`, `email-sync.ts`) call the adapter interface. The adapter factory creates the right provider implementation based on the user's connected accounts. Knowledge graph extractors don't change at all — they work on the normalized data model.

```typescript
// calendar-sync.ts (simplified)
const adapter = await getCalendarAdapter(userId); // returns Google or Microsoft
const events = await adapter.listEvents(startDate, endDate);
for (const event of events) {
    await touchStakeholder(userId, event.attendees);
    await upsertMeetingSyncRecord(userId, event);
}
```

This means adding a new calendar provider is a ~200-line adapter implementation, not a rewrite of the sync agent.

---

## OAuth Strategy

| Provider | OAuth Flow | Token Storage | Refresh Strategy |
|---|---|---|---|
| Google | Authorization Code | Account table (encrypted) | Auto-refresh via `googleapis` |
| Microsoft | Authorization Code (MSAL) | Account table (encrypted) | Refresh via MSAL token cache |
| Slack | OAuth 2.0 (bot + user) | Account table | Bot tokens don't expire; user tokens refresh |
| Zoom | OAuth 2.0 | Account table | Standard refresh |
| Notion | OAuth 2.0 | Account table | Tokens don't expire (with valid integration) |
| Linear | OAuth 2.0 | Account table | Standard refresh |
| Jira | OAuth 2.0 (3LO) | Account table | Standard refresh |

All OAuth connections go through the existing `Account` model with `provider` field. The onboarding flow adds a "Connect your tools" step where users pick their providers.

---

## Data Sensitivity Tiers

| Tier | Data Type | Consent Model | Storage |
|---|---|---|---|
| **Tier 1: Metadata** | Calendar events, email subject lines, file names | Implied (part of onboarding connection) | Stored as MeetingSyncRecord, EmailSummary |
| **Tier 2: Content** | Email bodies, document text, Slack messages | Explicit opt-in per source | Processed into facts, raw not stored long-term |
| **Tier 3: Sensitive** | DMs, financial data, health data | Separate consent + premium tier | Encrypted at rest, user-deletable, not used for model training |

---

## Impact on Market

| Adapters Available | Addressable Market |
|---|---|
| Google only (today) | ~10M Google Workspace paid users |
| + Microsoft 365 | +400M users (40x expansion) |
| + Slack | Deepens context for existing users, opens Slack-first orgs |
| + Zoom/Meet transcripts | Meeting intelligence becomes the killer feature |
| + Notion/Linear/Jira | Product/engineering leaders (highest willingness to pay) |

**The Microsoft adapter alone is a 40x market expansion.** It should be the #1 priority after the voice strategy stabilizes.

---

## Implementation Plan

| Phase | Adapters | Timeline | Milestone |
|---|---|---|---|
| **Phase 0** (now) | Google Calendar + Gmail + Drive | Done | Core product works |
| **Phase 1** | Adapter abstraction layer | 1 week | Provider-agnostic sync agents |
| **Phase 2** | Microsoft 365 (Calendar + Mail + OneDrive) | 2-3 weeks | Enterprise market unlocked |
| **Phase 3** | Slack | 2 weeks | Informal dynamics intelligence |
| **Phase 4** | Zoom/Meet transcripts | 3 weeks | Meeting intelligence |
| **Phase 5** | Notion / Linear / Jira (pick one based on user signal) | 2 weeks | Project context |
| **Phase 6** | Financial + Health (premium) | As needed | Differentiation |

Phase 1 (abstraction layer) should happen before Phase 2 — refactoring the Google sync agents to use the adapter interface first means Microsoft is a clean addition, not a parallel codebase.
