# Mira Command Center — UI Design

## Philosophy
Mira is a person who works for you, not a tool you operate.
The UI is her desk — she's laid out what you need for today.
Voice is the primary interaction. Screen is the reference layer.

## Main Screen: "Today"

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Good morning, Karthik.                      [🎤 Call Mira]  │
│  Tuesday, March 11                                           │
│                                                              │
│  ┌─── MIRA'S BRIEF ───────────────────────────────────────┐ │
│  │                                                         │ │
│  │  6 meetings today. The big one: COSS Monthly at 10 AM  │ │
│  │  with Madhu — you wanted budget approval.               │ │
│  │                                                         │ │
│  │  ⚠ Manmeet expects architect hire update (you emailed   │ │
│  │    last week about the Atul setback)                    │ │
│  │  ⚠ Shashwat hiring doc needs your sign-off              │ │
│  │                                                         │ │
│  │                         [📞 Read this to me]  [Got it]  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ─── YOUR DAY ──────────────────────────────────────────────│
│                                                              │
│  10:00  COSS Monthly Meeting                                │
│         Madhu, Karthik, +12        [Prep me 📞]             │
│         🎯 Budget approval                                  │
│                                                              │
│  10:00  AI4I Standup                                        │
│         Aravinth, Merson           [Prep me 📞]             │
│                                                              │
│  10:00  Bhili Language Enablement                            │
│         Aravinth, Santosh          [Prep me 📞]             │
│                                                              │
│  10:30  VoiceERA Daily Standup                              │
│         Pranab, Kowshik, Santosh                            │
│                                                              │
│  11:00  Internal Standup                                    │
│         Riya, Pranab, Kislaya                               │
│                                                              │
│  11:00  AI4X All Team                                       │
│         Aravinth, Karthik, Arun                             │
│                                                              │
│  ─── THINK WITH MIRA ──────────────────────────────────────│
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 🎯       │ │ 😈       │ │ 📈       │ │ 💭       │       │
│  │ Outcomes │ │ Devil's  │ │ Skill    │ │ Personal │       │
│  │          │ │ Advocate │ │ Building │ │          │       │
│  │ "What    │ │ "Poke    │ │"Practice │ │ "I need  │       │
│  │ should   │ │ holes in │ │ a hard   │ │ to talk" │       │
│  │ success  │ │ my plan" │ │ convo"   │ │          │       │
│  │ look     │ │          │ │          │ │          │       │
│  │ like?"   │ │   [📞]   │ │  [📞]    │ │  [📞]    │       │
│  │   [📞]   │ │   [💬]   │ │  [💬]    │ │  [💬]    │       │
│  │   [💬]   │ │          │ │          │ │          │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  ─── PROJECTS ──────────────────────────────────────────────│
│                                                              │
│  ┌─ VoiceERA ──────────┐  ┌─ AI4Inclusion ─────────┐       │
│  │ Standup at 10:30     │  │ Strategy needs clarity  │       │
│  │ 📄 TTS/ASR Analysis  │  │ 📄 Brazil Narration     │       │
│  │ 📧 Pranab: standup   │  │ 📧 Manmeet: architect   │       │
│  │ 🧠 Kowshik, Pranab   │  │ 🧠 Hiring blocked       │       │
│  │             [Ask 📞]  │  │             [Ask 📞]    │       │
│  └──────────────────────┘  └────────────────────────┘       │
│                                                              │
│  ┌─ Bhili ─────────────┐  ┌─ Bhashini ─────────────┐       │
│  │ Session tomorrow     │  │ Enablement topic        │       │
│  │ 🧠 Low-resource lang │  │                         │       │
│  │             [Ask 📞]  │  │             [Ask 📞]    │       │
│  └──────────────────────┘  └────────────────────────┘       │
│                                                              │
│  ─── RECENT CALLS ──────────────────────────────────────────│
│                                                              │
│  📞 #15 · 3 min · Tomorrow's schedule, VoiceERA question    │
│  📞 #14 · 1 min · COSS meeting time confusion               │
│  📞 #13 · 5 min · Architecture review debrief               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## "Think With Mira" — Conversation View

