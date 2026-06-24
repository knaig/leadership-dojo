/*
  Warnings:

  - Added the required column `senderType` to the `ConversationInsight` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "GoalMagnitude" AS ENUM ('CAREER', 'QUARTERLY', 'PROJECT', 'TASK');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('NASCENT', 'ACTIVE', 'BLOCKED', 'ACHIEVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('DECISION_MAKER', 'INFLUENCER', 'BLOCKER', 'ALLY', 'BRIDGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StakeholderImportance" AS ENUM ('MUST_HAVE', 'NICE_TO_HAVE');

-- CreateEnum
CREATE TYPE "RelationshipState" AS ENUM ('STRONG', 'ADEQUATE', 'WEAK', 'NONE', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('GENERAL', 'GOAL_CAPTURE', 'STAKEHOLDER_MAPPING', 'GAP_ANALYSIS', 'STRATEGY', 'EXECUTION');

-- CreateEnum
CREATE TYPE "RelationshipActionType" AS ENUM ('BUILD', 'STRENGTHEN', 'REPAIR', 'ACTIVATE', 'MAINTAIN');

-- CreateEnum
CREATE TYPE "RelActionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('MORNING_BRIEF', 'OPPORTUNITY', 'EXECUTION_NUDGE', 'REFLECTION');

-- AlterTable
ALTER TABLE "CoachMessage" ADD COLUMN     "conversationType" TEXT DEFAULT 'GENERAL',
ADD COLUMN     "relatedGoalId" TEXT,
ADD COLUMN     "relatedStakeholderId" TEXT;

-- AlterTable
ALTER TABLE "ConversationInsight" ADD COLUMN     "conversationType" TEXT DEFAULT 'GENERAL',
ADD COLUMN     "relatedGoalId" TEXT,
ADD COLUMN     "relatedStakeholderId" TEXT,
ADD COLUMN     "senderType" "SenderType" NOT NULL;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "magnitude" "GoalMagnitude" NOT NULL DEFAULT 'QUARTERLY',
    "deadline" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalStakeholder" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "role" "StakeholderRole" NOT NULL DEFAULT 'UNKNOWN',
    "importance" "StakeholderImportance" NOT NULL DEFAULT 'MUST_HAVE',
    "currentState" "RelationshipState" NOT NULL DEFAULT 'NONE',
    "requiredState" "RelationshipState" NOT NULL DEFAULT 'ADEQUATE',
    "notes" TEXT[],

    CONSTRAINT "GoalStakeholder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeGoalId" TEXT,
    "activeStakeholderId" TEXT,
    "activeActionId" TEXT,
    "mode" "ConversationMode" NOT NULL DEFAULT 'GENERAL',
    "pendingDraft" JSONB,
    "pendingAction" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipAction" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "stakeholderId" TEXT NOT NULL,
    "type" "RelationshipActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RelActionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "draftMessages" JSONB,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProactivePrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PromptType" NOT NULL,
    "content" TEXT NOT NULL,
    "goalId" TEXT,
    "stakeholderId" TEXT,
    "deliveredVia" TEXT NOT NULL DEFAULT 'web',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "resultedInAction" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProactivePrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptFrequency" INTEGER NOT NULL DEFAULT 4,
    "quietHoursStart" TEXT NOT NULL DEFAULT '21:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "preferredChannel" TEXT NOT NULL DEFAULT 'web',
    "enableProactivePrompts" BOOLEAN NOT NULL DEFAULT true,
    "enableExecution" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoalStakeholder_goalId_stakeholderId_key" ON "GoalStakeholder"("goalId", "stakeholderId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_userId_key" ON "ConversationState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalStakeholder" ADD CONSTRAINT "GoalStakeholder_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalStakeholder" ADD CONSTRAINT "GoalStakeholder_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationState" ADD CONSTRAINT "ConversationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipAction" ADD CONSTRAINT "RelationshipAction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProactivePrompt" ADD CONSTRAINT "ProactivePrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
