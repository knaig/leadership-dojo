/**
 * Action Agent
 *
 * Responsible for executing tools and taking actions.
 * This agent is the "hands" of the system - it can create goals,
 * sync data, add stakeholders, etc.
 */

import { prisma } from '../../lib/prisma';
import { publishSystemEvent } from '../../lib/pusher';
import { triggerVoiceCall } from '../../lib/vapi-voice';
import { AgentContext, ActionResult, ContextSynthesis, ExtractedEntities } from './types';
import { calendarSyncAgent } from '../calendar-sync';
import { emailSyncAgent } from '../email-sync';
import { driveSyncAgent } from '../drive-sync';
import { GoalMagnitude, StakeholderRole } from '@prisma/client';
import { withGeminiRetry } from './gemini-retry';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';
import { recordCorrection } from '../../lib/correction-learning';
import { mergeProfiles } from '../identity-resolution-agent';

export class ActionAgent {
    /**
     * Execute an action based on the user's intent
     */
    async executeAction(
        actionType: string,
        context: AgentContext,
        entities: ExtractedEntities,
        contextSynthesis: ContextSynthesis
    ): Promise<ActionResult> {
        console.log(`[ActionAgent] Executing action: ${actionType}`);
        const startTime = Date.now();

        const result = await this._executeActionInner(actionType, context, entities, contextSynthesis);

        // Record tool use (fire-and-forget)
        try {
            await prisma.toolUseRecord.create({
                data: {
                    userId: context.userId,
                    source: 'CHAT',
                    // messageId not available in current AgentContext
                    toolName: result.actionTaken || actionType,
                    inputData: { action: actionType, entities: entities },
                    outputData: { result: typeof result.result === 'string' ? result.result.substring(0, 500) : JSON.stringify(result.result)?.substring(0, 500) },
                    success: result.success,
                    errorMessage: result.result?.error || undefined,
                    durationMs: Date.now() - startTime,
                },
            });
        } catch (err: any) {
            console.error(`[ActionAgent] Failed to record tool use:`, err.message);
        }

        return result;
    }

    private async _executeActionInner(
        actionType: string,
        context: AgentContext,
        entities: ExtractedEntities,
        contextSynthesis: ContextSynthesis
    ): Promise<ActionResult> {
        switch (actionType) {
            case 'create_goals':
                return this.createGoals(context, entities, contextSynthesis);

            case 'sync_calendar':
                return this.syncCalendar(context.userId);

            case 'sync_email':
                return this.syncEmail(context.userId);

            case 'sync_drive':
                return this.syncDrive(context.userId);

            case 'add_stakeholder':
                return this.addStakeholder(context, entities);

            case 'prepare_for_meeting':
                return this.prepareForMeeting(context, entities, contextSynthesis);

            case 'capture_meeting_outcome':
                return this.captureMeetingOutcome(context);

            case 'capture_meeting_review':
                return this.captureMeetingReview(context);

            case 'trigger_voice_call':
                return this.callUser(context);

            case 'update_stakeholder_from_feedback':
                return this.updateStakeholderFromFeedback(context, entities);

            case 'resolve_identity':
                return this.resolveIdentity(context);

            default:
                return {
                    success: false,
                    actionTaken: 'none',
                    result: { error: `Unknown action type: ${actionType}` }
                };
        }
    }

