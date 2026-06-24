# Context Engineering Design for Leadership Dojo

## Research Foundation

This design synthesizes principles from:
- **Anthropic** — "Smallest set of high-signal tokens maximizing desired outcomes"
- **Manus** — KV-cache hit rate is "the single most important metric for production agents"
- **Google ADK** — Tiered context: Working Context / Session / Memory / Artifacts
- **LangChain** — Four operations: Write, Select, Compress, Isolate
- **Karpathy** — "Context window is RAM; fill it with just the right info for the next step"
- **ACE paper (ICLR 2026)** — Evolving playbooks via generation-reflection-curation
- **Tim Berglund / Confluent** — Context as a limited resource requiring engineering discipline

---

## Current State: What's Wrong

### Problem 1: Too Many LLM Calls Per Message (Cost)
Every chat message triggers a **4-agent pipeline**: Router → Context → Action → Response.
That's 3-4 LLM calls (~4,300 tokens) per message. At 100 users × 10 msgs/day = **4.3M tokens/day just for chat**.

The Router Agent duplicates what the model already does natively with function calling.
The Context Agent pre-loads everything regardless of whether the user asked about meetings or goals.

### Problem 2: Pre-Loading Over Just-In-Time (Accuracy + Cost)
Context Agent fetches ALL of: projects, people, documents, meetings, emails — then an LLM synthesizes insights. Most of this context is irrelevant to the user's actual question.

Anthropic: "Exhaustive context loading drowns agents in potentially irrelevant information."

### Problem 3: No Compaction (Accuracy)
200 messages hard cap, no summarization. After 200 messages, oldest context silently drops.
No sliding window. No summary preservation. Critical early decisions (goals set, preferences stated) vanish.

### Problem 4: No Cache Optimization (Cost)
System prompt is rebuilt from scratch every call. User profile re-fetched every call.
Manus: "Uncached vs cached tokens cost 10x difference." The app gets zero cache hits.

### Problem 5: No Relevance Scoring (Accuracy)
All context treated equally — 5 artifacts, 200 facts, 5 meetings. No scoring for which facts actually matter to *this* message. Low-relevance context competes with high-relevance context for the model's attention budget.

### Problem 6: Agent Sprawl (Cost + Complexity)
12+ agents, 11 cron jobs, 4 fact extractors. The proactive agent runs every 15 minutes for ALL users even when no meeting is near. Morning Brief and Context Deepening are separate daily jobs doing similar work.

---

## Design: Tiered Context Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TOKEN BUDGET: ~15K                        │
├─────────────────────────────────────────────────────────────┤
│  L1  SYSTEM PROMPT (Mira persona + tool defs)    ~2K  STABLE│  ← KV-cached
│  L2  USER PROFILE  (intelligence synthesis)     ~1.5K DAILY │  ← KV-cached
│  ─ ─ ─ ─ ─ ─ ─ cache boundary ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  L3  SESSION       (compacted history + goals)    ~4K GROWS │  ← append-only
│  L4  RETRIEVED     (tool results, on-demand)      ~4K DYNAMIC│  ← just-in-time
│  L5  OUTPUT        (response generation)         ~1.5K       │
│  L6  BUFFER        (safety margin)                ~2K       │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: System Prompt (Stable — cached across all calls)
- Mira persona (identity, personality, style guidelines)
- Tool definitions (11 tools, see below)
- Response format guidelines
- **NEVER include timestamps, dates, or per-call data here** (kills cache)
- ~2K tokens, identical across calls for the same user

### Layer 2: User Profile (Semi-stable — updated daily)
- From `UserIntelligence`: role, strengths, growth areas, communication style
- Active goals (names + status only, not full details)
- Top 5 stakeholders (names + relationship strength only)
- Current date/time injected here (below cache boundary)
- ~1.5K tokens, changes once per day

### Layer 3: Session Context (Growing — compacted)
- Recent conversation messages (verbatim)
- Conversation summary (for older messages)
- Active conversation state (mode, current goal focus)

