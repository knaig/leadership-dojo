# Admin Dashboard PRD — Does Mira Actually Matter?

## The Only Question

You're getting good feedback. But is it real? Or is it novelty wearing a polite mask?

This dashboard answers one question: **Is Mira becoming someone users can't imagine losing?**

We measure this through three lenses:
1. **How does Mira make users feel?** — Trust trajectory, emotional safety, relationship depth
2. **What does Mira enable users to do?** — Actions taken, outcomes achieved, capability unlocked
3. **Is Mira getting better at coaching?** — Learning accuracy, conversation evolution, coaching maturity

## Two Layers: Stories First, Metrics Second

**Layer 1 — Narratives** (primary): Auto-generated user stories that tell you what's happening and what to do about it. At N=5, every user is a case study.

**Layer 2 — Metrics** (supporting): Hard numbers underneath each narrative. Sparklines, KPI scores, trend arrows. These validate the stories and let you drill down when something looks off.

---

## Dashboard Layout

### Overview Page (landing)

**Top: Headline Metrics Bar** — 4 cards, always visible:
1. **Calls Today** — X/Y completed (with 7-day pickup rate trend)
2. **Avg Quality** — today's score /10 (with 7-day trend arrow)
3. **Trust Depth** — system avg depthOfSharingScore (with trend)
4. **Active Commitments** — open / total (with completion rate)

**Middle: Per-User Narrative Cards** — One card per user, sorted by urgency:

Each card shows:
- **User name + call count + days since signup**
- **1-2 sentence narrative summary** (auto-generated from data):
  > "Karthik — Strong session today (14 min, depth 7.8). Followed up on the Raj commitment — it happened. Trust: ascending."
  > "Priya — Missed today's call. 2nd miss this week. Repetition score 4.2 — Mira is being repetitive. **Needs attention.**"
- **Metric row underneath**: pickup rate (7d) | avg quality | depth trend | open commitments | knowledge facts
- **Status badge**: Thriving / Steady / Needs Attention / Onboarding
- Click → full user detail page

**Bottom: Intervention Alerts** — Specific, actionable items:
- Each alert = user + signal + evidence + recommended action
- Not "quality is down" but "Mira is repeating the delegation theme with Priya — review last 3 transcripts"

### User Detail Page

Click any user → full story across all three lenses:

**Section 1 — Trust & Engagement** (Lens 1)
- Narrative: trust arc summary with evidence
- Metrics: depth score sparkline (all calls), call duration trend, pickup rate chart, streak counter
- Key moments: transcript quotes showing depth progression

**Section 2 — Actions & Outcomes** (Lens 2)
- Narrative: what the user accomplished because of Mira
- Metrics: commitment tracker (open/completed/dropped/overdue), completion rate trend
- Coaching themes: status badges (active/resolving/resolved) with call counts

**Section 3 — Mira's Learning** (Lens 3)
- Narrative: how well Mira knows this user, what's improving
- Metrics: 6 KPI scores (spider/radar or bar), quality trend sparkline, repetition trend, correction rate
- Knowledge stats: fact count, entity count, source diversity, confidence distribution
- Phase + personality profile summary

**Section 4 — Call History**
- Scrollable list of calls with duration, quality score, key topics
- Expandable: full transcript, evaluation details, commitments extracted

---

## Lens 1: How Does Mira Make Users Feel?

### Trust Trajectory

| Signal | What it means | Source | Metric |
|--------|--------------|--------|--------|
| Depth of sharing progression | Surface → real problems → vulnerabilities | `depthOfSharingScore` trend | Score 1-10, sparkline |
| Correction comfort | User corrects Mira openly (healthy trust) | `UserCorrection` count | Count/week, trend |
| Return after bad call | Comes back despite mediocre experience | VoiceCall pickup after low-quality call | Boolean per instance |
| Call duration trend | Investing more time as trust builds | VoiceCall.durationSeconds | Duration sparkline |

### Engagement Quality

| Signal | Source | Metric |
|--------|--------|--------|
| Call duration trend | VoiceCall.durationSeconds | Sparkline + avg |
| Pickup rate | VoiceCall scheduled vs completed | % (7/14/30 day) |
| Streak | Consecutive answered days | Counter |
| Chat initiation | Message table (user-initiated outside calls) | Count |
| Callback requests | VoiceCall with callback flag | Count |

**Alert**: "User's calls shortened >30% from average" / "Missed 2+ consecutive calls" / "Depth score declining for 3+ calls"

---

## Lens 2: What Does Mira Enable Users to Do?

### Commitment → Action → Outcome Chain

