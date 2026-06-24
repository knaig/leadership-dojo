# Mira V2 — Architecture & Design Document

**Requirements:** `docs/requirements/mira-v2-requirements.md`
**Status:** Design
**Last Updated:** 2026-03-14

---

## 1. Schema Changes

### 1.1 Models That Already Exist (NO CHANGES)

These models are already in `web/prisma/schema.prisma` and do NOT need to be recreated:

| Model | Location (approx. line) | Status |
|-------|------------------------|--------|
| `CallEvaluation` | 3594 | Complete — 6 KPIs, qualitative fields |
| `CoachingRelationshipPlan` | 3626 | Complete — phase, themes, commitments, personality |
| `CoachingTrajectory` | 3658 | Complete — weekly snapshots |
| `PersonalThread` | 3687 | Complete — category, stage, engagement |
| `PromptInsight` | 3710 | Complete — pattern, recommendation, lifecycle |
| `ConversationConfig` | 3558 | Complete — thresholds, rules, guardrails |
| `PromptTemplate` | 3540 | Complete — versioned prompt templates |
| `Experiment` | 3572 | Complete — A/B testing |
| `UserPreferences` | 3139 | Has archetype, adaptationSignals, pacing fields |
| `ProfessionalProject` | 2733 | Exists — needs extension for unification |
| `UserProject` | 626 | Legacy — will be unified into ProfessionalProject |

### 1.2 NEW Models

#### AgentRun — Observability (P0)

```prisma
model AgentRun {
  id            String   @id @default(cuid())
  agentName     String                        // "call-evaluation", "stakeholder-synthesis", etc.
  userId        String?                       // null for system-level jobs
  triggerType   String                        // "cron", "event", "api", "queue"
  triggerRef    String?                       // cron name, queue name, or API path

  status        String   @default("running")  // running, completed, failed, skipped
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  durationMs    Int?

  // What it did
  inputSummary  String?  @db.Text             // JSON or text summary of input
  outputSummary String?  @db.Text             // What was produced
  itemsProcessed Int     @default(0)          // How many items (users, stakeholders, etc.)
  itemsSkipped  Int      @default(0)

  // Errors
  errorMessage  String?  @db.Text
  errorStack    String?  @db.Text

  // LLM usage (if applicable)
  llmCalls      Int      @default(0)
  tokensUsed    Int      @default(0)

  createdAt     DateTime @default(now())

  @@index([agentName, status])
  @@index([agentName, startedAt])
  @@index([userId, agentName])
  @@index([status, startedAt])
}
```

#### GitHubInstallation — GitHub Connector (P2)

```prisma
model GitHubInstallation {
  id              String   @id @default(cuid())
  userId          String
  installationId  Int      @unique            // GitHub App installation ID
  accountLogin    String                      // GitHub org/user login
  accountType     String                      // "Organization" | "User"
  accessToken     String?  @db.Text           // Encrypted installation access token
  tokenExpiresAt  DateTime?

  status          String   @default("active") // active, suspended, removed
  permissions     Json     @default("{}")     // Granted permissions
  repositories    Json     @default("[]")     // Selected repository names

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  syncRecords     GitHubSyncRecord[]

  @@index([userId])
}

model GitHubSyncRecord {
  id              String   @id @default(cuid())
  installationId  String
  installation    GitHubInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)

  repoFullName    String                      // "org/repo"
  lastSyncAt      DateTime?
  lastCommitSha   String?
  syncCursor      String?                     // Pagination cursor for incremental sync

  // What was synced
  prsProcessed    Int      @default(0)
  issuesProcessed Int      @default(0)
  commitsProcessed Int     @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([installationId, repoFullName])
  @@index([installationId])
}
```

#### ProjectStakeholder — Join table (P1)

```prisma
model ProjectStakeholder {
  id            String   @id @default(cuid())
  projectId     String
  project       ProfessionalProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  stakeholderId String
  stakeholder   StakeholderProfile  @relation(fields: [stakeholderId], references: [id], onDelete: Cascade)

  role          String?              // "sponsor", "blocker", "contributor", "reviewer"
  influence     String?              // "high", "medium", "low"
  notes         String?  @db.Text

  createdAt     DateTime @default(now())

  @@unique([projectId, stakeholderId])
  @@index([projectId])
  @@index([stakeholderId])
}
```

#### ProjectRepository — Join table for GitHub (P2)

```prisma
model ProjectRepository {
  id            String   @id @default(cuid())
  projectId     String
  project       ProfessionalProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  repoFullName  String               // "org/repo" — matches GitHubSyncRecord.repoFullName
  isDefault     Boolean  @default(false)

  createdAt     DateTime @default(now())

  @@unique([projectId, repoFullName])
  @@index([projectId])
}
```

### 1.3 Fields to Add to Existing Models

#### ProfessionalProject — add fields for unification

```prisma
// Add to ProfessionalProject:
  description     String?  @db.Text          // From UserProject.description
  driveLink       String?                    // From UserProject.driveLink
  risks           Json?                      // From UserProject.risks
  healthStatus    String?                    // From UserProject.status ("At Risk", "Healthy")
  userNotes       String?  @db.Text          // From UserProject.userNotes

  // Knowledge Graph link
  knowledgeEntityId String?                  // Link to KnowledgeEntity of type PROJECT

  // GitHub
  repositories    ProjectRepository[]

  // Stakeholders
  projectStakeholders ProjectStakeholder[]
```

#### StakeholderProfile — add relation

```prisma
// Add to StakeholderProfile:
  projectStakeholders ProjectStakeholder[]
```

#### User — add relation

```prisma
// Add to User:
  agentRuns             AgentRun[]
  githubInstallations   GitHubInstallation[]
```

---

## 2. New Files to Create

### 2a. Observability (P0)

#### `worker/src/lib/agent-run.ts`
- **Purpose:** Structured agent run tracking — wraps any agent in start/complete/fail lifecycle.
- **Key exports:**
  - `startAgentRun(agentName, userId?, triggerType, triggerRef?): Promise<AgentRunContext>`
  - `completeAgentRun(ctx, outputSummary?, itemsProcessed?): Promise<void>`
  - `failAgentRun(ctx, error): Promise<void>`
  - `withAgentRun(agentName, userId, fn): Promise<T>` — wrapper that auto-tracks
- **Dependencies:** `prisma`
- **Trigger:** Called from every agent and cron handler