When you tap a mode (Outcomes, Devil's Advocate, etc.) or start a call:

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Today          🎯 Outcomes Thinking    [🎤 Call]  │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  Mira: What are we working on?                              │
│                                                              │
│  You: I need to figure out what success looks like for       │
│       the AI4Inclusion project this quarter.                 │
│                                                              │
│  Mira: Right. You've got a strategy gap there — the team    │
│  flagged concerns about resources and renewed focus. Let     │
│  me ask you this: if you could only achieve ONE thing with   │
│  AI4Inclusion by end of quarter, what would it be?          │
│                                                              │
│  You: Get the Brazil pilot live.                            │
│                                                              │
│  Mira: Okay — Brazil pilot live. What specifically needs    │
│  to be true for that to happen? Not activities. Conditions. │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Type or tap 🎤 to talk...                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ── Extracted so far ──────────────────────────────────────  │
│  🎯 Outcome: Brazil pilot live by Q1 end                    │
│  ❓ Open: What conditions must be true?                      │
│  🔗 Linked: AI4Inclusion project, Brazil Narration doc       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Meeting Thread View

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Today        COSS Monthly Meeting     [🎤 Prep]  │
│  10:00 AM · Madhu, Karthik +12                              │
│──────────────────────────────────────────────────────────────│
│                                                              │
│  ┌─ PREP ──────────────────────────────────────────────────┐│
│  │                                                         ││
│  │  🎯 Your goal: Budget approval                          ││
│  │                                                         ││
│  │  👥 Watch for:                                          ││
│  │  • Madhu — decision maker, tends to defer to data       ││
│  │  • Aravinth — ally, align with him beforehand           ││
│  │                                                         ││
│  │  ⚠ Landmine: Manmeet will ask about architect hire.     ││
│  │    You emailed about Atul setback last week.            ││
│  │    Have a plan B ready.                                 ││
│  │                                                         ││
│  │  💡 One question to ask: "What would change your mind   ││
│  │     on the budget allocation?"                          ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─ DEBRIEF (after meeting) ───────────────────────────────┐│
│  │  Not yet — come back after your meeting.                ││
│  │                                        [Debrief 📞]     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─ OUTCOME ───────────────────────────────────────────────┐│
│  │  Did you land it?  [✅ Yes]  [❌ No]  [🔄 Partial]      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ── History ─────────────────────────────────────────────── │
│  📞 Prep call #12 · 4 min · Discussed Manmeet angle        │
│  💬 Chat: "What if Madhu pushes back on timeline?"          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Phone Call UX — Conversational Mode Detection

No buttons on a phone call. Mira detects the mode from what you say:

| User says | Mira detects | Behavior |
|-----------|-------------|----------|
| "Tell me about my day" | BRIEF | Informer — headlines, flags, asks what to dig into |
| "Prep me for the COSS meeting" | MEETING PREP | Strategist — attendees, landmines, one good question |
| "What should success look like for AI4Inclusion?" | OUTCOMES | Challenger — pushes for specifics, conditions, measures |
| "Push back on this" / "Play devil's advocate" | DEVIL'S ADVOCATE | Adversary — takes opposite stance, pokes holes |
| "I want to practice telling Manmeet about the delay" | SKILL BUILDING | Coach — role-plays as Manmeet, gives feedback |
| "I'm just tired" / "I need to talk" | PERSONAL | Confidant — listens, empathizes, no agenda |
| "What's happening with VoiceERA?" | PROJECT | Tracker — surfaces docs, emails, meetings, people |
| "Keep going" / "Tell me more" | EXTEND | Stays in current mode, no time pressure |
| "Call me back in 20 min about this" | CALLBACK | Schedules callback with current context loaded |
| "That's all" / "Thanks Mira" | END | Wraps up, routes summary to right section in app |

### Mid-call transitions are natural:

```
Mira: [BRIEF mode] ...and the Bhili session is at 10 AM.
User: "Actually, I don't know if that session is worth my time."
Mira: [shifts to OUTCOMES] "Okay — what would make it worth your time?
       What would you need to walk out with?"
User: "Good point. And what if someone argues we should drop Bhili entirely?"
Mira: [shifts to DEVIL'S ADVOCATE] "Alright. Here's the case against it:
       you've spent 3 months and the results are..."
User: "Okay stop, you're stressing me out."
Mira: [shifts to PERSONAL] "Ha. Fair. What's actually stressing you —
       the project or something bigger?"
```

### Duration rules:
- Mira-initiated calls: 10 min default, but if user is engaged, she doesn't cut off
- User-initiated calls: No default limit. User hangs up when done.
- At natural pauses (15+ min): "We've covered a lot. Keep going or want me to bundle this up?"
- Never: "Sorry, we're out of time." Always: "Want to keep going?"

### Post-call routing:
Call summary + extracted items auto-route to the right section:
- Discussed a meeting → Meeting thread
- Discussed a project → Project card
- Outcomes thinking → Outcomes section
- Personal stuff → Personal (private, never surfaced elsewhere)
- Mixed → Brief summary in each relevant section