**Compaction strategy:**
```
Total messages ≤ 15:  All verbatim
Total messages 16-30: Summarize oldest 10, keep last 5 verbatim
Total messages 31+:   Summarize all but last 5, append to running summary
```

The summary preserves:
- Goals set and their current status
- Decisions made and reasoning
- Action items and follow-ups
- Key preferences stated by user
- Patterns discussed

### Layer 4: Retrieved Context (Dynamic — tool results)
- Fetched only when Mira calls a tool
- Each tool returns compact, pre-formatted results
- Tool results are token-budgeted (each tool returns ≤ 800 tokens)
- Results from current turn only; previous tool results summarized or dropped

### Layer 5+6: Output + Buffer
- Model generates response within 1.5K token budget
- 2K buffer for safety (tool calling overhead, format tokens, etc.)

---

## Design: Agent Architecture

### Current: 12+ Agents
```
Chat:       Router → Context → Action → Response (4 agents, 3-4 LLM calls)
Background: CalendarSync, EmailSync, DriveSync (3 sync agents)
            CalendarExtractor, EmailExtractor, DocExtractor, ChatExtractor (4 extractors)
            ProactiveAgent (pre-meeting, morning brief, post-meeting, context deepening)
            IntelligenceSynthesis, CommunityDetection
            ConfidenceDecay, WatchChannelRenewal
```

### Proposed: 5 Agents + 2 Maintenance Jobs

```
┌──────────────────────────────────────────────────┐
│                   INTERACTIVE                     │
│                                                   │
│   User ←→ MIRA AGENT (single LLM, with tools)   │
│            │                                      │
│            ├── search_knowledge (graph query)     │
│            ├── get_meetings (calendar data)       │
│            ├── get_goals / create_goal            │
│            ├── get_stakeholder / add_stakeholder  │
│            ├── get_documents (artifact search)    │
│            ├── get_emails (thread search)         │
│            ├── get_meeting_prep (deep analysis)*  │
│            └── sync_workspace (trigger sync)      │
│                                                   │
│   * spawns sub-agent for heavy analysis           │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                   BACKGROUND                      │
│                                                   │
│   DATA SYNC WORKER (no LLM)                      │
│   ├── Calendar sync (every 30 min)               │
│   ├── Email sync (every 30 min)                  │
│   └── Drive sync (every 30 min)                  │
│                                                   │
│   KNOWLEDGE EXTRACTOR (batched LLM)              │
│   └── Runs after sync, processes ALL new data    │
│       in a single batched LLM call               │
│       (not 3 separate extractors)                │
│                                                   │
│   PROACTIVE COACH (event-driven LLM)             │
│   ├── Pre-meeting prep (45 min before meeting)   │
│   ├── Morning brief (daily, merged with deep.)   │
│   └── Post-meeting nudge (30 min after meeting)  │
│                                                   │
│   INTELLIGENCE SYNTHESIZER (daily LLM)           │
│   └── Profile + community detection (merged)     │
│                                                   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                  MAINTENANCE (no LLM)             │
│   ├── Confidence decay (daily)                   │
│   └── Watch channel renewal (daily)              │
└──────────────────────────────────────────────────┘
```

### Why This Is Better

#### Mira Agent: 1 LLM Call Instead of 4

The biggest win. Instead of:
```
Router (LLM#1) → "intent is PREPARE, entities: Sarah, tomorrow"
Context (LLM#2) → "here's everything about Sarah and tomorrow's meetings"
Action (LLM#3) → "no action needed"
Response (LLM#4) → "Hi! Here's your meeting prep for Sarah..."
```

Now:
```
Mira (LLM#1, with tools):
  → reads message, decides to call get_meetings("tomorrow") and get_stakeholder("Sarah")
  → receives tool results
  → generates response with meeting prep
```

Modern models (Gemini 2.0 Flash, Claude Sonnet) excel at tool selection.
The Router Agent is literally doing what function calling already does.
The Context Agent is doing what a tool call already does.

**Cost impact: ~60-70% reduction in chat LLM costs.**

#### Just-In-Time Context via Tools

When user says "How's project X going?" — Mira calls `search_knowledge("project X")`.
When user says "Good morning" — Mira calls nothing, just responds.

