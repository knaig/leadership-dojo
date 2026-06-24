# Mira — AI Chief of Staff

**Make every meeting count. Know every room you walk into.**

Mira is an AI chief of staff that helps leaders win their meetings. She syncs your calendar, learns who you work with, preps you before every important meeting, debriefs you after, and tracks whether you're landing your outcomes. Today, Mira is focused on meeting effectiveness — the skill that compounds fastest for leaders. The long-term vision is a true business-outcome-focused chief of staff.

## What Mira Does Today

### The Core Loop: Meeting Effectiveness

This is the center of gravity. Everything else serves this.

```
SYNC calendar → CLASSIFY meetings → PREP (who to watch, what to push for)
    → ATTEND → DEBRIEF (did you get what you wanted?) → TRACK patterns
```

- **Classification** — Meetings auto-categorized as Needle Movers, Operational, Growth, or Tactical (keyword-based today, LLM-based planned)
- **Pre-meeting prep** — 1 hour before: attendee intel, communication styles, what works with each person, your tactical edge, desired outcome prompt
- **Post-meeting debrief** — "How'd it go?" — LANDED / PARTIAL / MISSED outcome tracking
- **Commitment tracking** — Follow-ups and deadlines extracted from debriefs, with reminders
- **Weekly patterns** — Outcome hit rate, follow-through rate, time allocation, stale relationships

### Stakeholder Intelligence (Serves the Meetings)

Not a standalone people analytics platform. Stakeholder intel exists to make meeting prep sharp.

- **Per-person profiles** — Archetype, communication style, decision patterns, success/objection patterns — all inferred from calendar frequency, email patterns, and what you tell Mira
- **Influence mapping** — Power levels, ally/blocker/neutral stance, relationship strength
- **Enrichment** — Daily synthesis from calendar, email, chat, and voice data. Top 50 stakeholders by interaction frequency.

### Knowledge Graph (The Engine, Not a Feature)

Users never see "the graph." They see Mira knowing things — that Pranab is the decision-maker on VoicERA, that the last 3 finance meetings stalled on budget objections.

- Auto-extracts entities (people, projects, topics, orgs) from calendar, email, drive, chat, voice
- Facts with confidence scores that decay over time
- Community detection groups related entities
- Domain synthesis: org culture, unwritten rules, political landscape

### Voice Coaching (Optional Channel)

Mira can call your phone — morning check-ins, pre-meeting prep, post-meeting debriefs. Voice is a delivery channel for the same meeting intelligence, not a separate product.

- Voice: Priyanka Sogum (Indian English, ElevenLabs) via Vapi
- Conversational onboarding woven into calls until Mira knows your world
- Delivery guard: respects DND, quiet hours, max calls/day

### Proactive Coaching

- **Morning brief** (8 AM IST) — Today's meetings, active goals, stale relationships, batched nudges
- **Pre-meeting briefs** — Pushed 1 hour before important meetings via chat, push notification, email, or voice
- **Post-meeting review** — Prompted after meetings end
- **Commitment reminders** — Daily nudges for follow-ups coming due
- **Context deepening** — One targeted question per day to fill knowledge gaps
- **Pattern detection** — Flags meeting overload, commitment drift, relationship neglect, outcome avoidance

### Multi-Agent Chat

Text conversation with Mira via a 4-agent pipeline (Router → Context → Action → Response). Supports goal setting, stakeholder questions, meeting prep, outcome capture, and general coaching.

### Integrations

- Google Calendar (sync + webhook push)
- Gmail (thread ingestion)
- Google Drive (document sync)
- WhatsApp (group message listening, optional)

## Tech Stack

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 | Vercel |
| Backend | Next.js API routes (~95 endpoints), Prisma ORM | Vercel |
| Database | PostgreSQL (Neon), ~81 models, pg-boss queues | Neon |
| Worker | Node.js + TypeScript, pg-boss, 26 queues, 14 cron jobs | Render |
| Auth | Clerk | - |
| Voice | Vapi (outbound calls), ElevenLabs (TTS), Deepgram (STT) | - |
| AI | Gemini 2.0 Flash (default), OpenAI, Anthropic (user-configurable) | - |
| Real-time | Pusher WebSocket | - |
| Payments | Stripe (international) + Razorpay (India) | - |
| PWA | Installable on mobile via manifest.json | - |

## Project Structure