    /**
     * Create goals based on context and entities
     */
    private async createGoals(
        context: AgentContext,
        entities: ExtractedEntities,
        contextSynthesis: ContextSynthesis
    ): Promise<ActionResult> {
        const goalsCreated: any[] = [];

        // If we have project context, create project-specific goals
        for (const project of contextSynthesis.projectSummaries) {
            // Create a goal for each project mentioned
            const goal = await prisma.goal.create({
                data: {
                    userId: context.userId,
                    description: `Drive ${project.name} forward`,
                    magnitude: GoalMagnitude.QUARTERLY,
                    status: 'ACTIVE'
                }
            });

            goalsCreated.push({
                id: goal.id,
                description: goal.description,
                project: project.name
            });

            // Also link key stakeholders to this goal
            for (const personName of project.keyPeople.slice(0, 3)) {
                const stakeholder = await prisma.stakeholderProfile.findFirst({
                    where: {
                        userId: context.userId,
                        name: { contains: personName, mode: 'insensitive' }
                    }
                });

                if (stakeholder) {
                    await prisma.goalStakeholder.create({
                        data: {
                            goalId: goal.id,
                            stakeholderId: stakeholder.id,
                            role: StakeholderRole.ALLY
                        }
                    }).catch(() => { }); // Ignore if already exists
                }
            }
        }

        // If suggested actions include specific goal ideas, create those too
        for (const action of contextSynthesis.suggestedActions) {
            if (action.toLowerCase().includes('goal') || action.toLowerCase().includes('track')) {
                const goal = await prisma.goal.create({
                    data: {
                        userId: context.userId,
                        description: action,
                        magnitude: GoalMagnitude.QUARTERLY,
                        status: 'ACTIVE'
                    }
                });
                goalsCreated.push({
                    id: goal.id,
                    description: goal.description
                });
            }
        }

        return {
            success: goalsCreated.length > 0,
            actionTaken: 'create_goals',
            result: {
                goalsCreated,
                message: `Created ${goalsCreated.length} goal(s)`
            }
        };
    }

    /**
     * Sync calendar
     */
    private async syncCalendar(userId: string): Promise<ActionResult> {
        try {
            const result = await calendarSyncAgent(userId);
            return {
                success: true,
                actionTaken: 'sync_calendar',
                result: {
                    synced: result.synced,
                    message: `Synced ${result.synced} calendar events`
                }
            };
        } catch (error: any) {
            return {
                success: false,
                actionTaken: 'sync_calendar',
                result: { error: error.message }
            };
        }
    }

    /**
     * Sync email
     */
    private async syncEmail(userId: string): Promise<ActionResult> {
        try {
            const result = await emailSyncAgent(userId);
            return {
                success: true,
                actionTaken: 'sync_email',
                result: {
                    synced: result.synced,
                    message: `Synced ${result.synced} email threads`
                }
            };
        } catch (error: any) {
            return {
                success: false,
                actionTaken: 'sync_email',
                result: { error: error.message }
            };
        }
    }

    /**
     * Sync drive
     */
    private async syncDrive(userId: string): Promise<ActionResult> {
        try {
            const result = await driveSyncAgent(userId);
            return {
                success: true,
                actionTaken: 'sync_drive',
                result: {
                    synced: result.synced,
                    message: `Synced ${result.synced} documents`
                }
            };
        } catch (error: any) {
            return {
                success: false,
                actionTaken: 'sync_drive',
                result: { error: error.message }
            };
        }
    }

    /**
     * Add a stakeholder
     */
    private async addStakeholder(
        context: AgentContext,
        entities: ExtractedEntities
    ): Promise<ActionResult> {
        const stakeholdersAdded: any[] = [];

        for (const name of entities.people || []) {
            // Check if stakeholder already exists
            const existing = await prisma.stakeholderProfile.findFirst({
                where: {
                    userId: context.userId,
                    name: { contains: name, mode: 'insensitive' }
                }
            });

            if (!existing) {
                const stakeholder = await prisma.stakeholderProfile.create({
                    data: {
                        userId: context.userId,
                        name,
                        relationshipStrength: 0.5,
                        interactionCount: 1
                    }
                });
                stakeholdersAdded.push(stakeholder);
            }
        }

        return {
            success: stakeholdersAdded.length > 0,
            actionTaken: 'add_stakeholder',
            result: {
                stakeholdersAdded,
                message: `Added ${stakeholdersAdded.length} stakeholder(s)`
            }
        };
    }

