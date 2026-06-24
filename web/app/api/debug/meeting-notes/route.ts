/**
 * Debug endpoint: diagnose why meeting notes aren't being found.
 *
 * GET /api/debug/meeting-notes?title=AI4Inclusion&person=Rajagopalan
 *
 * Returns: stakeholder resolution, meeting search results, Gmail search attempts,
 * and what fetchGeminiMeetingNotes actually finds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const title = req.nextUrl.searchParams.get('title') || '';
    const person = req.nextUrl.searchParams.get('person') || '';

    const debug: any = { title, person, steps: [] };

    // Step 1: Resolve person name → email via StakeholderProfile
    if (person) {
        const words = person.split(/\s+/).filter(w => w.length > 3);
        const stakeholder = await prisma.stakeholderProfile.findFirst({
            where: {
                userId,
                mergedIntoId: null,
                OR: [
                    { name: { contains: person, mode: 'insensitive' } },
                    ...words.map(word => ({
                        name: { contains: word, mode: 'insensitive' as const }
                    })),
                ],
            },
            select: { id: true, name: true, email: true, importanceScore: true, importanceCategory: true },
        });
        debug.steps.push({
            step: 'resolve_person',
            query: person,
            words,
            result: stakeholder || 'NOT FOUND — name resolution failed',
        });

        // Step 2: Search meetings by attendee email
        if (stakeholder?.email) {
            const meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    participants: { has: stakeholder.email.toLowerCase() },
                },
                select: {
                    id: true,
                    title: true,
                    startTime: true,
                    endTime: true,
                    externalId: true,
                    participants: true,
                    notes: true,
                    outcome: true,
                    notesDocId: true,
                },
                orderBy: { startTime: 'desc' },
                take: 10,
            });
            debug.steps.push({
                step: 'search_meetings_by_email',
                email: stakeholder.email,
                found: meetings.length,
                meetings: meetings.map(m => ({
                    id: m.id,
                    title: m.title,
                    date: m.startTime.toISOString(),
                    externalId: m.externalId ? 'present' : 'MISSING',
                    participantCount: m.participants?.length || 0,
                    hasNotes: !!m.notes,
                    hasOutcome: !!m.outcome,
                    notesDocId: m.notesDocId || null,
                })),
            });
        }
    }

    // Step 3: Search meetings by title keyword
    if (title) {
        const titleMeetings = await prisma.meetingSyncRecord.findMany({
            where: {
                userId,
                title: { contains: title, mode: 'insensitive' },
            },
            select: {
                id: true,
                title: true,
                startTime: true,
                participants: true,
                attendees: true,
                externalId: true,
                notes: true,
                notesDocId: true,
            },
            orderBy: { startTime: 'desc' },
            take: 10,
        });
        debug.steps.push({
            step: 'search_meetings_by_title',
            query: title,
            found: titleMeetings.length,
            meetings: titleMeetings.map(m => ({
                id: m.id,
                title: m.title,
                date: m.startTime.toISOString(),
                externalId: m.externalId ? m.externalId.substring(0, 20) + '...' : 'MISSING',
                participants: m.participants,
                attendeeEmails: (m.attendees as any[])?.map((a: any) => a.email).filter(Boolean) || [],
                hasNotes: !!m.notes,
                notesLength: m.notes?.length || 0,
                notesDocId: m.notesDocId || null,
            })),
        });
    }

    // Step 4: Check EmailSummary for Gemini notes emails
    if (title) {
        const keywords = title.split(/[\s\-:]+/).filter(w => w.length > 2);
        const noteEmails = await prisma.emailSummary.findMany({
            where: {
                userId,
                OR: keywords.map(kw => ({
                    subject: { contains: kw, mode: 'insensitive' as const }
                })),
            },
            select: {
                subject: true,
                from: true,
                lastMessageAt: true,
                summary: true,
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 10,
        });
        debug.steps.push({
            step: 'search_email_summaries',
            keywords,
            found: noteEmails.length,
            emails: noteEmails.map(e => ({
                subject: e.subject,
                from: e.from,
                date: e.lastMessageAt.toISOString(),
                summaryPreview: e.summary?.substring(0, 200) || 'empty',
            })),
        });
    }

    return NextResponse.json(debug, { status: 200 });
}
