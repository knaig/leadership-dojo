/**
 * Hypothesis Engine — observe → hypothesize → present → validate → learn → deepen
 *
 * Inspired by Karpathy's autoresearch: a tight loop where each validated
 * hypothesis seeds the next round of deeper inquiry. Like autoresearch's
 * train→measure→keep/discard→repeat cycle, we:
 *
 *   observe data → form hypothesis → present in call → validate from transcript
 *   → keep (confirmed) or discard (rejected) → generate follow-up hypotheses
 *
 * The compounding insight: confirmed hypotheses become the foundation for
 * deeper questions. "Manmeet is your co-founder" → "How do you split decisions
 * with Manmeet?" → "You seem to defer to Manmeet on technical calls" → ...
 *
 * Rejected hypotheses are equally valuable: they tell us what NOT to assume,
 * preventing the same class of error in future hypotheses.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';
import { createSessionTrace, scoreTraceMulti, logEvent } from '../lib/langfuse';

// ============================================================================
// TYPES
// ============================================================================

interface HypothesisInput {
    category: string;
    statement: string;
    evidence: string;
    presentationText: string;
    confidence: number;
    priority: number;
    sourceType: string;
    sourceData?: Record<string, unknown>;
    relatedStakeholderId?: string;
    subjectEntityId?: string;
    visibility?: 'USER' | 'ADMIN_ONLY';
}

// Categories that represent meta/behavioral observations — admin-only
const ADMIN_ONLY_CATEGORIES = new Set([
    'POWER_ASYMMETRY',
    'COMMUNICATION_PATTERN',
    'LEADERSHIP_STYLE',
    'RELATIONSHIP_QUALITY',
    'PERSONAL_INSIGHT',
    'STRATEGIC_PATTERN',
]);

/** Classify visibility based on category. Factual claims → USER, meta observations → ADMIN_ONLY */
function classifyVisibility(category: string): 'USER' | 'ADMIN_ONLY' {
    return ADMIN_ONLY_CATEGORIES.has(category) ? 'ADMIN_ONLY' : 'USER';
}

// ============================================================================
// 1. GENERATE HYPOTHESES FROM EMAIL PATTERNS
// ============================================================================

