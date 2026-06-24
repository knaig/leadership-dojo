# Voice Architecture: Current vs Options A & B

## Current Architecture (Vapi)

```
                         YOUR INFRASTRUCTURE                                    VAPI'S INFRASTRUCTURE
                    ┌─────────────────────────────┐                    ┌──────────────────────────────────┐
                    │                             │                    │                                  │
                    │   leadership-coach worker    │                    │          Vapi Platform            │
                    │                             │                    │                                  │
                    │  ┌───────────────────────┐  │   HTTP POST        │  ┌────────────────────────────┐  │
                    │  │                       │  │   /call/phone      │  │                            │  │
                    │  │  buildVariableValues() │──┼──────────────────▶│  │   Vapi Orchestrator        │  │
                    │  │                       │  │   { assistantId,   │  │                            │  │
                    │  │  500+ lines of code    │  │     variables,    │  │   - Manages call lifecycle │  │
                    │  │  pre-computing ALL     │  │     firstMessage } │  │   - Routes audio           │  │
                    │  │  context into strings  │  │                    │  │   - Handles interruptions   │  │
                    │  │                       │  │                    │  │                            │  │
                    │  │  Queries:             │  │                    │  └─────────┬──────────────────┘  │
                    │  │  - Knowledge graph    │  │                    │            │                     │
                    │  │  - Coaching plan      │  │                    │            ▼                     │
                    │  │  - Stakeholder DB     │  │                    │  ┌────────────────────────────┐  │
                    │  │  - Calendar           │  │                    │  │                            │  │
                    │  │  - Personal context   │  │                    │  │   GPT-4o (Vapi's API key)  │  │
                    │  │  - Posture engine     │  │                    │  │                            │  │
                    │  │  - Thread manager     │  │                    │  │   System prompt with       │  │
                    │  │  - Hypothesis engine  │  │                    │  │   {{variables}} replaced   │  │
                    │  │                       │  │                    │  │                            │  │
                    │  └───────────────────────┘  │                    │  │   NO database access       │  │
                    │                             │                    │  │   NO tool calling           │  │
                    │                             │                    │  │   NO real-time context      │  │
                    │                             │                    │  │   Static prompt only        │  │
                    │                             │                    │  │                            │  │
                    │                             │                    │  └─────────┬──────────────────┘  │
                    │                             │                    │            │                     │
                    │                             │                    │            ▼                     │
                    │                             │                    │  ┌────────────────────────────┐  │
                    │                             │                    │  │  Deepgram STT (Vapi's key) │  │
                    │                             │                    │  │  Cartesia TTS (Vapi's key) │  │
                    │                             │                    │  │  Twilio PSTN  (Vapi's key) │  │
                    │                             │                    │  └─────────┬──────────────────┘  │
                    │                             │                    │            │                     │
                    │                             │                    └────────────┼─────────────────────┘
                    │                             │                                 │
                    │                             │                                 ▼
                    │                             │                          ┌──────────────┐
                    │                             │                          │              │
                    │                             │                          │  User Phone  │
                    │                             │                          │              │
                    │                             │                          └──────┬───────┘
                    │                             │                                 │
                    │                             │         Webhook POST            │
                    │  ┌───────────────────────┐  │◀────────────────────────────────┘
                    │  │                       │  │   { transcript, summary,
                    │  │  Post-call pipeline   │  │     duration, recordingUrl }
                    │  │                       │  │
                    │  │  - Call evaluation    │  │
                    │  │  - Onboarding detect  │  │
                    │  │  - Thread extraction  │  │
                    │  │  - Knowledge update   │  │
                    │  │  - Posture learning   │  │
                    │  │                       │  │
                    │  └───────────────────────┘  │
                    │                             │
                    └─────────────────────────────┘

COST: $0.11/min ($0.05 Vapi fee + $0.01 LLM + $0.008 STT + $0.04 TTS + $0.008 telephony)

PROBLEMS:
  1. All context pre-computed — frozen at call start
  2. No tool calling — Mira can't look up data mid-conversation
  3. Token bloat — 50+ variables stuffed into system prompt
  4. Vapi controls the LLM — you can't use your own Gemini key
  5. $0.05/min platform tax for hosting ~300 lines of glue code
  6. No Indian language support (Vapi doesn't support Hindi TTS well)
  7. Vendor lock-in on telephony (Twilio only, no Vobiz/Plivo)
```

---

## Option A: Separate Voice Server + Tool Callbacks

