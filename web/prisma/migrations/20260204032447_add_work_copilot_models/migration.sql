-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'MANAGER', 'CURATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompanyStage" AS ENUM ('SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C_PLUS', 'GROWTH', 'PUBLIC');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'COMMITTED', 'COMPLETED', 'SKIPPED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('EMAIL', 'CALENDAR', 'DOCUMENTS', 'NOTES', 'MANUAL', 'MCP');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'SYNCING', 'PAUSED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('EMAIL_SENT', 'EMAIL_RECEIVED', 'EMAIL_THREAD', 'MEETING_ATTENDED', 'MEETING_NOTES', 'DOCUMENT_AUTHORED', 'DOCUMENT_EDITED', 'VOICE_NOTE', 'TEXT_NOTE', 'QUICK_REFLECTION', 'STRUCTURED_REFLECTION', 'PROJECT_UPDATE', 'CONTEXT_TEACHING');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('POSITIVE', 'NEGATIVE', 'MISSED_OPPORTUNITY', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TrendDirection" AS ENUM ('IMPROVING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "LearningType" AS ENUM ('ORGANIZATION_CULTURE', 'UNWRITTEN_RULE', 'STAKEHOLDER_INSIGHT', 'HISTORICAL_CONTEXT', 'VOCABULARY_TERM', 'POLITICAL_DYNAMIC', 'USER_CORRECTION');