async function generateEmailHypotheses(userId: string, userEmails: Set<string>): Promise<HypothesisInput[]> {
    const hypotheses: HypothesisInput[] = [];

    // Get email thread summaries from last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const emailThreads = await prisma.emailSummary.findMany({
        where: { userId, lastMessageAt: { gte: twoWeeksAgo } },
        select: {
            from: true, to: true, participants: true,
            subject: true, messageCount: true,
            lastMessageAt: true, threadId: true,
            isImportant: true, requiresAction: true,
            keyTopics: true,
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 200,
    });

    if (emailThreads.length < 5) return hypotheses;

    // Compute per-contact interaction frequency from thread participants
    const contactInteractions = new Map<string, {
        threadCount: number;
        totalMessages: number;
        importantThreads: number;
        actionRequired: number;
        topics: string[];
        lastSeen: Date;
    }>();

    for (const thread of emailThreads) {
        const allParticipants = thread.participants || [];
        for (const p of allParticipants) {
            if (!p || !p.includes('@') || isSelfEmail(p, userEmails)) continue;
            const stats = contactInteractions.get(p) || {
                threadCount: 0, totalMessages: 0,
                importantThreads: 0, actionRequired: 0,
                topics: [], lastSeen: new Date(0),
            };
            stats.threadCount++;
            stats.totalMessages += thread.messageCount;
            if (thread.isImportant) stats.importantThreads++;
            if (thread.requiresAction) stats.actionRequired++;
            stats.topics.push(...(thread.keyTopics || []).slice(0, 2));
            if (thread.lastMessageAt > stats.lastSeen) stats.lastSeen = thread.lastMessageAt;
            contactInteractions.set(p, stats);
        }
    }

    // Find high-frequency contacts — sort by thread count, take top outliers only
    const entries = Array.from(contactInteractions.entries())
        .sort((a, b) => b[1].threadCount - a[1].threadCount);
    const avgThreadCount = entries.length > 0
        ? entries.reduce((sum, [, s]) => sum + s.threadCount, 0) / entries.length
        : 0;
    let emailStakeholderCount = 0;
    for (const [email, stats] of entries) {
        // Only flag outliers (2x average) and cap at 3 hypotheses
        if (stats.threadCount < Math.max(5, avgThreadCount * 2) || emailStakeholderCount >= 3) continue;
        if (stats.threadCount >= 5) {
            const stakeholder = await findStakeholderByEmail(userId, email);
            if (stakeholder && !stakeholder.isImportant && stakeholder.powerLevel === 'MEDIUM') {
                hypotheses.push({
                    category: 'STAKEHOLDER_DYNAMIC',
                    statement: `${stakeholder.name} appears in ${stats.threadCount} email threads (${stats.totalMessages} messages) in the last 2 weeks.`,
                    evidence: `${stats.threadCount} threads, ${stats.totalMessages} messages, ${stats.importantThreads} marked important`,
                    presentationText: `${stakeholder.name} keeps coming up in your emails — ${stats.threadCount} threads recently. They seem central to what's happening. How would you describe that relationship?`,
                    confidence: 0.6,
                    priority: 4,
                    sourceType: 'email_analysis',
                    sourceData: { email, ...stats, topics: stats.topics.slice(0, 5) },
                    relatedStakeholderId: stakeholder.id,
                });
                emailStakeholderCount++;
            }
        }

        // Signal: Many action-required threads = someone making demands
        if (stats.actionRequired >= 3) {
            const stakeholder = await findStakeholderByEmail(userId, email);
            if (stakeholder) {
                hypotheses.push({
                    category: 'POWER_ASYMMETRY',
                    statement: `${stats.actionRequired} of your email threads with ${stakeholder.name} require action from you.`,
                    evidence: `${stats.actionRequired} action-required threads out of ${stats.threadCount} total with ${stakeholder.name}`,
                    presentationText: `I notice a lot of your emails with ${stakeholder.name} need action from you — ${stats.actionRequired} threads right now. Is that typical, or is something ramping up?`,
                    confidence: 0.55,
                    priority: 3,
                    sourceType: 'email_analysis',
                    sourceData: { email, actionRequired: stats.actionRequired, threadCount: stats.threadCount },
                    relatedStakeholderId: stakeholder.id,
                });
            }
        }
    }

    // Signal: Topics appearing across many threads = hot topic
    const topicCounts = new Map<string, number>();
    for (const thread of emailThreads) {
        for (const topic of (thread.keyTopics || [])) {
            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
    }
    const topicEntries = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2); // Only top 2 hot topics
    for (const [topic, count] of topicEntries) {
        if (count >= 5) {
            hypotheses.push({
                category: 'WORK_PRIORITY',
                statement: `"${topic}" appears in ${count} email threads in the last 2 weeks — it's dominating your inbox.`,
                evidence: `${count} threads mention "${topic}" out of ${emailThreads.length} total threads`,
                presentationText: `"${topic}" keeps showing up across your emails — ${count} threads in two weeks. Is that the big thing right now, or is it noise?`,
                confidence: 0.65,
                priority: 3,
                sourceType: 'email_analysis',
                sourceData: { topic, count, totalThreads: emailThreads.length },
            });
        }
    }

    return hypotheses;
}

// ============================================================================
// 2. GENERATE HYPOTHESES FROM CALENDAR PATTERNS
// ============================================================================