No more loading 5 meetings + 5 people + 5 docs + 200 facts for every message.

**Accuracy impact: Higher signal-to-noise. Model attention focused on relevant context.**

#### Knowledge Extractor: Batched, Not Per-Type

Current: 3 separate LLM calls (calendar facts, email facts, doc facts) after each sync.
New: 1 batched LLM call processing all new data together.

The model sees the full picture — a meeting with Sarah, the follow-up email, and the shared doc — and extracts richer, cross-referenced facts.

**Cost impact: ~60% reduction in extraction LLM costs.**
**Accuracy impact: Cross-source facts (meeting → email → doc connections) captured naturally.**

#### Proactive Coach: Event-Driven, Not Poll-Driven

Current: Runs every 15 minutes for ALL users, checks if a meeting is near.
New: Triggered by sync agent when it detects a meeting within 45 minutes.

Morning Brief and Context Deepening merged into one daily job.

**Cost impact: ~80% reduction in proactive trigger overhead.**

---

## Design: Tool Definitions for Mira

Following Anthropic's principles: self-contained, minimal overlap, descriptive names, consistent prefixes.

```
RETRIEVAL TOOLS (get_*, search_*):
──────────────────────────────────
search_knowledge(query, entity_type?, limit?)
  → Searches knowledge graph. Returns facts with confidence scores.
  → Max 800 tokens. Sorted by relevance × confidence.

get_meetings(timeframe, person?)
  → Returns meetings in timeframe with attendees, notes.
  → "tomorrow", "this week", "last 3 days"
  → Max 800 tokens.

get_goals(status?)
  → Returns active goals with progress, deadlines, linked stakeholders.
  → Max 600 tokens.

get_stakeholder(name)
  → Returns full profile: role, relationship, interaction history,
    communication style, recent context from knowledge graph.
  → Max 600 tokens.

get_documents(query, limit?)
  → Keyword search over work artifacts. Returns title + snippet.
  → Max 800 tokens.

get_emails(query, limit?)
  → Search recent email threads. Returns subject + summary.
  → Max 600 tokens.

get_user_profile()
  → Returns own intelligence profile (strengths, growth areas, patterns).
  → Max 400 tokens.

MUTATION TOOLS (create_*, update_*, add_*):
───────────────────────────────────────────
create_goal(title, description, magnitude, deadline?, stakeholders?)
  → Creates goal, links to stakeholders. Returns confirmation.

update_goal(goal_id, progress?, status?, notes?)
  → Updates goal progress. Returns updated goal.

add_stakeholder(name, role?, relationship?, notes?)
  → Creates or updates stakeholder profile. Returns confirmation.

ACTION TOOLS (sync_*):
──────────────────────
sync_workspace(sources?)
  → Triggers calendar/email/drive sync. Returns status.
  → Sources: ["calendar", "email", "drive"] or all.
```

**11 tools total.** Each returns pre-formatted, token-budgeted results.

Following Manus's advice: tool names use consistent prefixes (`get_`, `search_`, `create_`, `update_`, `add_`, `sync_`). No dynamic tool addition/removal — all tools always available, model decides which to call.

---

## Design: Compaction Strategy

### Conversation Compaction (Anthropic's technique)

When conversation exceeds 15 messages:

```
1. Take messages 1...(N-5)
2. Send to LLM with compaction prompt:
   "Summarize this conversation preserving:
    - Goals set and their current status
    - Decisions made with reasoning
    - Action items and commitments
    - User preferences and communication style
    - Key patterns or insights discussed
    - Names and relationships mentioned
    Do NOT preserve: greetings, acknowledgments, tool outputs, repeated info."
3. Store summary in ConversationState.summary (~500 tokens)
4. Keep messages (N-4)...N verbatim
5. Next call: [System Prompt] + [User Profile] + [Summary] + [Recent 5 messages]
```

**Compaction is itself an LLM call** — but it only runs every ~15 messages, not every message.
Cost: ~1 extra LLM call per 15 messages = negligible.

### Tool Result Compaction (Manus's technique)

