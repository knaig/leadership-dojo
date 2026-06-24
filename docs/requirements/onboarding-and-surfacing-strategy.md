# Onboarding & Connection Surfacing Strategy

**Status:** Design → Implementation
**Priority:** P0 — Determines whether users reach value before they churn
**Last Updated:** 2026-03-22

---

## The Problem

Data connections are Mira's value driver. Every connected source (calendar, email, WhatsApp, Slack) makes coaching more specific and useful. But the current design buries connections in a 6-step onboarding form and a Settings page that <10% of users will ever visit.

The result: users complete onboarding with minimal data connected, Mira coaches with limited context, the user doesn't feel the value, and they churn.

## Design Principles

1. **Minimum viable onboarding** — get the user to value in under 2 minutes, not 10
2. **Auto-discover, don't ask** — stakeholders come from data, not manual forms
3. **Surface connections when the gap is felt** — not in a settings page, but in the moment Mira says "I wish I knew more about X"
4. **India-first** — WhatsApp gets its own prompt because it's where 854M Indians communicate
5. **Progressive disclosure** — connect more as trust grows, never front-load

## Current State (6 Steps, ~5-10 min)

| Step | What It Asks | Time | Drop-off Risk |
|---|---|---|---|
| 1. Profile | Title, company, team, org brief | 1 min | Low |
| 2. Role Inference | Responsibilities, KPIs, success criteria | 2 min | Medium — feels like a form |
| 3. Stakeholders | Manually type 3+ people | 2 min | **High — tedious, users skip** |
| 4. Calendar | Google OAuth only | 30 sec | Medium — Microsoft users stuck |
| 5. Outcomes | Business outcomes, strategic context | 2 min | **High — user doesn't trust Mira yet** |
| 6. Documents | File upload | 1 min | High — feels like work |

**Drop-off analysis:** Steps 3 and 5 are where users bail. Manual stakeholder entry is tedious when auto-discovery from email/calendar does it better. Outcome setting requires trust that hasn't been earned.

---

## New Design: 3-Step Onboarding (~90 seconds)

### Step 1: "Who are you?" (30 sec)

| Field | Required | Why |
|---|---|---|
| Name | Yes | Mira needs to address you |
| Job title | Yes | Shapes coaching context |
| Company | Yes | Domain intelligence lookup (Perplexity) |
| Preferred channel: text or voice | Yes | Determines first interaction type |
| Phone number | If voice selected | For voice calls |

**That's it.** No responsibilities, no KPIs, no stakeholders. Mira learns these through conversation (that's what the stage gate engine is designed for).

**What happens in the background:** Perplexity domain intelligence fires immediately with company name → Mira knows the industry, competitors, company stage before the first call.

### Step 2: "Connect your work" (30 sec)

**Auto-detection:** If user signed up with Gmail → highlight Google. If Outlook → highlight Microsoft. Show both if unclear.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Connect your calendar and email so Mira can           │
│   see your world. One click — she does the rest.        │
│                                                         │
│   ┌──────────────────┐  ┌──────────────────┐           │
│   │  ☁️ Google        │  │  🔷 Microsoft    │           │
│   │  Calendar + Gmail │  │  Outlook + Mail  │           │
│   │  + Drive          │  │  + OneDrive      │           │
│   │                  │  │                  │           │
│   │  [Connect]       │  │  [Connect]       │           │
│   └──────────────────┘  └──────────────────┘           │
│                                                         │
│   ▾ More sources (Slack, Zoom, Dropbox...)              │
│                                                         │
│   [Skip for now →]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**One OAuth = three connections.** Google OAuth gives Calendar + Gmail + Drive. Microsoft gives Outlook Calendar + Mail + OneDrive. The user clicks once, Mira gets everything.

**"More sources" expandable:** Shows Slack, Zoom, Dropbox, Notion, etc. Not in the way, but discoverable for power users.

### Step 3: "Connect WhatsApp" (30 sec) — India users only