| Signal | Source | Metric |
|--------|--------|--------|
| Commitments made | CoachingRelationshipPlan.commitments | Count by status |
| Completion rate | commitments completed / total | % + trend |
| Stale commitments | Open >7 days, no follow-up | Count (alert if >3) |
| Theme progression | CoachingRelationshipPlan.coachingThemes | Status badges |
| Themes resolved | Themes that moved to RESOLVED | Count |

**Alert**: "5+ open commitments with no follow-up" / "No themes resolved in 14 days" / "Theme stuck for 6+ calls"

---

## Lens 3: Is Mira Getting Better at Coaching?

### Conversation Quality KPIs

| KPI | What it measures | Target |
|-----|-----------------|--------|
| newGroundScore | Is each call covering new territory? | >6, trending up |
| depthOfSharingScore | Is the user opening up? | >6, trending up |
| valueAddScore | Is Mira saying things user couldn't figure out alone? | >6, trending up |
| contextUtilScore | Is Mira using what she knows? | >7 |
| repetitionScore | Is Mira NOT repeating herself? | >7 (below 5 = crisis) |
| engagementScore | Is the user engaged? | >7 |
| overallScore | Weighted composite | >6.5 |

### Learning Accuracy

| Signal | Source | Metric |
|--------|--------|--------|
| Knowledge facts | KnowledgeFact count per user | Total + per-call rate |
| Entities known | KnowledgeEntity count | Total |
| Correction rate | UserCorrection count | Per-call trend (should decrease) |
| Context utilization | CallEvaluation.contextUtilScore | Score trend |
| Coaching phase | CoachingRelationshipPlan.phase | Phase badge |

**Alert**: "Repetition score <5" / "Correction rate increasing" / "<10 facts after 5+ calls" / "Context utilization <5"

---

## Onboarding Health

Every lost user at onboarding is a total loss.

| Step | Source | Metric |
|------|--------|--------|
| Signup | User.createdAt | Timestamp |
| Google scopes granted | DataConnector (CALENDAR, EMAIL, DRIVE) | 3 checkmarks |
| Sync complete | SyncStatus per connector | Status badges |
| First call scheduled | ScheduledCall | Timestamp |
| First call completed | VoiceCall (first ended) | Timestamp |
| First call quality | CallEvaluation on first call | Score |
| Second call completed | VoiceCall (second ended) | Timestamp |

**Show**: Per-user onboarding timeline for anyone <7 days old. Funnel drop-off if N>10.

**Alert**: "Signed up >2 hours ago, no first call" / "Sync failed" / "First call quality <4"

---

## Data Sources

| What | Where | Status |
|------|-------|--------|
| Call data (duration, status, transcript) | VoiceCall | Exists |
| Quality scores (6 KPIs + overall) | CallEvaluation | Exists (needs eval agent) |
| Trust/depth trajectory | CallEvaluation.depthOfSharingScore series | Exists |
| Commitments | CoachingRelationshipPlan.commitments JSON | Exists |
| Coaching themes | CoachingRelationshipPlan.coachingThemes JSON | Exists |
| Coaching phase | CoachingRelationshipPlan.phase | Exists |
| Personality profile | CoachingRelationshipPlan.personalityProfile JSON | Exists |
| Knowledge graph | KnowledgeFact + KnowledgeEntity counts | Exists |
| User corrections | UserCorrection | Exists |
| Onboarding funnel | User + DataConnector + SyncStatus + VoiceCall | Exists |
| Engagement (pickup) | VoiceCall scheduled vs completed | Exists |
| Narrative generation | LLM over structured data | **New: admin-narrative-agent** |

---

## API Design

### `GET /api/admin/pmf-overview`
Returns everything for the overview page:
- Headline metrics (calls today, avg quality, trust depth, commitments)
- Per-user cards (narrative + metrics + status)
- Alerts with recommended actions

### `GET /api/admin/user-story/[userId]`
Returns full user detail:
- All three lens narratives
- Call history with evaluations
- Commitment tracker
- Theme lifecycle
- Knowledge stats
- Personality profile

### Existing (kept):
- `GET /api/admin/users` — User management + role changes
- `GET /api/admin/coaching-intelligence` — Detailed coaching data
- `GET /api/admin/calls` — Call explorer
- `GET /api/admin/pipeline-status` — System health

---

## Priority

1. **Overview page with per-user cards** — Narratives + metrics + alerts. The thing you check daily.
2. **User detail page** — Full story when you need to drill into a specific user.
3. **Onboarding health** — Zero tolerance for signup friction.
4. **Quality KPI trends** — The metrics that validate the narratives.
5. **Commitment tracking** — Proof that Mira drives action.

---

## What This Is NOT

- **Not a pure metrics dashboard.** Narratives first, metrics support.
- **Not a pure story page.** Hard numbers validate every claim.
- **Not permanent architecture.** Designed for N=5-20. At 50+ users, add cohort analysis and statistical views.