After each turn, tool results from previous turns are dropped from context.
Only the model's synthesized response persists — not the raw data it read.

```
Turn 1: User asks about Sarah
  → Mira calls get_stakeholder("Sarah") → 600 tokens of profile data
  → Mira responds: "Sarah is your VP of Eng..." (included in message history)
  → Tool result (600 tokens) is NOT carried to Turn 2

Turn 2: User asks follow-up
  → Context has Mira's response about Sarah (in history) but not the raw profile
  → If Mira needs more detail, she calls the tool again
```

This prevents context from growing linearly with tool usage.

---

## Design: Relevance Scoring

### Problem: "Lost in the Middle"
Research shows models pay most attention to the beginning and end of context.
If we dump 200 knowledge graph facts, the important ones in the middle get ignored.

### Solution: Tool-Level Relevance

Each retrieval tool returns results **pre-ranked by relevance**:

```
search_knowledge(query):
  1. Extract query entities (names, projects, topics)
  2. Match against knowledge graph
  3. Score: relevance_to_query × fact_confidence × recency_weight
  4. Return top N facts within 800-token budget
  5. Format: highest-relevance first (model attention pattern)
```

```
Recency weight:
  < 7 days:   1.0
  7-30 days:  0.7
  30-90 days: 0.4
  > 90 days:  0.2  (already decayed by confidence-decay job)
```

This means the model never sees irrelevant context — filtering happens before it enters the context window.

---

## Design: KV-Cache Optimization

Following Manus's #1 rule: maximize cache hit rate.

### Stable Prefix Structure
```
[CACHED — identical across calls for same user for same day]
├── System prompt (Mira persona, tool definitions)
├── User profile (daily intelligence synthesis)
│
[VARIABLE — changes per call]
├── Current datetime
├── Conversation summary (changes every ~15 messages)
├── Recent messages (append-only within session)
├── Tool results (per-call)
```

### Rules for Cache Stability
1. **Never put timestamps in system prompt** — inject datetime in the variable section
2. **Tool definitions are static** — never add/remove tools mid-session (use logit masking if needed)
3. **User profile updates once daily** — cached for 24 hours
4. **Conversation summary is append-only** — only grows, never rewritten mid-session

### Provider-Specific Cache Usage
- **Gemini**: Supports context caching natively (cache the stable prefix)
- **Anthropic**: Supports prompt caching (mark cache breakpoints)
- **OpenAI**: Automatic prefix caching on recent models

---

## Design: Proactive Intelligence

### Event-Driven, Not Poll-Driven

Current: Cron every 15 min → check all users → check if meeting near → maybe send prep.
New: Sync agent flags events → targeted triggers.

```
Calendar Sync completes
  → Scans next 2 hours for meetings not yet prepped
  → For each: queue proactive-coach job with meeting context
  → Proactive Coach generates prep (1 LLM call per meeting)

Meeting ends (detected by time)
  → Queue post-meeting nudge (1 LLM call)
  → "How did the meeting with Sarah go? Anything to capture?"

Daily 8 AM user-local-time
  → Queue morning brief (1 LLM call)
  → Combines: today's meetings, goal deadlines, recent patterns
  → Replaces both "morning brief" and "context deepening"
```

### Proactive Context Budget
Proactive messages get a **smaller context budget** (~8K tokens):
- System prompt (abbreviated, no tool definitions): ~1K
- User profile: ~1.5K
- Relevant meeting/goal context: ~3K
- Output: ~1K
- Buffer: ~1.5K

No tools needed — context is pre-assembled by the trigger.

---

## Design: Knowledge Graph Optimization

### Batched Extraction (Cost)
Current: 3 separate extractors (calendar, email, document) each make LLM calls.
New: Single extractor processes all new data in one call.

```
After sync completes:
  1. Gather all new/updated records since last extraction
     - New meetings, new emails, new documents
  2. Format as a single batch (up to 50 items)
  3. One LLM call: "Extract entities and facts from these work items"
  4. Parse results, upsert to knowledge graph
```

