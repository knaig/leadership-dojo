# Remaining Implementation Plan

## Priority Order

### 1. Deploy Current Changes
Push sync architecture + voice context improvements to GitHub.
Vercel auto-deploys web. Render deploys worker on push.

### 2. Email Filter Fix
**Status: ALREADY DONE** — `Updated invitation:`, `Invitation:`, `Declined:`, `Accepted:` all filtered in `web/app/api/vapi/call/route.ts:612`.

### 3. Worker-Side Prompt Control Plane
**Problem:** `worker/src/lib/vapi-voice.ts` has hardcoded inline prompts (line 414-417). The web side already reads from DB templates via `prompt-service.ts`, but the worker's inline fallback doesn't.

**Design:**
- Worker's `buildInlineAssistantPayload()` should use the same `assemblePrompt()` + DB template system as the web side
- Since worker is CommonJS and web is ESM, we need a shared prompt service
- The worker already injects `variableValues` into Vapi Assistant templates — the inline fallback just needs the same
- Import `assemblePrompt` and `getActivePromptTemplate` into worker (copy the functions since module systems differ)

**Files:**
- `worker/src/lib/prompt-service.ts` — new file, port of `web/lib/prompt-service.ts` for CommonJS
- `worker/src/lib/vapi-voice.ts` — update `buildInlineAssistantPayload()` to use DB templates

### 4. Voice Mode Detection + Longer Calls
**Problem:** Mira doesn't detect conversational modes (Brief, Outcomes, Devil's Advocate, Skill Building, Personal) and has hard duration limits.

**Design:**

#### Duration changes (vapi-voice.ts):
- Remove hard `maxDurationSeconds` caps. Set all to 1800 (30 min)
- `silenceTimeoutSeconds`: increase from 60 to 120 (let user think)
- Remove `endCallPhrases` — let Mira handle endings naturally via prompt

#### Mode detection (in Vapi Assistant prompt template):
Mode detection happens in the LLM prompt, not in code. The Vapi Assistant prompt should include mode detection instructions. When the user says something that signals a mode shift, Mira adjusts her behavior within the same call.

**Prompt template addition (goes into Vapi dashboard or DB template):**
```
## CONVERSATION MODES — Detect and adapt

Listen for signals and shift your approach:

| Signal | Mode | Your approach |
|--------|------|---------------|
| "Tell me about my day" / "what's up" | BRIEF | Headlines, flags, ask what to dig into |
| "Prep me for [meeting]" | MEETING PREP | Attendees, landmines, one good question |
| "What should success look like?" / "what's the goal" | OUTCOMES | Push for specifics, conditions, measures |
| "Push back on this" / "play devil's advocate" | DEVIL'S ADVOCATE | Take opposite stance, poke holes |
| "I want to practice [conversation]" | SKILL BUILDING | Role-play as the other person, give feedback |
| "I'm tired" / "I need to talk" / personal topics | PERSONAL | Listen, empathize, no agenda |
| "Keep going" / "tell me more" | EXTEND | Stay in current mode |
| "That's all" / "thanks Mira" | END | Wrap up, summarize key takeaways |

Transitions are natural. Don't announce "switching to outcomes mode."
Just shift your questions and energy.

At natural pauses (10+ min): "We've covered a lot. Want to keep going or should I bundle this up?"
Never say "we're out of time." Always: "Want to keep going?"
```

**Files:**
- `worker/src/lib/vapi-voice.ts` — update duration limits
- DB prompt template `voice-general` — add mode detection instructions
- DB prompt template `shared-voice-rules` — add duration/ending rules

### 5. Entity Resolution Fuzzy Matching
**Problem:** Knowledge graph entity resolver uses exact normalized names. "I4Inclusion" vs "AI4Inclusion" creates duplicates.

**Design:**
- Add fuzzy matching to entity resolution using string similarity (Levenshtein or trigram)
- When a new entity is created, check for similar existing entities
- If similarity > 0.8, flag as potential duplicate
- Store in a new `EntityMergeCandidate` model
- Surface to user via API endpoint + chat prompt ("Did you mean AI4Inclusion?")

**Schema addition:**
```prisma
model EntityMergeCandidate {
  id              String   @id @default(cuid())
  userId          String
  sourceEntityId  String   // The new/duplicate entity
  targetEntityId  String   // The existing entity it might match
  similarity      Float    // 0-1 score
  status          String   @default("pending") // pending, confirmed, rejected
  createdAt       DateTime @default(now())
  resolvedAt      DateTime?

  @@index([userId, status])
  @@unique([sourceEntityId, targetEntityId])
}
```

