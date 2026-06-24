# Conversation Control Plane — Requirements

**Status:** Design
**Priority:** P1 — Required before conversation engine can iterate at speed
**Last Updated:** 2026-03-10

---

## Problem

Every tunable aspect of Mira's behavior — prompts, confidence thresholds, adaptation rules, segment structures, guardrails, delivery timing, persona tone — is hardcoded across 6+ TypeScript files. Changing how call 1 opens requires editing `vapi-voice.ts`, redeploying the worker to Render, and hoping it works. There is no way to preview what a user will experience, no way to compare two approaches, and no way to observe what actually happened on a call without reading raw transcripts.

Langfuse is integrated but unused. The admin panel manages users and coupons. Nothing manages Mira's actual behavior.

This must change before the conversation engine ships. Iterating on prompts and call structures through code deploys is too slow for a solo developer who needs to test 10+ variations in the first month.

---

## What This Tool Is

A single admin interface that controls, previews, tests, and observes everything about how Mira talks to users — across voice calls, chat, proactive coaching, and push notifications.

It is NOT a generic prompt management platform. It is purpose-built for Mira's specific pipeline: data assembly → prompt construction → LLM execution → post-processing → learning.

---

## Requirements

### 1. Configuration Layer

Everything that controls Mira's behavior lives in the database, versioned and editable from the admin panel. No behavioral logic hardcoded in .ts files.

#### 1.1 Prompt Templates

1. Store all system prompts as versioned records in a `PromptTemplate` table. Each record has: name, version number, content (the prompt text), status (draft/active/archived), created/updated timestamps.
2. Support template variables using `{{variableName}}` syntax. The pre-call pipeline fills these at runtime from user data.
3. Support conditional blocks using `{{#if condition}}...{{/if}}` syntax for maturity-level-aware and mode-aware prompt sections.
4. Every prompt that currently exists hardcoded must be extractable to this system. The initial set:
   - Voice call system prompts (per assistant type: onboarding, daily, meeting)
   - Mira persona definition (traits, tone, humor, avoid-list)
   - Proactive coaching prompts (morning brief, pre-meeting prep, post-meeting review, context deepening, pattern detection, Friday ritual, weekly reflection)
   - Chat pipeline prompts (router agent, context agent, action agent, response agent)
   - Post-call extraction prompt
   - Confidence tier enforcement instructions
   - Closed-world rules and ban list
   - Segment structure instructions (per call type × mode × maturity)
5. Only one version of each prompt can be "active" at a time for the default population. But specific users can be assigned override versions (see experimentation, requirement 5).
6. Editing a prompt creates a new version. Old versions are never mutated — they are archived. Full history is preserved.
7. Prompts should support a "notes" field where the admin can record why a change was made.

#### 1.2 Confidence Thresholds

8. Store confidence tier thresholds (SILENT, PROBE, SUGGEST, ASSERT) as a configurable JSON object, not hardcoded constants.
9. Support per-archetype threshold overrides (e.g., stricter for Skeptic, looser for Navigator) as part of the same config.
10. Store the tier transition deltas (confirmation boost, correction penalty, decay rate) as configurable values.
11. These values should be editable from the admin panel with a simple form — not a raw JSON editor.

#### 1.3 Adaptation Rules

12. Store archetype detection signal definitions as configurable rules. Each rule maps a behavioral signal (e.g., "call duration < 3 min") to an archetype direction (e.g., "work_first_lean").
13. Store adaptation signal weights — how strongly each signal pushes toward a mode or archetype.
14. Store the maturity transition triggers (calls completed, stakeholders at tier, confirmations, correction rate) as configurable thresholds.
15. Store call structure templates (segment sequences per mode × maturity) as configurable JSON, not hardcoded arrays.

#### 1.4 Delivery Configuration

16. Store proactive coaching trigger schedules (cron expressions, enable/disable per trigger type) in the database. Currently these are hardcoded in `worker/src/index.ts`.
17. Store delivery channel preferences per trigger type (which triggers can use voice, push, email, in-app).
18. Store the delivery guard rules (quiet hours, max calls, meeting-aware suppression) as configurable parameters.

#### 1.5 Guardrails

19. Store the closed-world rules as a configurable text block that gets injected into every prompt.
20. Store the ban list (generic advice that Mira must never say) as an editable list.
21. Store the specificity test criteria as configurable rules.
22. Store personal boundary rules (max references per call, NEVER reference from email/calendar, off-limits handling) as configurable text.

#### 1.6 Question Banks

23. Store question banks organized by type (open, reflective, scaling, story, binary+why) and purpose (onboarding, stakeholder probe, outcome ask, personal plant, coaching).
24. Each question should have: text, type, purpose, minimum maturity level, minimum call number, applicable modes (work-first, relationship-first, freeform).
25. The pre-call pipeline selects questions from this bank based on the user's current state, rather than using hardcoded question strings.

---

### 2. Preview

The ability to see exactly what Mira would say to a specific user before any call happens.