async function generateCalendarHypotheses(userId: string, userEmails: Set<string>): Promise<HypothesisInput[]> {
    const hypotheses: HypothesisInput[] = [];

    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId, startTime: { gte: fourWeeksAgo }, status: { not: 'cancelled' } },
        select: {
            title: true, startTime: true, endTime: true,
            meetingCategory: true, participants: true,
            isRecurring: true, recurringId: true,
        },
        orderBy: { startTime: 'desc' },
        take: 200,
    });

    if (meetings.length < 5) return hypotheses;

    // Time allocation analysis
    const categoryHours = new Map<string, number>();
    let totalHours = 0;
    for (const m of meetings) {
        const hours = (new Date(m.endTime).getTime() - new Date(m.startTime).getTime()) / (1000 * 60 * 60);
        totalHours += hours;
        const cat = m.meetingCategory || 'uncategorized';
        categoryHours.set(cat, (categoryHours.get(cat) || 0) + hours);
    }

    // Signal: Dominated by one category (> 50% of time)
    const categoryEntries = Array.from(categoryHours.entries());
    for (const [cat, hours] of categoryEntries) {
        const pct = Math.round((hours / totalHours) * 100);
        if (pct > 50 && cat !== 'uncategorized') {
            hypotheses.push({
                category: 'STRATEGIC_PATTERN',
                statement: `${pct}% of your meeting time is spent in ${cat} meetings (${Math.round(hours)}h out of ${Math.round(totalHours)}h in 4 weeks).`,
                evidence: `${cat}: ${Math.round(hours)}h (${pct}%), Total: ${Math.round(totalHours)}h across ${meetings.length} meetings`,
                presentationText: `I noticed ${pct}% of your meetings are ${cat}-related. Is that where you want to be spending your time, or is there something being crowded out?`,
                confidence: 0.7,
                priority: 3,
                sourceType: 'calendar_pattern',
                sourceData: { categoryBreakdown: Object.fromEntries(categoryHours), totalHours },
            });
        }
    }

    // Signal: Very few strategy/1:1 meetings compared to ops
    const opsHours = categoryHours.get('operations') || 0;
    const strategyHours = categoryHours.get('strategy') || 0;
    if (opsHours > 0 && strategyHours === 0 && totalHours > 10) {
        hypotheses.push({
            category: 'STRATEGIC_PATTERN',
            statement: `No strategy-focused meetings detected in the last 4 weeks. All ${Math.round(totalHours)} hours are in operational/tactical meetings.`,
            evidence: `${meetings.length} meetings, ${Math.round(totalHours)}h total, 0h strategy`,
            presentationText: `Your calendar is packed with operational meetings but I don't see any time carved out for strategic thinking. Is that intentional, or something you'd like to change?`,
            confidence: 0.6,
            priority: 2,
            sourceType: 'calendar_pattern',
        });
    }

    // Signal: Meeting with same person very frequently
    const personMeetingCount = new Map<string, number>();
    for (const m of meetings) {
        const participants = m.participants as string[] | null;
        if (!participants) continue;
        for (const p of participants) {
            if (p.includes('@') && !isSelfEmail(p, userEmails)) {
                personMeetingCount.set(p, (personMeetingCount.get(p) || 0) + 1);
            }
        }
    }

    const personMeetingEntries = Array.from(personMeetingCount.entries());
    // Sort by meeting count and only flag the top 3 (not everyone in a daily standup)
    personMeetingEntries.sort((a, b) => b[1] - a[1]);
    let calendarStakeholderCount = 0;
    for (const [email, count] of personMeetingEntries) {
        if (count < 12 || calendarStakeholderCount >= 3) break; // Must be truly frequent, cap at 3
        const stakeholder = await findStakeholderByEmail(userId, email);
        if (stakeholder) {
            // Skip if this person is just in large team meetings (standup pattern)
            // Only interesting if it's substantially more than the average
            const avgMeetingCount = meetings.length > 0
                ? personMeetingEntries.reduce((sum, [, c]) => sum + c, 0) / personMeetingEntries.length
                : 0;
            if (count < avgMeetingCount * 1.5) continue; // Not significantly above average

            hypotheses.push({
                category: 'STAKEHOLDER_DYNAMIC',
                statement: `You've met with ${stakeholder.name} ${count} times in the last 4 weeks — significantly more than average (${Math.round(avgMeetingCount)}).`,
                evidence: `${count} meetings in 4 weeks with ${stakeholder.name} (${email}), avg across contacts: ${Math.round(avgMeetingCount)}`,
                presentationText: `You and ${stakeholder.name} seem to be working closely — ${count} meetings in the last month, way more than most people on your calendar. What's driving that?`,
                confidence: 0.7,
                priority: 3,
                sourceType: 'calendar_pattern',
                sourceData: { email, count, avgMeetingCount: Math.round(avgMeetingCount) },
                relatedStakeholderId: stakeholder.id,
            });
            calendarStakeholderCount++;
        }
    }

    return hypotheses;
}

// ============================================================================
// 3. GENERATE HYPOTHESES FROM KNOWLEDGE GRAPH
// ============================================================================

