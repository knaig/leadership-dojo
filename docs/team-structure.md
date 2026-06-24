# Team Structure — PMF Stage

**Goal:** Product-market fit. Each intern owns a product outcome end-to-end, full stack.

**Core Loop:** Data In → Intelligence → Coaching Out → User Acts → Feedback → Better Intelligence

**Model:** Interns using AI coding tools (Claude Code / Cursor). Founder manages all directly.

---

## Product Owners (5 Interns)

### 1. First 5 Minutes (Onboarding + Activation)

**Owns:** Everything from signup to first "wow"

**Scope:**
- Google OAuth connect flow
- Calendar/email/drive sync speed and reliability
- First-sync stakeholder importance scoring (the wow message)
- Progressive nav disclosure (unlock tabs as data arrives)
- Cold start drip sequence (micro-insights as sync progresses)
- Context-aware chat prompts (no empty cursor)
- Onboarding progress tracking

**Metric:** % of signups who return on Day 2

---

### 2. Intelligence Quality (What Mira Knows)

**Owns:** The accuracy and depth of everything Mira says

**Scope:**
- Email sync quality (LLM summaries, sent/received tracking, key topics)
- Meeting notes retrieval (Gemini notes, Drive docs, calendar attachments)
- Knowledge graph fact extraction + confidence scoring
- Stakeholder enrichment (web search, LLM inference, correction learning)
- Context Agent — what gets retrieved when the user asks a question
- Anti-hallucination — ensuring Mira only says what she actually knows
- Entity resolution + dedup (Srikanth vs Srikanth K vs srikanth@company.com)

**Metric:** User correction rate — how often does the user correct or challenge Mira's claims? (Low = good intel)

---

### 3. Voice Experience (VoicERA + Call Quality)

**Owns:** Everything the user hears

