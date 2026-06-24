import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StoredObservation {
    capacitySlug: string;
    type: string;
    context: string;
    observation: string;
    evidence: string;
    score: number;
    confidence: number;
    severity: string;
}

interface AnalysisResult {
    observations: StoredObservation[];
    summary?: string;
    dominantCapacities?: string[];
    growthAreas?: string[];
}

async function backfillObservations() {
    console.log('🔄 Backfilling observations from existing analysis results...\n');

    // Get all analyzed artifacts with their analysis results
    const analyzedArtifacts = await prisma.workArtifact.findMany({
        where: {
            analyzed: true,
            analysisResult: {
                not: null,
            },
        },
        select: {
            id: true,
            userId: true,
            title: true,
            analysisResult: true,
        },
    });

    console.log(`Found ${analyzedArtifacts.length} analyzed artifacts\n`);

    // Get capacity map
    const capacities = await prisma.capacity.findMany();
    const capacityMap = new Map(capacities.map((c) => [c.slug, c.id]));
    console.log(`Loaded ${capacities.size} capacities\n`);

    let totalObservations = 0;
    let skippedArtifacts = 0;
    let errors = 0;

    for (const artifact of analyzedArtifacts) {
        try {
            const analysisResult = artifact.analysisResult as unknown as AnalysisResult;

            if (!analysisResult || !analysisResult.observations || analysisResult.observations.length === 0) {
                console.log(`⚠️  Skipping ${artifact.title} - no observations in result`);
                skippedArtifacts++;
                continue;
            }

            let createdCount = 0;

            for (const obs of analysisResult.observations) {
                const capacityId = capacityMap.get(obs.capacitySlug);

                if (!capacityId) {
                    console.warn(`   Unknown capacity slug: ${obs.capacitySlug}`);
                    continue;
                }

                // Check if observation already exists
                const existing = await prisma.skillObservation.findFirst({
                    where: {
                        artifactId: artifact.id,
                        capacityId,
                        observation: obs.observation,
                    },
                });

                if (existing) {
                    continue; // Skip duplicates
                }

                // Create observation
                await prisma.skillObservation.create({
                    data: {
                        userId: artifact.userId,
                        capacityId,
                        artifactId: artifact.id,
                        type: obs.type as any,
                        context: obs.context,
                        observation: obs.observation,
                        evidence: obs.evidence,
                        score: Math.max(-1, Math.min(1, obs.score)),
                        confidence: Math.max(0, Math.min(1, obs.confidence)),
                        severity: obs.severity as any,
                    },
                });

                createdCount++;
                totalObservations++;
            }

            console.log(`✅ ${artifact.title}: ${createdCount} observations`);
        } catch (error) {
            console.error(`❌ Error processing ${artifact.title}:`, error);
            errors++;
        }
    }

    console.log(`\n📊 Backfill Complete:`);
    console.log(`   Total observations created: ${totalObservations}`);
    console.log(`   Artifacts processed: ${analyzedArtifacts.length - skippedArtifacts - errors}`);
    console.log(`   Artifacts skipped: ${skippedArtifacts}`);
    console.log(`   Errors: ${errors}`);

    await prisma.$disconnect();
}

backfillObservations().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