async function generateKnowledgeHypotheses(userId: string): Promise<HypothesisInput[]> {
    const hypotheses: HypothesisInput[] = [];

    // Find stakeholders with contradictory or evolving signals
    const recentFacts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            validTo: null, // Current facts only
            confidence: { gte: 0.5 },
        },
        select: {
            predicate: true, objectValue: true, confidence: true,
            subject: { select: { name: true, type: true, id: true } },
            objectEntity: { select: { name: true, type: true } },
            source: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    // Group facts by person
    const personFacts = new Map<string, typeof recentFacts>();
    for (const fact of recentFacts) {
        if (fact.subject.type !== 'PERSON') continue;
        const key = fact.subject.name;
        const existing = personFacts.get(key) || [];
        existing.push(fact);
        personFacts.set(key, existing);
    }

    // Find people with reported-to or manages relationships to surface
    const personEntries = Array.from(personFacts.entries());
    for (const [name, facts] of personEntries) {
        const relationships = facts.filter(f =>
            ['reports_to', 'manages', 'allies_with', 'blocks', 'supports'].includes(f.predicate)
        );
        const opinions = facts.filter(f =>
            ['has_opinion_on', 'concerned_about', 'stakeholder_position'].includes(f.predicate)
        );

        // Signal: Known blocker with recent activity
        const blockerFacts = facts.filter(f => f.predicate === 'blocks' || f.predicate === 'objects_to');
        if (blockerFacts.length > 0) {
            const stakeholder = await findStakeholderByName(userId, name);
            hypotheses.push({
                category: 'STAKEHOLDER_DYNAMIC',
                statement: `${name} has been flagged as a potential blocker based on call conversations.`,
                evidence: blockerFacts.map(f => `${f.predicate}: ${f.objectValue || f.objectEntity?.name || ''}`).join('; '),
                presentationText: `You've mentioned ${name} pushing back on some things. Is that a pattern, or was it situational?`,
                confidence: 0.6,
                priority: 2,
                sourceType: 'knowledge_graph',
                relatedStakeholderId: stakeholder?.id,
                subjectEntityId: facts[0]?.subject.id,
            });
        }

        // Signal: Person with many relationships mentioned (central figure)
        if (relationships.length >= 3 && !opinions.length) {
            const stakeholder = await findStakeholderByName(userId, name);
            hypotheses.push({
                category: 'STAKEHOLDER_DYNAMIC',
                statement: `${name} appears to be a central figure — connected to ${relationships.length} other people in your world.`,
                evidence: relationships.map(f => `${f.predicate} ${f.objectEntity?.name || f.objectValue || ''}`).join(', '),
                presentationText: `${name} seems to be at the center of a lot of what's happening. How would you describe their influence?`,
                confidence: 0.55,
                priority: 5,
                sourceType: 'knowledge_graph',
                relatedStakeholderId: stakeholder?.id,
                subjectEntityId: facts[0]?.subject.id,
            });
        }
    }

    return hypotheses;
}

// ============================================================================
// 4. DETECT HYPOTHESIS VALIDATION FROM CALL TRANSCRIPT
// ============================================================================

