import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/account/export
 *
 * GDPR Article 20 — Right to Data Portability
 * Returns all user data as a JSON download.
 */
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const [
            user,
            stakeholders,
            relationships,
            organizations,
            teams,
            projects,
            goals,
            meetings,
            conversations,
            connectors,
            domainContext,
        ] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, name: true, email: true, createdAt: true },
            }),
            prisma.stakeholderProfile.findMany({
                where: { userId },
                select: {
                    name: true, email: true, role: true, organization: true,
                    powerLevel: true, influenceRole: true, politicalStance: true,
                    archetype: true, communicationStyle: true, personaArchetype: true,
                    primaryMotivation: true, userNotes: true, relationshipStrength: true,
                    createdAt: true,
                },
            }),
            prisma.stakeholderRelationship.findMany({
                where: { userId },
                select: {
                    fromEntityType: true, toEntityType: true,
                    relationType: true, confidence: true, source: true,
                },
            }),
            prisma.organization.findMany({
                where: { userId },
                select: { name: true, domain: true, industry: true, relationToUser: true, size: true },
            }),
            prisma.professionalTeam.findMany({
                where: { userId },
                select: { name: true, context: true },
            }),
            prisma.professionalProject.findMany({
                where: { userId },
                select: { name: true, context: true, status: true },
            }),
            prisma.goal.findMany({
                where: { userId },
                select: {
                    title: true, description: true, status: true, category: true,
                    targetDate: true, createdAt: true,
                },
            }),
            prisma.meeting.findMany({
                where: { userId },
                select: {
                    title: true, startTime: true, endTime: true, classification: true,
                    createdAt: true,
                },
            }),
            prisma.conversation.findMany({
                where: { userId },
                select: {
                    title: true, createdAt: true,
                    messages: {
                        select: { role: true, content: true, createdAt: true },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            }),
            prisma.dataConnector.findMany({
                where: { userId },
                select: { provider: true, type: true, status: true, createdAt: true },
            }),
            prisma.domainContext.findFirst({
                where: { userId },
                select: { organization: true, landscape: true },
            }),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            format: 'GDPR_DATA_EXPORT_V1',
            user,
            stakeholders,
            relationships,
            organizations,
            teams,
            projects,
            goals,
            meetings,
            conversations,
            connectors,
            domainContext,
        };

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="clarity-data-export-${new Date().toISOString().split('T')[0]}.json"`,
            },
        });
    } catch (error: any) {
        console.error('[DataExport] Error:', error.message);
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
}