    /**
     * Prepare for a meeting
     */
    private async prepareForMeeting(
        context: AgentContext,
        entities: ExtractedEntities,
        contextSynthesis: ContextSynthesis
    ): Promise<ActionResult> {
        // Find the meeting they want to prepare for
        const upcomingMeetings = contextSynthesis.relevantMeetings
            .filter(m => m.date > new Date())
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (upcomingMeetings.length === 0) {
            return {
                success: false,
                actionTaken: 'prepare_for_meeting',
                result: { error: 'No upcoming meetings found' }
            };
        }

        const meeting = upcomingMeetings[0];

        // Gather relevant context for this meeting
        const prepMaterials = {
            meeting: {
                title: meeting.title,
                date: meeting.date,
                participants: meeting.participants
            },
            relevantDocs: contextSynthesis.relevantDocuments.filter(d =>
                meeting.keyTopics.some(topic =>
                    d.title.toLowerCase().includes(topic.toLowerCase()) ||
                    d.summary.toLowerCase().includes(topic.toLowerCase())
                )
            ),
            participantContext: contextSynthesis.relevantPeople.filter(p =>
                meeting.participants.some(participant =>
                    participant.toLowerCase().includes(p.name.toLowerCase())
                )
            )
        };

        return {
            success: true,
            actionTaken: 'prepare_for_meeting',
            result: prepMaterials
        };
    }