#### `web/app/api/admin/agent-health/route.ts`
- **Purpose:** Dashboard API — returns agent run stats for last 24h/7d.
- **Key exports:** `GET /api/admin/agent-health`
- **Dependencies:** `prisma`, Clerk auth (admin only)
- **Trigger:** Admin dashboard polling
- **Response shape:**
  ```json
  {
    "agents": [
      {
        "name": "call-evaluation",
        "last24h": { "runs": 12, "failures": 0, "avgDurationMs": 2340 },
        "last7d": { "runs": 84, "failures": 2, "avgDurationMs": 2180 },
        "lastRun": { "status": "completed", "startedAt": "...", "durationMs": 1800 },
        "health": "healthy"
      }
    ],
    "alerts": [
      { "agent": "stakeholder-enrichment", "issue": "no_runs_24h", "severity": "warning" }
    ]
  }
  ```

#### `web/app/api/admin/agent-runs/route.ts`
- **Purpose:** Paginated list of agent runs with filters.
- **Key exports:** `GET /api/admin/agent-runs?agent=X&status=Y&limit=50`
- **Dependencies:** `prisma`, Clerk auth (admin only)
- **Trigger:** Admin dashboard

### 2b. Coaching Intelligence (P0) — Already Exist

These files already exist and are functional:

| File | Status | Notes |
|------|--------|-------|
| `worker/src/agents/call-evaluation-agent.ts` | EXISTS | Scores calls on 6 KPIs |
| `worker/src/agents/coaching-relationship-agent.ts` | EXISTS | `updateRelationshipPlan()` + `deepAnalyzeRelationship()` |
| `worker/src/agents/call-planning-agent.ts` | EXISTS | `buildCallDirective()` — deterministic, no LLM |
| `worker/src/agents/coaching-trajectory-agent.ts` | EXISTS | `computeWeeklyTrajectoryAllUsers()` |
| `worker/src/agents/prompt-insight-agent.ts` | EXISTS | Auto-learns coaching strategies |

**What needs modification** (see Section 3):
- `call-evaluation-agent.ts` — wrap in `withAgentRun()`
- `coaching-relationship-agent.ts` — wrap in `withAgentRun()`
- `coaching-trajectory-agent.ts` — wrap in `withAgentRun()`
- `prompt-insight-agent.ts` — wrap in `withAgentRun()`

### 2c. Conversation Engine (P1) — Partially Exist

| File | Status |
|------|--------|
| `worker/src/lib/thread-manager.ts` | EXISTS |
| `worker/src/lib/confidence-engine.ts` | EXISTS |
| `worker/src/lib/conversation-engine.ts` | DOES NOT EXIST — needs creation |

#### `worker/src/lib/conversation-engine.ts`
- **Purpose:** Pre-call context assembly — orchestrates confidence engine, thread manager, and call planning into a unified `buildConversationPlan()` and `buildPeopleIntel()`.
- **Key exports:**
  - `buildConversationPlan(callType, confidenceMode, vars, callCount, adaptationSignals): string`
  - `buildPeopleIntel(userId, confidenceMode): Promise<string>`
  - `buildPersonalThreadInstruction(userId, callCount): Promise<string>`
  - `extractPostCallSignals(voiceCallId, transcript): Promise<PostCallExtraction>`
- **Dependencies:** `prisma`, `thread-manager`, `confidence-engine`, `call-planning-agent`
- **Trigger:** Called from `vapi-voice.ts` `buildVariableValues()` pre-call, and from `webhook/route.ts` post-call
- **Note:** The `buildConversationPlan` and `buildPeopleIntel` functions currently live inline in `vapi-voice.ts`. This file extracts them into a dedicated module for testability.

### 2d. Stakeholder Profiling (P1)

#### `worker/src/agents/email-content-analyzer.ts`
- **Purpose:** Analyzes email body/subject content for stakeholder personality signals. Extracts communication style, tone, formality, decision patterns from email threads.
- **Key exports:**
  - `analyzeEmailContentForStakeholder(userId, stakeholderEmail): Promise<EmailAnalysisResult>`
  - `batchAnalyzeEmailContent(userId): Promise<BatchResult>`
- **Dependencies:** `prisma`, `user-llm`, `agent-run`
- **Trigger:** Called from `stakeholder-enrichment-agent.ts` after web search enrichment

#### `worker/src/agents/relationship-profiler.ts`
- **Purpose:** Synthesizes multi-signal personality profile from email analysis + meeting patterns + knowledge facts + voice call mentions.
- **Key exports:**
  - `profileStakeholderRelationship(userId, stakeholderId): Promise<RelationshipProfile>`
  - `batchProfileRelationships(userId): Promise<BatchResult>`
- **Dependencies:** `prisma`, `user-llm`, `agent-run`, `email-content-analyzer`
- **Trigger:** Cron (weekly) or event (after significant new data)

### 2e. Project Entity (P1)

#### `worker/src/agents/project-service.ts`
- **Purpose:** CRUD + unification logic for the Project entity. Merges UserProject + ProfessionalProject + KnowledgeEntity(PROJECT) into a single coherent project view.
- **Key exports:**
  - `unifyProjects(userId): Promise<UnificationResult>` — one-time migration per user
  - `getProjectsWithContext(userId): Promise<ProjectWithContext[]>` — enriched project list
  - `linkStakeholderToProject(projectId, stakeholderId, role): Promise<void>`
  - `linkRepositoryToProject(projectId, repoFullName): Promise<void>`
  - `inferProjectFromMeetings(userId): Promise<InferredProject[]>` — detects projects from meeting clusters
- **Dependencies:** `prisma`, `agent-run`
- **Trigger:** API call, cron (weekly project inference), migration script

#### `web/app/api/projects/route.ts`
- **Purpose:** CRUD API for unified projects.
- **Key exports:**
  - `GET /api/projects` — list user's projects with stakeholders, repos, health
  - `POST /api/projects` — create project
- **Dependencies:** `prisma`, Clerk auth
- **Trigger:** Web UI

#### `web/app/api/projects/[id]/route.ts`
- **Purpose:** Individual project operations.
- **Key exports:**
  - `GET /api/projects/[id]` — project detail with stakeholders, repos, objectives
  - `PATCH /api/projects/[id]` — update project
  - `DELETE /api/projects/[id]` — archive project
- **Dependencies:** `prisma`, Clerk auth

#### `web/app/api/projects/[id]/stakeholders/route.ts`
- **Purpose:** Manage project-stakeholder links.
- **Key exports:**
  - `GET` — list stakeholders for project
  - `POST` — link stakeholder to project
  - `DELETE` — unlink
- **Dependencies:** `prisma`, Clerk auth

### 2f. GitHub Connector (P2)

