import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/corrections
 * Returns the user's correction history and learning stats.
 * Used by the "Mira's Learning" settings panel.
 */
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const corrections = await prisma.userCorrection.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Group by entity type
        const grouped: Record<string, typeof corrections> = {};
        for (const c of corrections) {
            if (!grouped[c.entityType]) grouped[c.entityType] = [];
            grouped[c.entityType].push(c);
        }

        // Stats
        const totalCorrections = corrections.length;
        const correctionsApplied = corrections.filter(c => c.appliedAt !== null).length;

        // Top patterns (same field + same correction direction)
        const patterns = new Map<string, number>();
        for (const c of corrections) {
            const key = `${c.field}:${c.aiValue ?? 'null'}→${c.userValue}`;
            patterns.set(key, (patterns.get(key) || 0) + 1);
        }
        const topPatterns = Array.from(patterns.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, count]) => {
                const [field, fromTo] = key.split(':');
                return { field, fromTo, count };
            });

        // Entity type labels for display
        const ENTITY_TYPE_LABELS: Record<string, string> = {
            meeting_classification: 'Meeting Classification',
            stakeholder_profile: 'Stakeholder Profile',
        };

        return NextResponse.json({
            corrections: corrections.map(c => ({
                id: c.id,
                entityType: c.entityType,
                entityTypeLabel: ENTITY_TYPE_LABELS[c.entityType] || c.entityType,
                field: c.field,
                aiValue: c.aiValue,
                userValue: c.userValue,
                context: c.context,
                appliedAt: c.appliedAt,
                createdAt: c.createdAt,
            })),
            grouped: Object.fromEntries(
                Object.entries(grouped).map(([type, items]) => [
                    type,
                    {
                        label: ENTITY_TYPE_LABELS[type] || type,
                        count: items.length,
                        appliedCount: items.filter(c => c.appliedAt !== null).length,
                    },
                ])
            ),
            stats: {
                totalCorrections,
                correctionsApplied,
                topPatterns,
            },
        });
    } catch (error) {
        console.error('[Corrections API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