```
/web                        Next.js web application
  /app/api                  API routes (chat, calendar, vapi, today, coaching, meetings, etc.)
  /app/v2                   Main app pages (dashboard, chat, meetings, stakeholders, wins)
  /components/v2            Core components (TodayBrief, PeopleIntelHub, MeetingCard, etc.)
  /components/voice         Voice call UI (VoiceCallButton)
  /lib                      Business logic (LLM providers, vapi, google-apis, stripe, encryption)
  /lib/llm                  LLM provider factory (gemini, openai, anthropic, perplexity)
  /prisma                   Database schema (~81 models)

/worker                     Background job processor
  /src/agents               Agent implementations
    /multi-agent            Chat pipeline (router, context, action, response, orchestrator)
    /knowledge              Knowledge graph (fact extractors, entity resolver, communities)
    calendar-sync.ts        Google Calendar sync + meeting classification
    email-sync.ts           Gmail sync
    proactive-agent.ts      Proactive coaching (briefs, prep, nudges, outcome asks)
    meeting-champion.ts     Weekly patterns, commitments, advisory
    stakeholder-enrichment-agent.ts  Web search + LLM stakeholder profiles
  /src/lib                  Worker utilities (vapi-voice, user-llm, google-auth, pusher)
  /src/index.ts             pg-boss queue setup & cron schedules

/scripts                    Utility scripts (Vapi assistant setup, Razorpay plans)
/docs                       Architecture, requirements, product specs
```

## Getting Started

1. **Install dependencies**:
   ```bash
   cd web && npm install
   cd ../worker && npm install
   ```

2. **Set up environment**:
   ```bash
   cp web/.env.example web/.env.local    # Web app env vars
   cp .env.example .env.local            # Worker env vars
   ```
   Required: `DATABASE_URL`, `CLERK_SECRET_KEY`, `GEMINI_API_KEY` (or OpenAI/Anthropic), `PUSHER_*`

   For voice calls: `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_ASSISTANT_*` (run setup script)

3. **Set up database**:
   ```bash
   cd web && npx prisma db push && npx prisma generate
   ```

4. **Set up Vapi assistants** (for voice calls):
   ```bash
   npx ts-node scripts/setup-vapi-assistants.ts
   # Add returned IDs to .env.local as VAPI_ASSISTANT_ONBOARDING, _DAILY, _MEETING
   ```

5. **Run locally** (both must run simultaneously):
   ```bash
   # Terminal 1 — web app
   cd web && npm run dev

   # Terminal 2 — worker
   cd worker && npx ts-node src/index.ts
   ```

## Common Commands

```bash
# Web
cd web && npm run dev              # Dev server (port 3000)
cd web && npm run build            # Production build
cd web && npm run lint             # ESLint
cd web && npm run test             # Vitest unit tests
cd web && npx vitest run <file>    # Single test file

# Worker
cd worker && npx ts-node src/index.ts   # Start worker daemon

# Database
cd web && npx prisma db push       # Apply schema changes
cd web && npx prisma generate      # Regenerate client
cd web && npx prisma studio        # Database GUI

# Vapi
npx ts-node scripts/setup-vapi-assistants.ts              # Create assistants
npx ts-node scripts/setup-vapi-assistants.ts --update     # Update existing
```

## Deployment

| Component | Platform | Trigger |
|-----------|----------|---------|
| Web app | Vercel | Push to `exec-coach` branch |
| Worker | Render | Manual deploy or push |
| Database | Neon | `npx prisma db push` |

## Voice Architecture

```
User clicks "Talk to Mira" → POST /api/vapi/call → Vapi API (outbound phone call)
                                                        │
Worker cron (morning brief, pre-meeting) ───────────────┤
                                                        │
                                                        ▼
                                                  Phone rings
                                                  User talks to Mira
                                                        │
                                                        ▼
                                              Vapi end-of-call-report
                                                        │
                                                        ▼
                                        POST /api/vapi/webhook
                                          ├── Save transcript + summary
                                          ├── Extract knowledge graph facts
                                          ├── Detect onboarding topics
                                          ├── Track commitments
                                          └── Update relationship strength
```

Three persistent Vapi Assistants with `{{variable}}` placeholders filled per call:
- **Mira — Onboarding**: First call + ongoing onboarding
- **Mira — Daily**: Morning check-in, briefs, nudges
- **Mira — Meeting**: Pre-meeting prep + post-meeting debrief

## LLM Configuration

Users choose their own LLM provider (Gemini, OpenAI, Anthropic, Perplexity) via in-app settings. The platform never hardcodes a provider:
- Web: `web/lib/llm/user-config.ts` → `getUserLLMConfig(userId)`
- Worker: `worker/src/lib/user-llm.ts` → `getUserLLMConfig(userId)`
- Both decrypt per-user API keys via `ENCRYPTION_SECRET` and fall back to env vars

## Where Mira Is Headed

Today: AI chief of staff for meeting effectiveness — prep, debrief, track, improve.

Next: True business-outcome-focused chief of staff — where meetings are one input into broader outcome tracking, stakeholder orchestration, and strategic decision support. The scaffolding exists (goals, KPIs, knowledge graph, domain context) but the wiring from "meeting outcomes" to "business outcomes" is still shallow.

## Key Design Principles

1. **Lead with value, not questions** — Tell the user something specific before asking anything
2. **Coach, don't score** — No numerical ratings. Observations in natural language.
3. **Never fake content** — If an LLM call fails, surface the error with retry. No hardcoded fallbacks.
4. **One question in, one question out** — Minimal friction for maximum insight
5. **Dismissing is always fine** — Every nudge can be ignored without guilt
6. **Stakeholder intel serves meetings** — People data woven into prep, not a separate dashboard to check

## License

Private repository.
