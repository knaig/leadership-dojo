# Mira Product Gap Tracker

Last updated: 2026-03-10

## Status legend
- [x] Done (shipped)
- [~] Partial (exists but incomplete)
- [ ] Not built

---

## PILLAR 1: Which meetings matter

| # | Requirement | Status | Implementation | Files |
|---|-----------|--------|---------------|-------|
| 1.1 | AI classifies meetings automatically | [~] | Keyword-based classifier (14 keywords). No semantic understanding. | `worker/src/agents/calendar-sync.ts:231` |
| 1.2 | Show AI classification as recommendation (approve/reject) | [ ] | UI shows "Edit classification" but no recommendation flow | `web/components/v2/TodayBrief.tsx` (StrategicMeetingView) |
| 1.3 | Actionable NM ratio guidance (decline/merge suggestions) | [ ] | Shows number only, no prescriptions | Needs new component |
| 1.4 | Duplicate/redundant meeting detection | [ ] | Not built | Needs new agent |
| 1.5 | Calendar write-back (suggest times, propose cancellations) | [ ] | Read-only calendar | Needs Google Calendar write API |
| 1.6 | Auto-suggest outcomes based on meeting context | [ ] | Mira asks but user must type from scratch. No one-tap suggestions. | `worker/src/agents/proactive-agent.ts:577` |

## PILLAR 2: How to steer meetings

| # | Requirement | Status | Implementation | Files |
|---|-----------|--------|---------------|-------|
| 2.1 | Platform Gemini key (no user API key needed) | [x] | Auto-provisions first 50 users with platform key (10M tokens/mo) | `worker/src/lib/user-llm.ts:105-130` |
| 2.2 | Talking points personalized per meeting (not generic) | [~] | Edge tips generated via Gemini with 4s timeout. Falls back to generic. Not persisted. | `web/app/api/meetings/gameplan/route.ts:100-171` |
| 2.3 | Meeting context specific, not generic PM advice | [~] | Confidence score exists but low-confidence meetings get padded with generic advice | `web/app/api/meetings/gameplan/route.ts:534` |
| 2.4 | Pre-meeting briefing pushed proactively | [~] | Push notification exists. No in-app briefing card. | `worker/src/agents/proactive-agent.ts:700-850` |
| 2.5 | People intel feeds directly into prep chat context | [ ] | PeopleIntelHub sits as separate panel. Prep chat doesn't pull stakeholder playbook. | `worker/src/agents/multi-agent/context-agent.ts` |
| 2.6 | Live meeting support (agenda, timer, prompts) | [ ] | Not built | Major feature |

## PILLAR 3: Effectiveness feedback

| # | Requirement | Status | Implementation | Files |
|---|-----------|--------|---------------|-------|
| 3.1 | Outcome tracking (LANDED/PARTIAL/MISSED) | [x] | Manual via UI buttons or chat response. Post-meeting review fires 15min-2h after. | `web/components/v2/TodayBrief.tsx`, `worker/src/agents/proactive-agent.ts` |
| 3.2 | Post-meeting intelligence (transcript analysis) | [~] | Fetches Gemini meeting notes from Drive. No transcript, no recording, no sentiment. | `worker/src/services/meeting-notes-service.ts` |
| 3.3 | Action items auto-extracted | [~] | Only from user chat responses during POST_MEETING_REVIEW, not from transcripts | `worker/src/agents/multi-agent/action-agent.ts` |
| 3.4 | Goals being set (adoption) | [ ] | Every meeting shows "No goal." No friction-free one-tap goal acceptance. | `worker/src/agents/proactive-agent.ts:577` |
| 3.5 | Effectiveness dashboard shows real data | [~] | Computed weekly via MeetingPatternSnapshot. Empty when no goals set (chicken-and-egg). | `worker/src/agents/meeting-champion.ts`, `web/app/v2/wins/page.tsx` |
| 3.6 | Commitment tracking and follow-through | [x] | Reminders, status updates, weekly ratio. Push notifications for due/overdue. | `worker/src/agents/proactive-agent.ts` (commitments section) |