**Cross-source extraction**: The model sees a meeting with Sarah AND the follow-up email AND the shared doc in one pass. It naturally connects them — "Sarah discussed the Q3 roadmap in the meeting, followed up via email with the spec doc."

### Confidence-Based Retrieval (Accuracy)
```
Tier 1 (Hot):   confidence ≥ 0.7, age < 7 days   → Always included if relevant
Tier 2 (Warm):  confidence ≥ 0.5, age < 30 days  → Included if query matches
Tier 3 (Cold):  confidence ≥ 0.3, age < 90 days  → Included only if directly asked
Tier 4 (Stale): confidence < 0.3 or age > 90 days → Not returned (pending decay)
```

---

## Cost Impact Analysis

### Per-Message Cost (100 users × 10 msgs/day)

| Component | Current | Proposed | Savings |
|-----------|---------|----------|---------|
| Chat (per msg) | 3-4 LLM calls, ~4,300 tokens | 1 call + tools, ~3,000 tokens | **~55%** |
| Chat daily (100 users) | 4.3M tokens | 1.9M tokens | 2.4M tokens saved |
| Fact extraction | 3 calls per sync cycle | 1 batched call | **~66%** |
| Proactive | 4 triggers/day, many no-ops | Event-driven, no no-ops | **~70%** |
| Intel synthesis | 2 separate jobs | 1 merged job | **~40%** |

### Monthly Projection at Scale

| Users | Current (tokens/mo) | Proposed (tokens/mo) | Monthly Savings |
|-------|--------------------|--------------------|-----------------|
| 100 | ~200M | ~80M | ~$20 (Gemini Flash) |
| 1,000 | ~2B | ~800M | ~$200 |
| 10,000 | ~20B | ~8B | ~$2,000 |

Cost savings compound because:
1. Fewer LLM calls per interaction (biggest win)
2. Smaller context per call (token budget enforced)
3. KV-cache hits reduce effective token cost further
4. No-op background jobs eliminated

---

## Migration Path

### Phase 1: Compaction + Tool Result Cleanup (Quick Win)
- Add conversation compaction (summarize after 15 messages)
- Drop tool results from previous turns
- **Impact: Better accuracy on long conversations, ~20% token reduction**

### Phase 2: Collapse Chat Pipeline to Single Agent
- Replace Router+Context+Action+Response with Mira-with-tools
- Implement 11 tools with token-budgeted responses
- Keep legacy pipeline as fallback (feature flag)
- **Impact: ~55% reduction in chat LLM costs**

### Phase 3: Batch Knowledge Extraction
- Merge 3 extractors into 1 batched extractor
- Cross-source fact extraction
- **Impact: ~66% reduction in extraction costs, better fact quality**

### Phase 4: Event-Driven Proactive + Cache Optimization
- Replace cron-polling with event-triggered proactive messages
- Implement KV-cache-friendly prompt structure
- Merge morning brief + context deepening
- **Impact: ~70% reduction in background costs**

### Phase 5: Relevance Scoring + Tiered Retrieval
- Implement relevance × confidence × recency scoring
- Tiered fact retrieval (hot/warm/cold)
- **Impact: Better accuracy, slightly lower token usage**

---

## Summary: Design Principles

1. **One agent, many tools** — Mira is the single conversational agent. She fetches what she needs via tools. No more 4-agent pipeline.

2. **Just-in-time over pre-loading** — Context is retrieved on demand, not pre-assembled. The model decides what it needs. (Anthropic)

3. **Stable prefix, variable suffix** — System prompt and user profile are cached. Conversation and tool results are appended. (Manus)

4. **Compress, don't truncate** — Summarize old messages instead of dropping them. Preserve decisions, goals, preferences. (ACE paper)

5. **Token budget per layer** — Fixed budget prevents context bloat. Each tool returns ≤ 800 tokens. Total ≤ 15K per call.

6. **Event-driven background** — No polling. Sync triggers extraction. Calendar triggers prep. Time triggers brief.

7. **Batch over per-item** — One extraction call for all new data, not one per data type. Cross-source connections emerge naturally.

8. **Relevance scoring at retrieval** — Filter before context window, not after. Model never sees irrelevant facts.
