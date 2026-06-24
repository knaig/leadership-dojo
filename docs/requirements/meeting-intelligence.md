# Meeting Intelligence - Requirements & Traceability

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked

---

## R1: User Identity in Meetings
**Priority**: P0 | **Status**: [x] Complete

### Requirements
- R1.1: [x] Fetch user email from DB to identify self among attendees
- R1.2: [x] Filter self out of attendee list (by email AND name)
- R1.3: [x] Handle partial matches (e.g., "karthik" matches "karthik@coss.org.in")

### Files Changed
- `web/app/api/meetings/gameplan/route.ts` — `isSelf()` helper, user email fetch

### Verification
- [ ] User does not appear in their own attendee list
- [ ] Works for both email and display name matches

---

## R2: Stakeholder Intelligence in Meetings
**Priority**: P0 | **Status**: [x] Complete (lookup), [~] Data population

### Requirements
- R2.1: [x] Look up StakeholderProfile by email (not just KnowledgeEntity by name)
- R2.2: [x] Look up StakeholderProfile by name (case-insensitive fallback)
- R2.3: [x] Include StakeholderIntelligence (successPatterns, objectionPatterns, recentTopics)
- R2.4: [ ] Show "Still learning" ONLY when genuinely no data — with a prompt to add context
- R2.5: [ ] Allow user to add stakeholder context inline from meeting card

### Files Changed
- `web/app/api/meetings/gameplan/route.ts` — dual lookup, intel merge

### Gap
- Stakeholder profiles may not exist for many attendees yet
- Need proactive prompts to ask user about unknown attendees

---

## R3: Meeting Description & Context
**Priority**: P0 | **Status**: [x] Partial

### Requirements
- R3.1: [x] Use meeting description in stakes inference (vendor, SLA, contract keywords)
- R3.2: [x] Pass meeting description to edge generation prompt
- R3.3: [ ] Show meeting description in the MeetingCard UI
- R3.4: [ ] Use description to infer meeting purpose/type (review, standup, negotiation)
- R3.5: [ ] Cross-reference description with project intelligence to identify which project

### Files Changed
- `web/app/api/meetings/gameplan/route.ts` — inferStakes(), generateEdges()

---

## R4: Edge Generation Quality
**Priority**: P0 | **Status**: [~] In progress

### Requirements
- R4.1: [ ] Edge MUST only reference people who are in the attendee list
- R4.2: [ ] Edge must be grounded in actual intelligence, not hallucinated
- R4.3: [ ] If no intelligence exists, say "Add context to get an edge" instead of hallucinating
- R4.4: [x] Include attendee roles in edge prompt
- R4.5: [x] Include meeting description in edge prompt
- R4.6: [ ] Include project context in edge prompt
- R4.7: [ ] Include org/domain context in edge prompt

### Files Changed
- `web/app/api/meetings/gameplan/route.ts` — generateEdges()

---

## R5: User's Role in Meeting
**Priority**: P1 | **Status**: [ ] Not started

### Requirements
- R5.1: [ ] Determine user's role: organizer, participant, presenter, reviewer
- R5.2: [ ] Cross-reference with project intelligence (projectSnapshot.userRole)
- R5.3: [ ] Show role context in MeetingCard ("You're the project lead")
- R5.4: [ ] Tailor edge/tip based on role (organizer = steer, participant = influence)

### Data Sources
- Calendar event: organizer field
- UserIntelligence.profile.projectSnapshot[project].userRole
- Meeting title patterns ("review" = reviewer, "standup" = participant)

---

## R6: Meeting Steering & Scenario Planning (Level 2 Depth)
**Priority**: P1 | **Status**: [ ] Not started

### Requirements
- R6.1: [ ] "How to steer" section for high-stakes meetings
- R6.2: [ ] Scenario planning: best case, worst case, most likely
- R6.3: [ ] Stakeholder reaction predictions per scenario
- R6.4: [ ] "Influence without authority" tactics based on attendee dynamics
- R6.5: [ ] Only show when user clicks "Deep Prep" or expands Level 2
- R6.6: [ ] Use existing Scenario model (schema has it)

### Data Sources
- Scenario model (probability, bestCase, worstCase, mostLikely, stakeholderReactions)
- StakeholderProfile (powerLevel, influenceRole, politicalStance)
- ConversationPrep (anticipatedObjections, keyMessages)

---

## R7: Confidence Indicators
**Priority**: P1 | **Status**: [ ] Not started

### Requirements
- R7.1: [ ] Per-stakeholder confidence: how well does AI know this person (0-100%)
- R7.2: [ ] Per-project confidence: how well does AI understand this project
- R7.3: [ ] Per-meeting confidence: overall readiness score
- R7.4: [ ] Show as visual indicators (bars/dots) on meeting cards
- R7.5: [ ] Clicking low-confidence triggers context-gathering chat
- R7.6: [ ] Confidence sliders: user can correct AI's confidence assessment
- R7.7: [ ] Slider changes inform what proactive questions to ask next

