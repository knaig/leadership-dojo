# Mira — Architecture Overview

Mira is an AI chief of staff focused on meeting effectiveness. The architecture serves one core loop: sync calendar → learn who the user works with → prep before meetings → debrief after → track outcomes → improve over time. Everything below — the knowledge graph, stakeholder synthesis, voice system, proactive coaching — exists to make that loop sharper.

## The Big Picture

```
┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│  User's Work  │    │   Web App    │    │   Worker    │
│  (Google,     │───▶│  (Vercel)    │◀──▶│  (Render)   │
│  WhatsApp)    │    │  Next.js 16  │    │  Node.js    │
└──────────────┘    └──────┬───────┘    └──────┬──────┘
                           │                    │
                    ┌──────▼────────────────────▼─────┐
                    │   PostgreSQL (Neon)              │
                    │   81 models + pg-boss queues     │
                    └────────────────────────────────┘
                           │
                    ┌──────▼──────┐    ┌──────────────┐
                    │   Vapi      │    │  ElevenLabs  │
                    │ (outbound   │───▶│  (TTS voice) │
                    │  calls)     │    │  + Deepgram   │
                    └─────────────┘    │  (STT)       │
                                       └──────────────┘
```

---

## Three Systems Working Together

### 1. Web App (Next.js on Vercel)

~95 API routes, 35+ pages.

- User-facing UI: dashboard, chat, meetings gameplan, stakeholders, wins, settings
- Voice call API: triggers outbound phone calls via Vapi
- Vapi webhook receiver: processes call transcripts, extracts insights
- Receives Google webhooks (calendar/email/drive changes)
- Queues jobs for the worker via pg-boss
- Real-time updates via Pusher

### 2. Worker (Node.js on Render)

26 queues, 14 cron schedules, 20+ agents.

- Processes all background work: syncing, fact extraction, intelligence synthesis
- Runs the multi-agent chat system (router → context → action → response)
- Triggers outbound voice calls (morning brief, pre-meeting prep, nudges)
- Sends proactive coaching (text briefs, push notifications)
- Knowledge graph extraction and entity resolution
- Stakeholder enrichment (web search + LLM)

### 3. Database (Neon PostgreSQL)

81 models, ~3500 lines of Prisma schema.

- User data, knowledge graph, intelligence profiles
- Voice call records (transcript, summary, duration, recording URL)
- pg-boss job queue (replaces external queue service)
- Watch channels for Google push notifications

---

## The Data Flywheel

```
INGEST → EXTRACT → SYNTHESIZE → DELIVER → FEEDBACK
  │                                           │
  └───────────────────────────────────────────┘
```

### Step 1: Ingest

Real-time webhooks + 30-minute polling fallback.

| Source | Storage | Signal Quality |
|--------|---------|----------------|
| Google Calendar | `MeetingSyncRecord` | High |
| Gmail | `EmailSummary` | Medium |
| Google Drive | `WorkArtifact` | Medium |
| Chat (text) | `Message` | Highest |
| Voice calls | `VoiceCall` (transcript) | Highest |
| WhatsApp | `WhatsAppMessage` | High |

### Step 2: Extract

LLM-powered fact extraction, queued as background jobs.

- Each source gets its own extractor agent (calendar, email, document, chat, voice)
- Produces **`KnowledgeEntity`** — types: `PERSON`, `PROJECT`, `TOPIC`, `CONCEPT`, `ORGANIZATION`
- Produces **`KnowledgeFact`** — directed relationships with confidence scores (0–1)
- Entity deduplication via resolver (canonical names, aliases)
- Community detection groups related entities into clusters

### Step 3: Synthesize

Daily cascade at 12:00–13:00 UTC:

| Time (UTC) | Agent | Output |
|------------|-------|--------|
| 12:00 | Intel Synthesis | `UserIntelligence` — strengths, growth areas, communication style |
| 12:15 | Stakeholder Synthesis | `StakeholderIntelligence` — what works / watch for per person |
| 12:30 | Community Detection | `KnowledgeCommunity` — groupings of related entities |
| 12:45 | Domain Synthesis | `DomainContext` — org culture, unwritten rules, political landscape |
| 13:00 | Stakeholder Enrichment | Web search + LLM for meeting attendee profiles |
| 01:00 | Confidence Decay | Old facts fade: 30d → ×0.9, 90d → ×0.7, 180d → ×0.5 |

