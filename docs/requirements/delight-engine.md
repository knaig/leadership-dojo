# Delight Engine — Fixing the First 30 Days

**Goal:** Every user should experience value within 5 minutes of connecting Google, and stay delighted through day 30.

**Status:** In Progress (March 2026)

---

## 1. AI Stakeholder Importance Scoring

**Problem:** Frequency-based ranking misses high-stakes, low-frequency relationships (board members, advisors, senior sponsors).

**Solution:** Multi-signal AI model that ingests all communication patterns and infers importance holistically.

### Signals (per stakeholder)
- Meeting frequency + recency
- Meeting type: 1:1 vs group, NEEDLE_MOVER vs OPERATIONAL
- Email sent vs received ratio (initiator = needs something)
- Email volume + thread depth
- Response latency (how fast does the user reply to them?)
- Calendar title signals ("Board", "Review", "Approval", "Steering")
- Meeting prep effort (email threads before a meeting)
- Forward/CC patterns (their emails get forwarded = influential)
- Seniority signals (email signature, domain, title if known)
- Outcome history (meetings with this person: landed/missed rate)

### Output (per stakeholder)
- `importanceScore` (1-100)
- `importanceReason` (1-2 sentence explanation)
- `relationshipDynamic` ("You initiate most contact — you need their input" or "They reach out to you frequently — you're a decision point for them")
- `category`: inner-circle | high-stakes | operational | peripheral | dormant

### Implementation
- Runs after initial sync completes (calendar + email)
- Aggregates raw metrics from EmailSummary + MeetingSyncRecord per stakeholder
- Feeds aggregated signals into LLM with a single prompt per batch (top 30 stakeholders)
- Persists to StakeholderProfile: importanceScore, importanceReason, importanceCategory
- Re-runs weekly via cron for top 50 stakeholders
- Enrichment agent already computes importance 1-10 but discards it — fix this too

### First-Sync Wow
Within 5 minutes of Google connect, Mira sends a proactive message:
- Inner circle (frequent collaborators)
- High-stakes relationships (rare but important)
- Someone to watch (building up, might need attention)
- Asks "Am I reading this right?" to invite correction

---

## 2. Cold Start Sequence

**Problem:** New user signs up → empty chat → leaves.

**Solution:** Proactive drip sequence during first 24 hours.