26. Given a user ID, call type, and date — render the complete system prompt + variable values payload that would be sent to Vapi (or the chat pipeline). Show the final assembled prompt, not just the template.
27. Show which prompt template version is being used, which confidence tiers apply to each stakeholder, which adaptation signals are active, which segment structure was selected, and which questions were chosen.
28. Allow the admin to override any variable value in the preview to test hypotheticals ("what if this user had 12 meetings today?" or "what if they were in COACHING maturity?").
29. Show a diff view when comparing two prompt versions applied to the same user state.
30. Preview must work for all prompt types: voice calls, chat pipeline, proactive coaching, post-call extraction.

---

### 3. Observation

Every interaction Mira has with a user is recorded with full context, so the admin can understand what happened and why.

31. Every voice call records: the prompt template version used, the full assembled system prompt sent to Vapi, the complete variable values payload, the transcript received, and the post-call extraction results.
32. Every chat message records: the prompt template version used per agent (router, context, action, response), the context retrieved, and the final response.
33. Every proactive coaching delivery records: the prompt template version, the assembled prompt, the content delivered, and the user's response (if any).
34. Admin panel shows a per-user timeline of all interactions (voice calls, chat messages, proactive prompts, push notifications) with the ability to drill into any one and see full context.
35. Admin panel shows aggregate metrics across all users for a given prompt version: average call duration, user talk ratio, early hangup rate, correction rate, engagement rate. This tells you whether a prompt change helped or hurt.
36. Admin panel can filter interactions by: prompt version, call type, maturity level, conversation mode, archetype, date range, specific user.
37. For voice calls specifically, show the mapping between what was in the segment plan and what actually happened in the transcript. Did the LLM follow the structure? Which segments were covered? This is manual observation, not automated — just show the prompt plan alongside the transcript.

---

### 4. Call Replay and Prompt Testing

38. For any past call, show the full input (prompt + variables) alongside the transcript. Then allow the admin to edit the prompt and see "what would have changed" — re-render the prompt with the new template but same variable values. This does NOT re-run the LLM call; it just shows the new prompt for manual comparison.
39. Create a "test call" mode: assemble a prompt for a real user's current state, but instead of triggering a Vapi call, send it to a text-based LLM call (Gemini/GPT) with a simulated user response. This is cheap prompt testing without burning real phone calls.
40. Store a library of "test scenarios" — predefined user states (new user day 1, Wartime Operator week 2, Juggler month 2, etc.) that can be used to test any prompt template against realistic inputs.

---

### 5. Experimentation

41. Assign specific prompt template versions to specific users. User A gets the "strong opener" version, user B gets the "soft opener" version. The pre-call pipeline reads the user's assigned version first, falls back to the global active version.
42. Create named experiments: a label (e.g., "call-1-opener-v2"), a set of user assignments, a start/end date, and a hypothesis. The admin panel shows metrics for each experiment group side by side.
43. Experiments should work across all prompt types, not just voice calls. You should be able to experiment with chat pipeline prompts, proactive coaching tone, and confidence thresholds.
44. Keep experiments simple. This is not a statistically rigorous A/B testing platform — it is a tool for a solo developer with 10-20 users to try two approaches and see which transcripts look better. No p-values needed. Just side-by-side comparison.

---

### 6. Guardrail Validation

45. Before activating a new prompt version, run it against the last N call inputs (stored from observation layer) and check: does the new prompt still include closed-world rules? Does it still include the ban list? Does the template parse correctly with all expected variables?
46. Flag any prompt version that is missing required sections (closed-world rules, confidence tier enforcement, ban list). These are non-negotiable guardrails that must be present in every voice call and chat prompt.
47. Provide a "lint" function that checks a prompt template for common issues: undefined variables, unclosed conditional blocks, missing required sections, prompt length exceeding token limits.

---

### 7. Langfuse Integration

48. Use the existing Langfuse integration (`worker/src/lib/langfuse.ts`) as the observability backend. Every LLM call (voice prompt assembly, chat pipeline, post-call extraction) should be traced in Langfuse with the prompt version, input, output, and metadata.
49. The admin panel links to Langfuse traces for detailed token-level inspection when needed.
50. Prompt templates can optionally be synced to Langfuse for their prompt management features, but the database remains the source of truth. Langfuse is for observability, the admin panel is for management.

---

### 8. Data Model

51. `PromptTemplate` — id, name (unique key like "voice-daily-morning"), version (auto-incrementing per name), content (text), variables (JSON schema of expected variables), status (draft/active/archived), notes, createdAt, updatedAt.
52. `ConversationConfig` — id, version, confidenceThresholds (JSON), adaptationRules (JSON), maturityTransitions (JSON), segmentStructures (JSON), deliveryConfig (JSON), guardrails (JSON), status (draft/active/archived), notes, createdAt.
53. `QuestionBank` — id, text, type (open/reflective/scaling/story/binary), purpose (onboarding/stakeholder_probe/outcome_ask/personal_plant/coaching), minMaturity (LEARNING/OBSERVING/COACHING), minCallNumber, applicableModes (JSON array), active (boolean).
54. `CallRecord` — id, userId, callType, promptTemplateId, configVersion, assembledPrompt (full text sent), variableValues (JSON), transcript, postCallExtraction (JSON), duration, createdAt. (This may partially overlap with existing VoiceCall model — extend rather than duplicate.)
55. `Experiment` — id, name, hypothesis, promptTemplateId (or configVersion), userAssignments (JSON array of userIds), startDate, endDate, status (active/completed), notes.
56. Extend existing `VoiceCall` model with: promptTemplateVersion, configVersion, assembledPromptHash (for linking without storing full text twice).
57. Extend existing `Message` model (chat) with: routerPromptVersion, contextPromptVersion, actionPromptVersion, responsePromptVersion.