#### `worker/src/agents/github-sync-agent.ts`
- **Purpose:** Syncs PRs, issues, and commits from GitHub repos linked to projects. Extracts facts about contributor activity, review patterns, and blockers.
- **Key exports:**
  - `syncGitHubRepos(installationId): Promise<SyncResult>`
  - `syncSingleRepo(installationId, repoFullName): Promise<RepoSyncResult>`
- **Dependencies:** `prisma`, `agent-run`, `@octokit/rest` (or GitHub REST API via fetch)
- **Trigger:** Cron (daily) or webhook (GitHub App events)

#### `worker/src/agents/knowledge/github-fact-extractor.ts`
- **Purpose:** Extracts knowledge graph facts from GitHub data (PR reviews, issue assignments, commit patterns).
- **Key exports:**
  - `extractGitHubFacts(userId, repoFullName): Promise<ExtractionResult>`
- **Dependencies:** `prisma`, `user-llm`, `agent-run`, entity resolver
- **Trigger:** Called after `github-sync-agent` completes

#### `web/app/api/github/install/route.ts`
- **Purpose:** OAuth callback for GitHub App installation.
- **Key exports:** `GET /api/github/install` — handles GitHub App installation callback
- **Dependencies:** `prisma`, Clerk auth

#### `web/app/api/github/webhook/route.ts`
- **Purpose:** Receives GitHub App webhook events (push, PR, issue).
- **Key exports:** `POST /api/github/webhook`
- **Dependencies:** `prisma`, webhook signature verification

### 2g. Admin API Routes

#### `web/app/api/admin/coaching/trajectory/route.ts`
- **Purpose:** View coaching trajectory data across users.
- **Key exports:** `GET /api/admin/coaching/trajectory?userId=X`
- **Dependencies:** `prisma`, Clerk auth (admin)

#### `web/app/api/admin/coaching/evaluations/route.ts`
- **Purpose:** View call evaluations with score trends.
- **Key exports:** `GET /api/admin/coaching/evaluations?userId=X&limit=20`
- **Dependencies:** `prisma`, Clerk auth (admin)

#### `web/app/api/admin/coaching/relationship/route.ts`
- **Purpose:** View/edit coaching relationship plan.
- **Key exports:** `GET /api/admin/coaching/relationship?userId=X`
- **Dependencies:** `prisma`, Clerk auth (admin)

---

## 3. Files to Modify

### `worker/src/index.ts` — New queues, cron schedules, worker registrations

**Changes:**
1. Add imports for new agents: `agent-run`, `project-service`, `email-content-analyzer`, `relationship-profiler`, `github-sync-agent`
2. Add new queues:
   - `agent-health-check` — periodic check for stale agents
   - `project-unification` — one-time migration job
   - `cron-relationship-profiling` — weekly stakeholder profiling
   - `cron-email-content-analysis` — weekly email analysis
   - `cron-github-sync` — daily GitHub sync (P2)
   - `cron-project-inference` — weekly project inference
3. Add cron schedules for new queues
4. Wrap ALL existing cron handlers in `withAgentRun()` for observability
5. Add health check endpoint expansion to report AgentRun stats

**Functions to modify:**
- Every `boss.work(...)` handler — wrap inner logic in `withAgentRun()`
- `startHealthServer()` — add `/health/agents` endpoint returning AgentRun summary

### `worker/src/lib/vapi-voice.ts` — Expanded buildVariableValues()

**Changes:**
- Import `buildConversationPlan`, `buildPeopleIntel`, `buildPersonalThreadInstruction` from new `conversation-engine.ts` instead of inline implementations
- Add new variable: `projectContext` — active projects with status and stakeholder overlaps for today's meetings
- Add new variable: `callDirective` — from `call-planning-agent.ts` (already imported, ensure fully wired)
- Add new variable: `coachingThemes` — active themes from CoachingRelationshipPlan
- Add new variable: `recentEvaluationInsight` — what to improve from last evaluation

**Functions to modify:**
- `buildVariableValues()` — add 4 new variables, refactor conversation plan + people intel into imports

### `web/app/api/vapi/call/route.ts` — Mirror new variables

**Changes:**
- Mirror all new variables from worker-side `buildVariableValues()` into the web-side equivalent
- Add `projectContext`, `coachingThemes`, `recentEvaluationInsight` variables
- Ensure web-side `buildVariableValues()` stays in sync with worker-side

**Functions to modify:**
- `buildVariableValues()` (web-side version, ~line 39)

### `web/app/api/vapi/webhook/route.ts` — Post-call pipeline expansion

**Changes:**
- After call ends (end-of-call-report handler), add pipeline steps:
  1. Queue `call-evaluation` job (already done — verify)
  2. Queue `knowledge-extract-voice` for the call
  3. Call `extractPostCallSignals()` from conversation engine
  4. Update PersonalThread touch counts
  5. Update PersonalContext call stats
- Wrap post-call pipeline in `withAgentRun('post-call-pipeline', userId)`

**Functions to modify:**
- `handleEndOfCallReport()` — expand post-call pipeline

### `scripts/setup-vapi-assistants.ts` — Prompt rewrite with guardrails

**Changes:**
- Add `GUARDRAILS` constant block (closed-world rules, anti-generic rules, confidence modes, early call rules, personal rules)
- Update Daily assistant prompt to include: `{{conversationPlan}}`, `{{peopleIntel}}`, `{{personalThreadInstruction}}`, `{{confidenceMode}}`, `{{targetDuration}}`, `{{coachingThemes}}`, `{{projectContext}}`
- Update Meeting assistant prompt to include: `{{projectContext}}`, `{{peopleIntel}}`
- Add `--update` flag support to update existing assistants instead of creating new ones

**Functions to modify:**
- `buildDailyPrompt()` — add new variable placeholders + guardrails
- `buildMeetingPrompt()` — add project context + people intel
- `buildOnboardingPrompt()` — add guardrails

### `worker/src/agents/stakeholder-enrichment-agent.ts` — Add email content analysis

**Changes:**
- After web search enrichment, call `analyzeEmailContentForStakeholder()` for each enriched stakeholder
- Merge email-derived signals (tone, formality, response patterns) into StakeholderIntelligence
- Wrap in `withAgentRun()`

**Functions to modify:**
- `enrichStakeholders()` — add email analysis step after web search
- `enrichSingleStakeholder()` — add email content call

### `worker/src/agents/stakeholder-synthesis-agent.ts` — Add confidence scoring