## CROSS-CUTTING

| # | Requirement | Status | Implementation | Files |
|---|-----------|--------|---------------|-------|
| X.1 | Org-level grouping of stakeholders | [x] | Org inferred from email domains during calendar sync. PeopleIntelHub groups by org. | `worker/src/agents/calendar-sync.ts:300-378`, `web/components/v2/PeopleIntelHub.tsx` |
| X.2 | Stakeholder enrichment runs automatically | [~] | Runs daily at 13:00 UTC. Only enriches meeting attendees, not all contacts. | `worker/src/agents/stakeholder-enrichment-agent.ts` |
| X.3 | Mira works without user API key | [x] | Platform Gemini key auto-provisioned for first 50 users. | `worker/src/lib/user-llm.ts:105-130` |
| X.4 | People deduplication (same person, multiple emails) | [x] | Post-sync dedup merges stakeholders by normalized name (corporate email canonical). | `worker/src/agents/calendar-sync.ts:400-470` |
| X.5 | Admin panel shows per-user LLM usage | [x] | Token usage bars, platform user count, total consumption. | `web/app/admin/page.tsx`, `web/app/api/admin/dashboard/route.ts` |
| X.6 | Email signature parsing for org/role enrichment | [ ] | Email sync only fetches metadata, not bodies. Need `format: 'full'` + signature regex. | `worker/src/agents/email-sync.ts` |
| X.7 | Relocated dashboard features | [x] | Meeting Blueprint → /meetings, Time Split → /wins. Excellence Cards still computed but not rendered. | `web/components/meetings/MeetingBlueprint.tsx`, `web/app/v2/wins/page.tsx` |
| X.8 | Correction learning (user overrides → system learns) | [x] | Generic service records corrections, queries past corrections before predictions, shows inline "Mira learned" acknowledgment. Meeting classification + stakeholder profile edits both wired in. API for viewing/deleting learned corrections. | `worker/src/lib/correction-learning.ts`, `web/lib/correction-learning.ts`, `web/app/api/corrections/route.ts` |
| X.9 | Stakeholder inline editing | [x] | PeopleIntelHub has inline edit panel for role, org, persona archetype, stance, power level. PATCH endpoint validates fields, records corrections for AI-generated fields. | `web/components/v2/PeopleIntelHub.tsx`, `web/app/api/context/stakeholders/[id]/route.ts` |

---

## Execution Priority

### P0 — Done
- [x] X.3: Platform Gemini key for all users
- [x] X.1: Org identification from email domains
- [x] X.4: People deduplication
- [x] X.5: Admin panel usage tracking
- [x] X.7: Feature relocation (blueprint, time split)
- [x] 2.1: Platform API key (same as X.3)
- [x] X.8: Correction learning system (generic, cross-agent)
- [x] X.9: Stakeholder inline editing with learning

### P1 — Next
- [ ] 1.1: LLM-based meeting classification (replace keyword matcher)
- [ ] 1.2: Show AI classification as recommendation with approve/reject
- [ ] 1.6 / 3.4: Auto-suggest outcomes + one-tap accept
- [ ] 2.2: Pre-generate and persist edge tips (not on-the-fly with 4s timeout)
- [ ] 2.5: Inject stakeholder playbook into prep chat context
- [ ] X.6: Email signature parsing for org/role

### P2 — After P1
- [ ] 1.3: Actionable NM ratio guidance
- [ ] 1.4: Duplicate meeting detection
- [ ] 2.3: Honest confidence display
- [ ] 2.4: In-app briefing card
- [ ] 3.2 / 3.3: Transcript integration + auto action item extraction

### P3 — Future
- [ ] 1.5: Calendar write-back
- [ ] 2.6: Live meeting support
