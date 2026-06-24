import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/vapi/tool-calls
 * Vapi sends tool/function call requests here during a live call.
 * We execute the tool and return the result for the LLM to use.
 *
 * Vapi payload: { message: { type: "tool-calls", toolCalls: [...], call: { metadata: { userId } } } }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message } = body;

        if (message?.type !== 'tool-calls' && message?.type !== 'function-call') {
            return NextResponse.json({ ok: true });
        }

        const userId = message.call?.metadata?.userId;
        if (!userId) {
            return NextResponse.json({ results: [{ error: 'No userId in call metadata' }] });
        }

        // Handle both old function-call and new tool-calls format
        const toolCalls = message.toolCalls || (message.functionCall ? [{
            id: 'fc-1',
            function: { name: message.functionCall.name, arguments: message.functionCall.parameters },
        }] : []);

        const results = [];

        for (const tc of toolCalls) {
            const name = tc.function?.name || tc.name;
            const args = tc.function?.arguments || tc.arguments || {};

            console.log(`[Vapi Tool] ${name}(${JSON.stringify(args)}) for user=${userId.substring(0, 8)}`);

            try {
                const result = await executeTool(name, args, userId);
                results.push({ toolCallId: tc.id, result });
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[Vapi Tool] ${name} failed:`, errMsg);
                results.push({ toolCallId: tc.id, error: errMsg });
            }
        }

        // Vapi expects { results: [{ toolCallId, result }] }
        return NextResponse.json({ results });

    } catch (error) {
        console.error('[Vapi Tool] Error:', error);
        return NextResponse.json({ error: 'Tool call failed' }, { status: 500 });
    }
}

// ============================================================================
// FUZZY NAME MATCHING — resolve STT-mangled names to known entities
// ============================================================================

/**
 * Resolve a fuzzy query against all known entities — people, projects, documents, topics.
 * Used by ALL tools to handle STT-mangled names.
 */
async function resolveFuzzy(userId: string, rawQuery: string, types?: string[]): Promise<string> {
    if (!rawQuery || rawQuery.length < 2) return rawQuery;

    const where: Record<string, unknown> = { userId };
    if (types && types.length > 0) {
        where.type = { in: types };
    }

    const [stakeholders, entities, docs] = await Promise.all([
        prisma.stakeholderProfile.findMany({
            where: { userId },
            select: { name: true },
        }),
        prisma.knowledgeEntity.findMany({
            where,
            select: { name: true },
        }),
        prisma.workArtifact.findMany({
            where: { userId },
            select: { title: true },
            take: 100,
        }),
    ]);

    const knownNames = [
        ...stakeholders.map(s => s.name),
        ...entities.map(e => e.name),
        ...docs.map(d => d.title),
    ].filter(Boolean);

    // Deduplicate
    const unique = [...new Set(knownNames)];

    if (unique.length === 0) return rawQuery;

    // Find best fuzzy match
    const inputLower = rawQuery.toLowerCase();
    let bestMatch = rawQuery;
    let bestScore = 0;

    for (const known of unique) {
        const score = fuzzyScore(inputLower, known.toLowerCase());
        if (score > bestScore && score > 0.35) {
            bestScore = score;
            bestMatch = known;
        }
    }

    if (bestMatch !== rawQuery) {
        console.log(`[FuzzyMatch] "${rawQuery}" → "${bestMatch}" (score: ${bestScore.toFixed(2)})`);
    }

    return bestMatch;
}

// Backward compat alias
async function resolveNameFuzzy(userId: string, rawName: string): Promise<string> {
    return resolveFuzzy(userId, rawName, ['PERSON']);
}

function fuzzyScore(input: string, target: string): number {
    // Combined scoring: substring match + character overlap + phonetic similarity

    // Exact substring match
    if (target.includes(input) || input.includes(target)) return 0.9;

    // Split into parts and check individual word matches
    const inputParts = input.split(/\s+/);
    const targetParts = target.split(/\s+/);

    let partMatches = 0;
    for (const ip of inputParts) {
        for (const tp of targetParts) {
            if (tp.includes(ip) || ip.includes(tp)) {
                partMatches++;
                break;
            }
            // Check first 3 chars match (handles "shail" → "shailendra")
            if (ip.length >= 3 && tp.length >= 3 && ip.substring(0, 3) === tp.substring(0, 3)) {
                partMatches += 0.7;
                break;
            }
            // Levenshtein-like: check character overlap
            const overlap = charOverlap(ip, tp);
            if (overlap > 0.6) {
                partMatches += overlap * 0.8;
                break;
            }
        }
    }

    if (inputParts.length > 0) {
        return partMatches / Math.max(inputParts.length, targetParts.length);
    }

    return charOverlap(input, target);
}

function charOverlap(a: string, b: string): number {
    // Bigram overlap coefficient
    const bigramsA = new Set<string>();
    const bigramsB = new Set<string>();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));
    for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let common = 0;
    for (const bg of bigramsA) {
        if (bigramsB.has(bg)) common++;
    }

    return (2 * common) / (bigramsA.size + bigramsB.size);
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function executeTool(name: string, args: Record<string, unknown>, userId: string): Promise<string> {
    switch (name) {
        case 'lookup_stakeholder': {
            const resolved = await resolveNameFuzzy(userId, String(args.name || ''));
            return await lookupStakeholder(userId, resolved);
        }

        case 'check_calendar':
            return await checkCalendar(userId, String(args.date || 'today'));

        case 'create_commitment':
            return await createCommitment(userId, String(args.description || ''), String(args.due_date || ''));

        case 'check_commitments':
            return await checkCommitments(userId);

        case 'lookup_person_from_calendar': {
            const resolved = await resolveNameFuzzy(userId, String(args.name || ''));
            return await lookupPersonFromCalendar(userId, resolved);
        }

        case 'search_emails': {
            const resolvedQuery = args.query ? await resolveFuzzy(userId, String(args.query)) : '';
            const resolvedPerson = args.person ? await resolveFuzzy(userId, String(args.person), ['PERSON']) : '';
            return await searchEmails(userId, resolvedQuery, resolvedPerson);
        }

        case 'recall_past_calls': {
            const resolved = await resolveFuzzy(userId, String(args.query || ''));
            return await recallPastCalls(userId, resolved);
        }

        case 'lookup_knowledge': {
            const resolved = await resolveFuzzy(userId, String(args.query || ''));
            return await lookupKnowledge(userId, resolved);
        }

        case 'check_goals':
            return await checkGoals(userId);

        case 'update_stakeholder_info': {
            const resolved = await resolveFuzzy(userId, String(args.name || ''), ['PERSON']);
            return await updateStakeholderInfo(userId, resolved, String(args.info || ''));
        }

        case 'search_documents': {
            const resolved = await resolveFuzzy(userId, String(args.query || ''));
            return await searchDocuments(userId, resolved);
        }

        default:
            return `Unknown tool: ${name}`;
    }
}

async function lookupStakeholder(userId: string, name: string): Promise<string> {
    const profiles = await prisma.stakeholderProfile.findMany({
        where: {
            userId,
            name: { contains: name, mode: 'insensitive' },
        },
        take: 3,
        select: {
            name: true, influenceRole: true, relationshipStrength: true,
            communicationStyle: true, motivations: true,
            doPlaybook: true, dontPlaybook: true,
        },
    });

    if (profiles.length === 0) {
        // Try knowledge graph
        const entities = await prisma.knowledgeEntity.findMany({
            where: { userId, name: { contains: name, mode: 'insensitive' }, type: 'PERSON' },
            take: 3,
            select: { name: true, properties: true },
        });

        if (entities.length === 0) {
            return `I don't have detailed information about ${name} yet. I've seen them in your calendar but haven't built a profile.`;
        }

        return entities.map(e => {
            const props = e.properties as Record<string, unknown> || {};
            return `${e.name}: ${Object.entries(props).map(([k, v]) => `${k}: ${v}`).join(', ') || 'limited info'}`;
        }).join('\n');
    }

    return profiles.map(p => {
        const parts = [`${p.name}`];
        if (p.influenceRole) parts.push(`Role: ${p.influenceRole}`);
        if (p.relationshipStrength) parts.push(`Relationship: ${p.relationshipStrength}/10`);
        if (p.communicationStyle) parts.push(`Style: ${JSON.stringify(p.communicationStyle)}`);
        if (p.doPlaybook) parts.push(`Do: ${JSON.stringify(p.doPlaybook)}`);
        if (p.dontPlaybook) parts.push(`Don't: ${JSON.stringify(p.dontPlaybook)}`);
        return parts.join(' | ');
    }).join('\n');
}

