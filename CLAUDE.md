# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Navigation

Serena MCP server is configured for this project, providing LSP-powered semantic code intelligence. When you need to find a function definition, trace references, or understand call hierarchies, prefer Serena's tools (find_symbol, find_referencing_symbols) over grep — they are faster and more precise for targeted lookups. Use grep/glob for broad text searches and discovery.

## Project Overview

Leadership Dojo / Clarity — AI executive coaching platform. "Mira" is the AI coach persona that analyzes calendar, email, and documents to deliver contextual coaching. Primary user is in IST (UTC+5:30).

## Architecture

```
Web App (Next.js 16, React 19, Vercel)
    ├── Auth: Clerk (@clerk/nextjs)
    ├── API Routes (~95 endpoints under web/app/api/)
    ├── Prisma ORM → PostgreSQL (Neon)
    ├── pg-boss queue ──→ Worker Daemon (Render)
    │                        ├── Multi-agent chat pipeline
    │                        ├── Knowledge graph (fact extraction + entity resolution)
    │                        ├── Sync agents (calendar, email, drive, WhatsApp)
    │                        ├── Proactive coaching (briefs, meeting prep, nudges)
    │                        └── Cron schedules
    └── Pusher (real-time delivery to client)
```

**Multi-Agent Chat Pipeline** (`worker/src/agents/multi-agent/`): Router Agent (intent + entity extraction) → Context Agent (knowledge graph lookup) → Action Agent (goal/data mutations) → Response Agent (Mira persona via `mira-persona.ts`) → Pusher delivery. Orchestrated by `orchestrator.ts`.

**Knowledge Graph** (`worker/src/agents/knowledge/`): Fact extractors (calendar, email, document, chat) → Entity resolver → Community detection → Confidence decay. Queried via `graph-query-service.ts`.

**Data Flow:** INGEST (calendar/email/drive sync) → EXTRACT (knowledge graph) → SYNTHESIZE (intelligence) → DELIVER (briefs/prep/nudges) → FEEDBACK (outcome tracking)

## Common Commands

```bash
# Web app
cd web && npm run dev           # Start dev server (port 3000)
cd web && npm run build         # Production build (runs prisma generate first)
cd web && npm run lint          # ESLint
cd web && npm run test          # Vitest unit tests
cd web && npm run test:watch    # Vitest watch mode
cd web && npx vitest run path/to/test.ts  # Run a single test file

# E2E tests (Playwright)
cd web && npm run test:e2e          # Run all E2E tests
cd web && npm run test:e2e:headed   # Run with visible browser
cd web && npm run test:e2e:debug    # Debug mode with inspector
cd web && npm run test:e2e:ui       # Interactive UI mode
cd web && npm run test:audit        # Button audit tests only

# Worker
cd worker && npx ts-node src/index.ts   # Start worker daemon

# Database
cd web && npx prisma db push    # Apply schema changes (no migration files)
cd web && npx prisma generate   # Regenerate Prisma client
cd web && npx prisma studio     # Database GUI
cd web && npx prisma db seed    # Seed database
```

Both web and worker must run simultaneously for chat to work. The worker uses the same Prisma schema from `web/prisma/schema.prisma` (imports `@prisma/client` generated from the web package).

## Environment Variables

- `web/.env.local` — web app env vars (Next.js picks up automatically)
- `.env.local` (root) — worker env vars (loaded via dotenv in dev)
- `.env.example` — reference for all required vars
- Keep `GEMINI_API_KEY` and `DATABASE_URL` synced between both
- Key services: Clerk (auth), Pusher (realtime), Google OAuth (calendar/email/drive), Stripe + Razorpay (payments), VAPID (web push)

## Key Directories

- `web/app/api/` — API routes (chat, calendar, coaching, meetings, etc.)
- `web/app/v2/` — Main app pages (chat, coaching, goals, kpis, meetings, stakeholders)
- `web/components/v2/` — Core components (TodayBrief, ActiveDialogue, InfluenceMap, etc.)
- `web/lib/llm/` — LLM provider implementations (factory pattern: gemini, openai, anthropic, perplexity)
- `web/lib/` — Business logic (agentic-coach, today-service, conversation-prep, google-apis, stripe, razorpay)
- `web/prisma/schema.prisma` — Database schema (~81 models)
- `worker/src/agents/` — Background agents (multi-agent/, knowledge/, meeting-champion, proactive, calendar-sync, etc.)
- `worker/src/agents/multi-agent/` — Chat pipeline agents (router, context, action, response, orchestrator)
- `worker/src/agents/knowledge/` — Knowledge graph (fact extractors, entity resolver, community detection)
- `worker/src/lib/` — Worker utilities (user-llm, google-auth, pusher, token-tracking)
- `docs/requirements/` — Feature requirements with status tracking
- `scripts/` — Utility scripts (Razorpay plan setup, pricing calculator)

## LLM Provider Rules — CRITICAL

**NEVER hardcode a specific LLM provider.** Users choose their own provider (Gemini, OpenAI, Anthropic) via settings stored in `UserApiKey` table.

- Web side: `web/lib/llm/user-config.ts` → `getUserLLMConfig(userId)`
- Worker side: `worker/src/lib/user-llm.ts` → `getUserLLMConfig(userId)`
- Both decrypt API keys via `ENCRYPTION_SECRET` and fall back to env vars
- Worker also provides `generateText(config, prompt)` + `withLLMRetry()` for provider-agnostic calls

## Error Handling — CRITICAL

**NEVER return fake/hardcoded content as a fallback when an LLM call fails.** If generation fails, surface the error to the user with a retry option. A generic fallback disguised as real AI output silently breaks trust.

## Code Conventions

- **TypeScript strict typing** — avoid `any`
- **Server Components by default** — `'use client'` only when needed
- **Prisma for all DB operations** — schema changes via `npx prisma db push` (not migrate)
- **Async/await** over raw promises
- Tests colocated with source or in `__tests__/`; Vitest for unit, Playwright for E2E
- Worker is CommonJS (`"type": "commonjs"` in package.json); web is ESM (Next.js)

## Deployment

- **Web**: Vercel, auto-deploys on push to `exec-coach` branch
- **Worker**: Render
- **Database**: Neon PostgreSQL
- Primary branch: `exec-coach`
- Push to GitHub triggers Vercel deploy — local dev server is NOT how the user tests
