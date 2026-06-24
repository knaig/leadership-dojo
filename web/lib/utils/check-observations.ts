import { prisma } from '@/lib/db';

async function checkObservations() {
    try {
        const total = await prisma.skillObservation.count();

        const recent24h = await prisma.skillObservation.count({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            }
        });

        const mostRecent = await prisma.skillObservation.findFirst({
            orderBy: { createdAt: 'desc' },
            include: {
                capacity: { select: { name: true } },
                artifact: { select: { title: true, type: true } }
            }
        });

        const analyzedCount = await prisma.workArtifact.count({
            where: { analyzed: true }
        });

        const totalArtifacts = await prisma.workArtifact.count();

        return {
            total,
            recent24h,
            analyzedCount,
            totalArtifacts,
            mostRecent: mostRecent ? {
                createdAt: mostRecent.createdAt,
                capacity: mostRecent.capacity.name,
                type: mostRecent.type,
                artifact: mostRecent.artifact ? {
                    title: mostRecent.artifact.title,
                    type: mostRecent.artifact.type
                } : null,
                context: mostRecent.context.substring(0, 100)
            } : null
        };
    } catch (error) {
        console.error('Error checking observations:', error);
        throw error;
    }
}

export { checkObservations };
