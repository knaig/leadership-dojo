import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { recordCorrection } from '@/lib/correction-learning';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const meeting = await prisma.meetingSyncRecord.findUnique({
            where: {
                id,
                userId // Ensure ownership
            },
            include: {
                conversationOutcome: {
                    select: {
                        whatWorked: true,
                        whatFailed: true,
                        surprises: true,
                        aiInsights: true,
                        suggestedImprovements: true,
                        userRating: true,
                        userNotes: true,
                    },
                },
                commitments: {
                    select: {
                        id: true,
                        owner: true,
                        description: true,
                        dueDate: true,
                        status: true,
                    },
                },
            },
        });

        if (!meeting) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        const review = meeting.conversationOutcome || null;

        return NextResponse.json({
            meeting: {
                id: meeting.id,
                googleEventId: meeting.externalId,
                title: meeting.title,
                description: meeting.description,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                attendees: meeting.attendees,
                location: meeting.location,
                meetingType: meeting.meetingType,
                meetingCategory: meeting.meetingCategory,
                desiredOutcome: meeting.desiredOutcome,
                outcomeResult: meeting.outcomeResult,
                outcome: meeting.outcome,
                followUps: meeting.followUps,
                lifecycleStage: meeting.lifecycleStage,
                notes: meeting.notes || null,
                // Post-meeting review
                review: review ? {
                    whatWorked: review.whatWorked,
                    whatFailed: review.whatFailed,
                    surprises: review.surprises,
                    aiInsights: review.aiInsights,
                    suggestedImprovements: review.suggestedImprovements,
                } : null,
                commitments: meeting.commitments,
            }
        });
    } catch (error) {
        console.error('[Meeting API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * PATCH /api/meetings/[id]
 * Update user classification overrides for a meeting.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const validImportance = ['critical', 'high', 'medium', 'low'];
    const validStrategicLevel = ['personal', 'team'];
    const validMeetingCategory = ['NEEDLE_MOVER', 'TACTICAL', 'OPERATIONAL', 'GROWTH', 'UNCLASSIFIED'];

    const updateData: Record<string, string | null> = {};

    if ('userImportanceOverride' in body) {
        const val = body.userImportanceOverride;
        if (val !== null && !validImportance.includes(val)) {
            return NextResponse.json({ error: 'Invalid importance value' }, { status: 400 });
        }
        updateData.userImportanceOverride = val;
    }

    if ('strategicLevel' in body) {
        const val = body.strategicLevel;
        if (val !== null && !validStrategicLevel.includes(val)) {
            return NextResponse.json({ error: 'Invalid strategicLevel value' }, { status: 400 });
        }
        updateData.strategicLevel = val;
    }

    if ('meetingCategory' in body) {
        const val = body.meetingCategory;
        if (val !== null && !validMeetingCategory.includes(val)) {
            return NextResponse.json({ error: 'Invalid meetingCategory value' }, { status: 400 });
        }
        updateData.meetingCategory = val;
    }

    if ('strategicOwner' in body) {
        updateData.strategicOwner = body.strategicOwner || null;
    }

    if ('userNotes' in body) {
        updateData.userNotes = body.userNotes || null;
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    try {
        // Fetch current meeting to record what AI predicted vs what user chose
        const existing = await prisma.meetingSyncRecord.findUnique({
            where: { id, userId },
            select: {
                meetingCategory: true,
                userImportanceOverride: true,
                strategicLevel: true,
                title: true,
                attendees: true,
                isRecurring: true,
                recurringId: true,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
        }

        await prisma.meetingSyncRecord.update({
            where: { id, userId },
            data: updateData,
        });

        // Record corrections for learning
        const attendees = existing.attendees as any[] | null;
        const context = {
            title: existing.title,
            attendeeCount: attendees?.length ?? 0,
            isRecurring: existing.isRecurring ?? false,
            recurringId: existing.recurringId,
        };

        if ('meetingCategory' in body && body.meetingCategory !== existing.meetingCategory) {
            await recordCorrection({
                userId,
                entityType: 'meeting_classification',
                entityId: id,
                field: 'meetingCategory',
                aiValue: existing.meetingCategory,
                userValue: body.meetingCategory,
                context,
            });
        }

        if ('userImportanceOverride' in body && body.userImportanceOverride !== existing.userImportanceOverride) {
            await recordCorrection({
                userId,
                entityType: 'meeting_classification',
                entityId: id,
                field: 'userImportanceOverride',
                aiValue: existing.userImportanceOverride,
                userValue: body.userImportanceOverride,
                context,
            });
        }

        if ('strategicLevel' in body && body.strategicLevel !== existing.strategicLevel) {
            await recordCorrection({
                userId,
                entityType: 'meeting_classification',
                entityId: id,
                field: 'strategicLevel',
                aiValue: existing.strategicLevel,
                userValue: body.strategicLevel,
                context,
            });
        }

        // Count how many corrections were recorded
        const correctionsRecorded = [
            'meetingCategory' in body && body.meetingCategory !== existing.meetingCategory,
            'userImportanceOverride' in body && body.userImportanceOverride !== existing.userImportanceOverride,
            'strategicLevel' in body && body.strategicLevel !== existing.strategicLevel,
        ].filter(Boolean).length;

        return NextResponse.json({
            success: true,
            learned: correctionsRecorded > 0,
            learnedMessage: correctionsRecorded > 0
                ? `Got it — Mira will remember this preference for similar meetings.`
                : undefined,
        });
    } catch (error) {
        console.error('[Meeting PATCH] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