async function checkCalendar(userId: string, date: string): Promise<string> {
    const now = new Date();
    let start: Date, end: Date;

    if (date === 'today' || !date) {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    } else if (date === 'tomorrow') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    } else {
        start = new Date(date);
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    }

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: { gte: start, lt: end },
            status: { not: 'cancelled' },
        },
        select: { title: true, startTime: true, endTime: true, meetingCategory: true, participants: true },
        orderBy: { startTime: 'asc' },
        take: 10,
    });

    if (meetings.length === 0) {
        return date === 'tomorrow' ? 'No meetings scheduled for tomorrow.' : 'No more meetings today.';
    }

    return meetings.map(m => {
        const time = m.startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        const participants = Array.isArray(m.participants) ? (m.participants as string[]).length : 0;
        return `${time} — ${m.title} (${m.meetingCategory || 'unclassified'}${participants > 0 ? `, ${participants} people` : ''})`;
    }).join('\n');
}

async function createCommitment(userId: string, description: string, dueDate: string): Promise<string> {
    if (!description) return 'No commitment description provided.';

    await prisma.message.create({
        data: {
            userId,
            role: 'assistant',
            content: `**Commitment tracked:** ${description}${dueDate ? ` (due: ${dueDate})` : ''}`,
            type: 'PROACTIVE_NUDGE',
        },
    });

    return `Got it — I'll track: "${description}"${dueDate ? ` due ${dueDate}` : ''}. I'll check in on this next call.`;
}

