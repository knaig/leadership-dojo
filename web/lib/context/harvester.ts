
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Heuristics for Role Inference
const ROLE_KEYWORDS = {
    "decision maker": ["sign off", "approve", "budget", "green light", "blocker"],
    "technical_lead": ["architecture", "code", "schema", "API", "deploy"],
    "product_owner": ["roadmap", "priority", "requirement", "user story", "scope"]
};

// Heuristics for Relationship Strength
// Based on frequency of 1:1s or intense meetings
const STRENGTH_THRESHOLD = {
    HIGH: 5,  // 5+ shared meetings
    MEDIUM: 2
};

export class ContextHarvester {

    async harvestFromArtifact(artifactId: string) {
        const artifact = await prisma.workArtifact.findUnique({
            where: { id: artifactId },
            include: { user: true }
        });

        if (!artifact || !artifact.participants) return;

        // 1. Identify Participants (Raw Strings from Calendar)
        const participantNames = this.extractParticipants(artifact.participants);

        for (const pd of participantNames) {
            await this.draftStakeholder(artifact.userId, pd);
        }

        // 2. Infer Role from Content (Simple Keyword Match)
        if (artifact.content) {
            // TODO: Use LLM for deeper inference later. 
            // For now, regex match on content to see if this person is mentioned with keywords.
        }
    }

    private extractParticipants(participantsJson: any): { name: string, email: string }[] {
        // Handle various JSON shapes from different providers (GCal etc)
        const participants: { name: string, email: string }[] = [];

        if (Array.isArray(participantsJson)) {
            participantsJson.forEach(p => {
                // Skip self (heuristic or exact match if we had full user email)
                if (typeof p === 'string') {
                    // Try to parse "Name <email>"
                    const match = p.match(/(.*)<(.*)>/);
                    if (match) {
                        participants.push({ name: match[1].trim(), email: match[2].trim() });
                    } else if (p.includes('@')) {
                        participants.push({ name: p.split('@')[0], email: p });
                    } else {
                        participants.push({ name: p, email: '' });
                    }
                } else if (typeof p === 'object') {
                    if (p.email) participants.push({ name: p.name || p.email.split('@')[0], email: p.email });
                }
            });
        }
        return participants;
    }

    private async draftStakeholder(userId: string, person: { name: string, email: string }) {
        if (!person.email) return; // Need email as unique key

        // Check if exists
        const existing = await prisma.stakeholderProfile.findUnique({
            where: {
                userId_email: {
                    userId,
                    email: person.email
                }
            }
        });

        if (existing) {
            // Increment Interaction Count
            await prisma.stakeholderProfile.update({
                where: { id: existing.id },
                data: {
                    interactionCount: { increment: 1 },
                    lastInteraction: new Date(),
                    // Auto-upgrade relationship strength based on frequency
                    relationshipStrength: {
                        set: (existing.interactionCount + 1) > STRENGTH_THRESHOLD.HIGH ? 0.8 :
                            (existing.interactionCount + 1) > STRENGTH_THRESHOLD.MEDIUM ? 0.5 : existing.relationshipStrength
                    }
                }
            });
        } else {
            // Create DRAFT
            await prisma.stakeholderProfile.create({
                data: {
                    userId,
                    name: person.name,
                    email: person.email,
                    validationStatus: "DRAFT", // <--- THE GOLDEN RULE
                    interactionCount: 1,
                    lastInteraction: new Date(),
                    relationshipStrength: 0.1 // Start low
                }
            });
            console.log(`[Harvester] Drafted Stakeholder: ${person.name}`);
        }
    }

    async scanRecentArtifacts(userId: string, limit = 20) {
        console.log(`[Harvester] Scanning last ${limit} artifacts for ${userId}...`);
        const artifacts = await prisma.workArtifact.findMany({
            where: {
                userId,
                type: { in: ['MEETING_ATTENDED', 'MEETING_NOTES', 'EMAIL_THREAD'] }
            },
            orderBy: { occurredAt: 'desc' },
            take: limit
        });

        for (const art of artifacts) {
            await this.harvestFromArtifact(art.id);
        }
        console.log(`[Harvester] Scan complete.`);
    }
}
