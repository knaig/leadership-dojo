/**
 * Chat Action API — handles responses from interactive UI elements.
 *
 * POST /api/chat/action
 * Body: { actionId, responses: Record<string, string> }
 *
 * Actions are dispatched based on actionId prefix:
 * - identity_resolve:* → merge/separate stakeholder profiles
 * - outcome:* → log meeting outcome
 * - feedback:* → save feedback rating
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { actionId, responses } = await req.json();

    if (!actionId || !responses) {
        return NextResponse.json({ error: 'actionId and responses required' }, { status: 400 });
    }

    try {
        // Route to handler based on actionId prefix
        if (actionId.startsWith('identity_resolve')) {
            return await handleIdentityResolve(userId, responses);
        }
        if (actionId.startsWith('outcome')) {
            return await handleOutcome(userId, actionId, responses);
        }
        if (actionId.startsWith('feedback')) {
            return await handleFeedback(userId, actionId, responses);
        }

        return NextResponse.json({ error: `Unknown actionId: ${actionId}` }, { status: 400 });
    } catch (err: any) {
        console.error(`[ChatAction] Error: ${err.message}`);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * Handle identity resolution responses.
 * Each key in responses is a pair key (profileAId|profileBId), value is "same" or "different"
 */
async function handleIdentityResolve(userId: string, responses: Record<string, string>) {
    let merged = 0;
    let separated = 0;

    for (const [pairKey, decision] of Object.entries(responses)) {
        // Find the pending resolution record
        const record = await prisma.userCorrection.findFirst({
            where: { userId, entityType: 'identity_resolution', entityId: pairKey },
        });

        if (!record?.context) continue;
        const ctx = record.context as any;

        if (decision === 'same') {
            // Merge profiles using survivorship rules
            const primaryId = ctx.profileAId;
            const duplicateId = ctx.profileBId;

            const mergeResult = await mergeWithSurvivorship(primaryId, duplicateId);
            if (mergeResult) merged++;

            await prisma.userCorrection.update({
                where: { id: record.id },
                data: { userValue: 'confirmed' },
            });
        } else if (decision === 'different') {
            await prisma.userCorrection.update({
                where: { id: record.id },
                data: { userValue: 'denied' },
            });
            separated++;
        } else if (decision === 'skip') {
            await prisma.userCorrection.update({
                where: { id: record.id },
                data: { userValue: 'skipped' },
            });
        }
    }

    return NextResponse.json({ success: true, merged, separated });
}

/**
 * Handle meeting outcome responses (Landed/Partial/Missed)
 */
async function handleOutcome(userId: string, actionId: string, responses: Record<string, string>) {
    const meetingId = actionId.replace('outcome:', '');
    const result = responses.response;

    if (!['LANDED', 'PARTIAL', 'MISSED'].includes(result)) {
        return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
    }

    await prisma.meetingSyncRecord.updateMany({
        where: { id: meetingId, userId },
        data: { outcomeResult: result },
    });

    return NextResponse.json({ success: true, outcome: result });
}

/**
 * Merge two profiles using survivorship rules.
 * Picks the best value per field rather than just concatenating.
 */