---

### 9. Admin UI Pages

58. **Prompts page** — List all prompt templates grouped by type (voice/chat/proactive/extraction). Click to view versions. Edit to create new version. Activate/archive. Side-by-side diff between versions.
59. **Config page** — Edit confidence thresholds, adaptation rules, maturity transitions, segment structures, delivery config, guardrails. Form-based, not raw JSON (though raw JSON view available for power use).
60. **Questions page** — CRUD for question bank. Filter by type, purpose, mode, maturity. Bulk enable/disable.
61. **Preview page** — Select a user and call type. See the fully assembled prompt. Override variables. Compare prompt versions. "Test call" button for simulated LLM response.
62. **Observation page** — Per-user interaction timeline. Filter by type, date range, prompt version. Drill into any interaction for full context. Aggregate metrics per prompt version.
63. **Experiments page** — Create/manage experiments. Assign users. View side-by-side metrics. Link to relevant observation data.
64. **Guardrail page** — Edit closed-world rules, ban list, specificity test, personal boundary rules. Lint checker for all active prompts. Validation report showing which prompts pass/fail.

---

### 10. Migration Path

The control plane must be built incrementally without breaking existing functionality. At every phase, the system falls back to the current hardcoded behavior if no database config exists.

65. **Phase 1 — Prompt storage + preview (1-2 days).** Create `PromptTemplate` table. Seed it with current hardcoded prompts. Build the preview endpoint. Build a minimal admin page that lists prompts and shows preview. The worker still reads from hardcoded files — this phase is read-only.
66. **Phase 2 — Wire prompts to pipeline (1-2 days).** Modify `buildVariableValues()` and voice call trigger to read from `PromptTemplate` table instead of hardcoded strings. Fallback: if no active template found, use hardcoded default. Modify chat pipeline agents to read prompts from DB. Same fallback pattern.
67. **Phase 3 — Observation (1 day).** Extend `VoiceCall` and `Message` models with prompt version fields. Record full assembled prompt + variables on every call. Build the observation page in admin.
68. **Phase 4 — Config extraction (1-2 days).** Create `ConversationConfig` table. Extract confidence thresholds, adaptation rules, segment structures from code into DB. Build the config admin page.
69. **Phase 5 — Experimentation (1 day).** Create `Experiment` table. Build user assignment logic in pre-call pipeline. Build experiment admin page with side-by-side comparison.
70. **Phase 6 — Question bank + guardrail validation (1 day).** Create `QuestionBank` table. Build question selection logic. Build guardrail lint checker. Build guardrail admin page.
71. **Phase 7 — Langfuse wiring (half day).** Wire all LLM calls through Langfuse tracing with prompt version metadata. Link admin panel to Langfuse traces.

Total estimated effort: 7-10 days for a solo developer who knows the codebase. Phases 1-3 are the highest priority and should ship before the conversation engine goes live with real users.

---

## What This Enables

With this control plane in place:

- Changing how call 1 opens takes 30 seconds in the admin panel, not a code deploy.
- You can preview what your CTO will hear tomorrow morning before it happens.
- After every call, you can see exactly what Mira was told, what she said, and what the user did — and decide if the prompt needs adjustment.
- You can try a different approach for one user without affecting everyone else.
- When the conversation engine confidence thresholds feel wrong, you adjust a number in a form, not a constant in a .ts file.
- When you add a new question to the bank, it's available to the next call without a deploy.
- When something goes wrong, you can trace exactly which prompt version and config was responsible.

---

## What This Is NOT

- Not a generic LLM ops platform. It is specific to Mira's pipeline.
- Not a visual prompt builder with drag-and-drop. It is a text editor with preview and observation.
- Not a statistical A/B testing engine. It is a comparison tool for a solo developer with small user counts.
- Not a replacement for Langfuse. Langfuse handles token-level tracing. This handles behavior-level management.

---

## Depends On

- Existing Prisma schema + admin panel infrastructure
- Existing Langfuse integration (worker/src/lib/langfuse.ts)
- Existing Vapi voice call pipeline (worker/src/lib/vapi-voice.ts)
- Existing chat pipeline (worker/src/agents/multi-agent/)
- Existing proactive agent (worker/src/agents/proactive-agent.ts)

## Blocks

- Conversation engine implementation (cannot iterate on prompts at speed without this)
- Calls 1-3 engagement strategy (cannot test variations without preview + observation)
- Archetype detection tuning (cannot adjust thresholds without config layer)
- Confidence engine calibration (cannot tune without observable outcomes)