### Triggers
| Time | Trigger | Mira sends |
|------|---------|-----------|
| Sync starts | Calendar + email sync begins | "I'm syncing your calendar and email. Give me a few minutes..." |
| First batch | 50+ emails or 20+ meetings synced | Stakeholder importance analysis (see #1) |
| Sync 50% | Midway through sync | "I'm finding more context. You have X meetings this week..." |
| Sync complete | All syncs done | "I'm ready. Here's your week at a glance." |
| Hour 4 | If user hasn't chatted | "Your next meeting is [X] in [Y] hours. Want me to prep you?" |
| Hour 24 | Next morning | First real daily brief with meeting prep |

### Implementation
- New `first-run-sequence` agent or state machine in proactive-agent
- Track progress in User model or OnboardingProgress
- Each trigger fires only once (idempotent)
- Messages delivered via Pusher → chat (not voice)

---

## 3. Context-Aware Chat Prompts

**Problem:** Empty chat with blinking cursor. User has to know what to ask.

**Solution:** Dynamic suggestion cards based on time of day + calendar state.

### Prompt Logic
| Context | Suggestions shown |
|---------|------------------|
| Morning, meetings today | "Prep for [next meeting]", "What should I focus on today?" |
| Between meetings | "How did [last meeting] go?", "Prep for [next meeting]" |
| After last meeting | "Quick recap of today", "Any commitments I should track?" |
| End of week | "Show me my patterns", "Who should I reconnect with?" |
| No meetings today | "What's this week looking like?", "Help me think about [goal]" |
| New user, post-sync | "Tell me about the people I work with", "What patterns do you see?" |

### Implementation
- API endpoint: `GET /api/chat/suggestions` returns 2-4 contextual suggestions
- Fetches: next meeting, last meeting, time of day, meeting count today, days since signup
- ActiveDialogue renders cards above input (replaces static suggestions)
- Cards disappear after first message sent
- Recalculate on page load + after each assistant message

---

## 4. Auto Outcome Tracking

**Problem:** Outcome tracking requires manual discipline. Most users won't set goals or log results.

**Solution:** Mira proposes outcomes before meetings and asks about results after.

### Pre-Meeting (30 min before)
- Mira analyzes meeting title + attendees + recent email threads
- Proposes a desired outcome: "Looks like the goal is [X]. Track this?"
- One-tap: Yes / Not quite (correct)
- Delivered as chat message or push notification

### Post-Meeting (15 min after end time)
- Mira asks: "How did [meeting] go? Did you [outcome]?"
- Three-tap: Landed / Partial / Missed
- If no response within 2 hours, mark as "unlogged" (no nag)

### Implementation
- Extend proactive-agent with meeting-aware triggers
- Pre-meeting: cron checks meetings starting in 30 min, generates outcome suggestion via LLM
- Post-meeting: cron checks meetings ended 15 min ago that had outcomes set
- Deliver via Pusher chat message with inline action buttons
- Action buttons hit API to update MeetingSyncRecord.desiredOutcome / outcomeResult

---

## 5. Earned Voice Calls

**Problem:** Uncontrolled daily calls → bad UX → trust lost.

**Solution:** Progressive trust ladder.

### Phases
| Phase | Trigger | Call behavior |
|-------|---------|--------------|
| 0 - Silent | Signup to day 7 | No calls. Chat only. |
| 1 - On-demand | Day 7+ with 3+ chat sessions | "Call me" button enabled in chat |
| 2 - Suggested | Day 14+ with 5+ outcomes logged | Mira suggests calling before high-stakes meetings |
| 3 - Scheduled | User explicitly opts in | Daily brief calls at preferred time |

### Rules (all phases)
- Never call without something specific to say
- Never call during DND / outside configured hours
- Max 1 call/day unless user-initiated
- If user doesn't answer, don't retry same day (current retry logic is too aggressive)

### Implementation
- Add `voicePhase` field to User model (0-3)
- Phase transitions based on engagement metrics
- Phase 0: kill switch stays active (current state)
- Phase 1: enable "Call me" button, triggerVoiceCall only for user-initiated
- Phase 2-3: gradual re-enable of proactive calls with strict guards

---

## 6. Progressive Nav Disclosure

**Problem:** 10 nav items, most empty for new users.

**Solution:** Start with 3 tabs, unlock more as data arrives.

### Unlock Rules
| Tab | Appears when |
|-----|-------------|
| Home | Always |
| Chat | Always |
| Settings | Always |
| Meetings | Calendar sync complete + 1+ meeting exists |
| People | 5+ stakeholders identified |
| Patterns (Wins) | 5+ meeting outcomes logged |

### Removed from nav (folded in)
- Goals → surfaces in chat + Home brief
- KPIs → surfaces in Patterns tab
- Coaching → mode within chat
- Insights → surfaces inline in chat
- Projects → removed (per product decision: no project spaces)

### Implementation
- API endpoint: `GET /api/nav/unlocks` returns which tabs are active
- BottomTabs component reads unlock state
- Each unlock triggers a celebratory Mira message: "Your People tab is live — I've built profiles on 12 stakeholders."
- Desktop sidebar matches mobile logic

---

## Priority Order

1. **AI Stakeholder Importance Scoring** — powers the first-sync wow
2. **Cold Start Sequence** — uses #1, makes first 24hrs magical
3. **Context-Aware Chat Prompts** — kills the empty cursor problem
4. **Auto Outcome Tracking** — spins the effectiveness flywheel
5. **Progressive Nav** — polish, not urgent
6. **Earned Voice Calls** — blocked until voice UX is redesigned

---

## Success Metrics

- Time to first "wow": < 5 minutes (currently: never for most users)
- Day 1 retention: user returns next day (currently: unknown)
- Day 7 engagement: 3+ chat sessions in first week
- Day 30 effectiveness: 5+ meeting outcomes logged, patterns visible