async function mergeWithSurvivorship(profileAId: string, profileBId: string): Promise<boolean> {
    const MERGE_SELECT = {
        id: true, name: true, email: true, additionalEmails: true, aliases: true,
        organization: true, role: true, companyDescription: true, relationshipType: true,
        communicationTone: true, linkedinUrl: true, linkedinHeadline: true, linkedinSummary: true,
        powerLevel: true, influenceRole: true, interactionCount: true,
        enrichedAt: true, enrichmentSource: true, updatedAt: true,
    };

    const [a, b] = await Promise.all([
        prisma.stakeholderProfile.findUnique({ where: { id: profileAId }, select: MERGE_SELECT }),
        prisma.stakeholderProfile.findUnique({ where: { id: profileBId }, select: MERGE_SELECT }),
    ]);

    if (!a || !b) return false;

    // Determine primary: prefer enriched > more interactions > corporate email > recent
    const aScore = (a.enrichedAt ? 10 : 0) + (a.linkedinUrl ? 5 : 0) + Math.min(a.interactionCount, 10)
        + (isPersonalDomain(a.email) ? 0 : 4);
    const bScore = (b.enrichedAt ? 10 : 0) + (b.linkedinUrl ? 5 : 0) + Math.min(b.interactionCount, 10)
        + (isPersonalDomain(b.email) ? 0 : 4);

    const primary = aScore >= bScore ? a : b;
    const secondary = aScore >= bScore ? b : a;

    // Survivorship: pick best per field
    const updates: Record<string, any> = {};

    // Name: longest (most complete)
    if (secondary.name.length > primary.name.length) updates.name = secondary.name;
    // Org: prefer web_search source, then longest
    updates.organization = pickBestValue(primary.organization, primary.enrichmentSource, secondary.organization, secondary.enrichmentSource);
    // Role: prefer web_search source
    updates.role = pickBestValue(primary.role, primary.enrichmentSource, secondary.role, secondary.enrichmentSource);
    // Company description: prefer non-null
    if (!primary.companyDescription && secondary.companyDescription) updates.companyDescription = secondary.companyDescription;
    // LinkedIn: prefer non-null
    if (!primary.linkedinUrl && secondary.linkedinUrl) updates.linkedinUrl = secondary.linkedinUrl;
    if (!primary.linkedinHeadline && secondary.linkedinHeadline) updates.linkedinHeadline = secondary.linkedinHeadline;
    if (!primary.linkedinSummary && secondary.linkedinSummary) updates.linkedinSummary = secondary.linkedinSummary;
    // Relationship type: prefer non-unknown
    if ((!primary.relationshipType || primary.relationshipType === 'unknown') && secondary.relationshipType && secondary.relationshipType !== 'unknown') {
        updates.relationshipType = secondary.relationshipType;
    }
    // Power level: highest
    const powerRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    if ((powerRank[secondary.powerLevel] ?? 0) > (powerRank[primary.powerLevel] ?? 0)) {
        updates.powerLevel = secondary.powerLevel;
    }
    // Influence role: highest
    const influenceRank: Record<string, number> = { UNKNOWN: 0, END_USER: 1, GATEKEEPER: 2, INFLUENCER: 3, DECISION_MAKER: 4 };
    if ((influenceRank[secondary.influenceRole] ?? 0) > (influenceRank[primary.influenceRole] ?? 0)) {
        updates.influenceRole = secondary.influenceRole;
    }
    // Enrichment: most recent
    if (secondary.enrichedAt && (!primary.enrichedAt || secondary.enrichedAt > primary.enrichedAt)) {
        updates.enrichedAt = secondary.enrichedAt;
        updates.enrichmentSource = secondary.enrichmentSource;
    }

    // Emails: keep all unique
    const allEmails = new Set<string>();
    if (primary.email) allEmails.add(primary.email.toLowerCase());
    if (secondary.email) allEmails.add(secondary.email.toLowerCase());
    for (const e of primary.additionalEmails) allEmails.add(e.toLowerCase());
    for (const e of secondary.additionalEmails) allEmails.add(e.toLowerCase());
    const primaryEmail = primary.email?.toLowerCase();

    // Aliases: keep all unique
    const allAliases = new Set<string>();
    allAliases.add(primary.name);
    allAliases.add(secondary.name);
    for (const al of primary.aliases) allAliases.add(al);
    for (const al of secondary.aliases) allAliases.add(al);
    const finalName = updates.name || primary.name;
    allAliases.delete(finalName);

    // Remove undefined values
    for (const key of Object.keys(updates)) {
        if (updates[key] === undefined || updates[key] === null) delete updates[key];
    }

    await prisma.stakeholderProfile.update({
        where: { id: primary.id },
        data: {
            ...updates,
            additionalEmails: Array.from(allEmails).filter(e => e !== primaryEmail),
            aliases: Array.from(allAliases),
            interactionCount: primary.interactionCount + secondary.interactionCount,
        },
    });

    await prisma.stakeholderProfile.update({
        where: { id: secondary.id },
        data: { mergedIntoId: primary.id },
    });

    return true;
}

function isPersonalDomain(email: string | null): boolean {
    if (!email) return true;
    const domain = email.split('@')[1]?.toLowerCase() || '';
    return ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'protonmail.com', 'rediffmail.com'].includes(domain);
}

function pickBestValue(aVal: string | null, aSource: string | null, bVal: string | null, bSource: string | null): string | null | undefined {
    if (!aVal && !bVal) return undefined;
    if (!aVal) return bVal;
    if (!bVal) return undefined; // keep primary's value
    const sourceRank: Record<string, number> = { calendar_inferred: 0, llm_inference: 1, web_search: 2, manual: 3 };
    const aRank = sourceRank[aSource || ''] ?? -1;
    const bRank = sourceRank[bSource || ''] ?? -1;
    if (bRank > aRank) return bVal;
    return undefined; // keep primary's value
}

/**
 * Handle feedback/rating responses
 */
async function handleFeedback(userId: string, actionId: string, responses: Record<string, string>) {
    const callId = actionId.replace('feedback:', '');
    const rating = parseInt(responses.rating || '0');

    if (rating > 0) {
        await prisma.callFeedback.updateMany({
            where: { voiceCallId: callId, userId },
            data: { rating },
        });
    }

    return NextResponse.json({ success: true, rating });
}