async function checkCommitments(userId: string): Promise<string> {
    const actions = await prisma.relationshipAction.findMany({
        where: {
            goal: { userId },
            status: 'IN_PROGRESS',
        },
        select: { description: true, dueDate: true, status: true },
        orderBy: { dueDate: 'asc' },
        take: 5,
    });

    if (actions.length === 0) {
        return 'No open commitments right now.';
    }

    return actions.map(a => {
        const due = a.dueDate ? a.dueDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'no due date';
        const overdue = a.dueDate && a.dueDate < new Date() ? ' ⚠️ OVERDUE' : '';
        return `- ${a.description} (due: ${due}${overdue})`;
    }).join('\n');
}

async function lookupPersonFromCalendar(userId: string, name: string): Promise<string> {
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            participants: { has: name },
        },
        select: { title: true, startTime: true, meetingCategory: true },
        orderBy: { startTime: 'desc' },
        take: 5,
    });

    if (meetings.length === 0) {
        // Try broader search
        const broader = await prisma.$queryRaw<Array<{ title: string; startTime: Date }>>`
            SELECT title, "startTime" FROM "MeetingSyncRecord"
            WHERE "userId" = ${userId} AND participants::text ILIKE ${'%' + name + '%'}
            ORDER BY "startTime" DESC LIMIT 5
        `;

        if (broader.length === 0) {
            return `I haven't seen ${name} in your recent meetings.`;
        }

        return `${name} appeared in ${broader.length} recent meetings:\n` +
            broader.map(m => `${m.startTime.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} — ${m.title}`).join('\n');
    }

    return `${name} appeared in ${meetings.length} recent meetings:\n` +
        meetings.map(m => `${m.startTime.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} — ${m.title}`).join('\n');
}

async function recallPastCalls(userId: string, query: string): Promise<string> {
    const calls = await prisma.voiceCall.findMany({
        where: { userId, status: 'ended', transcript: { not: null } },
        orderBy: { endedAt: 'desc' },
        take: 10,
        select: { summary: true, callType: true, endedAt: true, durationSeconds: true },
    });

    if (calls.length === 0) return 'No previous calls found.';

    if (query) {
        const matching = calls.filter(c =>
            c.summary?.toLowerCase().includes(query.toLowerCase())
        );
        if (matching.length > 0) {
            return matching.slice(0, 3).map(c => {
                const date = c.endedAt?.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) || '?';
                return `${date} (${c.callType}, ${Math.round((c.durationSeconds || 0) / 60)}min): ${c.summary?.substring(0, 200)}`;
            }).join('\n\n');
        }
        return `Nothing about "${query}" in recent calls.`;
    }

    return calls.slice(0, 5).map(c => {
        const date = c.endedAt?.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) || '?';
        return `${date} (${c.callType}): ${c.summary?.substring(0, 150) || 'no summary'}`;
    }).join('\n\n');
}