**Changes:**
- Already has fuzzy name matching fix
- Add confidence-tiered output: for each synthesized field, include confidence level
- Feed confidence tiers into `buildPeopleIntel()` via StakeholderIntelligence metadata
- Wrap in `withAgentRun()`

**Functions to modify:**
- `synthesizeSingleStakeholder()` — add confidence metadata to output

### `web/prisma/schema.prisma` — All schema changes

**Changes:**
- Add `AgentRun` model
- Add `GitHubInstallation` model
- Add `GitHubSyncRecord` model
- Add `ProjectStakeholder` model
- Add `ProjectRepository` model
- Add fields to `ProfessionalProject` (description, driveLink, risks, healthStatus, userNotes, knowledgeEntityId)
- Add relations to `User` (agentRuns, githubInstallations)
- Add relation to `StakeholderProfile` (projectStakeholders)

### `worker/src/agents/call-evaluation-agent.ts` — Observability

**Changes:**
- Wrap `evaluateCall()` in `withAgentRun('call-evaluation', userId)`
- Log structured output to AgentRun.outputSummary

### `worker/src/agents/coaching-relationship-agent.ts` — Observability

**Changes:**
- Wrap `deepAnalyzeRelationship()` in `withAgentRun('coaching-relationship-analysis', userId)`
- Log phase transitions and theme changes

### `worker/src/agents/coaching-trajectory-agent.ts` — Observability

**Changes:**
- Wrap `computeWeeklyTrajectory()` in `withAgentRun('coaching-trajectory', userId)`

### `worker/src/agents/prompt-insight-agent.ts` — Observability

**Changes:**
- Wrap main functions in `withAgentRun('prompt-insights')`

---

## 4. Data Flow Diagrams

### 4.1 Post-Call Pipeline

```
Call Ends (Vapi webhook: end-of-call-report)
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  handleEndOfCallReport()                                  │
│  web/app/api/vapi/webhook/route.ts                       │
│                                                           │
│  1. Save transcript + summary to VoiceCall                │
│  2. Update PersonalContext (callCount, totalMinutes)      │
│  3. Update ScheduledCall status                           │
│                                                           │
│  QUEUE PIPELINE (async via pg-boss):                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ call-evaluation                                      │  │
│  │   → evaluateCall(voiceCallId)                        │  │
│  │   → CallEvaluation record (6 KPIs + qualitative)     │  │
│  │   → updateRelationshipPlan(userId, evaluation)       │  │
│  │   → CoachingRelationshipPlan updated                  │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ knowledge-extract-voice                              │  │
│  │   → extractVoiceFacts(userId)                        │  │
│  │   → KnowledgeFact + KnowledgeEntity records          │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ post-call-extraction (conversation engine)           │  │
│  │   → extractPostCallSignals(voiceCallId, transcript)  │  │
│  │   → PersonalThread touch/advance                     │  │
│  │   → UserPreferences.adaptationSignals update         │  │
│  │   → VoiceCall.postCallExtraction saved               │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Pre-Call Context Assembly

```
triggerVoiceCall(userId, callType)
    │
    ▼
buildVariableValues(userId, callType)
    │
    ├──► prisma.personalContext          → callCount, lastCallDate
    ├──► prisma.meetingSyncRecord        → today's meetings
    ├──► prisma.userPreferences          → archetype, adaptationSignals, pacing
    │
    ├──► computeMaturityLevel(userId)    → LEARNING / OBSERVING / COACHING
    │       └── confidence-engine.ts
    │           ├── stakeholder count with intel
    │           ├── knowledge fact count
    │           ├── confirmed threads
    │           └── user corrections count
    │
    ├──► buildCallDirective(userId)      → coaching themes, commitments, avoid topics
    │       └── call-planning-agent.ts
    │           ├── CoachingRelationshipPlan
    │           ├── last CallEvaluation
    │           └── PersonalContext
    │
    ├──► selectThreadAction(userId)      → personal thread to touch today
    │       └── thread-manager.ts
    │           ├── PersonalThread records
    │           └── stage-based selection
    │
    ├──► buildConversationPlan(...)      → segment plan for this call
    │       └── conversation-engine.ts
    │           ├── call count (1-3 have distinct plans)
    │           ├── adaptation signals
    │           └── confidence mode
    │
    ├──► buildPeopleIntel(userId, mode)  → stakeholder intel for today's attendees
    │       └── conversation-engine.ts
    │           ├── StakeholderProfile + StakeholderIntelligence
    │           ├── KnowledgeFact (PERSON entities)
    │           └── confidence tiers (ASSERT / PROBE / MENTION / SILENT)
    │
    └──► buildProjectContext(userId)     → active projects relevant to today
            └── project-service.ts
                ├── ProfessionalProject
                ├── ProjectStakeholder overlap with today's meetings
                └── recent health/risk signals
    │
    ▼
variableValues → Vapi assistantOverrides → LLM runs the call
```

### 4.3 Stakeholder Intelligence Pipeline

```
DATA SOURCES
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Calendar │ │  Email   │ │  Voice   │ │  Chat    │ │ Web      │
│  Sync    │ │  Sync    │ │  Calls   │ │ Messages │ │ Search   │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     │             │             │             │             │
     ▼             ▼             ▼             ▼             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FACT EXTRACTION LAYER                          │
│  calendar-fact-extractor  email-fact-extractor  voice-fact-extr   │
│  chat-fact-extractor  document-fact-extractor                    │
│                                                                   │
│  Output: KnowledgeFact records (subject → predicate → object)    │
│  + KnowledgeEntity records (PERSON, PROJECT, TOPIC, etc.)        │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    SYNTHESIS LAYER                                │
│                                                                   │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐   │
│  │ stakeholder-         │  │ email-content-analyzer (NEW)      │   │
│  │ synthesis-agent      │  │ Reads email bodies for tone,      │   │
│  │ (existing)           │  │ formality, decision signals        │   │
│  │ Facts → Intel        │  └──────────────┬───────────────────┘   │
│  └──────────┬──────────┘                  │                       │
│             │                              │                       │
│             ▼                              ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ relationship-profiler (NEW)                                  │  │
│  │ Multi-signal synthesis: email analysis + meeting patterns    │  │
│  │ + knowledge facts + voice mentions + web search              │  │
│  │ Output: archetype, communication style, do/don't playbook   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CONFIDENCE SCORING                             │
│                                                                   │
│  Per stakeholder field, assign tier:                              │
│  ASSERT (>0.7)  → State directly in call                         │
│  PROBE  (0.4-0.7) → Frame as question: "I get the sense..."    │
│  MENTION (0.2-0.4) → Name only: "I see X in your calendar"     │
│  SILENT (<0.2)  → Don't reference at all                        │
│                                                                   │
│  Evidence count drives confidence:                                │
│  1-2 signals → SILENT, 3-5 → MENTION, 5-10 → PROBE, 10+ → ASSERT│
└────────────────────────────────┬──────────────────────────────────┘
                                 │
                                 ▼
            buildPeopleIntel() → injected into Vapi variableValues