### Step 4: Deliver

Proactive engagement + on-demand consumption.

| Trigger | Schedule | Channel |
|---------|----------|---------|
| Morning brief | 8:00 AM IST | Voice call + text |
| Pre-meeting prep | Every 15 min | Voice call + push |
| Post-meeting review | Every 15 min (24h window) | Dashboard + voice debrief |
| Context deepening | 4:30 PM IST | Chat question |
| Commitment reminders | As needed | Push notification |
| Today Brief | On-demand | Dashboard API |

**Delivery channels:** Voice call (Vapi), in-app (Pusher), browser push (VAPID), email (Resend), WhatsApp (BSP)

### Step 5: Feedback

- User responses to prompts → `ProactivePrompt.responded` + `resultedInAction`
- Chat facts → immediate stakeholder synthesis trigger
- Meeting outcomes (LANDED/PARTIAL/MISSED) → training signal for future briefs
- Voice call transcripts → knowledge graph facts + onboarding progress
- Call feedback (rating, too long/short, relevant, actionable)
- Correction learning (user overrides → system learns)

---

## Voice System

### Architecture

```
                    ┌─────────────┐
 Worker Cron ──────▶│  Vapi API   │──────▶ Phone rings
                    │  (outbound  │         User talks to Mira
 UI Button ────────▶│   calls)    │         GPT-4o powers conversation
                    └──────┬──────┘
                           │
                     End of call
                           │
                    ┌──────▼──────┐
                    │   Webhook   │
                    │ /api/vapi/  │
                    │  webhook    │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   Save VoiceCall   Extract facts    Update onboarding
   (transcript,     (knowledge       (detect covered
    summary,         graph)           topics: role,
    duration)                         stakeholders, etc.)
```

### Three Persistent Assistants

Created via `scripts/setup-vapi-assistants.ts`, updated with `--update`.

| Assistant | Use Case | Max Duration |
|-----------|----------|-------------|
| Mira — Onboarding | First call + ongoing onboarding | 15 min |
| Mira — Daily | Morning check-in, briefs, nudges | 15 min |
| Mira — Meeting | Pre-meeting prep + post-meeting debrief | 10 min |

Each uses `{{variable}}` placeholders filled per call via `assistantOverrides.variableValues`:
- `userName`, `jobTitle`, `today`, `callType`
- `meetingsSummary`, `overdueCommitments`, `meetingCount`
- `domainContext` (org culture, power structure, projects)
- `onboardingComplete`, `onboardingCovered`, `onboardingUncovered`
- `lastCallSummary` (prevents repetition within same day)
- `relationshipStage` (new/building/established)

### Voice Config
- **Voice**: Priyanka Sogum (Indian English) via ElevenLabs (`1zUSi8LeHs9M2mV8X6YS`)
- **Speed**: 0.9 (relaxed pace)
- **STT**: Deepgram Nova-2
- **LLM**: GPT-4o (via Vapi)
- **Silence timeout**: 60s
- **Webhook**: `https://miracos.vercel.app/api/vapi/webhook`

### Call Triggers
- **Worker-initiated**: `triggerVoiceCall()` in `worker/src/lib/vapi-voice.ts` — uses persistent assistants with variable overrides
- **UI-initiated**: `POST /api/vapi/call` in `web/app/api/vapi/call/route.ts` — uses inline assistant config with full context
- **Delivery guard**: Respects DND, quiet hours, max calls per day, no calls during meetings

---

## Multi-Agent Chat System