**Files:**
- `web/prisma/schema.prisma` — add `EntityMergeCandidate` model
- `worker/src/agents/knowledge/entity-resolver.ts` — add fuzzy matching + candidate creation
- `web/app/api/entities/merge-candidates/route.ts` — new API to list/resolve candidates

### 6. Chat Restructure — Topic-Based Modes
**Problem:** Monolithic chat — all messages in one stream. User can't focus on outcomes vs personal vs skill building.

**Design:**

#### New schema:
```prisma
model Conversation {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  mode      ConversationChannel  // OUTCOMES, DEVILS_ADVOCATE, SKILL_BUILDING, PERSONAL, GENERAL
  title     String?              // Auto-generated from first message

  messages  Message[]

  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, mode])
  @@index([userId, updatedAt])
}

enum ConversationChannel {
  OUTCOMES          // Goal-driven thinking — "what should success look like?"
  DEVILS_ADVOCATE   // AI takes opposite stance — "poke holes in my plan"
  SKILL_BUILDING    // Practice hard conversations, role-play
  PERSONAL          // Private, never surfaced elsewhere
  GENERAL           // Default catch-all
}
```

#### Message gets conversationId:
```prisma
model Message {
  // ... existing fields ...
  conversationId String?
  conversation   Conversation? @relation(fields: [conversationId], references: [id])
}
```

#### Router agent update:
- Detect channel from user's opening message
- Route to appropriate Conversation (create new or resume existing)
- Each channel gets a different system prompt persona:
  - OUTCOMES: Challenger — pushes for specifics, conditions, measures
  - DEVILS_ADVOCATE: Adversary — takes opposite stance, pokes holes
  - SKILL_BUILDING: Coach — role-plays, gives feedback
  - PERSONAL: Confidant — listens, empathizes, no agenda
  - GENERAL: Mira default

#### API changes:
- `GET /api/conversations` — list conversations grouped by mode
- `GET /api/conversations/[id]/messages` — messages for a conversation
- `POST /api/chat` — existing endpoint, but now routes through conversation

**Files:**
- `web/prisma/schema.prisma` — Conversation model, ConversationChannel enum, Message.conversationId
- `web/app/api/conversations/route.ts` — list conversations
- `web/app/api/conversations/[id]/messages/route.ts` — conversation messages
- `worker/src/agents/multi-agent/router-agent.ts` — channel detection
- `worker/src/agents/multi-agent/orchestrator.ts` — conversation routing
- `web/components/v2/` — new conversation UI components

### 7. Command Center UI
**Problem:** Current UI is a generic chat interface. Need a personal command center.

**Design:** See `docs/requirements/command-center-ui.md` for full wireframes.

#### Key components:
1. **TodayView** — Morning brief + calendar + projects + recent calls
2. **ThinkWithMira** — Mode cards (Outcomes, Devil's Advocate, Skill Building, Personal) linking to conversations
3. **MeetingThread** — Per-meeting view with prep, debrief, outcome tracking
4. **SyncHealthBadge** — Shows sync status using `/api/sync/health`

#### Implementation approach:
- New page: `web/app/v2/today/page.tsx` — main command center
- Reuse existing `TodayBrief` component, enhance with new sections
- Mode cards link to `/v2/chat?mode=OUTCOMES` etc.
- Meeting threads at `/v2/meetings/[id]`

**Files:**
- `web/app/v2/today/page.tsx` — main page
- `web/components/v2/CommandCenter/` — new component directory
- `web/components/v2/CommandCenter/MiraBrief.tsx`
- `web/components/v2/CommandCenter/YourDay.tsx`
- `web/components/v2/CommandCenter/ThinkWithMira.tsx`
- `web/components/v2/CommandCenter/ProjectCards.tsx`
- `web/components/v2/CommandCenter/RecentCalls.tsx`
- `web/components/v2/CommandCenter/SyncHealth.tsx`
- `web/components/v2/MeetingThread/MeetingThread.tsx`

### 8. Langfuse Integration
**Problem:** LLM calls not traced. Can't see prompt quality, latency, cost.

**Design:**
- `worker/src/lib/langfuse.ts` already has `tracedGenerate()` — wraps any LLM call with Langfuse tracing
- `worker/src/lib/user-llm.ts` has `generateText()` — the central LLM call function
- Wire `generateText()` through `tracedGenerate()` so ALL LLM calls are automatically traced
- Voice calls already create traces (line 137 in vapi-voice.ts)

**Files:**
- `worker/src/lib/user-llm.ts` — wrap `generateText()` with Langfuse tracing
- Env vars: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
