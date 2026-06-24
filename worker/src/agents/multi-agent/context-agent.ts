/**
 * Context Agent
 *
 * Responsible for retrieving and synthesizing relevant information
 * from the user's calendar, emails, documents, and stakeholders.
 *
 * This agent is the "memory" of the system - it knows what the user
 * has been working on and can provide rich context to other agents.
 */

import { prisma } from '../../lib/prisma';
import {
    AgentContext,
    ExtractedEntities,
    ContextSynthesis,
    ProjectSummary,
    PersonContext,
    DocumentContext,
    MeetingContext,
    EmailContext
} from './types';
import { withGeminiRetry } from './gemini-retry';
import {
    findEntitiesByName,
    getTwoHopFacts,
    getEntityCommunities,
} from '../knowledge/graph-query-service';
import { fetchGeminiMeetingNotes } from '../../services/meeting-notes-service';
import { createTrackedGeminiModel } from '../../lib/gemini-tracked';

export class ContextAgent {

    /**
     * Main entry point - gather and synthesize context based on entities
     */
    async synthesizeContext(
        context: AgentContext,
        entities: ExtractedEntities
    ): Promise<ContextSynthesis> {
        console.log('[ContextAgent] Synthesizing context for entities:', entities);

        const [
            projectSummaries,
            relevantPeople,
            relevantDocuments,
            relevantMeetings,
            relevantEmails
        ] = await Promise.all([
            this.getProjectSummaries(context.userId, entities.projects || []),
            this.getRelevantPeople(context.userId, entities.people || [], entities.projects || []),
            this.getRelevantDocuments(context.userId, entities),
            this.getRelevantMeetings(context.userId, entities),
            this.getRelevantEmails(context.userId, entities)
        ]);

        // Use LLM to generate insights and suggested actions
        const { suggestedActions, keyInsights } = await this.generateInsights(
            context,
            entities,
            { projectSummaries, relevantPeople, relevantDocuments, relevantMeetings, relevantEmails }
        );

        return {
            projectSummaries,
            relevantPeople,
            relevantDocuments,
            relevantMeetings,
            relevantEmails,
            suggestedActions,
            keyInsights
        };
    }