-- CreateEnum
CREATE TYPE "StakeholderRelationship" AS ENUM ('BOSS', 'PEER', 'DIRECT_REPORT', 'SKIP_LEVEL', 'BOARD_MEMBER', 'INVESTOR', 'CUSTOMER', 'VENDOR', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "PersonaArchetype" AS ENUM ('DRIVER', 'ANALYST', 'COLLABORATOR', 'VISIONARY', 'GUARDIAN', 'POLITICIAN', 'CHAMPION', 'PRAGMATIST', 'SKEPTIC', 'CONSERVATIVE', 'OPERATOR');

-- CreateEnum
CREATE TYPE "CommunicationStyle" AS ENUM ('DIRECT', 'DIPLOMATIC', 'DATA_DRIVEN', 'NARRATIVE', 'VISUAL', 'RELATIONSHIP', 'COLLABORATIVE', 'FORMAL', 'STORY_DRIVEN');

-- CreateEnum
CREATE TYPE "DecisionStyle" AS ENUM ('QUICK_INTUITIVE', 'DELIBERATE_ANALYTIC', 'CONSENSUS_SEEKING', 'DIRECTIVE');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('HIGH', 'MODERATE', 'LOW');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('EMAIL', 'MEETING', 'CALL', 'MESSAGE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "InteractionQuality" AS ENUM ('RELATIONSHIP_BUILDING', 'TRANSACTIONAL', 'WITHDRAWAL', 'CONFLICT');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('NUDGE', 'OBSERVATION', 'WEEKLY_DIGEST', 'INTERVENTION', 'CELEBRATION');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'DELIVERED', 'READ', 'ACTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "LearningRecType" AS ENUM ('COURSE', 'CASE', 'MODULE', 'REFLECTION_PROMPT');

-- CreateEnum
CREATE TYPE "LearningRecStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'FAILED');

-- CreateEnum
CREATE TYPE "CaseVertical" AS ENUM ('CONSULTING', 'TECHNOLOGY', 'FINANCE', 'HEALTHCARE', 'RETAIL', 'MANUFACTURING', 'GENERAL', 'DPI', 'TECH_SAAS', 'FINANCIAL_SVCS');

-- CreateEnum
CREATE TYPE "CaseHorizontal" AS ENUM ('LEADERSHIP', 'STRATEGY', 'FINANCE', 'MARKETING', 'PRODUCT', 'TECHNOLOGY', 'OPERATIONS', 'RISK', 'ORG_DESIGN', 'COMMUNICATION', 'SALES', 'PEOPLE', 'LEADERSHIP_PEOPLE', 'STRATEGY_PLANNING', 'STAKEHOLDER_MGMT', 'FINANCE_ECONOMICS', 'MARKETING_GTM', 'PRODUCT_INNOVATION', 'TECHNOLOGY_DIGITAL', 'OPERATIONS_EXECUTION', 'RISK_COMPLIANCE', 'ORG_DESIGN_CHANGE', 'COMMUNICATION_INFLUENCE');

-- CreateEnum
CREATE TYPE "CaseComplexity" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SurfacingTrigger" AS ENUM ('CALENDAR_UPCOMING', 'PATTERN_DETECTED', 'DECISION_MENTIONED', 'TRANSITION_DETECTED', 'USER_REQUESTED', 'SIGNAL_BASED', 'LEARNING_PATH', 'AMBIENT');

-- CreateEnum
CREATE TYPE "SurfacingResponse" AS ENUM ('VIEWED', 'STARTED', 'COMPLETED', 'REMIND_LATER', 'DISMISSED', 'NOT_RELEVANT');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('REORG', 'HIRING', 'FIRING', 'BUDGET_REQUEST', 'STRATEGY_PIVOT', 'PRODUCT_CUT', 'VENDOR_SELECTION', 'PRICING_CHANGE', 'MARKET_ENTRY', 'PARTNERSHIP', 'ACQUISITION', 'CRISIS_RESPONSE', 'BOARD_PRESENTATION', 'INVESTOR_PITCH', 'PEOPLE', 'STRATEGY', 'INVESTMENT', 'STAKEHOLDER', 'OPERATIONAL', 'CAREER');

-- CreateEnum
CREATE TYPE "Reversibility" AS ENUM ('EASILY_REVERSIBLE', 'REVERSIBLE_WITH_COST', 'MOSTLY_IRREVERSIBLE', 'IRREVERSIBLE');

-- CreateEnum
CREATE TYPE "Timeframe" AS ENUM ('IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "ImpactScope" AS ENUM ('INDIVIDUAL', 'TEAM', 'DEPARTMENT', 'COMPANY', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('ANALYZING', 'READY_TO_DECIDE', 'DECIDED', 'IMPLEMENTED', 'REVIEWED', 'DRAFT', 'READY', 'PREPPING', 'EXECUTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ScenarioProbability" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'LIKELY', 'POSSIBLE', 'UNLIKELY');

-- CreateEnum
CREATE TYPE "ImpactLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "ImpactType" AS ENUM ('POSITIVE', 'NEGATIVE', 'MIXED', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "StakeholderReaction" AS ENUM ('STRONG_SUPPORT', 'SUPPORT', 'NEUTRAL', 'CONCERN', 'RESISTANCE', 'STRONG_OPPOSITION', 'SUPPORTIVE', 'SKEPTICAL', 'BLOCKER');

-- CreateEnum
CREATE TYPE "KPIType" AS ENUM ('REVENUE', 'GROWTH', 'PROFITABILITY', 'CUSTOMER', 'PRODUCT', 'TEAM', 'OPERATIONAL', 'STRATEGIC', 'PERSONAL');

-- CreateEnum
CREATE TYPE "KPITimeframe" AS ENUM ('QUARTERLY', 'ANNUAL', 'MULTI_YEAR', 'MILESTONE');

-- CreateEnum
CREATE TYPE "KPIStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'REVISED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('INITIATIVE', 'DECISION', 'CONVERSATION', 'HIRE', 'PROCESS', 'MEETING', 'REVIEW', 'OTHER');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ActionKPIRelationship" AS ENUM ('DIRECTLY_DRIVES', 'ENABLES', 'PROTECTS', 'INDIRECT');

-- CreateEnum
CREATE TYPE "WasteType" AS ENUM ('MEETING_NO_DECISION', 'REPORT_UNREAD', 'DUPLICATE_EFFORT', 'UNNECESSARY_ATTENDANCE', 'NO_CLEAR_OWNER', 'SCOPE_CREEP', 'PERFECTIONISM', 'WAITING', 'CONTEXT_SWITCHING', 'MISALIGNED_PRIORITY');

-- CreateEnum
CREATE TYPE "SignalCategory" AS ENUM ('COMPETITIVE', 'MARKET', 'ECONOMIC', 'REGULATORY', 'TECHNOLOGY', 'CUSTOMER', 'INTERNAL', 'TEAM');

-- CreateEnum
CREATE TYPE "ContextType" AS ENUM ('REVENUE_DRIVER', 'COST_DRIVER', 'COMPETITIVE_ADVANTAGE', 'KEY_CONSTRAINT', 'TEAM_STRENGTH', 'TEAM_GAP', 'STAKEHOLDER_DYNAMIC', 'MARKET_POSITION', 'STRATEGIC_BET', 'PAST_LEARNING');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('BOARD_PRESENTATION', 'INVESTOR_PITCH', 'CUSTOMER_MEETING', 'DIFFICULT_CONVERSATION', 'NEGOTIATION', 'STAKEHOLDER_ALIGNMENT', 'PERFORMANCE_REVIEW', 'CRISIS_COMMUNICATION', 'TEAM_ALL_HANDS', 'ONE_ON_ONE', 'SALES_CALL', 'INTERVIEW', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('PREPPING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ObjectionLikelihood" AS ENUM ('VERY_LIKELY', 'POSSIBLE', 'UNLIKELY');

-- CreateEnum
CREATE TYPE "LogEntryType" AS ENUM ('NOTE', 'OBJECTION', 'PIVOT', 'COMMITMENT', 'ACTION_ITEM', 'QUESTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobTitle" TEXT,
    "company" TEXT,
    "industry" TEXT,
    "companyStage" "CompanyStage",
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessModel" TEXT,
    "primaryMetric" TEXT,
    "currentChallenges" TEXT[],
    "strategicPriorities" TEXT[],
    "teamSize" INTEGER,
    "directReports" INTEGER,
    "reportingTo" TEXT,
    "peerVPs" TEXT[],
    "decisionPatterns" JSONB,
    "communicationStyle" TEXT,
    "blindSpots" TEXT[],
    "strengths" TEXT[],
    "competitors" TEXT[],
    "keyCustomerSegments" TEXT[],
    "regulatoryContext" TEXT,
    "knownRevenueDrivers" JSONB,
    "knownCostDrivers" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cluster" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "cluster" TEXT,
    "skills" JSONB,
    "vertical" "CaseVertical" NOT NULL DEFAULT 'GENERAL',
    "horizontals" "CaseHorizontal"[],
    "targetRoles" TEXT[],
    "situations" TEXT[],
    "complexity" "CaseComplexity" NOT NULL DEFAULT 'INTERMEDIATE',
    "durationMins" INTEGER NOT NULL DEFAULT 15,
    "triggerKeywords" TEXT[],
    "currentVersionId" TEXT,
    "sourceUrl" TEXT,
    "factSheet" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseVersion" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "changeLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "CaseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedArticle" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL,
    "generatedCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestedArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,
    "feedback" JSONB,
    "rounds" JSONB,
    "skillDelta" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CaseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queue" JSONB NOT NULL,
    "coreCount" INTEGER NOT NULL,
    "electiveCount" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,

    CONSTRAINT "RecPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capacity" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "evidence_observation" TEXT,
    "evidence_benchmark" TEXT,
    "action_summary" TEXT NOT NULL,
    "action_bullets" JSONB NOT NULL,
    "target_meeting_id" TEXT,
    "related_case_id" TEXT,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "committed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "UserActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionPlanId" TEXT,
    "recommendationId" TEXT,
    "caseId" TEXT,
    "meeting_id" TEXT,
    "did_practice" BOOLEAN,
    "user_notes" TEXT,
    "ai_observations" JSONB,
    "ai_observations_accuracy" TEXT,
    "content" TEXT,
    "qualityScore" INTEGER,
    "debtCleared" BOOLEAN NOT NULL DEFAULT true,
    "structuredData" JSONB,
    "prompted_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "response_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "driveLink" TEXT,
    "risks" JSONB,
    "status" TEXT,
    "userNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "skillId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "outcome" TEXT,
    "aiVerification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectHealth" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ragStatus" TEXT NOT NULL,
    "pivotSignal" BOOLEAN NOT NULL DEFAULT false,
    "advice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "stripeCurrentPeriodEnd" TIMESTAMP(3),
    "monthlyCaseLimit" INTEGER NOT NULL DEFAULT 3,
    "monthlyAiFeedbackLimit" INTEGER NOT NULL DEFAULT 0,
    "casesUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "aiFeedbackUsedThisMonth" INTEGER NOT NULL DEFAULT 0,
    "lastResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasGoogleIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "hasAiFeedback" BOOLEAN NOT NULL DEFAULT false,
    "hasAgenticCoach" BOOLEAN NOT NULL DEFAULT false,
    "hasTeamFeatures" BOOLEAN NOT NULL DEFAULT false,
    "enabledFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyPreview" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripePaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataConnector" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accountId" TEXT,
    "mcpConfig" JSONB,
    "syncFrequency" INTEGER NOT NULL DEFAULT 60,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkArtifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "content" TEXT,
    "rawContent" TEXT,
    "metadata" JSONB NOT NULL,
    "participants" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,
    "analysisResult" JSONB,
    "linkedNoteId" TEXT,

    CONSTRAINT "WorkArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capacity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "whyAIProof" TEXT NOT NULL,
    "courses" TEXT[],

    CONSTRAINT "Capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "artifactId" TEXT,
    "type" "ObservationType" NOT NULL,
    "context" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" "Severity" NOT NULL,
    "userAgreed" BOOLEAN,
    "userFeedback" TEXT,
    "userContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapacityScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "trend" "TrendDirection" NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "positiveCount" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "missedCount" INTEGER NOT NULL DEFAULT 0,
    "lastObservation" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapacityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization" JSONB NOT NULL DEFAULT '{}',
    "history" JSONB NOT NULL DEFAULT '{}',
    "vocabulary" JSONB NOT NULL DEFAULT '{}',
    "landscape" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainLearning" (
    "id" TEXT NOT NULL,
    "domainContextId" TEXT NOT NULL,
    "type" "LearningType" NOT NULL,
    "source" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "organization" TEXT,
    "relationshipStrength" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastInteraction" TIMESTAMP(3),
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "communicationTone" TEXT,
    "avgResponseTime" INTEGER,
    "topics" TEXT[],
    "influenceLevel" TEXT,
    "stanceOnProjects" TEXT,
    "keyInterests" TEXT[],
    "connectedThrough" TEXT[],
    "bridgePosition" BOOLEAN NOT NULL DEFAULT false,
    "personaArchetype" "PersonaArchetype",
    "communicationStyle" "CommunicationStyle",
    "primaryMotivation" TEXT,
    "secondaryMotivations" TEXT[],
    "fears" TEXT[],
    "decisionStyle" "DecisionStyle",
    "riskTolerance" "RiskTolerance",
    "userNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "valueExchange" TEXT,
    "politicalCapital" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "lastValidatedAt" TIMESTAMP(3),

    CONSTRAINT "StakeholderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderInteraction" (
    "id" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "artifactId" TEXT,
    "type" "InteractionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quality" "InteractionQuality" NOT NULL,
    "summary" TEXT,
    "outcome" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "observationIds" TEXT[],
    "artifactIds" TEXT[],
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "userResponse" TEXT,
    "helpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LearningRecType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "priority" INTEGER NOT NULL,
    "estimatedTime" INTEGER NOT NULL,
    "status" "LearningRecStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "targetScore" DOUBLE PRECISION NOT NULL,
    "baselineScore" DOUBLE PRECISION NOT NULL,
    "currentScore" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3) NOT NULL,
    "artifactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoreChange" DOUBLE PRECISION,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "validationNotes" TEXT,
    "status" "MissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseSurfacing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "trigger" "SurfacingTrigger" NOT NULL,
    "triggerContext" JSONB,
    "relevanceScore" DOUBLE PRECISION,
    "surfacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" "SurfacingResponse",
    "respondedAt" TIMESTAMP(3),
    "caseStarted" BOOLEAN NOT NULL DEFAULT false,
    "caseCompleted" BOOLEAN NOT NULL DEFAULT false,
    "userRating" INTEGER,

    CONSTRAINT "CaseSurfacing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "decisionType" "DecisionType" NOT NULL,
    "reversibility" "Reversibility",
    "timeframe" "Timeframe",
    "impactScope" "ImpactScope",
    "status" "DecisionStatus" NOT NULL DEFAULT 'ANALYZING',
    "chosenScenario" TEXT,
    "actualOutcome" TEXT,
    "lessonsLearned" TEXT,
    "prepQuestions" TEXT[],
    "watchOuts" TEXT[],
    "successSignals" TEXT[],
    "decisionDeadline" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "probability" "ScenarioProbability" NOT NULL,
    "bestCase" TEXT,
    "worstCase" TEXT,
    "mostLikely" TEXT,
    "assumptions" TEXT[],
    "dependencies" TEXT[],
    "risks" TEXT[],
    "immediateActions" TEXT[],
    "shortTermActions" TEXT[],
    "keyActions" TEXT[],
    "talkingPoints" TEXT[],
    "watchFor" TEXT[],
    "stakeholderReactions" JSONB,
    "order" INTEGER,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderImpact" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "impactLevel" "ImpactLevel",
    "impactType" "ImpactType",
    "likelyReaction" "StakeholderReaction",
    "initialReaction" "StakeholderReaction",
    "reactionReason" TEXT,
    "concerns" TEXT[],
    "motivations" TEXT[],
    "mitigationStrategy" TEXT,
    "approachStrategy" TEXT,
    "talkingPoints" TEXT[],
    "riskIfMishandled" TEXT,

    CONSTRAINT "StakeholderImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderReactionHistory" (
    "id" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "theirReaction" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "whatWorked" TEXT,
    "whatDidnt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderReactionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserKPI" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "baselineValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "type" "KPIType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "timeframe" "KPITimeframe" NOT NULL,
    "isPersonal" BOOLEAN NOT NULL,
    "dependsOn" TEXT[],
    "status" "KPIStatus" NOT NULL DEFAULT 'ON_TRACK',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revisedAt" TIMESTAMP(3),

    CONSTRAINT "UserKPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIAssumption" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "assumption" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "validatedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "impactIfFalse" TEXT,

    CONSTRAINT "KPIAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIUpdate" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "onTrack" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rootCause" TEXT,
    "correctionPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KPIUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionType" NOT NULL,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "expectedImpact" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "completedAt" TIMESTAMP(3),
    "actualOutcome" TEXT,
    "lessonsLearned" TEXT,
    "isHighLeverage" BOOLEAN NOT NULL DEFAULT false,
    "isWasteful" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionKPILink" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "relationship" "ActionKPIRelationship" NOT NULL,
    "expectedImpact" TEXT,
    "impactEstimate" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "ActionKPILink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "totalMeetingHours" DOUBLE PRECISION NOT NULL,
    "totalFocusHours" DOUBLE PRECISION NOT NULL,
    "linkedToKPI1" DOUBLE PRECISION NOT NULL,
    "linkedToKPI2" DOUBLE PRECISION NOT NULL,
    "linkedToKPI3" DOUBLE PRECISION NOT NULL,
    "linkedToOtherKPIs" DOUBLE PRECISION NOT NULL,
    "unlinked" DOUBLE PRECISION NOT NULL,
    "decisionMeetings" DOUBLE PRECISION NOT NULL,
    "infoSharingMeetings" DOUBLE PRECISION NOT NULL,
    "oneOnOnes" DOUBLE PRECISION NOT NULL,
    "externalMeetings" DOUBLE PRECISION NOT NULL,
    "backToBackCount" INTEGER NOT NULL,
    "afterHoursHours" DOUBLE PRECISION NOT NULL,
    "feltProductive" BOOLEAN,
    "biggestWaste" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WastePattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" "WasteType" NOT NULL,
    "description" TEXT NOT NULL,
    "hoursPerWeek" DOUBLE PRECISION,
    "occurrences" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceDetails" JSONB,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "addressedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "firstDetected" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOccurrence" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WastePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "category" "SignalCategory" NOT NULL,
    "source" TEXT,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "affectedKPIs" TEXT[],
    "implications" TEXT,
    "assumptionsAffected" TEXT[],
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "response" TEXT,
    "kpisRevised" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssumptionReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "kpisReviewed" TEXT[],
    "assumptionsReviewed" TEXT[],
    "stillValid" TEXT[],
    "nowInvalid" TEXT[],
    "kpisRevised" TEXT[],
    "actionsAdded" TEXT[],
    "actionsCancelled" TEXT[],
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssumptionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationDate" TIMESTAMP(3) NOT NULL,
    "insight" TEXT NOT NULL,
    "contextType" "ContextType" NOT NULL,
    "explicit" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "wasHelpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationPrep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "stakeholders" TEXT[],
    "meetingId" TEXT,
    "stakeholderEmail" TEXT,
    "primaryObjective" TEXT NOT NULL,
    "secondaryObjectives" TEXT[],
    "worstAcceptableOutcome" TEXT,
    "openingHook" TEXT,
    "closingAction" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'PREPPING',
    "actualOutcome" TEXT,
    "lessonsLearned" TEXT,
    "followUps" TEXT[],
    "intelligenceReport" JSONB,
    "critiqueResult" JSONB,
    "generationPasses" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationPrep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyMessage" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "shortForm" TEXT NOT NULL,
    "supportingData" TEXT,
    "transition" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "KeyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objection" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "objection" TEXT NOT NULL,
    "shortForm" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "quickResponse" TEXT NOT NULL,
    "reframe" TEXT,
    "likelihood" "ObjectionLikelihood" NOT NULL DEFAULT 'POSSIBLE',

    CONSTRAINT "Objection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickReference" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "pivots" JSONB NOT NULL,
    "closeChecklist" TEXT[],
    "avoid" TEXT[],
    "use" TEXT[],

    CONSTRAINT "QuickReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationLog" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "LogEntryType" NOT NULL,
    "content" TEXT NOT NULL,
    "objectionTriggered" TEXT,
    "pivotUsed" TEXT,

    CONSTRAINT "ConversationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "context" TEXT,
    "relatedPrepId" TEXT,
    "relatedCaseId" TEXT,
    "relatedKPIId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "nextSyncAt" TIMESTAMP(3),
    "syncCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSyncRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "attendees" JSONB NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringId" TEXT,
    "meetingType" TEXT,
    "participants" TEXT[],
    "outcome" TEXT,
    "notes" TEXT,
    "followUps" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "participants" TEXT[],
    "from" TEXT,
    "to" TEXT[],
    "subject" TEXT,
    "summary" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "keyTopics" TEXT[],
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationOutcome" (
    "id" TEXT NOT NULL,
    "conversationPrepId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "objectiveMet" BOOLEAN,
    "whatWorked" TEXT[],
    "whatFailed" TEXT[],
    "surprises" TEXT[],
    "userRating" INTEGER,
    "userNotes" TEXT,
    "aiInsights" TEXT,
    "suggestedImprovements" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderIntelligence" (
    "id" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "profileSummary" TEXT,
    "avgResponseTimeHrs" DOUBLE PRECISION,
    "preferredMeetingTimes" TEXT[],
    "decisionMakingNotes" TEXT,
    "objectionPatterns" TEXT[],
    "successPatterns" TEXT[],
    "failurePatterns" TEXT[],
    "recentTopics" TEXT[],
    "currentMood" TEXT,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessContext_userId_key" ON "BusinessContext"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_skillId_key" ON "UserSkill"("userId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_slug_key" ON "Case"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Case_currentVersionId_key" ON "Case"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseVersion_caseId_version_key" ON "CaseVersion"("caseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedArticle_url_key" ON "IngestedArticle"("url");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedArticle_generatedCaseId_key" ON "IngestedArticle"("generatedCaseId");

-- CreateIndex
CREATE INDEX "UserActionPlan_userId_status_idx" ON "UserActionPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "UserActionPlan_created_at_idx" ON "UserActionPlan"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKey_userId_provider_key" ON "UserApiKey"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentId_key" ON "Payment"("stripePaymentId");

-- CreateIndex
CREATE INDEX "DataConnector_userId_idx" ON "DataConnector"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DataConnector_userId_provider_key" ON "DataConnector"("userId", "provider");

-- CreateIndex
CREATE INDEX "WorkArtifact_userId_type_occurredAt_idx" ON "WorkArtifact"("userId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkArtifact_connectorId_idx" ON "WorkArtifact"("connectorId");

-- CreateIndex
CREATE INDEX "WorkArtifact_linkedNoteId_idx" ON "WorkArtifact"("linkedNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Capacity_slug_key" ON "Capacity"("slug");

-- CreateIndex
CREATE INDEX "SkillObservation_userId_capacityId_createdAt_idx" ON "SkillObservation"("userId", "capacityId", "createdAt");

-- CreateIndex
CREATE INDEX "SkillObservation_artifactId_idx" ON "SkillObservation"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityScore_userId_capacityId_key" ON "CapacityScore"("userId", "capacityId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainContext_userId_key" ON "DomainContext"("userId");

-- CreateIndex
CREATE INDEX "DomainLearning_domainContextId_idx" ON "DomainLearning"("domainContextId");

-- CreateIndex
CREATE INDEX "StakeholderProfile_userId_idx" ON "StakeholderProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderProfile_userId_email_key" ON "StakeholderProfile"("userId", "email");

-- CreateIndex
CREATE INDEX "StakeholderInteraction_stakeholderId_idx" ON "StakeholderInteraction"("stakeholderId");

-- CreateIndex
CREATE INDEX "FeedbackItem_userId_status_createdAt_idx" ON "FeedbackItem"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LearningRecommendation_userId_status_priority_idx" ON "LearningRecommendation"("userId", "status", "priority");

-- CreateIndex
CREATE INDEX "PracticeMission_userId_status_idx" ON "PracticeMission"("userId", "status");

-- CreateIndex
CREATE INDEX "PracticeMission_capacityId_status_idx" ON "PracticeMission"("capacityId", "status");

-- CreateIndex
CREATE INDEX "CaseSurfacing_userId_surfacedAt_idx" ON "CaseSurfacing"("userId", "surfacedAt");

-- CreateIndex
CREATE INDEX "CaseSurfacing_caseId_idx" ON "CaseSurfacing"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionKPILink_actionId_kpiId_key" ON "ActionKPILink"("actionId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeAllocation_userId_weekStart_key" ON "TimeAllocation"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "ConversationPrep_userId_scheduledAt_idx" ON "ConversationPrep"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ConversationPrep_stakeholderEmail_idx" ON "ConversationPrep"("stakeholderEmail");

-- CreateIndex
CREATE UNIQUE INDEX "QuickReference_prepId_key" ON "QuickReference"("prepId");

-- CreateIndex
CREATE INDEX "CoachSession_userId_lastMessageAt_idx" ON "CoachSession"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SyncStatus_userId_idx" ON "SyncStatus"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncStatus_userId_connector_key" ON "SyncStatus"("userId", "connector");

-- CreateIndex
CREATE INDEX "MeetingSyncRecord_userId_startTime_idx" ON "MeetingSyncRecord"("userId", "startTime");

-- CreateIndex
CREATE INDEX "MeetingSyncRecord_participants_idx" ON "MeetingSyncRecord"("participants");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSyncRecord_userId_externalId_key" ON "MeetingSyncRecord"("userId", "externalId");

-- CreateIndex
CREATE INDEX "EmailSummary_userId_lastMessageAt_idx" ON "EmailSummary"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "EmailSummary_participants_idx" ON "EmailSummary"("participants");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSummary_userId_threadId_key" ON "EmailSummary"("userId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationOutcome_conversationPrepId_key" ON "ConversationOutcome"("conversationPrepId");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderIntelligence_stakeholderId_key" ON "StakeholderIntelligence"("stakeholderId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessContext" ADD CONSTRAINT "BusinessContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "CaseVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseVersion" ADD CONSTRAINT "CaseVersion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestedArticle" ADD CONSTRAINT "IngestedArticle_generatedCaseId_fkey" FOREIGN KEY ("generatedCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProgress" ADD CONSTRAINT "CaseProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecPlan" ADD CONSTRAINT "RecPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActionPlan" ADD CONSTRAINT "UserActionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActionPlan" ADD CONSTRAINT "UserActionPlan_related_case_id_fkey" FOREIGN KEY ("related_case_id") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflection" ADD CONSTRAINT "Reflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflection" ADD CONSTRAINT "Reflection_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "UserActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProject" ADD CONSTRAINT "UserProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingLog" ADD CONSTRAINT "MeetingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingLog" ADD CONSTRAINT "MeetingLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "UserProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "UserProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHealth" ADD CONSTRAINT "ProjectHealth_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "UserProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiKey" ADD CONSTRAINT "UserApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataConnector" ADD CONSTRAINT "DataConnector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataConnector" ADD CONSTRAINT "DataConnector_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifact" ADD CONSTRAINT "WorkArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifact" ADD CONSTRAINT "WorkArtifact_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "DataConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArtifact" ADD CONSTRAINT "WorkArtifact_linkedNoteId_fkey" FOREIGN KEY ("linkedNoteId") REFERENCES "WorkArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillObservation" ADD CONSTRAINT "SkillObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillObservation" ADD CONSTRAINT "SkillObservation_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillObservation" ADD CONSTRAINT "SkillObservation_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "WorkArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityScore" ADD CONSTRAINT "CapacityScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapacityScore" ADD CONSTRAINT "CapacityScore_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainContext" ADD CONSTRAINT "DomainContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainLearning" ADD CONSTRAINT "DomainLearning_domainContextId_fkey" FOREIGN KEY ("domainContextId") REFERENCES "DomainContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderProfile" ADD CONSTRAINT "StakeholderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderInteraction" ADD CONSTRAINT "StakeholderInteraction_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRecommendation" ADD CONSTRAINT "LearningRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeMission" ADD CONSTRAINT "PracticeMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeMission" ADD CONSTRAINT "PracticeMission_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeMission" ADD CONSTRAINT "PracticeMission_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "LearningRecommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseSurfacing" ADD CONSTRAINT "CaseSurfacing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseSurfacing" ADD CONSTRAINT "CaseSurfacing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderImpact" ADD CONSTRAINT "StakeholderImpact_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderImpact" ADD CONSTRAINT "StakeholderImpact_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderReactionHistory" ADD CONSTRAINT "StakeholderReactionHistory_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKPI" ADD CONSTRAINT "UserKPI_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIAssumption" ADD CONSTRAINT "KPIAssumption_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "UserKPI"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIUpdate" ADD CONSTRAINT "KPIUpdate_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "UserKPI"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionKPILink" ADD CONSTRAINT "ActionKPILink_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "UserAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionKPILink" ADD CONSTRAINT "ActionKPILink_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "UserKPI"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeAllocation" ADD CONSTRAINT "TimeAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastePattern" ADD CONSTRAINT "WastePattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSignal" ADD CONSTRAINT "ExternalSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssumptionReview" ADD CONSTRAINT "AssumptionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationInsight" ADD CONSTRAINT "ConversationInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPrep" ADD CONSTRAINT "ConversationPrep_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "WorkArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationPrep" ADD CONSTRAINT "ConversationPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyMessage" ADD CONSTRAINT "KeyMessage_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "ConversationPrep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objection" ADD CONSTRAINT "Objection_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "ConversationPrep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickReference" ADD CONSTRAINT "QuickReference_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "ConversationPrep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationLog" ADD CONSTRAINT "ConversationLog_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "ConversationPrep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSession" ADD CONSTRAINT "CoachSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CoachSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationOutcome" ADD CONSTRAINT "ConversationOutcome_conversationPrepId_fkey" FOREIGN KEY ("conversationPrepId") REFERENCES "ConversationPrep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderIntelligence" ADD CONSTRAINT "StakeholderIntelligence_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