export async function detectHypothesisValidation(
    userId: string,
    voiceCallId: string,
    transcript: string,
): Promise<void> {
    // Find hypotheses that were READY or PRESENTED for this user
    const activeHypotheses = await prisma.hypothesis.findMany({
        where: {
            userId,
            status: { in: ['PRESENTED', 'READY'] },
        },
        select: {
            id: true, statement: true, presentationText: true,
            category: true, status: true,
        },
        take: 10,
    });

    if (activeHypotheses.length === 0) return;

    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') return;

    const hypothesesList = activeHypotheses.map((h, i) =>
        `${i + 1}. [${h.id}] ${h.statement}`
    ).join('\n');

    const prompt = `Analyze this coaching call transcript and determine if any of these hypotheses were discussed, confirmed, or rejected by the user.

HYPOTHESES:
${hypothesesList}

TRANSCRIPT:
${transcript.substring(0, 4000)}

For each hypothesis that was discussed, respond with a JSON array of objects:
[{
  "id": "the hypothesis id",
  "outcome": "confirmed" | "revised" | "rejected" | "not_discussed",
  "userResponse": "brief quote or paraphrase of what user said",
  "revisedStatement": "if revised, what the corrected understanding is"
}]

Rules:
- "confirmed" = user explicitly agreed or implicitly validated
- "revised" = user corrected part of it but the core observation was right
- "rejected" = user clearly denied or dismissed
- "not_discussed" = wasn't mentioned in the call
- Only include hypotheses that were actually discussed (skip not_discussed)

Respond ONLY with the JSON array.`;

    const result = await withLLMRetry(
        () => generateText(config, prompt, { userId }),
        { label: 'HypothesisValidation' },
    );

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    try {
        const outcomes = JSON.parse(jsonMatch[0]) as Array<{
            id: string;
            outcome: string;
            userResponse: string;
            revisedStatement?: string;
        }>;

        for (const outcome of outcomes) {
            if (outcome.outcome === 'not_discussed') continue;

            const hypothesis = activeHypotheses.find(h => h.id === outcome.id);
            if (!hypothesis) continue;

            if (outcome.outcome === 'confirmed') {
                const updated = await prisma.hypothesis.update({
                    where: { id: outcome.id },
                    data: {
                        status: 'CONFIRMED',
                        validatedAt: new Date(),
                        presentedInCallId: voiceCallId,
                        presentedAt: new Date(),
                        userResponse: outcome.userResponse,
                    },
                });

                console.log(`[Hypothesis] CONFIRMED: ${hypothesis.statement.substring(0, 80)}`);

                // AUTORESEARCH LOOP: Generate deeper follow-up hypotheses
                await generateFollowUpHypotheses(userId, {
                    id: outcome.id,
                    category: hypothesis.category,
                    statement: hypothesis.statement,
                    userResponse: outcome.userResponse,
                    outcome: 'confirmed',
                    relatedStakeholderId: updated.relatedStakeholderId,
                }).catch(err => console.error('[Hypothesis] Follow-up generation failed:', err));

            } else if (outcome.outcome === 'revised') {
                const updated = await prisma.hypothesis.update({
                    where: { id: outcome.id },
                    data: {
                        status: 'REVISED',
                        validatedAt: new Date(),
                        presentedInCallId: voiceCallId,
                        presentedAt: new Date(),
                        userResponse: outcome.userResponse,
                    },
                });

                // Create a revised hypothesis with the corrected understanding
                if (outcome.revisedStatement) {
                    await prisma.hypothesis.create({
                        data: {
                            userId,
                            category: hypothesis.category as any,
                            statement: outcome.revisedStatement,
                            evidence: `Revised from user feedback: "${outcome.userResponse}"`,
                            presentationText: '',
                            confidence: 0.8,
                            status: 'CONFIRMED',
                            priority: 1,
                            sourceType: 'user_correction',
                            revisedFromId: outcome.id,
                            validatedAt: new Date(),
                            visibility: classifyVisibility(hypothesis.category),
                        },
                    });
                }

                console.log(`[Hypothesis] REVISED: ${hypothesis.statement.substring(0, 80)}`);

                // AUTORESEARCH LOOP: Probe the corrected version deeper
                await generateFollowUpHypotheses(userId, {
                    id: outcome.id,
                    category: hypothesis.category,
                    statement: outcome.revisedStatement || hypothesis.statement,
                    userResponse: outcome.userResponse,
                    outcome: 'revised',
                    relatedStakeholderId: updated.relatedStakeholderId,
                }).catch(err => console.error('[Hypothesis] Follow-up generation failed:', err));

            } else if (outcome.outcome === 'rejected') {
                await prisma.hypothesis.update({
                    where: { id: outcome.id },
                    data: {
                        status: 'REJECTED',
                        validatedAt: new Date(),
                        presentedInCallId: voiceCallId,
                        presentedAt: new Date(),
                        userResponse: outcome.userResponse,
                    },
                });
                console.log(`[Hypothesis] REJECTED: ${hypothesis.statement.substring(0, 80)}`);

                // AUTORESEARCH: No follow-up for rejected, but log the anti-pattern
                // Future generators will skip similar hypotheses via rejectedPatterns filter
            }
        }

        // Send hypothesis validation outcomes to Langfuse for feedback loop tracking
        try {
            const validatedOutcomes = outcomes.filter(o => o.outcome !== 'not_discussed');
            if (validatedOutcomes.length > 0) {
                const sessionId = `coaching-${userId}`;
                const lfTrace = createSessionTrace({
                    name: 'hypothesis-validation',
                    userId,
                    sessionId,
                    metadata: { voiceCallId, hypothesesEvaluated: activeHypotheses.length },
                    input: { hypotheses: activeHypotheses.map(h => h.statement) },
                });

                if (lfTrace) {
                    const outcomeValues: Record<string, number> = { confirmed: 1, revised: 0.5, rejected: 0 };
                    for (const o of validatedOutcomes) {
                        const h = activeHypotheses.find(h => h.id === o.id);
                        scoreTraceMulti({
                            traceId: lfTrace.id,
                            scores: [{
                                name: 'hypothesis_accuracy',
                                value: outcomeValues[o.outcome] ?? 0,
                                comment: `${o.outcome}: ${h?.statement?.substring(0, 80) ?? o.id}`,
                            }],
                        });
                    }

                    logEvent({
                        traceId: lfTrace.id,
                        name: 'validation-results',
                        output: validatedOutcomes.map(o => ({
                            id: o.id,
                            outcome: o.outcome,
                            response: o.userResponse,
                        })),
                    });
                }
            }
        } catch (err: any) {
            console.warn(`[Hypothesis] Langfuse tracing failed: ${err.message}`);
        }
    } catch (e) {
        console.error('[Hypothesis] Failed to parse validation results:', e);
    }
}