**Show this step only if:** user's phone number has +91 country code, or browser locale is en-IN, or company domain is .in.

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   📱 One more thing — your real conversations           │
│   happen on WhatsApp, not email.                        │
│                                                         │
│   Connect it and Mira understands your network          │
│   10x faster. She only reads — never sends messages.    │
│                                                         │
│   ┌───────────────────────────────────────┐             │
│   │                                       │             │
│   │         [QR CODE DISPLAYED HERE]      │             │
│   │                                       │             │
│   │   Open WhatsApp → Linked Devices      │             │
│   │   → Scan this code                    │             │
│   │                                       │             │
│   └───────────────────────────────────────┘             │
│                                                         │
│   [Skip — I'll do this later →]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**QR code shown inline** — not via push notification. The worker generates it, sends via Pusher, the onboarding page renders it. User scans from their phone.

**Privacy assurance is front and center:** "She only reads — never sends messages."

### After Step 3 → First interaction

- If voice selected → Mira's first call happens within minutes
- If text selected → Mira sends a chat message: "Hey [name]! I've been looking through your calendar. You've got X meetings today. The one I'd prep for is..."
- If no data connected (user skipped step 2) → Mira: "I don't have access to your calendar yet. Want to connect it so I can help with your day?"

---

## In-Context Connection Surfacing

After onboarding, Mira surfaces connection suggestions **at the moment the user would feel the value.**

### Trigger-Based Prompts

| Trigger | What Mira Says | Connection Suggested |
|---|---|---|
| User mentions a stakeholder Mira doesn't know | "You mentioned Priya but I don't see her in your calendar. Do you mostly talk on WhatsApp or Slack?" | WhatsApp or Slack |
| Meeting has no transcript data | "How was your 3pm? If you connect Zoom, I can read the transcript next time." | Zoom |
| User mentions a document | "You mentioned the strategy doc. Want to connect Drive/Dropbox so I can read it?" | Drive, Dropbox, Notion |
| User talks about project status | "You keep mentioning the Q2 roadmap. If you connect Linear/Jira, I can see what's actually on the board." | Linear, Jira, Trello, Asana |
| Mira notices stakeholder gaps | "I can see you work with people I don't have much context on. WhatsApp would help me fill in the gaps." | WhatsApp |
| User asks about email context | "I don't have access to your email yet. One click and I can see who you're talking to." | Gmail, Outlook |
| No calendar connected after 2 calls | "I'm coaching blind without your calendar. It takes 10 seconds to connect — want to do it now?" | Calendar |

### Implementation

These prompts are injected into the call planning agent and the proactive agent:

```typescript
// In buildVariableValues() or call planning
const missingConnections = await detectMissingConnections(userId);
if (missingConnections.length > 0) {
    vars.connectionSuggestion = missingConnections[0]; // suggest ONE at a time
}
```

The prompt template includes:
```
{{#if connectionSuggestion}}
OPTIONAL — if it comes up naturally, you can mention:
"${connectionSuggestion.message}"
Do NOT force this into the conversation. Only mention it if the context makes it natural.
{{/if}}
```

**Rules:**
- Maximum one connection suggestion per call
- Never suggest in the first 2 calls (earn trust first)
- Don't suggest the same connection twice in a week
- Always frame as value for the user, never as data extraction

### Connection Suggestion Tracking

Store in `UserPreferences`:
```
connectionSuggestionsShown: Json?  // { "whatsapp": "2026-03-20", "slack": "2026-03-18" }
```

This prevents nagging and ensures each suggestion is spaced out.

---

## Dashboard Integration Points

Beyond onboarding and calls, connections should surface in the product UI:

### 1. Today Brief — Empty State

When Mira has no calendar data:
```
Good morning! I'd love to help you prep for today,
but I can't see your calendar yet.

[Connect Google Calendar]  [Connect Outlook]
```

### 2. Stakeholder Page — Coverage Gaps

On the People/Influence Map page:
```
Mira knows 12 of your stakeholders well.
Connect WhatsApp to discover more of your network.

[Connect WhatsApp]
```

### 3. Chat — Natural Prompts

When the user asks about something Mira doesn't have data for:
```
User: "What did Raj email about?"
Mira: "I don't have access to your email yet. Want to connect it? Takes 10 seconds."
[Connect Gmail] [Connect Outlook]
```

### 4. Post-Call Summary

After a call where Mira wished she had more data:
```
Call summary: ...

💡 Mira could have given better prep for your 3pm if Zoom recordings were connected.
[Connect Zoom]
```

---

## WhatsApp QR Code — Inline Display

The current flow (POST to API → job queued → QR via Pusher) needs a UX improvement for inline display.

**New flow:**
1. Onboarding page or connection card calls `POST /api/whatsapp/connect`
2. API returns `{ status: 'qr_pending' }`
3. Frontend subscribes to Pusher channel `private-user-{userId}`
4. Worker generates QR → publishes to Pusher as `{ type: 'whatsapp_qr', qr: 'base64...' }`
5. Frontend renders QR code inline using a QR code component
6. When connection succeeds → worker publishes `{ type: 'whatsapp_connected' }`
7. Frontend shows success state

**No page navigation needed.** The QR appears right where the user is — in onboarding, in settings, or in a modal.

---

## Migration Plan

### Phase 1: Simplified Onboarding (immediate)
- Reduce to 3 steps: Profile → Connect Work → Connect WhatsApp
- Move role/stakeholders/outcomes to in-conversation discovery
- Auto-detect Google vs Microsoft from signup email
- WhatsApp QR inline display

### Phase 2: In-Context Prompts (next)
- `detectMissingConnections()` function
- Connection suggestions in call planning + chat responses
- Dashboard empty states with connection CTAs

### Phase 3: Smart Sequencing
- Track which connections have been suggested and when
- Personalize suggestion timing based on user engagement
- A/B test prompt copy for highest conversion

---

## Success Metrics

| Metric | Current (est.) | Target |
|---|---|---|
| Onboarding completion rate | ~60% (6 steps, lots of drop-off) | 90%+ (3 steps, minimal friction) |
| Calendar connected at onboarding | ~70% (Google only) | 85%+ (Google + Microsoft) |
| WhatsApp connected (India users) | ~5% (buried in settings) | 40%+ (own onboarding step) |
| Time to first value | ~5-10 min (finish onboarding → first call) | <2 min (onboarding → first message/call) |
| Data sources per user at day 7 | ~1.2 (calendar only) | 2.5+ (calendar + email + WhatsApp) |
