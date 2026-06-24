import { prisma } from '@/lib/prisma';
import { ObservationType } from '@prisma/client';

export interface ConfidenceMetrics {
    score: number; // 0-1
    volume: number;
    consistency: number;
    timeSpanDays: number;
    dataPoints: number;
}

export interface SWOTItem {
    type: 'STRENGTH' | 'WEAKNESS' | 'OPPORTUNITY' | 'THREAT';
    capacity: string;
    description: string;
    confidence: ConfidenceMetrics;
    evidence: string[];
}

/**
 * Calculate confidence score for a capacity based on user observations
 */
export async function calculateCapacityConfidence(
    userId: string,
    capacityId: string
): Promise<ConfidenceMetrics> {
    // Link to artifact to get type
    const observations = await prisma.skillObservation.findMany({
        where: {
            userId,
            capacityId,
        },
        orderBy: { createdAt: 'asc' },
        select: {
            type: true,
            createdAt: true,
            artifact: {
                select: {
                    type: true
                }
            }
        },
    });

    if (observations.length === 0) {
        return {
            score: 0,
            volume: 0,
            consistency: 0,
            timeSpanDays: 0,
            dataPoints: 0,
        };
    }

    // 1. Volume Score (30%) - Max out at 10 observations
    const count = observations.length;
    const volumeScore = Math.min(count / 10, 1.0);

    // 2. Consistency Score (30%)
    // Ratio of dominant type vs minority type
    const positive = observations.filter(o => o.type === ObservationType.POSITIVE).length;
    const negative = observations.filter(o => o.type === ObservationType.NEGATIVE || o.type === ObservationType.MISSED_OPPORTUNITY).length;
    const total = positive + negative;

    let consistencyScore = 0;
    if (total > 0) {
        if (positive > negative) {
            consistencyScore = (positive / total);
        } else {
            consistencyScore = (negative / total);
        }
    }

    // 3. Context Diversity Score (30%)
    // Do we see this across different channels (Email vs Meeting vs Doc)?
    const uniqueSources = new Set(observations.map(o => o.artifact?.type).filter(Boolean));
    // 1 source = 0.33, 2 sources = 0.66, 3+ sources = 1.0
    const diversityScore = Math.min(uniqueSources.size / 3, 1.0);

    // 4. Recency Score (10%)
    // Decay confidence if no recent data
    const lastObservationDate = new Date(observations[observations.length - 1].createdAt).getTime();
    const now = Date.now();
    const daysSinceLast = (now - lastObservationDate) / (1000 * 60 * 60 * 24);

    let recencyScore = 0;
    if (daysSinceLast < 7) recencyScore = 1.0;       // < 1 week: 100%
    else if (daysSinceLast < 30) recencyScore = 0.8; // < 1 month: 80%
    else if (daysSinceLast < 90) recencyScore = 0.5; // < 3 months: 50%
    else recencyScore = 0.2;                         // > 3 months: 20%

    // Time Span Calculation (for display, not scoring)
    const start = new Date(observations[0].createdAt).getTime();
    const end = new Date(observations[observations.length - 1].createdAt).getTime();
    const days = (end - start) / (1000 * 60 * 60 * 24);

    // Weighted Average
    // Volume: 30%, Consistency: 30%, Diversity: 30%, Recency: 10%
    const weightedScore = (0.3 * volumeScore) + (0.3 * consistencyScore) + (0.3 * diversityScore) + (0.1 * recencyScore);

    return {
        score: parseFloat(weightedScore.toFixed(2)),
        volume: parseFloat(volumeScore.toFixed(2)),
        consistency: parseFloat(consistencyScore.toFixed(2)),
        timeSpanDays: parseFloat(days.toFixed(1)),
        dataPoints: count,
    };
}

/**
 * Generate SWOT analysis with confidence scores
 */
export async function generateSWOTAnalysis(userId: string): Promise<SWOTItem[]> {
    const capacities = await prisma.capacity.findMany();
    const swot: SWOTItem[] = [];

    for (const capacity of capacities) {
        // Get aggregated scores
        const capacityScore = await prisma.capacityScore.findUnique({
            where: { userId_capacityId: { userId, capacityId: capacity.id } },
        });

        if (!capacityScore) continue;

        // Calculate dynamic confidence
        const confidence = await calculateCapacityConfidence(userId, capacity.id);

        // Get supporting evidence (recent observations)
        const evidence = await prisma.skillObservation.findMany({
            where: { userId, capacityId: capacity.id },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { observation: true },
        });

        const evidenceTexts = evidence.map(e => e.observation);

        // Classify
        if (capacityScore.score >= 3.5) {
            if (confidence.score > 0.6) {
                swot.push({
                    type: 'STRENGTH',
                    capacity: capacity.name,
                    description: `Consistently demonstrated high performance in ${capacity.name}.`,
                    confidence,
                    evidence: evidenceTexts,
                });
            } else {
                swot.push({
                    type: 'OPPORTUNITY', // Potential strength but needs more proof
                    capacity: capacity.name,
                    description: `Showing promise in ${capacity.name}, but more consistency needed.`,
                    confidence,
                    evidence: evidenceTexts,
                });
            }
        } else if (capacityScore.score <= 2.5) {
            if (confidence.score > 0.6) {
                swot.push({
                    type: 'WEAKNESS', // Confirmed weakness
                    capacity: capacity.name,
                    description: `Consistently struggling with ${capacity.name}. Priority area.`,
                    confidence,
                    evidence: evidenceTexts,
                });
            } else {
                swot.push({
                    type: 'THREAT', // Developing weakness or blind spot
                    capacity: capacity.name,
                    description: `Early signs of gaps in ${capacity.name}. Monitor closely.`,
                    confidence,
                    evidence: evidenceTexts,
                });
            }
        }
    }

    return swot;
}