```

### 4.4 Observability Pipeline

```
Agent starts (any agent/cron)
    │
    ▼
withAgentRun('agent-name', userId, async (ctx) => {
    │
    ├──► AgentRun created (status: "running")
    │
    ├──► Agent does work
    │       ├── ctx.log('processing stakeholder X')  → structured log
    │       ├── ctx.increment('itemsProcessed')
    │       └── ctx.trackLLMCall(tokens)
    │
    ├──► SUCCESS: completeAgentRun(ctx)
    │       └── AgentRun updated (status: "completed", durationMs, outputSummary)
    │
    └──► FAILURE: failAgentRun(ctx, error)
            ├── AgentRun updated (status: "failed", errorMessage, errorStack)
            └── Sentry.captureException(error)
})
    │
    ▼
Health Dashboard (GET /api/admin/agent-health)
    │
    ├── Queries AgentRun for last 24h/7d per agent
    ├── Detects: no runs (stale), high failure rate, slow runs
    └── Returns structured health report
```

### 4.5 Weekly Analysis Cycle

```
Sunday Pipeline (sequential):

11:00 UTC │ cron-coaching-trajectory
          │   → computeWeeklyTrajectoryAllUsers()
          │   → CoachingTrajectory snapshot per user
          ▼
12:00 UTC │ cron-intel-synthesis
          │   → synthesizeUserIntelligence() per user
          │   → UserIntelligence profile updated
          ▼
12:15 UTC │ cron-stakeholder-synthesis
          │   → synthesizeStakeholderIntelligence() per user
          │   → StakeholderIntelligence updated
          ▼
12:30 UTC │ cron-community-detection
          │   → detectCommunities() per user
          │   → KnowledgeCommunity updated
          ▼
12:45 UTC │ cron-domain-synthesis
          │   → synthesizeDomainContext() per user
          │   → DomainContext updated
          ▼
15:00 UTC │ cron-prompt-insights
          │   → discoverInsights() + measureInsights()
          │   → PromptInsight lifecycle management

Wednesday Pipeline:

13:00 UTC │ cron-relationship-analysis
          │   → deepAnalyzeRelationship() per user
          │   → CoachingRelationshipPlan updated
          │   → Personality profile refined
          │   → Archetype detected/updated

Weekly (new, P1):

TBD       │ cron-relationship-profiling
          │   → batchProfileRelationships() per user
          │   → StakeholderProfile archetype/style updated

TBD       │ cron-email-content-analysis
          │   → batchAnalyzeEmailContent() per user
          │   → Email-derived personality signals extracted

TBD       │ cron-project-inference
          │   → inferProjectFromMeetings() per user
          │   → New ProfessionalProject candidates surfaced
```

---

## 5. Cron Schedule (Complete)

### Existing Crons

| Queue Name | Schedule | UTC Time | IST Equivalent | What It Does | Dependencies |
|------------|----------|----------|----------------|--------------|-------------|
| `cron-sync-calendar` | `0 */2 * * *` | Every 2h | Every 2h | Calendar sync (skips users with active watch channels) | None |
| `cron-sync-email` | `0 */2 * * *` | Every 2h | Every 2h | Email sync (skips users with active watch) | None |
| `cron-sync-drive` | `0 */4 * * *` | Every 4h | Every 4h | Drive sync (least time-sensitive) | None |
| `cron-confidence-decay` | `0 1 * * *` | 01:00 | 06:30 AM | Decay old knowledge fact confidence | None |
| `cron-morning-brief` | `30 2 * * *` | 02:30 | 08:00 AM | Morning brief + auto-enrich for high-stakes meetings | Sync complete |
| `cron-renew-watch-channels` | `0 3 * * *` | 03:00 | 08:30 AM | Renew expiring Google watch channels | None |
| `cron-commitment-reminders` | `0 4 * * *` | 04:00 | 09:30 AM | Check overdue commitments, send reminders | None |
| `cron-pre-meeting-prep` | `*/30 * * * *` | Every 30m | Every 30m | Pre-meeting prep nudges | Calendar sync |
| `cron-post-meeting-review` | `*/30 * * * *` | Every 30m | Every 30m | Post-meeting debrief nudges | Calendar sync |
| `cron-daily-call-scheduler` | `*/15 * * * *` | Every 15m | Every 15m | Schedule daily voice calls for users | None |
| `execute-scheduled-calls` | `*/5 * * * *` | Every 5m | Every 5m | Execute pending scheduled calls via Vapi | Scheduler |
| `cron-call-evaluation-poll` | `*/10 * * * *` | Every 10m | Every 10m | Find unevaluated calls, queue evaluation | Calls complete |
| `cron-context-deepening` | `0 11 * * *` | 11:00 | 04:30 PM | Afternoon context deepening | Post-meeting |
| `cron-weekly-meeting-patterns` | `30 10 * * 0` | Sun 10:30 | Sun 4:00 PM | Weekly meeting pattern snapshot | Calendar sync |
| `cron-coaching-trajectory` | `0 11 * * 0` | Sun 11:00 | Sun 4:30 PM | Weekly coaching trajectory snapshot | Evaluations |
| `cron-weekly-reflection` | `0 12 * * 0` | Sun 12:00 | Sun 5:30 PM | Weekly reflection message | Trajectory |
| `cron-intel-synthesis` | `0 12 * * *` | 12:00 | 05:30 PM | Intelligence synthesis | Syncs + context |
| `cron-stakeholder-synthesis` | `15 12 * * *` | 12:15 | 05:45 PM | Stakeholder intelligence synthesis | Intel synthesis |
| `cron-community-detection` | `30 12 * * *` | 12:30 | 06:00 PM | Knowledge graph community detection | Stakeholder synth |
| `cron-domain-synthesis` | `45 12 * * *` | 12:45 | 06:15 PM | Domain context synthesis | Community detect |
| `cron-stakeholder-enrichment` | `0 13 * * *` | 13:00 | 06:30 PM | Web search enrichment for stakeholders | Stakeholder synth |
| `cron-relationship-analysis` | `0 13 * * 3` | Wed 13:00 | Wed 6:30 PM | Deep relationship analysis (personality, archetype) | Evaluations |
| `cron-friday-ritual` | `0 13 * * 5` | Fri 13:00 | Fri 6:30 PM | Friday ritual message | Week's data |
| `cron-extract-voice` | `0 14 * * *` | 14:00 | 07:30 PM | Voice call fact extraction | Enrichment |
| `cron-pattern-detection` | `0 15 * * *` | 15:00 | 08:30 PM | Pattern detection (end of workday) | All syncs |
| `cron-prompt-insights` | `0 15 * * 0` | Sun 15:00 | Sun 8:30 PM | Auto-learn coaching strategies | Trajectory + rel |
| `cron-admin-daily-brief` | `0 16 * * *` | 16:00 | 09:30 PM | Admin daily brief | All agents |
| `cron-whatsapp-extract` | `0 */4 * * *` | Every 4h | Every 4h | WhatsApp message fact extraction | WhatsApp listener |

### New Crons (to add)

| Queue Name | Schedule | UTC Time | IST Equivalent | What It Does | Dependencies |
|------------|----------|----------|----------------|--------------|-------------|
| `cron-agent-health-check` | `0 */6 * * *` | Every 6h | Every 6h | Check for stale/failed agents, alert | AgentRun data |
| `cron-email-content-analysis` | `0 14 * * 2` | Tue 14:00 | Tue 7:30 PM | Batch email content analysis for stakeholder signals | Email sync |
| `cron-relationship-profiling` | `0 14 * * 4` | Thu 14:00 | Thu 7:30 PM | Multi-signal stakeholder profiling | Email analysis, enrichment |
| `cron-project-inference` | `0 11 * * 1` | Mon 11:00 | Mon 4:30 PM | Infer projects from meeting clusters | Calendar sync |
| `cron-github-sync` | `0 6 * * *` | 06:00 | 11:30 AM | GitHub repo sync (P2) | GitHub installation |

---

## 6. API Routes (New)

### Admin Routes

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/api/admin/agent-health` | GET | Admin | Agent health dashboard — run stats, failure rates, stale detection |
| `/api/admin/agent-runs` | GET | Admin | Paginated agent run history with filters (`?agent=X&status=Y&userId=Z&limit=50&offset=0`) |
| `/api/admin/coaching/trajectory` | GET | Admin | Coaching trajectory data (`?userId=X`) |
| `/api/admin/coaching/evaluations` | GET | Admin | Call evaluation history with score trends (`?userId=X&limit=20`) |
| `/api/admin/coaching/relationship` | GET | Admin | Coaching relationship plan view (`?userId=X`) |