    /**
     * Capture user's desired meeting outcome.
     * Finds the most recent meeting with lifecycleStage = OUTCOME_ASKED that's still upcoming,
     * stores the user's message as desiredOutcome, and transitions to OUTCOME_SET.
     */
    private async captureMeetingOutcome(context: AgentContext): Promise<ActionResult> {
        const now = new Date();

        // Find the most recent meeting where we asked for an outcome
        const meeting = await prisma.meetingSyncRecord.findFirst({
            where: {
                userId: context.userId,
                lifecycleStage: 'OUTCOME_ASKED',
                startTime: { gt: now },
                status: { not: 'cancelled' }
            },
            orderBy: { startTime: 'asc' }
        });

        if (!meeting) {
            return {
                success: false,
                actionTaken: 'capture_meeting_outcome',
                result: { error: 'No upcoming meeting awaiting outcome — storing as general note.' }
            };
        }

        // Store the user's desired outcome
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: {
                desiredOutcome: context.message,
                lifecycleStage: 'OUTCOME_SET'
            }
        });

        // If meeting is < 1 hour away, flag for immediate brief
        const minutesUntil = (meeting.startTime.getTime() - now.getTime()) / (60 * 1000);
        const needsImmediateBrief = minutesUntil < 60;

        return {
            success: true,
            actionTaken: 'capture_meeting_outcome',
            result: {
                meetingTitle: meeting.title,
                meetingTime: meeting.startTime,
                desiredOutcome: context.message,
                needsImmediateBrief
            }
        };
    }

    /**
     * Capture user's post-meeting review feedback.
     * Finds the most recent meeting with lifecycleStage = ENDED,
     * uses LLM to analyze feedback into structured review,
     * creates ConversationOutcome record, updates MeetingSyncRecord.
     */
    private async captureMeetingReview(context: AgentContext): Promise<ActionResult> {
        // Find the most recent meeting awaiting review
        const meeting = await prisma.meetingSyncRecord.findFirst({
            where: {
                userId: context.userId,
                lifecycleStage: 'ENDED',
                status: { not: 'cancelled' }
            },
            orderBy: { endTime: 'desc' }
        });

        if (!meeting) {
            return {
                success: false,
                actionTaken: 'capture_meeting_review',
                result: { error: 'No recent meeting awaiting review.' }
            };
        }

        // Use LLM to analyze the user's feedback into structured review
        const model = await createTrackedGeminiModel(context.userId, {
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
        });

        const attendees = (meeting.attendees as any[]) || [];
        const attendeeNames = attendees.map((a: any) => a.displayName || a.name || a.email || '').filter(Boolean);

        const analysisPrompt = `Analyze this post-meeting feedback and produce a structured review.

MEETING: "${meeting.title}"
ATTENDEES: ${attendeeNames.join(', ')}
${meeting.desiredOutcome ? `DESIRED OUTCOME: "${meeting.desiredOutcome}"` : ''}
${meeting.notes ? `MEETING NOTES: "${meeting.notes.substring(0, 1000)}"` : ''}

USER'S FEEDBACK: "${context.message}"

Respond in JSON only:
{
  "success": true/false,
  "objectiveMet": true/false/null,
  "outcomeResult": "LANDED" | "PARTIAL" | "MISSED",
  "whatWorked": ["...", "..."],
  "whatFailed": ["...", "..."],
  "surprises": ["...", "..."],
  "aiInsights": "One paragraph of coaching insight",
  "suggestedImprovements": ["...", "..."],
  "followUps": ["...", "..."],
  "commitments": [{"owner": "person name", "description": "what they committed to", "dueDate": "YYYY-MM-DD or null"}],
  "outcomeStatement": "One sentence summary of what happened",
  "stakeholderDynamics": [
    {
      "name": "person name (from attendees list)",
      "stance": "CHAMPION" | "SUPPORTIVE" | "NEUTRAL" | "SKEPTIC" | "BLOCKER",
      "evidence": "brief quote or observation from notes/feedback that justifies this stance",
      "powerSignal": "HIGH" | "MEDIUM" | "LOW" | null,
      "strengthDelta": -0.1 to 0.1
    }
  ]
}

For outcomeResult:
- LANDED: user clearly achieved their desired outcome
- PARTIAL: some progress but not fully achieved
- MISSED: outcome was not achieved
- If no desired outcome was set, infer from the user's feedback tone

For commitments: extract any specific commitments made by anyone (the user OR attendees). Include who owns it, what it is, and any mentioned deadline. Only include concrete, actionable commitments — not vague intentions.

For stakeholderDynamics: analyze each attendee's behavior in this meeting:
- stance: Did they champion the user's goal? Block it? Stay neutral? Be skeptical?
- evidence: What specific thing did they do/say that reveals their stance?
- powerSignal: Did they demonstrate HIGH power (made decisions, overrode others), MEDIUM (influenced), or LOW (followed)? null if unclear.
- strengthDelta: How did this meeting change the relationship? +0.1 = strengthened, -0.1 = weakened, 0 = unchanged.
Only include attendees where there is clear signal. Skip if no relationship data is evident.`;

        let reviewData: any;
        try {
            const result = await withGeminiRetry(
                () => model.generateContent(analysisPrompt),
                { label: 'MeetingReviewAnalysis' }
            );
            const text = result.response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            reviewData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (error: any) {
            console.error('[ActionAgent] Meeting review analysis failed:', error.message);
            reviewData = {
                success: true,
                objectiveMet: null,
                whatWorked: [],
                whatFailed: [],
                surprises: [],
                aiInsights: 'Review analysis unavailable.',
                suggestedImprovements: [],
                followUps: [],
                outcomeStatement: context.message.substring(0, 200)
            };
        }

        // Map outcomeResult string to enum
        const validOutcomes = ['LANDED', 'PARTIAL', 'MISSED', 'SKIPPED'] as const;
        const outcomeResult = validOutcomes.includes(reviewData.outcomeResult)
            ? reviewData.outcomeResult
            : (reviewData.objectiveMet === true ? 'LANDED' : reviewData.objectiveMet === false ? 'MISSED' : null);

        // Update MeetingSyncRecord with outcome data
        await prisma.meetingSyncRecord.update({
            where: { id: meeting.id },
            data: {
                outcome: reviewData.outcomeStatement || context.message.substring(0, 500),
                outcomeResult: outcomeResult,
                followUps: reviewData.followUps || [],
                lifecycleStage: 'REVIEWED'
            }
        });

        // Create MeetingCommitment records from extracted commitments
        const commitments = reviewData.commitments || [];
        for (const c of commitments) {
            if (!c.owner || !c.description) continue;
            await prisma.meetingCommitment.create({
                data: {
                    meetingId: meeting.id,
                    userId: context.userId,
                    owner: c.owner,
                    description: c.description,
                    dueDate: c.dueDate ? new Date(c.dueDate) : null,
                    source: 'CHAT'
                }
            });
        }

        // Create ConversationOutcome record
        await prisma.conversationOutcome.create({
            data: {
                meetingSyncRecordId: meeting.id,
                success: reviewData.success ?? true,
                objectiveMet: reviewData.objectiveMet ?? null,
                whatWorked: reviewData.whatWorked || [],
                whatFailed: reviewData.whatFailed || [],
                surprises: reviewData.surprises || [],
                aiInsights: reviewData.aiInsights || null,
                suggestedImprovements: reviewData.suggestedImprovements || []
            }
        });

        // Update stakeholder profiles from meeting dynamics
        const dynamics: Array<{
            name: string; stance: string; evidence: string;
            powerSignal?: string | null; strengthDelta?: number;
        }> = reviewData.stakeholderDynamics || [];

        if (dynamics.length > 0) {
            await this.updateStakeholderDynamics(context.userId, dynamics, meeting.title);
        }

        return {
            success: true,
            actionTaken: 'capture_meeting_review',
            result: {
                meetingTitle: meeting.title,
                reviewData
            }
        };
    }

    /**
     * Update stakeholder profiles based on observed meeting dynamics.
     * Maps stance observations to politicalStance, and adjusts relationshipStrength.
     */
    private async updateStakeholderDynamics(
        userId: string,
        dynamics: Array<{ name: string; stance: string; evidence: string; powerSignal?: string | null; strengthDelta?: number }>,
        meetingTitle: string,
    ): Promise<void> {
        const STANCE_MAP: Record<string, string> = {
            CHAMPION: 'CHAMPION',
            SUPPORTIVE: 'SUPPORTIVE',
            NEUTRAL: 'NEUTRAL',
            SKEPTIC: 'SKEPTIC',
            BLOCKER: 'HOSTILE',
        };

        const POWER_MAP: Record<string, string> = {
            HIGH: 'HIGH',
            MEDIUM: 'MEDIUM',
            LOW: 'LOW',
        };

        for (const d of dynamics) {
            if (!d.name || !d.stance) continue;

            // Find stakeholder by fuzzy name match
            const stakeholder = await prisma.stakeholderProfile.findFirst({
                where: {
                    userId,
                    name: { contains: d.name, mode: 'insensitive' },
                    validationStatus: { not: 'ARCHIVED' },
                },
                select: { id: true, name: true, politicalStance: true, relationshipStrength: true, powerLevel: true },
            });

            if (!stakeholder) continue;

            const updateData: Record<string, unknown> = {};

            // Update political stance
            const mappedStance = STANCE_MAP[d.stance];
            if (mappedStance && mappedStance !== stakeholder.politicalStance) {
                updateData.politicalStance = mappedStance;
            }

            // Update power level if we have a signal
            if (d.powerSignal && POWER_MAP[d.powerSignal]) {
                const mappedPower = POWER_MAP[d.powerSignal];
                if (mappedPower !== stakeholder.powerLevel) {
                    updateData.powerLevel = mappedPower;
                }
            }

            // Adjust relationship strength
            const delta = d.strengthDelta || 0;
            if (delta !== 0) {
                const currentStrength = stakeholder.relationshipStrength || 0.5;
                const newStrength = Math.max(0, Math.min(1, currentStrength + delta));
                updateData.relationshipStrength = newStrength;
            }

            // Update last interaction
            updateData.lastInteraction = new Date();
            updateData.interactionCount = { increment: 1 };

            if (Object.keys(updateData).length > 0) {
                await prisma.stakeholderProfile.update({
                    where: { id: stakeholder.id },
                    data: updateData,
                });

                // Also create a knowledge fact for the stance observation
                if (d.evidence) {
                    // Find or create knowledge entity for this person
                    const entity = await prisma.knowledgeEntity.findFirst({
                        where: { userId, name: { equals: stakeholder.name, mode: 'insensitive' }, type: 'PERSON' },
                        select: { id: true },
                    });

                    if (entity) {
                        const predicate = d.stance === 'CHAMPION' || d.stance === 'SUPPORTIVE' ? 'supports'
                            : d.stance === 'BLOCKER' || d.stance === 'SKEPTIC' ? 'objects_to'
                            : 'commented_on';

                        await prisma.knowledgeFact.create({
                            data: {
                                userId,
                                subjectId: entity.id,
                                predicate,
                                objectValue: `${meetingTitle}: ${d.evidence}`,
                                source: 'INFERRED_MEETING',
                                confidence: 0.7,
                            },
                        });
                    }
                }

                console.log(`[ActionAgent] Updated ${stakeholder.name}: stance=${d.stance}, delta=${delta}, power=${d.powerSignal || 'unchanged'}`);
            }
        }
    }
    /**
     * Trigger a voice call to the user — they asked Mira to call them.
     */
    private async callUser(context: AgentContext): Promise<ActionResult> {
        try {
            // Check if user has a phone number
            const user = await prisma.user.findUnique({
                where: { id: context.userId },
                select: { phoneNumber: true, name: true },
            });

            if (!user?.phoneNumber) {
                return {
                    success: false,
                    actionTaken: 'trigger_voice_call',
                    result: { error: 'no_phone_number' },
                    followUpNeeded: 'Ask user to add their phone number in Settings before Mira can call them.',
                };
            }

            const success = await triggerVoiceCall({
                userId: context.userId,
                callType: 'general',
            });

            if (success) {
                return {
                    success: true,
                    actionTaken: 'trigger_voice_call',
                    result: { message: 'Call initiated' },
                };
            }

            return {
                success: false,
                actionTaken: 'trigger_voice_call',
                result: { error: 'call_failed' },
                followUpNeeded: 'Voice call could not be initiated. May be outside delivery hours or DND is active.',
            };
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[ActionAgent] Voice call failed: ${errMsg}`);
            return {
                success: false,
                actionTaken: 'trigger_voice_call',
                result: { error: errMsg },
            };
        }
    }
    /**
     * Update stakeholder profiles based on user feedback/corrections in chat.
     * Handles responses like "Prof is my advisor", "Manmeet is just a vendor",
     * "yes that's right about Srikanth", etc.
     */
    /**
     * Handle identity confirmation — user confirms/denies that two profiles are the same person.
     */
    private async resolveIdentity(context: AgentContext): Promise<ActionResult> {
        const { userId, message, conversationHistory } = context;

        try {
            // Find the most recent identity question in conversation history
            const identityQuestion = [...conversationHistory].reverse().find(m =>
                m.role === 'assistant' && m.content.includes('might be the same person')
            );

            if (!identityQuestion) {
                return { success: true, actionTaken: 'resolve_identity', result: { note: 'No pending identity question found' } };
            }

            // Use LLM to determine: did user confirm or deny?
            const model = await createTrackedGeminiModel(userId, {
                model: 'gemini-2.5-flash',
                generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
            });

            const prompt = `Mira asked: "${identityQuestion.content.substring(0, 300)}"
User replied: "${message}"

Did the user confirm they are the same person, or deny it?
Return ONLY JSON: {"confirmed": true} or {"confirmed": false}`;

            const result = await withGeminiRetry(
                () => model.generateContent(prompt),
                { label: 'IdentityConfirmation' }
            );
            const raw = result.response.text();
            const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Find the pending identity resolution record
            const pendingResolution = await prisma.userCorrection.findFirst({
                where: { userId, entityType: 'identity_resolution', userValue: 'pending' },
                orderBy: { createdAt: 'desc' },
            });

            if (!pendingResolution?.context) {
                return { success: true, actionTaken: 'resolve_identity', result: { note: 'No pending resolution' } };
            }

            const ctx = pendingResolution.context as any;

            if (parsed.confirmed) {
                // Merge profiles
                await mergeProfiles(userId, ctx.profileAId, ctx.profileBId);

                // Update resolution record
                await prisma.userCorrection.update({
                    where: { id: pendingResolution.id },
                    data: { userValue: 'confirmed' },
                });

                return {
                    success: true,
                    actionTaken: 'resolve_identity',
                    result: { merged: true, primaryName: ctx.profileAName, mergedName: ctx.profileBName },
                };
            } else {
                // Mark as different people
                await prisma.userCorrection.update({
                    where: { id: pendingResolution.id },
                    data: { userValue: 'denied' },
                });

                return {
                    success: true,
                    actionTaken: 'resolve_identity',
                    result: { merged: false, note: 'Marked as different people' },
                };
            }
        } catch (err: any) {
            console.error(`[ActionAgent] Identity resolution failed: ${err.message}`);
            return { success: false, actionTaken: 'resolve_identity', result: { error: err.message } };
        }
    }

    private async updateStakeholderFromFeedback(
        context: AgentContext,
        entities: ExtractedEntities
    ): Promise<ActionResult> {
        const { userId, message } = context;
        const peopleNames = entities.people || [];

        if (peopleNames.length === 0) {
            return {
                success: true,
                actionTaken: 'update_stakeholder_from_feedback',
                result: { updated: 0, note: 'No specific people mentioned' },
            };
        }

        try {
            // Use LLM to extract structured corrections from the message
            const model = await createTrackedGeminiModel(userId, {
                model: 'gemini-2.5-flash',
                generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
            });

            const prompt = `The user said: "${message}"

People mentioned: ${peopleNames.join(', ')}

Extract any corrections or confirmations about these people. Return ONLY valid JSON array:
[
  {
    "name": "Person Name",
    "corrections": {
      "role": "their role if mentioned",
      "importance": "higher/lower/confirmed if indicated",
      "importanceCategory": "inner-circle/high-stakes/operational/peripheral if indicated",
      "relationship": "advisor/vendor/partner/colleague/boss/report if mentioned",
      "note": "any other context the user provided"
    },
    "isConfirmation": false
  }
]

Only include fields the user actually mentioned or implied. isConfirmation=true if user is agreeing with Mira's assessment ("yes", "that's right", "correct").`;

            const result = await withGeminiRetry(
                () => model.generateContent(prompt),
                { label: 'StakeholderFeedback' }
            );
            const raw = result.response.text();
            const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const corrections = JSON.parse(jsonStr);

            if (!Array.isArray(corrections)) {
                return { success: true, actionTaken: 'update_stakeholder_from_feedback', result: { updated: 0 } };
            }

            let updated = 0;

            for (const correction of corrections) {
                const name = correction.name;
                if (!name) continue;

                // Find stakeholder by fuzzy name match
                const stakeholder = await prisma.stakeholderProfile.findFirst({
                    where: {
                        userId,
                        mergedIntoId: null,
                        name: { contains: name, mode: 'insensitive' },
                    },
                });

                if (!stakeholder) continue;

                const updateData: any = {};
                const c = correction.corrections || {};

                // Apply role update
                if (c.role) {
                    await recordCorrection({
                        userId, entityType: 'stakeholder_profile', entityId: stakeholder.id,
                        field: 'role', aiValue: stakeholder.role, userValue: c.role,
                        context: { name: stakeholder.name, email: stakeholder.email },
                    });
                    updateData.role = c.role;
                }

                // Apply relationship type
                if (c.relationship) {
                    await recordCorrection({
                        userId, entityType: 'stakeholder_profile', entityId: stakeholder.id,
                        field: 'relationshipType', aiValue: stakeholder.relationshipType, userValue: c.relationship,
                        context: { name: stakeholder.name, email: stakeholder.email },
                    });
                    updateData.relationshipType = c.relationship;
                }

                // Apply importance adjustments
                if (c.importance === 'higher' || c.importance === 'confirmed') {
                    const newScore = Math.min(100, (stakeholder.importanceScore || 50) + 15);
                    updateData.importanceScore = newScore;
                    if (correction.isConfirmation) {
                        updateData.importanceReason = `${stakeholder.importanceReason || ''} (confirmed by user)`.trim();
                    }
                } else if (c.importance === 'lower') {
                    const newScore = Math.max(1, (stakeholder.importanceScore || 50) - 20);
                    updateData.importanceScore = newScore;
                }

                if (c.importanceCategory) {
                    updateData.importanceCategory = c.importanceCategory;
                }

                // Store user note
                if (c.note) {
                    const existingNotes = stakeholder.userNotes || '';
                    updateData.userNotes = existingNotes
                        ? `${existingNotes}\n${c.note}`
                        : c.note;
                }

                if (Object.keys(updateData).length > 0) {
                    await prisma.stakeholderProfile.update({
                        where: { id: stakeholder.id },
                        data: updateData,
                    });
                    updated++;
                    console.log(`[ActionAgent] Updated stakeholder ${stakeholder.name} from chat feedback`);
                }
            }

            return {
                success: true,
                actionTaken: 'update_stakeholder_from_feedback',
                result: { updated, people: peopleNames },
            };
        } catch (err: any) {
            console.error(`[ActionAgent] Stakeholder feedback update failed: ${err.message}`);
            return {
                success: false,
                actionTaken: 'update_stakeholder_from_feedback',
                result: { error: err.message },
            };
        }
    }
}

export const actionAgent = new ActionAgent();