async function lookupKnowledge(userId: string, query: string): Promise<string> {
    // Search knowledge graph facts
    const facts = await prisma.knowledgeFact.findMany({
        where: {
            userId,
            OR: [
                { predicate: { contains: query, mode: 'insensitive' } },
                { objectValue: { contains: query, mode: 'insensitive' } },
                { subject: { name: { contains: query, mode: 'insensitive' } } },
                { objectEntity: { name: { contains: query, mode: 'insensitive' } } },
            ],
        },
        select: {
            subject: { select: { name: true, type: true } },
            predicate: true,
            objectValue: true,
            objectEntity: { select: { name: true } },
            confidence: true,
        },
        orderBy: { confidence: 'desc' },
        take: 10,
    });

    if (facts.length === 0) return `No information found about "${query}" in the knowledge graph.`;

    return facts.map(f => {
        const subj = f.subject?.name || '?';
        const obj = f.objectEntity?.name || f.objectValue || '?';
        return `${subj} ${f.predicate} ${obj}`;
    }).join('\n');
}

async function checkGoals(userId: string): Promise<string> {
    const goals = await prisma.strategicObjective.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { title: true, description: true, status: true, priority: true, deadline: true },
    });

    if (goals.length === 0) return 'No goals or strategic objectives set yet.';

    return goals.map(g => {
        const deadline = g.deadline ? g.deadline.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'no deadline';
        return `[${g.status}] ${g.title} (${g.priority}, due: ${deadline})${g.description ? '\n  ' + g.description.substring(0, 100) : ''}`;
    }).join('\n\n');
}

async function updateStakeholderInfo(userId: string, name: string, info: string): Promise<string> {
    if (!name || !info) return 'Need both a name and information to update.';

    // Save as a conversation insight for the knowledge graph to pick up
    await prisma.conversationInsight.create({
        data: {
            userId,
            conversationDate: new Date(),
            insight: `User shared about ${name}: ${info}`,
            conversationType: 'GENERAL',
            senderType: 'USER',
            contextType: 'PAST_LEARNING',
            explicit: true,
            confidence: 0.9,
        },
    });

    return `Got it — I've noted that about ${name}. I'll remember this for future conversations.`;
}

async function searchDocuments(userId: string, query: string): Promise<string> {
    const docs = await prisma.workArtifact.findMany({
        where: {
            userId,
            OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { extractedText: { contains: query, mode: 'insensitive' } },
            ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { title: true, type: true, updatedAt: true, extractedText: true },
    });

    if (docs.length === 0) return `No documents found matching "${query}".`;

    return docs.map(d => {
        const date = d.updatedAt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const snippet = d.extractedText?.substring(0, 150) || 'no content extracted';
        return `${date} — "${d.title}" (${d.type})\n  ${snippet}`;
    }).join('\n\n');
}

async function searchEmails(userId: string, query: string, person: string): Promise<string> {
    // Person already resolved by caller
    const resolvedPerson = person;

    const where: Record<string, unknown> = { userId };

    if (resolvedPerson) {
        // Search by participant
        where.OR = [
            { from: { contains: resolvedPerson, mode: 'insensitive' } },
            { participants: { has: resolvedPerson } },
            { subject: { contains: resolvedPerson, mode: 'insensitive' } },
        ];
    }

    if (query && !resolvedPerson) {
        // Search by topic/subject
        where.OR = [
            { subject: { contains: query, mode: 'insensitive' } },
            { summary: { contains: query, mode: 'insensitive' } },
            { keyTopics: { has: query } },
        ];
    }

    const emails = await prisma.emailSummary.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take: 5,
        select: {
            subject: true,
            summary: true,
            from: true,
            participants: true,
            lastMessageAt: true,
            sentiment: true,
            requiresAction: true,
            keyTopics: true,
        },
    });

    if (emails.length === 0) {
        return resolvedPerson
            ? `No recent email threads found involving ${resolvedPerson}.`
            : `No email threads found matching "${query}".`;
    }

    return emails.map(e => {
        const date = e.lastMessageAt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const action = e.requiresAction ? ' [ACTION NEEDED]' : '';
        return `${date} — "${e.subject}" from ${e.from || 'unknown'}${action}\n  ${e.summary.substring(0, 150)}`;
    }).join('\n\n');
}