```
                YOUR INFRASTRUCTURE                                         YOUR INFRASTRUCTURE
          ┌─────────────────────────────┐                            ┌──────────────────────────────┐
          │                             │                            │                              │
          │   leadership-coach worker    │                            │   karthikVoicEra-server      │
          │                             │                            │   (Pipecat + Vobiz)          │
          │  ┌───────────────────────┐  │   HTTP POST                │                              │
          │  │                       │  │   /call/outbound           │  ┌────────────────────────┐  │
          │  │  buildVariableValues() │──┼───────────────────────────▶│  │                        │  │
          │  │  (lighter version)    │  │   { systemPrompt,          │  │   Pipecat Pipeline     │  │
          │  │                       │  │     variables,             │  │                        │  │
          │  │  Still pre-computes   │  │     greeting,              │  │   Audio ──▶ Deepgram   │  │
          │  │  core context but     │  │     tools: [...],          │  │              (your key) │  │
          │  │  NOT everything       │  │     toolCallbackUrl }      │  │                        │  │
          │  │                       │  │                            │  │   Text ──▶ Gemini Flash │  │
          │  └───────────────────────┘  │                            │  │              (your key) │  │
          │                             │                            │  │                        │  │
          │                             │    ┌───────────────────┐   │  │   Text ──▶ Cartesia    │  │
          │                             │    │                   │   │  │              (your key) │  │
          │  ┌───────────────────────┐  │    │  Tool Call Flow   │   │  │                        │  │
          │  │                       │  │    │                   │   │  │   Audio ──▶ Vobiz      │  │
          │  │  Tool Callback API    │◀─┼────│  LLM decides to   │◀──┤  │              (your key) │  │
          │  │  /api/voice/tools     │  │    │  call a function  │   │  │                        │  │
          │  │                       │  │    │                   │   │  └────────────┬───────────┘  │
          │  │  lookup_stakeholder() │──┼────│  ~200-500ms       │──▶│               │              │
          │  │  check_calendar()     │  │    │  round trip       │   │               │              │
          │  │  create_commitment()  │  │    │                   │   │               ▼              │
          │  │  query_knowledge()    │  │    └───────────────────┘   │        ┌──────────────┐      │
          │  │  update_stakeholder() │  │                            │        │              │      │
          │  │                       │  │                            │        │  User Phone  │      │
          │  └───────────────────────┘  │                            │        │              │      │
          │                             │                            │        └──────────────┘      │
          │                             │         Webhook POST       │                              │
          │  ┌───────────────────────┐  │◀───────────────────────────┤  Post-call:                  │
          │  │                       │  │   { transcript, duration,  │  sends transcript + metadata │
          │  │  Post-call pipeline   │  │     callId, metadata }     │                              │
          │  │  (same as before)     │  │                            │                              │
          │  └───────────────────────┘  │                            └──────────────────────────────┘
          │                             │
          └─────────────────────────────┘

COST: $0.03/min ($0 platform + $0.005 Gemini + $0.008 STT + $0.004 TTS + $0.006 Vobiz)

  Current: $0.11/min  ──▶  Option A: $0.03/min  (3.7x cheaper)
  50 users × 5min/day: $825/mo ──▶ $131/mo

WHAT CHANGES:
  + Your own API keys for everything — no markup
  + Tool calling during conversation (LLM calls back to your worker)
  + Indian language support (Bhashini, Sarvam, AI4Bharat available)
  + Vobiz telephony ($0.006/min vs Twilio $0.008/min)
  + Reusable for other projects

TRADEOFFS:
  - Tool calls add 200-500ms latency (HTTP round trip between services)
  - Two services to deploy and monitor (worker + voice server)
  - Pre-computed context still needed for system prompt baseline
  - Voice server has no DB access — can't do complex queries directly
  - Need to define tool schemas and callback handlers
```

---

## Option B: Voice Pipeline Inside the Worker

