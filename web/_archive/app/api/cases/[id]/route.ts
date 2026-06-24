
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { CaseData } from '@/types/case-engine';

export const dynamic = 'force-dynamic';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Try ID first, then slug
        let caseItem = await prisma.case.findUnique({
            where: { id },
            include: { currentVersion: true }
        });

        if (!caseItem) {
            caseItem = await prisma.case.findUnique({
                where: { slug: id },
                include: { currentVersion: true }
            });
        }

        if (!caseItem || !caseItem.currentVersion) {
            return NextResponse.json({ error: 'Case not found' }, { status: 404 });
        }

        // Map DB Content to Agentic CaseData
        // Assuming currentVersion.content satisfies the shape or needs mapping
        // We cast it for now, but ideally we validate it.
        const content = caseItem.currentVersion.content as any;

        // Construct the CaseData
        const caseData: CaseData = {
            id: caseItem.id,
            title: caseItem.title,
            subtitle: caseItem.description || '',
            duration: content.duration || "5 min",
            category: caseItem.cluster || "General",
            // Meeting logic involves finding a relevant meeting for the user, 
            // which is dynamic context. For now, we omit it or fetch separately.
            relevantMeeting: undefined,

            stakeholders: content.stakeholders || [],
            mentalModel: content.mentalModel || {}, // Should fallback or be present
            talkingPoints: content.talkingPoints || [],
            quantitativeAnalysis: content.quantitativeAnalysis || { title: "Analysis", content: "No data." },
            visualDiagram: content.visualDiagram || { title: "Map", mermaidCode: "" },
            challenge: content.challenge || {},
            reveal: content.reveal || {}
        };

        return NextResponse.json({
            success: true,
            data: caseData
        });

    } catch (error) {
        console.error('[API] Failed to get case:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
