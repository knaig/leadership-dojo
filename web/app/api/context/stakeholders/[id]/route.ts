import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { recordCorrection } from "@/lib/correction-learning";

export const dynamic = 'force-dynamic';

// Fields users can edit on a stakeholder profile
const EDITABLE_FIELDS = new Set([
    'role', 'organization', 'personaArchetype', 'communicationStyle',
    'powerLevel', 'influenceRole', 'politicalStance',
    'primaryMotivation', 'decisionStyle', 'riskTolerance',
    'relationshipType', 'userNotes', 'validationStatus',
]);

// Fields that are AI-generated and should trigger correction recording
const AI_FIELDS = new Set([
    'personaArchetype', 'communicationStyle', 'powerLevel',
    'influenceRole', 'politicalStance', 'primaryMotivation',
    'decisionStyle', 'riskTolerance', 'relationshipType',
    'role', 'organization',
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    // Validate ownership
    const existing = await prisma.stakeholderProfile.findUnique({
        where: { id }
    });

    if (!existing || existing.userId !== userId) {
        return NextResponse.json({ error: "Not Found or Unauthorized" }, { status: 404 });
    }

    // Whitelist editable fields
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
        if (EDITABLE_FIELDS.has(key)) {
            updateData[key] = value;
        }
    }

    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Update
    const updated = await prisma.stakeholderProfile.update({
        where: { id },
        data: updateData,
    });

    // Record corrections for AI-generated fields
    let correctionsRecorded = 0;
    const context = {
        name: existing.name,
        email: existing.email,
        organization: existing.organization,
    };

    for (const field of Object.keys(updateData)) {
        if (AI_FIELDS.has(field)) {
            const aiValue = (existing as any)[field];
            const userValue = updateData[field];
            if (aiValue !== userValue && userValue !== null) {
                await recordCorrection({
                    userId,
                    entityType: 'stakeholder_profile',
                    entityId: id,
                    field,
                    aiValue: aiValue != null ? String(aiValue) : null,
                    userValue: String(userValue),
                    context,
                });
                correctionsRecorded++;
            }
        }
    }

    return NextResponse.json({
        ...updated,
        learned: correctionsRecorded > 0,
        learnedMessage: correctionsRecorded > 0
            ? `Got it — Mira will remember this about ${existing.name}.`
            : undefined,
    });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.stakeholderProfile.findUnique({
        where: { id }
    });

    if (!existing || existing.userId !== userId) {
        return NextResponse.json({ error: "Not Found or Unauthorized" }, { status: 404 });
    }

    await prisma.stakeholderProfile.delete({
        where: { id }
    });

    return NextResponse.json({ success: true });
}