// ============================================================================
// 5. SELECT HYPOTHESES FOR NEXT CALL
// ============================================================================

export async function getHypothesesForCall(userId: string, maxCount: number = 2): Promise<string> {
    const ready = await prisma.hypothesis.findMany({
        where: { userId, status: 'READY' },
        orderBy: [{ priority: 'asc' }, { confidence: 'desc' }],
        take: maxCount,
        select: {
            id: true, presentationText: true, category: true,
            confidence: true, evidence: true,
        },
    });

    if (ready.length === 0) return '';

    // Mark as PRESENTED
    await prisma.hypothesis.updateMany({
        where: { id: { in: ready.map(h => h.id) } },
        data: { status: 'PRESENTED', presentedAt: new Date() },
    });

    const lines = ready.map(h =>
        `- ${h.presentationText} [confidence: ${Math.round(h.confidence * 100)}%, based on: ${h.evidence.substring(0, 100)}]`
    );

    return `## HYPOTHESES TO TEST (present naturally, observe reaction)
${lines.join('\n')}
IMPORTANT: Frame as observations, not assertions. Watch for confirmation or correction. If user corrects you, absorb it gracefully.`;
}

// ============================================================================
// 6. MAIN: GENERATE ALL HYPOTHESES FOR A USER
// ============================================================================

export async function generateHypotheses(userId: string): Promise<number> {
    const allHypotheses: HypothesisInput[] = [];

    // Get user's emails for self-reference filtering
    const userEmails = await getUserEmails(userId);

    // Load rejected hypothesis patterns to avoid regenerating similar ones
    const rejectedPatterns = await prisma.hypothesis.findMany({
        where: { userId, status: 'REJECTED' },
        select: { statement: true, category: true, sourceType: true },
        take: 50,
    });

    // Run all generators in parallel
    const [emailH, calendarH, knowledgeH] = await Promise.all([
        generateEmailHypotheses(userId, userEmails).catch(() => []),
        generateCalendarHypotheses(userId, userEmails).catch(() => []),
        generateKnowledgeHypotheses(userId).catch(() => []),
    ]);

    allHypotheses.push(...emailH, ...calendarH, ...knowledgeH);

    if (allHypotheses.length === 0) return 0;

    // Deduplicate against existing hypotheses
    const existing = await prisma.hypothesis.findMany({
        where: {
            userId,
            status: { in: ['PENDING', 'READY', 'PRESENTED'] },
        },
        select: { statement: true, category: true },
    });

    const existingStatements = new Set(existing.map(h => h.statement.toLowerCase().substring(0, 50)));
    // Also skip hypotheses similar to rejected ones (autoresearch: don't re-test failures)
    const rejectedStatements = new Set(rejectedPatterns.map(h => h.statement.toLowerCase().substring(0, 50)));
    const newHypotheses = allHypotheses.filter(h => {
        const prefix = h.statement.toLowerCase().substring(0, 50);
        return !existingStatements.has(prefix) && !rejectedStatements.has(prefix);
    });

    if (newHypotheses.length === 0) return 0;

    // Insert new hypotheses
    let created = 0;
    for (const h of newHypotheses) {
        await prisma.hypothesis.create({
            data: {
                userId,
                category: h.category as any,
                statement: h.statement,
                evidence: h.evidence,
                presentationText: h.presentationText,
                confidence: h.confidence,
                priority: h.priority,
                sourceType: h.sourceType,
                sourceData: h.sourceData ? JSON.parse(JSON.stringify(h.sourceData)) : undefined,
                relatedStakeholderId: h.relatedStakeholderId,
                subjectEntityId: h.subjectEntityId,
                status: 'PENDING',
                visibility: h.visibility || classifyVisibility(h.category),
            },
        });
        created++;
    }

    console.log(`[Hypothesis] Generated ${created} new hypotheses for user ${userId.substring(0, 8)}`);
    return created;
}