```
User message → POST /api/chat → pg-boss queue
                                      │
                               ┌──────▼──────┐
                               │   Router    │  intent + entity extraction
                               └──────┬──────┘
                          ┌───────────┼───────────┐
                    ┌─────▼─────┐          ┌──────▼──────┐
                    │  Context  │          │   Action    │
                    │  Agent    │          │   Agent     │
                    └─────┬─────┘          └──────┬──────┘
                          └───────────┬───────────┘
                               ┌──────▼──────┐
                               │  Response   │  Mira persona
                               └──────┬──────┘
                                      │
                               Pusher → User's chat
```

**Persona:** Mira — Della Street meets Indra Nooyi. Warm, sharp, dry wit. Never generic.

---

## Worker: Cron Schedules

All times in UTC. IST = UTC + 5:30.

| Schedule | Queue | Purpose |
|----------|-------|---------|
| `*/30 * * * *` | `cron-sync-calendar` | Sync Google Calendar |
| `*/30 * * * *` | `cron-sync-email` | Sync Gmail |
| `*/30 * * * *` | `cron-sync-drive` | Sync Google Drive |
| `*/15 * * * *` | `cron-pre-meeting-prep` | Send pre-meeting briefs |
| `*/15 * * * *` | `cron-post-meeting-review` | Prompt post-meeting reflection |
| `30 2 * * *` | `cron-morning-brief` | Morning briefing (~8 AM IST) |
| `0 11 * * *` | `cron-context-deepening` | Deep context questions (~4:30 PM IST) |
| `0 12 * * *` | `cron-intel-synthesis` | User intelligence synthesis |
| `15 12 * * *` | `cron-stakeholder-synthesis` | Stakeholder intelligence |
| `30 12 * * *` | `cron-community-detection` | Knowledge graph communities |
| `45 12 * * *` | `cron-domain-synthesis` | Domain context synthesis |
| `0 13 * * *` | `cron-stakeholder-enrichment` | Web search stakeholder profiles |
| `0 1 * * *` | `cron-confidence-decay` | Decay old fact confidence |
| `0 3 * * *` | `cron-renew-watch-channels` | Renew Google API watch channels |
| `*/30 * * * *` | `cron-whatsapp-extract` | Extract facts from WhatsApp |

---

## External Integrations

| Service | Purpose | Auth |
|---------|---------|------|
| **Google Calendar** | Event ingestion + webhooks | OAuth 2.0 via Clerk |
| **Gmail** | Email thread ingestion + Pub/Sub push | OAuth 2.0 via Clerk |
| **Google Drive** | Document ingestion + webhooks | OAuth 2.0 via Clerk |
| **Vapi** | Outbound voice calls | API key |
| **ElevenLabs** | Text-to-speech (Priyanka Sogum voice) | Via Vapi |
| **Deepgram** | Speech-to-text (Nova-2) | Via Vapi |
| **Gemini** | Primary LLM (2.0 Flash) | API key (BYOLLM or platform) |
| **OpenAI** | Fallback LLM + Vapi conversation | API key |
| **Anthropic** | Alternative LLM | API key |
| **Pusher** | Real-time WebSocket | App key + secret |
| **Clerk** | Authentication + user management | Publishable + secret key |
| **Stripe** | International payments | API key + webhook secret |
| **Razorpay** | India payments | Key ID + secret |
| **Resend** | Transactional email | API key |
| **Web Push (VAPID)** | Browser notifications | VAPID key pair |

---

## Key Numbers

| Metric | Count |
|--------|-------|
| Database models | 81 |
| API routes | ~95 |
| Worker queues | 26 |
| Cron schedules | 14+ |
| Agent types | 20+ |
| LLM providers | 4 (Gemini, OpenAI, Anthropic, Perplexity) |
| Notification channels | 5 (voice, in-app, push, email, WhatsApp) |
| Voice assistant types | 3 (Onboarding, Daily, Meeting) |
| Pages | 35+ |

---

## Deployment

| Component | Platform | Trigger |
|-----------|----------|---------|
| Web app | Vercel | Push to `exec-coach` on GitHub |
| Worker | Render | Manual deploy or push |
| Database | Neon | `npx prisma db push` |

Primary branch: `exec-coach`
Repository: `knaig/leadership-coach`