### Data Sources
- KnowledgeFact count per entity + average confidence
- StakeholderIntelligence.evidenceCount
- UserIntelligence.overallConfidence + dataPointCount

---

## R8: Proactive Messaging Strategy
**Priority**: P1 | **Status**: [~] Feedback loop complete, strategy partial

### Requirements
- R8.1: [x] Tribal knowledge capture: politics, on-ground realities, stakeholder dynamics
- R8.2: [ ] Ask about unknown attendees before meetings (not after)
- R8.3: [ ] Fatigue detection: track response rate, time-to-respond, message dismissals
- R8.4: [ ] Engagement scoring: classify user as engaged/neutral/fatigued
- R8.5: [ ] Adaptive frequency: reduce messages when fatigued, increase when engaged
- R8.6: [ ] Never repeat questions the user has already answered
- R8.7: [ ] Priority-ranked question queue (highest-value gaps first)
- R8.8: [ ] Verify learned facts with user periodically ("Is this still true?")
- R8.9: [x] Track which proactive messages led to user action (resultedInAction)

### Files Changed
- `worker/src/agents/knowledge/chat-fact-extractor.ts` — feedback loop (responded, resultedInAction)
- `worker/src/agents/knowledge/chat-fact-extractor.ts` — stakeholder routing from chat
- `worker/src/agents/knowledge/chat-fact-extractor.ts` — expanded predicates for tribal knowledge

### Current State
- ProactivePrompt.responded NOW updated when user replies to a prompt
- ProactivePrompt.resultedInAction NOW set based on response substance
- Chat facts now route to StakeholderProfile (creates profile if missing)
- Expanded predicates: responds_well_to, objects_to, political_stance, etc.
- Context deepening runs daily but doesn't prioritize gaps

---

## R9: Organization & Domain Intelligence
**Priority**: P2 | **Status**: [x] Synthesis agent built

### Requirements
- R9.1: [x] Populate DomainContext from knowledge graph (org facts, team facts, user-stated)
- R9.2: [x] Learn org culture, unwritten rules from chat (DomainLearning)
- R9.3: [ ] Surface org context in meeting prep ("At [org], decisions go through...")
- R9.4: [x] Domain vocabulary awareness (acronyms, internal terms)
- R9.5: [x] Political landscape mapping (who influences whom, power dynamics)

### Files Changed
- `worker/src/agents/domain-synthesis-agent.ts` — new agent
- `worker/src/index.ts` — queue + cron registration (daily 12:45 UTC)

### Data Sources
- DomainContext model (organization, history, vocabulary, landscape JSON fields)
- DomainLearning model (type-tagged insights)
- KnowledgeFacts (ORGANIZATION, TEAM entities)
- StakeholderProfile (power dynamics, influence roles)
- Meeting patterns (type distribution)

## R11: Stakeholder Intelligence Synthesis
**Priority**: P0 | **Status**: [x] Complete

### Requirements
- R11.1: [x] Synthesize KnowledgeFacts about PERSON entities into StakeholderIntelligence
- R11.2: [x] Populate successPatterns, failurePatterns, objectionPatterns, recentTopics
- R11.3: [x] Overweight USER_STATED and INFERRED_CHAT sources
- R11.4: [x] Include recent meeting titles and email subjects as context
- R11.5: [x] Run daily + on-demand when chat produces 2+ new facts
- R11.6: [x] Route chat-mentioned people to StakeholderProfile automatically

### Files Changed
- `worker/src/agents/stakeholder-synthesis-agent.ts` — new agent
- `worker/src/agents/knowledge/chat-fact-extractor.ts` — stakeholder routing
- `worker/src/index.ts` — queue + cron registration (daily 12:15 UTC, on-demand after chat)

## R12: Data Flywheel Feedback Loop
**Priority**: P0 | **Status**: [x] Complete

### Requirements
- R12.1: [x] Mark ProactivePrompt.responded when user replies to any prompt type
- R12.2: [x] Set ProactivePrompt.resultedInAction based on response substance
- R12.3: [x] Chat facts overweighted (0.95 confidence for explicit, 0.85 for implied)
- R12.4: [x] Expanded predicates for tribal knowledge capture (political_stance, responds_well_to, etc.)
- R12.5: [x] Immediate stakeholder synthesis trigger when chat produces 2+ facts

### Files Changed
- `worker/src/agents/knowledge/chat-fact-extractor.ts` — feedback loop + routing + predicates

---

## R10: Color Scheme & UI
**Priority**: P0 | **Status**: [x] Complete

### Requirements
- R10.1: [x] All components use semantic CSS variables (not hardcoded slate/white)
- R10.2: [x] Works on Chrome light mode
- R10.3: [x] Works on Chrome dark mode
- R10.4: [x] Works on Chrome force-dark mode (color-scheme declaration)
- R10.5: [x] TopNav readable on all backgrounds

### Files Changed
- 15 component files (see git commit 2d072ce)
- `web/app/globals.css` — color-scheme declarations