// ============================================================================
// 7. PROMOTE: Move best PENDING hypotheses to READY (run before calls)
// ============================================================================

export async function promoteHypotheses(userId: string, maxReady: number = 3): Promise<void> {
    // Count currently READY hypotheses
    const readyCount = await prisma.hypothesis.count({
        where: { userId, status: 'READY' },
    });

    if (readyCount >= maxReady) return;

    const slotsAvailable = maxReady - readyCount;

    // Get best PENDING hypotheses
    const pending = await prisma.hypothesis.findMany({
        where: { userId, status: 'PENDING' },
        orderBy: [{ priority: 'asc' }, { confidence: 'desc' }],
        take: slotsAvailable,
        select: { id: true },
    });

    if (pending.length === 0) return;

    await prisma.hypothesis.updateMany({
        where: { id: { in: pending.map(h => h.id) } },
        data: { status: 'READY' },
    });

    console.log(`[Hypothesis] Promoted ${pending.length} hypotheses to READY for user ${userId.substring(0, 8)}`);
}

// ============================================================================
// 8. EXPIRE: Clean up old PENDING hypotheses
// ============================================================================

async function expireStaleHypotheses(userId: string): Promise<void> {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    await prisma.hypothesis.updateMany({
        where: {
            userId,
            status: 'PENDING',
            createdAt: { lt: twoWeeksAgo },
        },
        data: { status: 'EXPIRED' },
    });
}

// ============================================================================
// CRON: Generate + promote hypotheses for all active users
// ============================================================================

export async function runHypothesisGenerationAllUsers(): Promise<void> {
    await withAgentRun('hypothesis-generation', undefined, 'cron', async (ctx) => {
        const users = await prisma.personalContext.findMany({
            where: { callCount: { gte: 2 } }, // Only users with 2+ calls
            select: { userId: true },
        });

        let totalGenerated = 0;
        for (const { userId } of users) {
            try {
                const generated = await generateHypotheses(userId);
                await promoteHypotheses(userId);
                await expireStaleHypotheses(userId);
                totalGenerated += generated;
            } catch (err) {
                console.error(`[Hypothesis] Failed for user ${userId.substring(0, 8)}:`, err);
            }
        }

        ctx.itemsProcessed = totalGenerated;
        console.log(`[Hypothesis] Generation complete. ${totalGenerated} new hypotheses across ${users.length} users.`);
    });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the user's own email addresses (primary + any Google account emails).
 * Used to filter self-references — we match by email (unique), never by name
 * (ambiguous: "Karthik" could be the user or a different Karthik).
 */
async function getUserEmails(userId: string): Promise<Set<string>> {
    const [user, accounts] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
        prisma.account.findMany({
            where: { userId, provider: 'google' },
            select: { providerAccountId: true },
        }),
    ]);
    const emails = new Set<string>();
    if (user?.email) emails.add(user.email.toLowerCase());
    // Google providerAccountId is numeric, not email — but if the user's email
    // domain appears in meeting participants, we catch it via the primary email.
    return emails;
}

function isSelfEmail(email: string, userEmails: Set<string>): boolean {
    return userEmails.has(email.toLowerCase());
}

async function findStakeholderByEmail(userId: string, email: string) {
    return prisma.stakeholderProfile.findFirst({
        where: { userId, email, mergedIntoId: null },
        select: { id: true, name: true, powerLevel: true, isImportant: true },
    });
}

async function findStakeholderByName(userId: string, name: string) {
    return prisma.stakeholderProfile.findFirst({
        where: {
            userId,
            mergedIntoId: null,
            name: { contains: name, mode: 'insensitive' },
        },
        select: { id: true, name: true },
    });
}

// ============================================================================
// AUTORESEARCH LOOP: Generate follow-up hypotheses from validated ones
// ============================================================================

/**
 * After hypothesis validation, generate deeper follow-up hypotheses.
 * This is the compounding step from Karpathy's autoresearch:
 * each confirmed hypothesis seeds a deeper line of inquiry.
 *
 * Confirmed: "Manmeet is co-founder" → deepen into decision dynamics
 * Revised: "Not a blocker, just cautious" → probe the caution pattern
 * Rejected: "That's me, not another person" → avoid similar self-references
 */