**Response shapes:**

`GET /api/admin/agent-runs`:
```json
{
  "runs": [
    {
      "id": "cuid",
      "agentName": "call-evaluation",
      "userId": "cuid",
      "status": "completed",
      "startedAt": "ISO",
      "durationMs": 2340,
      "itemsProcessed": 1,
      "outputSummary": "Evaluated call xyz — overall 7.2/10"
    }
  ],
  "total": 142,
  "hasMore": true
}
```

### Project Routes

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/api/projects` | GET | User | List user's unified projects with stakeholders, health |
| `/api/projects` | POST | User | Create new project |
| `/api/projects/[id]` | GET | User | Project detail with stakeholders, repos, objectives |
| `/api/projects/[id]` | PATCH | User | Update project fields |
| `/api/projects/[id]` | DELETE | User | Archive project (soft delete via status) |
| `/api/projects/[id]/stakeholders` | GET | User | List project stakeholders with roles |
| `/api/projects/[id]/stakeholders` | POST | User | Link stakeholder to project (`{ stakeholderId, role }`) |
| `/api/projects/[id]/stakeholders/[sid]` | DELETE | User | Unlink stakeholder from project |

### GitHub Routes (P2)

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/api/github/install` | GET | User | GitHub App installation callback |
| `/api/github/webhook` | POST | Webhook sig | GitHub App webhook receiver |
| `/api/github/repos` | GET | User | List repos from user's GitHub installations |
| `/api/projects/[id]/repos` | POST | User | Link repo to project (`{ repoFullName }`) |
| `/api/projects/[id]/repos/[rid]` | DELETE | User | Unlink repo from project |

---

## 7. Vapi Prompt Changes

### New Variables Added to `assistantOverrides.variableValues`

| Variable | Contents | Used By | Source |
|----------|----------|---------|--------|
| `conversationPlan` | Segment-by-segment plan for this call (call 1-3 have distinct plans, 4+ are maturity-based) | Daily, Meeting | `conversation-engine.ts` → `buildConversationPlan()` |
| `peopleIntel` | Confidence-tiered stakeholder intelligence for today's attendees | Daily, Meeting | `conversation-engine.ts` → `buildPeopleIntel()` |
| `personalThreadInstruction` | Which personal thread to touch and how | Daily | `thread-manager.ts` → `selectThreadAction()` |
| `confidenceMode` | `LEARNING` / `OBSERVING` / `COACHING` | Daily, Meeting, Onboarding | `confidence-engine.ts` → `computeMaturityLevel()` |
| `targetDuration` | Target call length in minutes | Daily | UserPreferences + call count heuristic |
| `callCount` | Total previous calls with this user | Daily, Meeting, Onboarding | PersonalContext.callCount |
| `coachingThemes` | Active coaching themes from relationship plan (e.g., "delegation anxiety", "stakeholder avoidance") | Daily | `call-planning-agent.ts` → CoachingRelationshipPlan.coachingThemes |
| `projectContext` | Active projects relevant to today's meetings (name, status, key stakeholders) | Daily, Meeting | `project-service.ts` → `getProjectsWithContext()` |
| `recentEvaluationInsight` | Top improvement suggestion from last call's evaluation (e.g., "Ask more follow-up questions") | Daily | Last CallEvaluation.whatToImprove[0] |
| `overdueCommitments` | Commitments user made but hasn't followed up on | Daily | CoachingRelationshipPlan.commitments filtered by status |
| `lastCallSummary` | Summary of last call (for memory callbacks) | Daily | VoiceCall.summary (most recent) |
| `onboardingComplete` | "true" / "false" | Daily | OnboardingProgress.onboardingComplete |
| `onboardingUncovered` | List of uncovered onboarding topics | Daily | OnboardingProgress (uncovered fields) |
| `topStakeholderProbe` | For call 3: specific stakeholder to ask about | Daily (call 3) | Most frequent attendee without intel |

### Variables Already Existing (no changes needed)

