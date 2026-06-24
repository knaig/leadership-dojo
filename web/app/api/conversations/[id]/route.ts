import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { generateConversationPrep } from '@/lib/conversation-prep';

export const dynamic = 'force-dynamic';

// GET /api/conversations/[id] - Get single conversation with prep
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = (await params).id;

    try {
        const conversation = await prisma.conversationPrep.findFirst({
            where: { id, userId },
            include: {
                keyMessages: {
                    orderBy: { order: 'asc' }
                },
                anticipatedObjections: true,
                quickRef: true
            }
        });

        if (!conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        return NextResponse.json({ conversation });
    } catch (error) {
        console.error('Conversation fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
    }
}

// PUT /api/conversations/[id] - Update conversation or trigger prep generation
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = (await params).id;
    const body = await req.json();

    try {
        const existing = await prisma.conversationPrep.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        // If action is 'generate-prep', call the LLM
        if (body.action === 'generate-prep') {
            let prep;
            try {
                prep = await generateConversationPrep({
                    userId,
                    conversationId: id,
                    title: existing.title,
                    type: existing.type,
                    objective: existing.primaryObjective || '',
                    stakeholderNames: existing.stakeholders,
                    context: body.additionalContext
                });
            } catch (prepError: any) {
                console.error('[API] Prep generation failed:', prepError.message);
                return NextResponse.json(
                    { error: prepError.message || 'Failed to generate prep' },
                    { status: 500 }
                );
            }

            // Ensure arrays exist (defensive programming)
            const safePrep = {
                ...prep,
                keyMessages: Array.isArray(prep.keyMessages) ? prep.keyMessages : [],
                anticipatedObjections: Array.isArray(prep.anticipatedObjections) ? prep.anticipatedObjections : [],
                quickReference: prep.quickReference || {
                    objective: prep.primaryObjective?.slice(0, 50) || '',
                    pivots: {},
                    closeChecklist: [],
                    avoid: [],
                    use: []
                }
            };

            console.log('[API] Safe prep counts:', {
                keyMessages: safePrep.keyMessages.length,
                objections: safePrep.anticipatedObjections.length
            });

            // Update conversation with generated prep
            // First delete existing related entities
            await prisma.keyMessage.deleteMany({ where: { prepId: id } });
            await prisma.objection.deleteMany({ where: { prepId: id } });
            await prisma.quickReference.deleteMany({ where: { prepId: id } });

            // Now update with new prep content
            const updated = await prisma.conversationPrep.update({
                where: { id },
                data: {
                    status: 'READY',
                    primaryObjective: safePrep.primaryObjective,
                    secondaryObjectives: safePrep.secondaryObjectives,
                    worstAcceptableOutcome: safePrep.worstAcceptableOutcome,
                    openingHook: safePrep.openingHook,
                    closingAction: safePrep.closingAction,
                    keyMessages: {
                        create: safePrep.keyMessages.map((msg, idx) => ({
                            message: msg.message,
                            shortForm: msg.shortForm,
                            supportingData: msg.supportingData || '',
                            transition: msg.transition || '',
                            order: idx
                        }))
                    },
                    anticipatedObjections: {
                        create: safePrep.anticipatedObjections.map((obj) => ({
                            objection: obj.objection,
                            shortForm: obj.shortForm,
                            response: obj.response,
                            quickResponse: obj.quickResponse,
                            reframe: obj.reframe || '',
                            likelihood: obj.likelihood
                        }))
                    },
                    quickRef: {
                        create: {
                            objective: safePrep.quickReference.objective,
                            pivots: safePrep.quickReference.pivots,
                            closeChecklist: safePrep.quickReference.closeChecklist,
                            avoid: safePrep.quickReference.avoid,
                            use: safePrep.quickReference.use
                        }
                    }
                },
                include: {
                    keyMessages: true,
                    anticipatedObjections: true,
                    quickRef: true
                }
            });

            return NextResponse.json({ conversation: updated });
        }

        // Regular update
        const updated = await prisma.conversationPrep.update({
            where: { id },
            data: {
                title: body.title ?? existing.title,
                primaryObjective: body.primaryObjective ?? existing.primaryObjective,
                scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : existing.scheduledAt,
                status: body.status ?? existing.status
            }
        });

        return NextResponse.json({ conversation: updated });
    } catch (error) {
        console.error('Conversation update error:', error);
        return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
    }
}

// DELETE /api/conversations/[id] - Delete conversation
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = (await params).id;

    try {
        const existing = await prisma.conversationPrep.findFirst({ where: { id, userId } });
        if (!existing) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        await prisma.conversationPrep.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Conversation delete error:', error);
        return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
    }
}