async function generateFollowUpHypotheses(
    userId: string,
    validatedHypothesis: {
        id: string;
        category: string;
        statement: string;
        userResponse: string;
        outcome: 'confirmed' | 'revised' | 'rejected';
        relatedStakeholderId?: string | null;
    },
): Promise<void> {
    // Rejected hypotheses: learn what to avoid, don't generate follow-ups
    if (validatedHypothesis.outcome === 'rejected') {
        console.log(`[Hypothesis] Rejected → no follow-up. Learning: "${validatedHypothesis.userResponse}"`);
        return;
    }

    const config = await getUserLLMConfig(userId);
    if (config.provider === 'none') return;

    // Load hypothesis history for context (autoresearch's results.tsv equivalent)
    const history = await prisma.hypothesis.findMany({
        where: { userId, status: { in: ['CONFIRMED', 'REVISED', 'REJECTED'] } },
        select: { statement: true, status: true, userResponse: true, category: true },
        orderBy: { validatedAt: 'desc' },
        take: 15,
    });

    const historyContext = history.length > 0
        ? history.map(h => `[${h.status}] ${h.statement} → User: "${h.userResponse || 'N/A'}"`).join('\n')
        : 'No prior hypothesis history.';

    const prompt = `You are a hypothesis engine for an executive coaching AI. A hypothesis was just ${validatedHypothesis.outcome} by the user.

VALIDATED HYPOTHESIS:
"${validatedHypothesis.statement}"
User's response: "${validatedHypothesis.userResponse}"
Category: ${validatedHypothesis.category}

PRIOR HYPOTHESIS HISTORY (confirmed/revised/rejected):
${historyContext}

Generate 1-2 DEEPER follow-up hypotheses that build on what we just learned. These should go one level deeper — don't repeat the same observation, advance the understanding.

Rules:
- Each follow-up must be MORE SPECIFIC than the parent (not broader)
- Reference the user's actual words when possible
- If confirmed: probe the WHY or the IMPLICATION
- If revised: test the CORRECTED version more precisely
- NEVER generate hypotheses similar to REJECTED ones in the history
- Each hypothesis needs a natural conversational presentation (2 sentences max, Mira's voice)

Respond with a JSON array:
[{
  "category": "STAKEHOLDER_DYNAMIC" | "POWER_ASYMMETRY" | "COMMUNICATION_PATTERN" | "WORK_PRIORITY" | "LEADERSHIP_STYLE" | "RELATIONSHIP_QUALITY" | "PERSONAL_INSIGHT" | "TEAM_DYNAMIC" | "STRATEGIC_PATTERN",
  "statement": "the hypothesis statement",
  "evidence": "what data/prior validation supports this",
  "presentationText": "how Mira would naturally present this in a call",
  "confidence": 0.5-0.8,
  "priority": 1-5
}]`;

    const result = await withLLMRetry(
        () => generateText(config, prompt, { userId }),
        { label: 'HypothesisFollowUp' },
    );

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    try {
        const followUps = JSON.parse(jsonMatch[0]) as Array<{
            category: string;
            statement: string;
            evidence: string;
            presentationText: string;
            confidence: number;
            priority: number;
        }>;

        const validCategories = new Set([
            'STAKEHOLDER_DYNAMIC', 'POWER_ASYMMETRY', 'COMMUNICATION_PATTERN',
            'WORK_PRIORITY', 'LEADERSHIP_STYLE', 'RELATIONSHIP_QUALITY',
            'PERSONAL_INSIGHT', 'TEAM_DYNAMIC', 'STRATEGIC_PATTERN',
        ]);

        for (const fu of followUps.slice(0, 2)) {
            // Validate category — LLMs sometimes invent new ones
            const category = validCategories.has(fu.category)
                ? fu.category
                : validatedHypothesis.category; // Fall back to parent's category

            await prisma.hypothesis.create({
                data: {
                    userId,
                    category: category as any,
                    statement: fu.statement,
                    evidence: fu.evidence,
                    presentationText: fu.presentationText,
                    confidence: Math.min(fu.confidence, 0.8),
                    priority: Math.max(fu.priority, 1),
                    sourceType: 'autoresearch_followup',
                    revisedFromId: validatedHypothesis.id,
                    relatedStakeholderId: validatedHypothesis.relatedStakeholderId || undefined,
                    status: 'PENDING',
                    visibility: classifyVisibility(category),
                },
            });
        }

        console.log(`[Hypothesis] Autoresearch: ${followUps.length} follow-ups generated from ${validatedHypothesis.outcome} hypothesis`);
    } catch (e) {
        console.error('[Hypothesis] Failed to parse follow-up hypotheses:', e);
    }
}