| Variable | Source |
|----------|--------|
| `userName` | User.name |
| `jobTitle` | User.jobTitle |
| `callType` | From trigger |
| `today` | Formatted date |
| `meetingsSummary` | MeetingSyncRecord |
| `meetingCount` | Count |
| `relationshipStage` | Heuristic from callCount |

### Guardrail Blocks (to add to setup script)

1. **CLOSED-WORLD RULES** — Only reference meetings, people, commitments in context. Never invent.
2. **ANTI-GENERIC RULES** — Ban list of generic coaching phrases. Specificity test before giving advice.
3. **CONFIDENCE MODE RULES** — LEARNING (ask only), OBSERVING (hedge observations), COACHING (assert high-confidence).
4. **EARLY CALL RULES** (calls 1-3) — No role inference, no outcome prediction, no email content, no claiming to know people.
5. **PERSONAL RULES** — Only reference user-shared personal info. Don't push on short answers. Natural callbacks.

---

## 8. Migration Strategy

### 8.1 Stakeholder Name Deduplication (926 email-derived names)

**Problem:** 926 StakeholderProfile records created from email sync, many with only email addresses or partial names. Duplicates exist (e.g., "Raj" and "Rajagopalan Srinivasan" for the same person).

**Strategy:**
1. `EntityMergeCandidate` model already exists in schema
2. Run `stakeholder-synthesis-agent` with fuzzy matching (already implemented) to populate EntityMergeCandidate
3. Surface merge candidates in admin dashboard for manual review
4. Auto-merge high-confidence matches (similarity > 0.95) after first manual confirmation establishes pattern
5. Non-destructive: merged profiles retain `mergedIntoId` pointer, original data preserved

### 8.2 Project Unification (UserProject + ProfessionalProject + KnowledgeEntity)

**Problem:** Three separate representations of "project":
- `UserProject` (626) — legacy, from initial user setup
- `ProfessionalProject` (2733) — newer, with org links
- `KnowledgeEntity` where type = `PROJECT` — from knowledge graph extraction