```
                              YOUR INFRASTRUCTURE (single service)
          ┌──────────────────────────────────────────────────────────────────────┐
          │                                                                      │
          │                    leadership-coach worker                            │
          │                                                                      │
          │  ┌──────────────────────────────────────────────────────────────┐    │
          │  │                                                              │    │
          │  │                   Voice Pipeline (in-process)                │    │
          │  │                                                              │    │
          │  │   Vobiz WebSocket ◀──────▶ Audio Stream                     │    │
          │  │         │                                                    │    │
          │  │         ▼                                                    │    │
          │  │   ┌──────────┐    ┌──────────────┐    ┌──────────┐          │    │
          │  │   │ Deepgram │───▶│ Gemini Flash │───▶│ Cartesia │          │    │
          │  │   │   STT    │    │    LLM       │    │   TTS    │          │    │
          │  │   │(your key)│    │  (your key)  │    │(your key)│          │    │
          │  │   └──────────┘    └──────┬───────┘    └──────────┘          │    │
          │  │                          │                                   │    │
          │  │                          │ Function calls                    │    │
          │  │                          │ (in-process, <1ms)               │    │
          │  │                          ▼                                   │    │
          │  │               ┌──────────────────────┐                      │    │
          │  │               │                      │                      │    │
          │  │               │   Direct DB Access   │                      │    │
          │  │               │                      │                      │    │
          │  │               │   prisma.stakeholder  │                      │    │
          │  │               │     .findUnique()    │                      │    │
          │  │               │                      │                      │    │
          │  │               │   Zero latency       │                      │    │
          │  │               │   Full context        │                      │    │
          │  │               │   Real-time queries   │                      │    │
          │  │               │                      │                      │    │
          │  │               └──────────────────────┘                      │    │
          │  │                                                              │    │
          │  └──────────────────────────────────────────────────────────────┘    │
          │                                                                      │
          │  ┌──────────────────────────────────────────────────────────────┐    │
          │  │                                                              │    │
          │  │   Everything else (already exists)                           │    │
          │  │                                                              │    │
          │  │   - Call scheduling + day planner                           │    │
          │  │   - Posture engine + signal collector                       │    │
          │  │   - buildVariableValues() → NOT NEEDED (LLM queries live)  │    │
          │  │   - Post-call evaluation                                    │    │
          │  │   - Knowledge graph extraction                              │    │
          │  │   - Calendar/email/drive sync                               │    │
          │  │   - Coaching relationship management                        │    │
          │  │                                                              │    │
          │  └──────────────────────────────────────────────────────────────┘    │
          │                                                                      │
          └──────────────────────────────────────────────────────────────────────┘
                    │
                    │  Vobiz WebSocket (audio)
                    ▼
            ┌──────────────┐
            │              │
            │  User Phone  │
            │              │
            └──────────────┘

COST: $0.03/min (same as Option A — same providers, same rates)

WHAT CHANGES vs OPTION A:
  + Tool calls are in-process function calls (<1ms, not 200-500ms HTTP)
  + No pre-computed context needed — LLM queries DB in real-time
  + Single service to deploy (worker handles both voice + background jobs)
  + buildVariableValues() becomes unnecessary — LLM has live access
  + Mid-call adaptation (posture shift, new info surfaces, context updates)

TRADEOFFS:
  - Worker is Node.js/TypeScript — Pipecat is Python
    Must either:
    (a) Rewrite audio pipeline in Node.js (~2 weeks)
    (b) Run Python subprocess from Node worker (messy)
    (c) Rewrite worker in Python (massive effort)
  - Voice pipeline is CPU-intensive (audio processing, VAD)
    Could affect background job performance on same process
  - Not reusable for other projects (tightly coupled to leadership-coach)
  - Pipecat's audio handling (VAD, interruptions, resampling) is battle-tested
    Rewriting in Node means re-solving solved problems
  - Single point of failure — voice calls and background jobs share resources
```

---

## Comparison Table

```
                          │  Current (Vapi)  │  Option A (Separate)  │  Option B (In-Worker)
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
Cost per minute           │  $0.11           │  $0.03                │  $0.03
Monthly (50 users)        │  $825            │  $131                 │  $131
Platform fee              │  $0.05/min       │  $0                   │  $0
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
LLM during call           │  Vapi's key      │  Your key             │  Your key
Tool calling              │  No              │  Yes (200-500ms)      │  Yes (<1ms)
Real-time DB access       │  No              │  Via HTTP callback    │  Direct (in-process)
Mid-call context update   │  No              │  Partial              │  Full
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
Pre-computed context      │  Required (all)  │  Required (baseline)  │  Not needed
buildVariableValues()     │  500+ lines      │  Lighter version      │  Can eliminate
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
Indian languages          │  No              │  Yes (Bhashini etc.)  │  Yes
Telephony                 │  Twilio only     │  Vobiz/Plivo/any      │  Vobiz/Plivo/any
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
Reusable for other apps   │  N/A             │  Yes                  │  No
Services to deploy        │  1 (worker)      │  2 (worker + voice)   │  1 (worker)
Language mismatch         │  N/A             │  None (Python server) │  Node vs Python
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────
Build effort              │  Done            │  ~2-3 days            │  ~2-3 weeks
Risk                      │  Vendor lock-in  │  Low                  │  Medium (rewrite)
──────────────────────────┼──────────────────┼───────────────────────┼──────────────────────

RECOMMENDATION:
  Now     → Option A (separate server, 2-3 days, 3.7x cheaper)
  Later   → Option B if tool-call latency becomes a UX problem
            (unlikely for coaching — 300ms "thinking" is natural)
```