**Scope:**
- VoicERA integration to replace Vapi (cost reduction — strategic)
- Call timing and earned trust ladder (when Mira calls, how often)
- Call content quality (what Mira says on calls, how it's structured)
- Vapi/VoicERA tool calling (11 tools already built — make them reliable)
- Call feedback loop (tooLong, wasRelevant → adapts next call)
- STT quality (fuzzy name matching, transcription accuracy)
- Post-call follow-up (commitments detected, summary pushed to chat)

**Metric:** Call completion rate (user stays past 30 seconds) x relevance rating

**Strategic note:** This role doubles as the VoicERA integration lead. Every improvement to Mira's voice experience is also a proof point for VoicERA as a platform. Founder pairs closely on architecture.

---

### 4. Coaching Delivery (What Mira Says + How She Says It)

**Owns:** The quality and impact of every Mira interaction

**Scope:**
- Response Agent prompt engineering (Mira persona, framing rules, anti-hallucination)
- Artifact panel rendering (meeting notes, action items, stakeholder briefs in side panel)
- Meeting prep quality (what does Mira actually surface before a meeting?)
- Outcome tracking loop (pre-meeting goals, post-meeting reviews)
- Stakeholder feedback handling (correction flow from chat)
- Proactive nudges (what triggers them, how useful are they)
- Pattern detection → coaching insights (you land 80% when you prep)
- Style adaptation from feedback (brevity vs depth, actionable vs analytical)

**Metric:** % of users who log meeting outcomes (proves coaching is being used)

---

### 5. Metrics + Instrumentation (Eyes on the Product)

**Owns:** Measuring what's working and what's broken

**Scope:**
- Track every Mira response + whether user corrected it (hallucination rate)
- Track reply rate after Mira messages (engagement)
- Track onboarding funnel (signup → Google connect → wow message → second message → Day 2 return)
- Build internal dashboard (Postgres views + basic UI or PostHog/Mixpanel)
- Flag bad responses for Coaching Delivery intern to fix
- Call quality metrics (completion rate, feedback scores)
- Weekly report: what improved, what degraded, where users drop off

**Metric:** Dashboard exists and is reviewed daily by the team

---

## Non-Coding Roles

### 6. Design + User Research

- Talks to 5 users weekly, 30 min each
- Turns feedback into actionable UX changes (not slide decks)
- Prototypes in Figma or directly in code with AI tools
- Obsesses over onboarding, first-5-minutes, and "aha moment"
- Runs activation experiments

**Metric:** Qualitative — are users saying "I need this" unprompted?

### 7. GTM (Part-time / Fractional)

- Gets 10-20 execs to try Mira
- Follows up on usage patterns (who retained, who churned, why)
- Sets up basic analytics for activation funnels
- Manages landing page, waitlist, early testimonials

**Metric:** 50 active trial users within 3 months

---

## How They Interact

```
              ┌──────────────┐
              │  Founder      │
              │  (Product +   │
              │  Vision +     │
              │  User Research│
              │  + Voice Arch)│
              └──────┬───────┘
                     │
    ┌────────┬───────┼───────┬──────────┐
    │        │       │       │          │
┌───▼──┐ ┌──▼───┐ ┌─▼────┐ ┌▼───────┐ ┌▼────────┐
│First 5│ │Intel │ │Coach │ │Voice   │ │Metrics  │
│Mins   │ │Qual  │ │Deliv │ │Exper   │ │+ Instru │
└───┬──┘ └──┬───┘ └─┬────┘ └┬───────┘ └┬────────┘
    │       │       │       │          │
    │  feeds into►  │       │     measures all
    │       │  ◄uses│       │          │
    │       │       │ ◄delivers via    │
    └───────┴───────┴───────┴──────────┘
                 Same codebase
```

- Intel Quality feeds both Coaching Delivery and Voice Experience
- First 5 Minutes depends on Intel Quality for the sync wow moment
- Coaching Delivery and Voice Experience are two delivery channels for the same intelligence
- Metrics + Instrumentation measures all four areas and surfaces problems
- All share the same codebase, same DB, same agents — just different ownership boundaries

---

## Founder Owns

- Product direction — what to build, what to kill
- User research — founder talks to users, not the interns
- Voice architecture — founder knows VoicERA, Voice intern executes the design
- Quality bar — founder reviews Mira's responses and says "this is good" or "this is wrong"
- GTM — getting first 20 users (or fractional person for this)

---

## Management Model

- Daily 15-min async standup (text/video update from each intern)
- Weekly 1:1 with each (30 min x 5 = 2.5 hrs/week)
- Each intern has ONE deliverable per week, reviewed by founder
- Interns try solving blockers with AI tools first, escalate to founder on Slack if stuck
- Founder reviews work every evening (~30 min total scan)

---

## Hiring Order

1. **Intel Quality** — hire first. Everything depends on data accuracy.
2. **Coaching Delivery** — hire second. Once intel is solid, this person makes it land.
3. **Metrics + Instrumentation** — hire third. You need eyes on the product before scaling.
4. **First 5 Minutes** — hire fourth. Retention matters once the product is good enough to retain.
5. **Voice Experience** — hire fifth (or founder covers initially given VoicERA context).

---

## Hiring Filter

Give them this test: "Here's Mira's codebase. Using Claude Code, fix this bug / build this feature in 2 hours." Watch how they work.

Look for:
- Can they navigate a large unfamiliar codebase with AI tools?
- Do they ship something that works, or get stuck in analysis?
- Do they ask good questions when stuck, or spin in circles?
- Do they test the result or assume it works?

---

## Week 1 Deliverables

| Owner | Week 1 ship |
|---|---|
| First 5 Minutes | Cold start drip sequence — 3 proactive messages within first hour of connecting Google |
| Intel Quality | Email summaries are real LLM summaries, Gemini meeting notes fetched for all past meetings |
| Coaching Delivery | Context-aware chat prompts — dynamic suggestions based on time + next meeting |
| Voice Experience | VoicERA integration spike — one call through VoicERA instead of Vapi |
| Metrics | Onboarding funnel dashboard — signup → connect → wow → engage → retain |

---

## What You Don't Need at PMF

| Role | Why Not Yet |
|---|---|
| DevOps / SRE | Vercel + Render + Neon handle infra |
| QA / Testing | Users are the testers. Fix bugs same-day |
| Data Engineer | Prisma + Postgres is enough |
| Dedicated PM | Founder is the PM |
| Security specialist | Not until enterprise customers ask for SOC2 |
| Mobile developer | Next.js responsive web is sufficient |