    /**
     * Get summaries of projects mentioned by the user.
     * Uses knowledge graph for richer project intelligence, falls back to raw data.
     */
    private async getProjectSummaries(
        userId: string,
        projectNames: string[]
    ): Promise<ProjectSummary[]> {
        const summaries: ProjectSummary[] = [];

        for (const projectName of projectNames) {
            // Try knowledge graph first
            const graphEntities = await findEntitiesByName(userId, projectName);
            const projectEntity = graphEntities.find(e => e.type === 'PROJECT');

            if (projectEntity) {
                // Get rich graph data about this project
                const { directFacts, connectedFacts } = await getTwoHopFacts(userId, projectEntity.id);
                const communities = await getEntityCommunities(projectEntity.id, userId);

                // Extract people from graph facts
                const keyPeople = directFacts
                    .filter(f => f.objectEntity?.type === 'PERSON')
                    .map(f => f.objectEntity!.name)
                    .filter((name, i, arr) => arr.indexOf(name) === i)
                    .slice(0, 5);

                // Extract topics
                const topics = directFacts
                    .filter(f => f.objectEntity?.type === 'TOPIC')
                    .map(f => f.objectEntity!.name);

                const communityContext = communities.length > 0
                    ? `. Part of: ${communities.map(c => c.name).join(', ')}`
                    : '';

                summaries.push({
                    name: projectEntity.name,
                    meetingCount: directFacts.filter(f => f.predicate === 'involves_topic' || f.predicate === 'works_on').length,
                    documentCount: directFacts.filter(f => f.predicate === 'related_to_project').length,
                    keyPeople,
                    recentActivity: `${directFacts.length} graph facts. Topics: ${topics.join(', ') || 'unknown'}${communityContext}`,
                    openQuestions: []
                });
                continue;
            }

            // Fall back to raw data search
            const meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    OR: [
                        { title: { contains: projectName, mode: 'insensitive' } },
                        { description: { contains: projectName, mode: 'insensitive' } }
                    ]
                },
                orderBy: { startTime: 'desc' },
                take: 20
            });

            const documents = await prisma.workArtifact.findMany({
                where: {
                    userId,
                    OR: [
                        { title: { contains: projectName, mode: 'insensitive' } },
                        { content: { contains: projectName, mode: 'insensitive' } }
                    ]
                },
                orderBy: { ingestedAt: 'desc' },
                take: 10
            });

            const peopleSet = new Set<string>();
            for (const meeting of meetings) {
                const attendees = meeting.attendees as any[] || [];
                for (const attendee of attendees) {
                    const email = typeof attendee === 'string' ? attendee : attendee.email;
                    if (email && !email.includes(userId)) {
                        peopleSet.add(email.split('@')[0]);
                    }
                }
            }

            let recentActivity = '';
            if (meetings[0]) recentActivity = `Last meeting: "${meetings[0].title}" on ${meetings[0].startTime.toLocaleDateString()}`;
            if (documents[0]) recentActivity += (recentActivity ? '. ' : '') + `Recent doc: "${documents[0].title}"`;

            summaries.push({
                name: projectName,
                meetingCount: meetings.length,
                documentCount: documents.length,
                keyPeople: Array.from(peopleSet).slice(0, 5),
                recentActivity: recentActivity || 'No recent activity found',
                openQuestions: []
            });
        }

        // If no specific projects mentioned, try graph PROJECT entities first, then meeting titles
        if (summaries.length === 0) {
            const graphProjects = await prisma.knowledgeEntity.findMany({
                where: { userId, type: 'PROJECT' },
                orderBy: { updatedAt: 'desc' },
                take: 3,
            });

            if (graphProjects.length > 0) {
                for (const project of graphProjects) {
                    const factCount = await prisma.knowledgeFact.count({
                        where: { userId, OR: [{ subjectId: project.id }, { objectEntityId: project.id }], validTo: null }
                    });

                    summaries.push({
                        name: project.name,
                        meetingCount: factCount,
                        documentCount: 0,
                        keyPeople: [],
                        recentActivity: `${factCount} facts in knowledge graph`,
                        openQuestions: []
                    });
                }
            } else {
                // Ultimate fallback: infer from meeting titles
                const recentMeetings = await prisma.meetingSyncRecord.findMany({
                    where: { userId },
                    orderBy: { startTime: 'desc' },
                    take: 20
                });

                const projectPatterns = this.extractProjectPatterns(recentMeetings.map(m => m.title));
                for (const pattern of projectPatterns.slice(0, 3)) {
                    const meetingCount = recentMeetings.filter(m =>
                        m.title.toLowerCase().includes(pattern.toLowerCase())
                    ).length;

                    summaries.push({
                        name: pattern,
                        meetingCount,
                        documentCount: 0,
                        keyPeople: [],
                        recentActivity: `${meetingCount} meetings found`,
                        openQuestions: []
                    });
                }
            }
        }

        return summaries;
    }

    /**
     * Extract common project names from meeting titles
     */
    private extractProjectPatterns(titles: string[]): string[] {
        const patterns: Map<string, number> = new Map();

        for (const title of titles) {
            // Look for common patterns like "Project X", "X Standup", "X Review"
            const words = title.split(/[\s\-:]+/);
            for (const word of words) {
                if (word.length > 2 &&
                    !['the', 'and', 'for', 'with', 'meeting', 'standup', 'review', 'sync', 'call', 'weekly', 'daily'].includes(word.toLowerCase())) {
                    patterns.set(word, (patterns.get(word) || 0) + 1);
                }
            }
        }

        // Return patterns that appear multiple times
        return Array.from(patterns.entries())
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .map(([pattern, _]) => pattern);
    }

    /**
     * Get relevant people based on entities.
     * Tries knowledge graph first for richer data, falls back to StakeholderProfile.
     */
    private async getRelevantPeople(
        userId: string,
        peopleNames: string[],
        projectNames: string[]
    ): Promise<PersonContext[]> {
        const people: PersonContext[] = [];
        const resolvedNames = new Set<string>();

        // First: try knowledge graph for explicitly mentioned people
        for (const name of peopleNames) {
            const graphEntities = await findEntitiesByName(userId, name);
            const personEntity = graphEntities.find(e => e.type === 'PERSON');

            if (personEntity) {
                const { directFacts, connectedFacts } = await getTwoHopFacts(userId, personEntity.id);
                const communities = await getEntityCommunities(personEntity.id, userId);

                // Extract role, email, and key facts from graph
                const roleFact = directFacts.find(f => f.predicate === 'has_role');
                const emailProp = (await prisma.knowledgeEntity.findUnique({
                    where: { id: personEntity.id },
                    select: { properties: true }
                }))?.properties as any;

                const graphFacts = directFacts.slice(0, 8).map(f =>
                    `${f.predicate}: ${f.objectEntity?.name || f.objectValue || '?'}`
                );

                const communityNames = communities.map(c => c.name);

                people.push({
                    name: personEntity.name,
                    email: emailProp?.email || undefined,
                    role: roleFact?.objectValue || undefined,
                    relationship: communityNames.length > 0
                        ? `Connected via: ${communityNames.join(', ')}`
                        : `${directFacts.length} known facts`,
                    recentInteractions: graphFacts,
                    upcomingMeetings: []
                });
                resolvedNames.add(name.toLowerCase());
            }
        }

        // Second: fall back to StakeholderProfile for unresolved names
        for (const name of peopleNames) {
            if (resolvedNames.has(name.toLowerCase())) continue;

            const stakeholder = await prisma.stakeholderProfile.findFirst({
                where: {
                    userId,
                    name: { contains: name, mode: 'insensitive' }
                },
                select: {
                    id: true, name: true, email: true, role: true, relationshipStrength: true,
                    personaArchetype: true, communicationStyle: true, primaryMotivation: true,
                    politicalStance: true, decisionStyle: true,
                    powerLevel: true, influenceRole: true,
                    lastInteraction: true, interactionCount: true,
                    linkedinHeadline: true, recentPublicActivity: true,
                    fears: true,
                    intelligence: {
                        select: {
                            profileSummary: true, successPatterns: true,
                            objectionPatterns: true, recentTopics: true,
                            currentMood: true, decisionMakingNotes: true,
                            failurePatterns: true,
                        }
                    }
                }
            });

            if (stakeholder) {
                const intel = stakeholder.intelligence;
                const playbook: string[] = [];
                if (intel?.profileSummary) playbook.push(intel.profileSummary);
                if (intel?.successPatterns?.length) playbook.push(`What works: ${intel.successPatterns.join('; ')}`);
                if (intel?.objectionPatterns?.length) playbook.push(`Their concerns: ${intel.objectionPatterns.join('; ')}`);
                if (intel?.decisionMakingNotes) playbook.push(`Decision style: ${intel.decisionMakingNotes}`);
                if (intel?.currentMood) playbook.push(`Current mood: ${intel.currentMood}`);
                if (intel?.failurePatterns?.length) playbook.push(`Growth areas: ${intel.failurePatterns.join('; ')}`);

                // Ground Game intelligence
                if (stakeholder.politicalStance && stakeholder.politicalStance !== 'UNKNOWN') {
                    playbook.push(`Political stance: ${stakeholder.politicalStance.toLowerCase()}`);
                }
                if (stakeholder.powerLevel === 'HIGH') playbook.push(`High-power stakeholder (${stakeholder.influenceRole?.toLowerCase()?.replace('_', ' ') || 'key player'})`);
                if (stakeholder.linkedinHeadline) playbook.push(`LinkedIn: ${stakeholder.linkedinHeadline}`);
                if (stakeholder.fears?.length) playbook.push(`Fears: ${stakeholder.fears.slice(0, 2).join('; ')}`);
                if (stakeholder.lastInteraction) {
                    const daysSince = Math.floor((Date.now() - stakeholder.lastInteraction.getTime()) / (24 * 60 * 60 * 1000));
                    playbook.push(`Last contact: ${daysSince}d ago (${stakeholder.interactionCount} total interactions)`);
                    if (daysSince > 14 && (stakeholder.powerLevel === 'HIGH' || stakeholder.influenceRole === 'DECISION_MAKER')) {
                        playbook.push(`⚠️ Relationship going stale — consider booking a 1:1`);
                    }
                }

                // Build archetype playbook
                const archetypePlaybook = this.getArchetypePlaybook(stakeholder.personaArchetype as string | null);

                // Fetch past outcome history with this person
                const outcomeHistory = await this.getOutcomeHistoryWith(userId, stakeholder.name, stakeholder.email);

                people.push({
                    name: stakeholder.name,
                    email: stakeholder.email || undefined,
                    role: stakeholder.role || undefined,
                    relationship: this.describeRelationship(stakeholder.relationshipStrength),
                    recentInteractions: playbook.length > 0 ? [playbook.join('. ')] : [],
                    upcomingMeetings: [],
                    archetype: stakeholder.personaArchetype || undefined,
                    archetypePlaybook,
                    commStyle: stakeholder.communicationStyle || undefined,
                    motivation: stakeholder.primaryMotivation || undefined,
                    outcomeHistory,
                });
            }
        }

        // Third: if no names matched, get top stakeholders
        if (people.length === 0) {
            const topStakeholders = await prisma.stakeholderProfile.findMany({
                where: { userId },
                orderBy: { interactionCount: 'desc' },
                take: 5,
                select: { id: true, name: true, email: true, role: true, relationshipStrength: true }
            });

            for (const stakeholder of topStakeholders) {
                people.push({
                    name: stakeholder.name,
                    email: stakeholder.email || undefined,
                    role: stakeholder.role || undefined,
                    relationship: this.describeRelationship(stakeholder.relationshipStrength),
                    recentInteractions: [],
                    upcomingMeetings: []
                });
            }
        }

        return people;
    }

    private describeRelationship(strength: number): string {
        if (strength >= 0.8) return 'close collaborator';
        if (strength >= 0.6) return 'frequent collaborator';
        if (strength >= 0.4) return 'regular contact';
        if (strength >= 0.2) return 'occasional contact';
        return 'infrequent contact';
    }

    /**
     * Get past meeting outcome history with a specific person.
     * Looks at meetings where this person was an attendee and outcomes were recorded.
     */
    private async getOutcomeHistoryWith(
        userId: string,
        personName: string,
        personEmail: string | null
    ): Promise<PersonContext['outcomeHistory']> {
        try {
            // Find meetings with this person that have outcomes
            const meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    outcomeResult: { not: null },
                    OR: [
                        { attendees: { path: '$[*].email', string_contains: personEmail || '__no_match__' } },
                        { title: { contains: personName.split(' ')[0], mode: 'insensitive' } },
                    ],
                },
                select: {
                    outcomeResult: true,
                    title: true,
                    desiredOutcome: true,
                    outcome: true,
                    conversationOutcomes: {
                        select: { whatWorked: true, whatFailed: true },
                        take: 1,
                    },
                },
                orderBy: { startTime: 'desc' },
                take: 10,
            });

            if (meetings.length === 0) return undefined;

            const landed = meetings.filter(m => m.outcomeResult === 'LANDED').length;
            const partial = meetings.filter(m => m.outcomeResult === 'PARTIAL').length;
            const missed = meetings.filter(m => m.outcomeResult === 'MISSED').length;

            // Extract patterns from whatWorked/whatFailed across meetings
            const patterns: string[] = [];
            const allWorked: string[] = [];
            const allGrowth: string[] = [];
            for (const m of meetings) {
                const co = m.conversationOutcomes?.[0];
                if (co?.whatWorked) allWorked.push(...co.whatWorked);
                if (co?.whatFailed) allGrowth.push(...co.whatFailed);
            }
            // Deduplicate and take top patterns
            if (landed > 0 && allWorked.length > 0) {
                patterns.push(`You succeed when: ${[...new Set(allWorked)].slice(0, 3).join('; ')}`);
            }
            if (allGrowth.length > 0) {
                patterns.push(`Growth area: ${[...new Set(allGrowth)].slice(0, 2).join('; ')}`);
            }
            if (landed > partial + missed) {
                patterns.push(`Strong track record — ${landed}/${meetings.length} meetings landed`);
            }

            return { total: meetings.length, landed, partial, missed, patterns };
        } catch (err: any) {
            console.warn(`[ContextAgent] Outcome history lookup failed for ${personName}: ${err.message}`);
            return undefined;
        }
    }

    /**
     * Get tactical archetype playbook advice.
     */
    private getArchetypePlaybook(archetype: string | null): string | undefined {
        if (!archetype) return undefined;
        const playbook: Record<string, string> = {
            DRIVER: 'Lead with outcomes, be concise, show ROI. Avoid: rambling, bringing problems without solutions.',
            ANALYST: 'Bring evidence, give them time to process, be precise. Avoid: vague claims, rushing decisions.',
            COLLABORATOR: 'Include them early, validate input, build agreement. Avoid: steamrolling, deciding without consulting.',
            VISIONARY: 'Connect to the big picture, show long-term impact, be bold. Avoid: getting lost in minutiae.',
            GUARDIAN: 'Show safety nets, propose incremental steps, respect existing systems. Avoid: radical change, dismissing concerns.',
            POLITICIAN: 'Understand their agenda, find mutual wins, give them credit. Avoid: challenging publicly, being naïve about motives.',
            CHAMPION: 'Give them something to champion, share early, offer public credit. Avoid: keeping them out of the loop.',
            PRAGMATIST: 'Show ROI, be specific about timelines, start small. Avoid: being abstract, promising the moon.',
            SKEPTIC: 'Welcome objections, provide evidence, earn trust gradually. Avoid: dismissing concerns, asking for blind trust.',
            CONSERVATIVE: 'Change slowly, show precedent, respect what exists. Avoid: proposing disruption, forcing urgency.',
            OPERATOR: 'Be structured, respect their systems, follow up in writing. Avoid: being disorganized, changing plans frequently.',
        };
        return playbook[archetype] || undefined;
    }

    /**
     * Get relevant documents based on entities
     */
    private async getRelevantDocuments(
        userId: string,
        entities: ExtractedEntities
    ): Promise<DocumentContext[]> {
        const searchTerms = [
            ...(entities.projects || []),
            ...(entities.topics || [])
        ];

        if (searchTerms.length === 0) {
            // Just get recent documents
            const docs = await prisma.workArtifact.findMany({
                where: {
                    userId,
                    type: 'DOCUMENT_AUTHORED'
                },
                orderBy: { ingestedAt: 'desc' },
                take: 5
            });

            return docs.map(doc => ({
                title: doc.title || 'Untitled',
                type: doc.type,
                summary: doc.content?.substring(0, 200) || 'No content',
                lastModified: doc.ingestedAt,
                relevanceReason: 'Recent document'
            }));
        }

        // Build OR conditions for each search term
        const orConditions = searchTerms.map(term => ({
            OR: [
                { title: { contains: term, mode: 'insensitive' as const } },
                { content: { contains: term, mode: 'insensitive' as const } }
            ]
        }));

        const docs = await prisma.workArtifact.findMany({
            where: {
                userId,
                OR: orConditions
            },
            orderBy: { ingestedAt: 'desc' },
            take: 10
        });

        return docs.map(doc => {
            // Figure out which term matched
            const matchedTerm = searchTerms.find(term =>
                doc.title?.toLowerCase().includes(term.toLowerCase()) ||
                doc.content?.toLowerCase().includes(term.toLowerCase())
            );

            return {
                title: doc.title || 'Untitled',
                type: doc.type,
                summary: doc.content?.substring(0, 300) || 'No content',
                lastModified: doc.ingestedAt,
                relevanceReason: matchedTerm ? `Related to "${matchedTerm}"` : 'Recent document'
            };
        });
    }

    /**
     * Enrich a meeting with related emails and documents when notes are missing.
     * Searches EmailSummary within 4h after meeting end with participant overlap,
     * and WorkArtifact (DOCUMENT_AUTHORED/EDITED) within 24h with title keyword overlap.
     */
    private async enrichMeetingWithNotes(
        userId: string,
        meeting: { id: string; title: string; startTime: Date; endTime: Date; attendees: any; notes: string | null; outcome: string | null }
    ): Promise<{
        relatedEmails: Array<{ subject: string; from: string; date: Date; summary: string }>;
        relatedDocuments: Array<{ title: string; lastModified: Date; summary: string }>;
    }> {
        const meetingEnd = meeting.endTime;
        const fourHoursAfter = new Date(meetingEnd.getTime() + 4 * 60 * 60 * 1000);
        const twentyFourHoursAfter = new Date(meetingEnd.getTime() + 24 * 60 * 60 * 1000);

        // Extract participant emails from meeting attendees
        const attendees = (meeting.attendees as any[]) || [];
        const participantEmails = attendees
            .map((a: any) => typeof a === 'string' ? a : a.email)
            .filter(Boolean) as string[];

        // Extract keywords from meeting title for document matching
        const titleKeywords = meeting.title
            .split(/[\s\-:]+/)
            .filter(w => w.length > 3 && !['meeting', 'call', 'sync', 'weekly', 'daily', 'with'].includes(w.toLowerCase()));

        // Search for related emails within 4h after meeting
        // Strategy: match by participant overlap OR by meeting title keywords in subject
        // (Gemini/Meet notes come from Google, not attendees, so participant match alone misses them)
        let relatedEmails: Array<{ subject: string; from: string; date: Date; summary: string }> = [];
        const timeWindow = {
            gte: meetingEnd,
            lte: fourHoursAfter
        };

        const emailOrConditions: any[] = [];

        // Match emails where any attendee is a participant
        if (participantEmails.length > 0) {
            emailOrConditions.push({
                participants: { hasSome: participantEmails }
            });
        }

        // Match emails where subject contains meeting title keywords (catches Gemini notes, bot summaries)
        if (titleKeywords.length > 0) {
            for (const kw of titleKeywords) {
                emailOrConditions.push({
                    subject: { contains: kw, mode: 'insensitive' as const }
                });
            }
        }

        if (emailOrConditions.length > 0) {
            const emailSummaries = await prisma.emailSummary.findMany({
                where: {
                    userId,
                    lastMessageAt: timeWindow,
                    OR: emailOrConditions
                },
                orderBy: { lastMessageAt: 'asc' },
                take: 5
            });

            relatedEmails = emailSummaries.map(e => ({
                subject: e.subject || 'No subject',
                from: e.from || 'Unknown',
                date: e.lastMessageAt,
                summary: e.summary.substring(0, 300)
            }));
        }

        // Search for related documents within 24h with title keyword overlap
        let relatedDocuments: Array<{ title: string; lastModified: Date; summary: string }> = [];
        if (titleKeywords.length > 0) {
            const docOrConditions = titleKeywords.map(kw => ({
                title: { contains: kw, mode: 'insensitive' as const }
            }));

            const docs = await prisma.workArtifact.findMany({
                where: {
                    userId,
                    type: { in: ['DOCUMENT_AUTHORED', 'DOCUMENT_EDITED'] },
                    occurredAt: {
                        gte: meetingEnd,
                        lte: twentyFourHoursAfter
                    },
                    OR: docOrConditions
                },
                orderBy: { occurredAt: 'asc' },
                take: 5
            });

            relatedDocuments = docs.map(d => ({
                title: d.title || 'Untitled',
                lastModified: d.occurredAt,
                summary: d.content?.substring(0, 300) || 'No content'
            }));
        }

        return { relatedEmails, relatedDocuments };
    }

    /**
     * Get relevant meetings based on entities.
     * When user asks about notes/outcomes/minutes, enriches past meetings
     * with related emails and documents.
     */
    private async getRelevantMeetings(
        userId: string,
        entities: ExtractedEntities
    ): Promise<MeetingContext[]> {
        const searchTerms = [
            ...(entities.projects || []),
            ...(entities.people || []),
            ...(entities.topics || [])
        ];

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Detect if user is asking about meeting notes/outcomes/minutes
        const notesKeywords = ['notes', 'minutes', 'outcome', 'outcomes', 'summary', 'action items', 'takeaways', 'decisions', 'what happened', 'recap'];
        const allTopics = (entities.topics || []).map(t => t.toLowerCase());
        const isAskingForNotes = notesKeywords.some(kw => allTopics.some(t => t.includes(kw)));

        let meetings;
        const peopleNames = entities.people || [];

        if (searchTerms.length === 0) {
            meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    startTime: { gte: weekAgo, lte: weekAhead }
                },
                orderBy: { startTime: 'asc' },
                take: 10
            });
        } else if (peopleNames.length > 0) {
            // Resolve people names → ALL known email addresses
            // A person may have multiple emails (personal, work, academic)
            // Also check merged profiles for alt emails
            const resolvedEmails: string[] = [];
            for (const name of peopleNames) {
                // Find matching stakeholder profiles (active, not merged)
                const stakeholders = await prisma.stakeholderProfile.findMany({
                    where: {
                        userId,
                        mergedIntoId: null,
                        OR: [
                            { name: { contains: name, mode: 'insensitive' as const } },
                            ...name.split(/\s+/).filter(w => w.length > 3).map(word => ({
                                name: { contains: word, mode: 'insensitive' as const }
                            })),
                        ],
                    },
                    select: { id: true, email: true, name: true, additionalEmails: true, aliases: true },
                });

                // Collect ALL emails: primary + additionalEmails + merged profiles
                for (const s of stakeholders) {
                    // Add additionalEmails from the profile itself
                    for (const altEmail of (s.additionalEmails || [])) {
                        if (altEmail && !resolvedEmails.includes(altEmail.toLowerCase())) {
                            resolvedEmails.push(altEmail.toLowerCase());
                            console.log(`[ContextAgent] Found additional email for "${name}" → ${altEmail}`);
                        }
                    }

                    // Also collect emails from profiles merged INTO this one
                    const mergedProfiles = await prisma.stakeholderProfile.findMany({
                        where: { mergedIntoId: s.id, email: { not: null } },
                        select: { email: true, name: true },
                    });
                    for (const mp of mergedProfiles) {
                        if (mp.email && !resolvedEmails.includes(mp.email.toLowerCase())) {
                            resolvedEmails.push(mp.email.toLowerCase());
                            console.log(`[ContextAgent] Found merged email for "${name}" → ${mp.email} (from ${mp.name})`);
                        }
                    }
                }

                // Also check if the name matches any aliases
                if (resolvedEmails.length === 0) {
                    const aliasMatch = await prisma.stakeholderProfile.findFirst({
                        where: {
                            userId,
                            mergedIntoId: null,
                            aliases: { has: name },
                        },
                        select: { email: true, additionalEmails: true, name: true },
                    });
                    if (aliasMatch) {
                        if (aliasMatch.email) resolvedEmails.push(aliasMatch.email.toLowerCase());
                        for (const e of aliasMatch.additionalEmails) resolvedEmails.push(e.toLowerCase());
                        console.log(`[ContextAgent] Resolved "${name}" via alias → ${aliasMatch.name}`);
                    }
                }
                for (const s of stakeholders) {
                    if (s.email) {
                        resolvedEmails.push(s.email.toLowerCase());
                        console.log(`[ContextAgent] Resolved "${name}" → ${s.email} (${s.name})`);
                    }
                }

                // Also check calendar attendees for additional emails this person uses
                // (e.g., Prof uses raj@coss.org.in in calendar but srgpalan@gmail.com in StakeholderProfile)
                // Strategy 1: search by known email
                // Strategy 2: if no meetings found, search by name in meeting titles (catches "Review with Prof")
                const knownEmails = stakeholders.map(s => s.email).filter(Boolean) as string[];
                let meetingsWithPerson = knownEmails.length > 0
                    ? await prisma.meetingSyncRecord.findMany({
                        where: { userId, participants: { hasSome: knownEmails.map(e => e.toLowerCase()) } },
                        select: { attendees: true },
                        take: 5,
                    })
                    : [];

                // Fallback: if no meetings found by email, search by name in title
                if (meetingsWithPerson.length === 0) {
                    const nameWords = name.split(/\s+/).filter(w => w.length > 3);
                    const stakeholderNames = stakeholders.map(s => s.name);
                    const allSearchNames = [...nameWords, ...stakeholderNames.flatMap(n => n.split(/\s+/).filter(w => w.length > 3))];
                    const uniqueSearchNames = [...new Set(allSearchNames)];

                    if (uniqueSearchNames.length > 0) {
                        const titleConditions = uniqueSearchNames.map(w => ({
                            title: { contains: w, mode: 'insensitive' as const }
                        }));
                        meetingsWithPerson = await prisma.meetingSyncRecord.findMany({
                            where: { userId, OR: titleConditions },
                            select: { attendees: true },
                            take: 10,
                        });
                        console.log(`[ContextAgent] Name-based title search for "${name}" found ${meetingsWithPerson.length} meetings`);
                    }
                }

                // Extract alt emails from attendees of found meetings
                for (const m of meetingsWithPerson) {
                    const attendees = (m.attendees as any[]) || [];
                    for (const a of attendees) {
                        const email = (a.email || '').toLowerCase();
                        if (email && !resolvedEmails.includes(email) && !email.includes('calendar.google.com')) {
                            const attendeeName = ((a.displayName || a.name || '') as string).toLowerCase();
                            const personLower = name.toLowerCase();
                            const nameWords = personLower.split(/\s+/).filter(w => w.length > 3);
                            // Match by name OR by email local part containing a name word
                            if (attendeeName.includes(personLower) || nameWords.some(w => attendeeName.includes(w) || email.split('@')[0].includes(w))) {
                                resolvedEmails.push(email);
                                console.log(`[ContextAgent] Found alt email for "${name}" → ${email} (from calendar attendees)`);
                            }
                        }
                    }
                }
            }

            // Deduplicate
            const uniqueEmails = [...new Set(resolvedEmails)];
            console.log(`[ContextAgent] Total resolved emails: ${uniqueEmails.join(', ')}`);

            if (uniqueEmails.length > 0) {
                // Primary: search by attendee email (exact, foolproof)
                meetings = await prisma.meetingSyncRecord.findMany({
                    where: {
                        userId,
                        participants: { hasSome: uniqueEmails },
                    },
                    orderBy: { startTime: 'desc' },
                    take: 15,
                });
            } else {
                // Fallback: name-based title search if we couldn't resolve emails
                console.log(`[ContextAgent] Could not resolve emails for ${peopleNames.join(', ')}, falling back to title search`);
                const titleConditions = searchTerms.map(term => ({
                    OR: [
                        { title: { contains: term, mode: 'insensitive' as const } },
                        { description: { contains: term, mode: 'insensitive' as const } },
                    ]
                }));
                meetings = await prisma.meetingSyncRecord.findMany({
                    where: { userId, OR: titleConditions },
                    orderBy: { startTime: 'desc' },
                    take: 10,
                });
            }
        } else {
            const orConditions = searchTerms.map(term => ({
                OR: [
                    { title: { contains: term, mode: 'insensitive' as const } },
                    { description: { contains: term, mode: 'insensitive' as const } }
                ]
            }));

            meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    OR: orConditions
                },
                orderBy: { startTime: 'desc' },
                take: 10
            });
        }

        const results: MeetingContext[] = [];

        for (const meeting of meetings) {
            const attendees = meeting.attendees as any[] || [];
            const participants = attendees.map(a =>
                typeof a === 'string' ? a.split('@')[0] : (a.email?.split('@')[0] || 'Unknown')
            );

            const keyTopics = meeting.title.split(/[\s\-:]+/).filter(w =>
                w.length > 3 && !['meeting', 'call', 'sync'].includes(w.toLowerCase())
            );

            const matchedTerm = searchTerms.find(term =>
                meeting.title.toLowerCase().includes(term.toLowerCase())
            );

            // Detect if meeting is currently in progress
            const isInProgress = meeting.startTime <= now && meeting.endTime > now;

            const meetingContext: MeetingContext = {
                title: meeting.title,
                date: meeting.startTime,
                participants,
                keyTopics,
                relevanceReason: isInProgress
                    ? 'CURRENTLY IN PROGRESS'
                    : matchedTerm
                        ? `Related to "${matchedTerm}"`
                        : (meeting.startTime > now ? 'Upcoming' : 'Recent'),
                notes: meeting.notes || undefined,
                outcome: meeting.outcome || undefined
            };

            // For in-progress meetings: fetch live Gemini notes for real-time context
            if (isInProgress) {
                try {
                    const liveNotes = await fetchGeminiMeetingNotes(userId, meeting);
                    if (liveNotes) {
                        meetingContext.notes = liveNotes;
                    }
                } catch (err: any) {
                    console.log(`[ContextAgent] Live notes fetch failed: ${err.message}`);
                }
            }

            // For past meetings: fetch actual Gemini notes + enrich with related emails/docs
            const isPastMeeting = meeting.startTime < now && !isInProgress;

            if (isPastMeeting) {
                // Notes should already be in DB (pre-synced by meeting-notes-sync agent).
                // Fallback: fetch on demand if sync hasn't run yet.
                if (!meeting.notes) {
                    try {
                        const geminiNotes = await fetchGeminiMeetingNotes(userId, meeting);
                        if (geminiNotes) {
                            meetingContext.notes = geminiNotes;
                            prisma.meetingSyncRecord.update({
                                where: { id: meeting.id },
                                data: { notes: geminiNotes.substring(0, 10000) },
                            }).catch(err => console.log(`[ContextAgent] Failed to cache notes: ${err.message}`));
                        }
                    } catch (err: any) {
                        console.log(`[ContextAgent] Fallback notes fetch failed: ${err.message}`);
                    }
                }

                // Then: also pull related emails/docs for additional context
                const enrichment = await this.enrichMeetingWithNotes(userId, meeting);
                meetingContext.relatedEmails = enrichment.relatedEmails;
                meetingContext.relatedDocuments = enrichment.relatedDocuments;
            }

            results.push(meetingContext);
        }

        return results;
    }

    /**
     * Get relevant emails based on entities
     */
    private async getRelevantEmails(
        userId: string,
        entities: ExtractedEntities
    ): Promise<EmailContext[]> {
        const searchTerms = [
            ...(entities.projects || []),
            ...(entities.people || []),
            ...(entities.topics || [])
        ];

        if (searchTerms.length === 0) {
            // Get recent email artifacts
            const emails = await prisma.workArtifact.findMany({
                where: {
                    userId,
                    type: 'EMAIL_SENT'
                },
                orderBy: { ingestedAt: 'desc' },
                take: 5
            });

            return emails.map(email => ({
                subject: email.title || 'No subject',
                from: 'You',
                date: email.ingestedAt,
                summary: email.content?.substring(0, 200) || 'No content',
                relevanceReason: 'Recent email'
            }));
        }

        // Search for emails matching terms
        const orConditions = searchTerms.map(term => ({
            OR: [
                { title: { contains: term, mode: 'insensitive' as const } },
                { content: { contains: term, mode: 'insensitive' as const } }
            ]
        }));

        const emails = await prisma.workArtifact.findMany({
            where: {
                userId,
                type: { in: ['EMAIL_SENT', 'EMAIL_THREAD'] },
                OR: orConditions
            },
            orderBy: { ingestedAt: 'desc' },
            take: 10
        });

        return emails.map(email => {
            const matchedTerm = searchTerms.find(term =>
                email.title?.toLowerCase().includes(term.toLowerCase()) ||
                email.content?.toLowerCase().includes(term.toLowerCase())
            );

            return {
                subject: email.title || 'No subject',
                from: email.type === 'EMAIL_SENT' ? 'You' : 'Thread',
                date: email.ingestedAt,
                summary: email.content?.substring(0, 200) || 'No content',
                relevanceReason: matchedTerm ? `Related to "${matchedTerm}"` : 'Recent email'
            };
        });
    }

    /**
     * Use LLM to generate insights and suggested actions
     */
    private async generateInsights(
        context: AgentContext,
        entities: ExtractedEntities,
        data: Omit<ContextSynthesis, 'suggestedActions' | 'keyInsights'>
    ): Promise<{ suggestedActions: string[]; keyInsights: string[] }> {
        const model = await createTrackedGeminiModel(context.userId, { model: 'gemini-2.5-flash' });

        const now = new Date();
        const prompt = `You are analyzing a user's work context to provide insights and suggested actions.

TODAY'S DATE: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

USER: ${context.userName} (${context.userJobTitle})
THEIR MESSAGE: "${context.message}"

ENTITIES EXTRACTED:
- Projects: ${entities.projects?.join(', ') || 'None'}
- People: ${entities.people?.join(', ') || 'None'}
- Topics: ${entities.topics?.join(', ') || 'None'}

CONTEXT DATA:

PROJECTS:
${data.projectSummaries.map(p => `- ${p.name}: ${p.meetingCount} meetings, ${p.documentCount} docs. Key people: ${p.keyPeople.join(', ')}. ${p.recentActivity}`).join('\n')}

RELEVANT PEOPLE:
${data.relevantPeople.map(p => `- ${p.name} (${p.role || 'Unknown role'}): ${p.relationship}`).join('\n')}

RELEVANT DOCUMENTS:
${data.relevantDocuments.map(d => `- "${d.title}" (${d.type}): ${d.summary.substring(0, 100)}...`).join('\n')}

UPCOMING/RECENT MEETINGS:
${data.relevantMeetings.map(m => {
            let entry = `- "${m.title}" on ${m.date.toLocaleDateString()} with ${m.participants.join(', ')}`;
            if (m.notes) entry += `\n  Notes: ${m.notes.substring(0, 200)}`;
            if (m.outcome) entry += `\n  Outcome: ${m.outcome.substring(0, 200)}`;
            if (m.relatedEmails && m.relatedEmails.length > 0) {
                entry += `\n  Related emails:`;
                for (const e of m.relatedEmails) {
                    entry += `\n    - "${e.subject}" from ${e.from} (${e.date.toLocaleDateString()}): ${e.summary.substring(0, 100)}`;
                }
            }
            if (m.relatedDocuments && m.relatedDocuments.length > 0) {
                entry += `\n  Related documents:`;
                for (const d of m.relatedDocuments) {
                    entry += `\n    - "${d.title}" (modified ${d.lastModified.toLocaleDateString()}): ${d.summary.substring(0, 100)}`;
                }
            }
            return entry;
        }).join('\n')}

Based on this context, provide:
1. 2-3 KEY INSIGHTS that connect the dots (what patterns do you see?)
2. 2-3 SUGGESTED ACTIONS the user might want to take

Respond in JSON format:
{
  "keyInsights": ["insight1", "insight2"],
  "suggestedActions": ["action1", "action2"]
}`;

        try {
            const result = await withGeminiRetry(
                () => model.generateContent(prompt),
                { label: 'ContextAgent' }
            );
            const text = result.response.text();

            // Parse JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    keyInsights: parsed.keyInsights || [],
                    suggestedActions: parsed.suggestedActions || []
                };
            }
        } catch (error) {
            console.error('[ContextAgent] Error generating insights:', error);
        }

        return { keyInsights: [], suggestedActions: [] };
    }
}

export const contextAgent = new ContextAgent();
