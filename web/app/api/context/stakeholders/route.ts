
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET(req: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId: userId },
        orderBy: [
            { influenceLevel: 'desc' }, // Show High Influence first
            { interactionCount: 'desc' }
        ]
    });

    return NextResponse.json(stakeholders);
}

export async function POST(req: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Basic validation
    if (!body.name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    try {
        const newStakeholder = await prisma.stakeholderProfile.create({
            data: {
                userId,
                name: body.name,
                email: body.email || null,
                role: body.role || "Unknown",
                influenceLevel: body.influenceLevel || "low",
                validationStatus: "VERIFIED", // Manual add is auto-verified
                interactionCount: 0,
                relationshipStrength: body.relationshipStrength || 0.5
            }
        });
        return NextResponse.json(newStakeholder);
    } catch (e) {
        console.error(e);
        // Handle unique constraint violation
        return NextResponse.json({ error: "Stakeholder already exists" }, { status: 409 });
    }
}
