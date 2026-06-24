
import { prisma } from '../lib/prisma';
import { WorkArtifact, LinkType } from '@prisma/client';

interface GraphBuilderJob {
    artifactId: string;
    userId: string;
}

/**
 * Graph Builder Agent
 * Scans for connections between artifacts using time, participants, and content heuristics.
 */
export async function graphBuilderAgent(jobData: GraphBuilderJob) {
    const { artifactId, userId } = jobData;

    console.log(`[GraphBuilder] Analyzing connections for artifact: ${artifactId}`);

    const sourceArtifact = await prisma.workArtifact.findUnique({
        where: { id: artifactId },
    });

    if (!sourceArtifact) {
        console.error(`[GraphBuilder] Artifact not found: ${artifactId}`);
        return { success: false, error: 'Artifact not found' };
    }

    // Define Search Window (+/- 24 hours)
    const windowStart = new Date(sourceArtifact.occurredAt.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = new Date(sourceArtifact.occurredAt.getTime() + 24 * 60 * 60 * 1000);

    // Fetch candidates
    const candidates = await prisma.workArtifact.findMany({
        where: {
            userId,
            id: { not: artifactId }, // Exclude self
            occurredAt: {
                gte: windowStart,
                lte: windowEnd,
            },
        },
        take: 50, // Limit to prevent N^2 explosion on busy days
    });

    console.log(`[GraphBuilder] Found ${candidates.length} candidates in time window.`);

    let linksCreated = 0;
    const linksToCreate: any[] = [];

    for (const target of candidates) {
        // Prevent duplicate processing if link already exists
        // (Optimization: In a real system, we'd check this efficiently)

        const links = detectLinks(sourceArtifact, target);

        for (const link of links) {
            linksToCreate.push({
                sourceId: sourceArtifact.id,
                targetId: target.id,
                type: link.type,
                score: link.score,
                metadata: link.metadata,
                createdAt: new Date()
            });
        }
    }

    if (linksToCreate.length > 0) {
        try {
            const result = await prisma.artifactLink.createMany({
                data: linksToCreate,
                skipDuplicates: true
            });
            linksCreated = result.count;
            if (linksCreated > 0) {
                console.log(`[GraphBuilder] Bulk Created ${linksCreated} links for artifact ${artifactId}`);
            }
        } catch (e: any) {
            console.error(`[GraphBuilder] Bulk creation failed: ${e.message}`);
        }
    }

    return { success: true, linksCreated };
}

interface DetectedLink {
    type: LinkType;
    score: number;
    metadata: any;
}

function detectLinks(source: WorkArtifact, target: WorkArtifact): DetectedLink[] {
    const links: DetectedLink[] = [];

    // 1. Time Proximity (Generic)
    const timeDiff = Math.abs(source.occurredAt.getTime() - target.occurredAt.getTime());
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff < 2) {
        links.push({
            type: 'TIME_PROXIMITY',
            score: 0.5, // Low confidence just for time
            metadata: { hoursDiff },
        });
    }

    // 2. The "Follow-up" Pattern (Meeting -> Email/Doc)
    // meeting happened, then email sent shortly after
    if (source.type === 'MEETING_ATTENDED' &&
        (target.type === 'EMAIL_SENT' || target.type === 'DOCUMENT_AUTHORED') &&
        target.occurredAt > source.occurredAt &&
        hoursDiff < 4) {

        // Check Participant Overlap
        if (hasParticipantOverlap(source, target)) {
            links.push({
                type: 'FOLLOW_UP',
                score: 0.8,
                metadata: { reason: "Email sent shortly after meeting with matching participants" }
            });
        }
    }

    // 3. The "Pre-read" Pattern (Doc Edited -> Meeting)
    // Doc edited, then meeting happened
    if ((source.type === 'DOCUMENT_EDITED' || source.type === 'DOCUMENT_AUTHORED') &&
        target.type === 'MEETING_ATTENDED' &&
        target.occurredAt > source.occurredAt &&
        hoursDiff < 24) {

        // Check Title Match or Participants
        if (titleFuzzyMatch(source.title, target.title)) {
            links.push({
                type: 'PRE_READ',
                score: 0.85,
                metadata: { reason: "Doc edited before meeting with similar title" }
            });
        }
    }

    // 4. Explicit Mention (Regex)
    if (source.content && target.title) {
        // Very basic check: Does source content contain target filename?
        if (source.content.includes(target.title) && target.title.length > 5) { // Avoid short words
            links.push({
                type: 'EXPLICIT_MENTION',
                score: 0.95,
                metadata: { reason: `Content mentions '${target.title}'` }
            });
        }
    }

    return links;
}

// Helpers

function hasParticipantOverlap(a: WorkArtifact, b: WorkArtifact): boolean {
    const participantsA = extractEmails(a);
    const participantsB = extractEmails(b);

    if (participantsA.length === 0 || participantsB.length === 0) return false;

    return participantsA.some(email => participantsB.includes(email));
}

function extractEmails(artifact: WorkArtifact): string[] {
    // Robust extraction depends on how `participants` JSON is structured in ingestion
    // Assuming structure: [{ email: "..." }, "email@...", ...]
    const p = artifact.participants as any;
    if (!p) return [];

    const emails: string[] = [];

    if (Array.isArray(p)) {
        for (const item of p) {
            if (typeof item === 'string') emails.push(item);
            else if (item.email) emails.push(item.email);
        }
    }
    return emails;
}

function titleFuzzyMatch(t1: string | null, t2: string | null): boolean {
    if (!t1 || !t2) return false;
    const clean1 = t1.toLowerCase().replace(/[^\w\s]/g, '');
    const clean2 = t2.toLowerCase().replace(/[^\w\s]/g, '');

    // Check if significant tokens overlap
    const tokens1 = new Set(clean1.split(/\s+/).filter(w => w.length > 3));
    const tokens2 = new Set(clean2.split(/\s+/).filter(w => w.length > 3));

    let overlap = 0;
    for (const t of tokens1) {
        if (tokens2.has(t)) overlap++;
    }

    return overlap >= 2; // At least 2 matching significant words
}