**Strategy:**
1. Add new fields to `ProfessionalProject` (description, driveLink, risks, healthStatus, userNotes, knowledgeEntityId)
2. Create `unifyProjects(userId)` migration function:
   - For each `UserProject`, find or create matching `ProfessionalProject`
   - Copy fields (name, description, driveLink, risks, status)
   - Link matching `KnowledgeEntity(PROJECT)` via knowledgeEntityId
   - Preserve `UserProject` records (don't delete) — mark with migrated flag
3. Update all code that reads `UserProject` to read `ProfessionalProject` instead
4. Run as one-time migration job, then as part of `project-service.ts` for new users
5. After migration verified, deprecate `UserProject` queries (keep model for data safety)

### 8.3 Backward Compatibility

- **Schema additions are non-breaking** — all new fields are optional, all new models are independent
- **Existing API routes unchanged** — new routes are additive
- **Existing cron jobs unchanged** — only adding `withAgentRun()` wrapper (no behavior change)
- **Vapi prompts use `{{variable}}` syntax** — missing variables render as empty string (safe)
- **No feature flags needed for P0** — observability is invisible to users
- **P1 features (conversation engine, stakeholder profiling) are behind data availability** — they enhance output only when data exists

### 8.4 Feature Flags (if needed)

For user-facing P1 features, use existing `Subscription.enabledFeatures` array:

| Flag | Purpose | Default |
|------|---------|---------|
| `projects_v2` | Show unified project UI (when ready) | Off |
| `github_connector` | Enable GitHub integration (P2) | Off |
| `coaching_dashboard` | Show coaching intelligence dashboard | Off (admin only initially) |

---

## 9. Implementation Phases

### Phase 0: Observability Foundation (P0) — Ship First

**What:**
- `AgentRun` model + `agent-run.ts` helper
- Wrap all existing cron handlers in `withAgentRun()`
- Admin health check API (`/api/admin/agent-health`, `/api/admin/agent-runs`)
- Expand worker health endpoint with AgentRun summary

**Shippable independently:** Yes — pure additive, no behavior changes.

**Files:**
| Type | File | New/Modify |
|------|------|-----------|
| Schema | `web/prisma/schema.prisma` | Modify (add AgentRun) |
| Worker | `worker/src/lib/agent-run.ts` | New |
| Worker | `worker/src/index.ts` | Modify (wrap handlers, add cron) |
| Worker | `worker/src/agents/call-evaluation-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/coaching-relationship-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/coaching-trajectory-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/prompt-insight-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/stakeholder-synthesis-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/stakeholder-enrichment-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/intelligence-synthesis-agent.ts` | Modify (wrap) |
| Worker | `worker/src/agents/domain-synthesis-agent.ts` | Modify (wrap) |
| Web | `web/app/api/admin/agent-health/route.ts` | New |
| Web | `web/app/api/admin/agent-runs/route.ts` | New |

**Estimated file count:** 2 new, 11 modified

**Dependencies:** None — can start immediately.

---

### Phase 1A: Conversation Engine + Coaching Intelligence Wiring (P0/P1)

**What:**
- Extract `buildConversationPlan()` and `buildPeopleIntel()` from inline in `vapi-voice.ts` into `conversation-engine.ts`
- Wire `extractPostCallSignals()` into webhook post-call pipeline
- Add new variables to `buildVariableValues()` (both worker + web sides)
- Update Vapi assistant prompts with guardrails and new variable placeholders
- Add coaching themes, project context, evaluation insights to call context

**Shippable independently:** Yes — enhances call quality, backward compatible (missing variables = empty).

**Files:**
| Type | File | New/Modify |
|------|------|-----------|
| Worker | `worker/src/lib/conversation-engine.ts` | New |
| Worker | `worker/src/lib/vapi-voice.ts` | Modify (refactor, add variables) |
| Web | `web/app/api/vapi/call/route.ts` | Modify (mirror new variables) |
| Web | `web/app/api/vapi/webhook/route.ts` | Modify (expand post-call pipeline) |
| Scripts | `scripts/setup-vapi-assistants.ts` | Modify (guardrails, new vars) |

**Estimated file count:** 1 new, 4 modified

**Dependencies:** Phase 0 (for AgentRun tracking of post-call pipeline).

---

### Phase 1B: Stakeholder Profiling + Project Entity (P1)

**What:**
- Email content analyzer for stakeholder personality signals
- Relationship profiler for multi-signal synthesis
- Project unification (UserProject + ProfessionalProject + KnowledgeEntity)
- Project CRUD APIs
- ProjectStakeholder join table
- Stakeholder enrichment expansion (email content analysis step)
- New crons for email analysis and relationship profiling

**Shippable independently:** Yes — enriches stakeholder data, new project API is additive.

**Files:**
| Type | File | New/Modify |
|------|------|-----------|
| Schema | `web/prisma/schema.prisma` | Modify (ProjectStakeholder, ProfessionalProject fields) |
| Worker | `worker/src/agents/email-content-analyzer.ts` | New |
| Worker | `worker/src/agents/relationship-profiler.ts` | New |
| Worker | `worker/src/agents/project-service.ts` | New |
| Worker | `worker/src/agents/stakeholder-enrichment-agent.ts` | Modify (add email step) |
| Worker | `worker/src/agents/stakeholder-synthesis-agent.ts` | Modify (confidence tiers) |
| Worker | `worker/src/index.ts` | Modify (new queues + crons) |
| Web | `web/app/api/projects/route.ts` | New |
| Web | `web/app/api/projects/[id]/route.ts` | New |
| Web | `web/app/api/projects/[id]/stakeholders/route.ts` | New |

**Estimated file count:** 6 new, 4 modified

**Dependencies:** Phase 0 (for AgentRun). Can run in parallel with Phase 1A.

---

### Phase 1C: Admin Dashboard APIs (P1)

**What:**
- Coaching trajectory, evaluations, relationship plan admin views
- Agent health dashboard integration

**Shippable independently:** Yes — admin-only, no user impact.

**Files:**
| Type | File | New/Modify |
|------|------|-----------|
| Web | `web/app/api/admin/coaching/trajectory/route.ts` | New |
| Web | `web/app/api/admin/coaching/evaluations/route.ts` | New |
| Web | `web/app/api/admin/coaching/relationship/route.ts` | New |

**Estimated file count:** 3 new

**Dependencies:** Phase 0 (AgentRun data exists).

---

### Phase 2: GitHub Connector (P2)

**What:**
- GitHub App installation flow
- GitHub sync agent (PRs, issues, commits)
- GitHub fact extractor (knowledge graph integration)
- Project-repository linking
- GitHub webhook receiver

**Shippable independently:** Yes — fully optional feature behind feature flag.

**Files:**
| Type | File | New/Modify |
|------|------|-----------|
| Schema | `web/prisma/schema.prisma` | Modify (GitHubInstallation, GitHubSyncRecord, ProjectRepository) |
| Worker | `worker/src/agents/github-sync-agent.ts` | New |
| Worker | `worker/src/agents/knowledge/github-fact-extractor.ts` | New |
| Worker | `worker/src/index.ts` | Modify (new queue + cron) |
| Web | `web/app/api/github/install/route.ts` | New |
| Web | `web/app/api/github/webhook/route.ts` | New |
| Web | `web/app/api/github/repos/route.ts` | New |
| Web | `web/app/api/projects/[id]/repos/route.ts` | New |

**Estimated file count:** 6 new, 2 modified

**Dependencies:** Phase 1B (project entity must exist).

---

### Phase Summary

| Phase | Priority | New Files | Modified Files | Can Ship Alone? | Depends On |
|-------|----------|-----------|---------------|-----------------|------------|
| 0: Observability | P0 | 2 | 11 | Yes | Nothing |
| 1A: Conversation Engine | P0/P1 | 1 | 4 | Yes | Phase 0 |
| 1B: Stakeholder + Project | P1 | 6 | 4 | Yes | Phase 0 |
| 1C: Admin APIs | P1 | 3 | 0 | Yes | Phase 0 |
| 2: GitHub | P2 | 6 | 2 | Yes | Phase 1B |
| **Total** | | **18** | **~15** | | |

### Recommended Order

1. **Phase 0** (1-2 days) — foundation, unblocks everything
2. **Phase 1A** (2-3 days) — highest user impact, improves every call
3. **Phase 1B** (3-4 days) — enriches data quality, can run parallel with 1A

---

## 10. Self-Critique & Design Corrections

### Critique 1: Call scheduling invisible to admin
The auto-calling system (`callFrequencyMinutes`, `callWindowStart/End`, retries) is the most critical user-facing pipeline but has ZERO admin visibility. Admin can't see: when calls are scheduled, what failed, what retried, what was skipped. **Fix:** Add call scheduling status to admin dashboard, including per-user schedule config, today's calls (pending/calling/completed/no_answer), and admin controls to pause/resume/adjust frequency per user.

### Critique 2: `withAgentRun()` wrapping 11 files in Phase 0 is too much churn
Wrapping every existing agent before doing anything else delays useful work. **Fix:** Ship `AgentRun` model + `agent-run.ts` helper first, then wrap agents incrementally as each subsequent phase touches them. Phase 0 should only wrap the agents known to be failing silently (stakeholder-synthesis, stakeholder-enrichment, voice-fact-extractor).

### Critique 3: Email content analyzer as separate file is premature
The email sync already runs daily. Adding a standalone `email-content-analyzer.ts` + separate cron creates a parallel pipeline. **Fix:** Enhance `email-fact-extractor.ts` to extract richer stakeholder personality signals during its existing run, rather than creating a separate pass. Only create a standalone analyzer if email fact extraction proves insufficient.

### Critique 4: `conversation-engine.ts` described as "extract from inline" but code doesn't exist inline
The design says "extract buildConversationPlan from vapi-voice.ts" but those functions don't exist yet in vapi-voice.ts. They're designed in conversation-engine-design.md but never coded. **Fix:** `conversation-engine.ts` is a NEW module implementing the design doc, not a refactor.

### Critique 5: Silent `provider === 'none'` returns throughout codebase
Multiple agents check `if (config.provider === 'none') return;` — this silently skips work. With the platform key guarantee (first 50 users), this should never happen. **Fix:** These should log a WARNING when hit, not silently return. If the platform key is unavailable, that's a system-level alert, not a per-user skip.

### Critique 6: Missing call scheduling in admin surface
**Fix:** Add these to the admin autoresearch page and a new admin API:
- Per-user call config (frequency, window, enabled, channel)
- Today's call schedule: pending, calling, completed, no_answer, retried
- Admin controls: pause/resume daily calls, adjust frequency
- Call attempt history with outcomes

### Applied Fixes
- Phase 0 reduced to: schema + helper + 3 critical agent wraps only
- Email content analysis folded into enhanced email-fact-extractor
- conversation-engine.ts clarified as NEW implementation
- Call scheduling admin API and UI added to Phase 0
- All `provider === 'none'` returns will get warning logs
4. **Phase 1C** (1 day) — admin visibility
5. **Phase 2** (3-4 days) — when a user requests GitHub integration
