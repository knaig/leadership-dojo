/**
 * Recommendation Engine
 * 
 * Generates personalized recommendations based on capacity gaps
 */

import { prisma } from '@/lib/prisma';

interface Recommendation {
    id: string;
    capacity: {
        id: string;
        slug: string;
        name: string;
    };
    currentScore: number;
    targetScore: number;
    gap: string;
    recommendation: string;
    mission: string;
    expectedOutcome: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    evidence: string[];
}

/**
 * Generate recommendations for a user based on their capacity scores
 */
export async function generateRecommendations(userId: string): Promise<Recommendation[]> {
    // Get capacity scores
    const scores = await prisma.capacityScore.findMany({
        where: { userId },
        include: {
            capacity: {
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    description: true,
                },
            },
        },
        orderBy: { score: 'asc' }, // Lowest scores first (biggest gaps)
    });

    if (scores.length === 0) {
        return [];
    }

    const recommendations: Recommendation[] = [];

    // Focus on top 3 gaps
    for (const score of scores.slice(0, 3)) {
        // Get recent negative observations for this capacity
        const negativeObs = await prisma.skillObservation.findMany({
            where: {
                userId,
                capacityId: score.capacityId,
                type: { in: ['NEGATIVE', 'MISSED_OPPORTUNITY'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: {
                observation: true,
                evidence: true,
                context: true,
                severity: true,
            },
        });

        if (negativeObs.length === 0) continue;

        // Determine priority based on score and severity
        const priority = score.score < 2.0 ? 'HIGH' : score.score < 3.5 ? 'MEDIUM' : 'LOW';

        // Generate recommendation based on capacity type
        const rec = generateCapacityRecommendation(
            score.capacity.slug,
            score.capacity.name,
            score.score,
            negativeObs.map(o => o.observation)
        );

        recommendations.push({
            id: `rec-${score.capacityId}`,
            capacity: {
                id: score.capacity.id,
                slug: score.capacity.slug,
                name: score.capacity.name,
            },
            currentScore: score.score,
            targetScore: Math.min(5.0, score.score + 1.5),
            gap: negativeObs[0].observation,
            recommendation: rec.recommendation,
            mission: rec.mission,
            expectedOutcome: rec.expectedOutcome,
            priority,
            evidence: negativeObs.map(o => o.evidence),
        });
    }

    return recommendations;
}

/**
 * Generate capacity-specific recommendations
 */
function generateCapacityRecommendation(
    slug: string,
    name: string,
    currentScore: number,
    observations: string[]
): {
    recommendation: string;
    mission: string;
    expectedOutcome: string;
} {
    const targetScore = Math.min(5.0, currentScore + 1.5);

    const recommendations: Record<string, any> = {
        'situational-awareness': {
            recommendation: 'Practice reading the room before speaking in meetings',
            mission: 'In your next 3 meetings, identify one unstated concern or political dynamic before sharing your opinion',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
        'outcome-orientation': {
            recommendation: 'Start each day by identifying the ONE outcome that matters most',
            mission: 'For the next 5 work days, write down your #1 outcome before 9am and review at end of day',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
        'relationship-capital': {
            recommendation: 'Invest in relationships before you need them',
            mission: 'Reach out to 3 stakeholders this week with no ask - just check in or share something useful',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
        'domain-mastery': {
            recommendation: 'Learn one unwritten rule or cultural norm per week',
            mission: 'Ask a senior colleague: "What\'s one thing about our org that surprised you when you joined?"',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
        'decision-quality': {
            recommendation: 'Practice making decisions with incomplete information',
            mission: 'Next time you face a decision, set a 30-minute timer and decide when it goes off - no more research',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
        'execution-velocity': {
            recommendation: 'Identify and remove one blocker per day',
            mission: 'For the next 5 days, end your day by writing: "Today I unblocked: [X]"',
            expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
        },
    };

    return recommendations[slug] || {
        recommendation: `Focus on improving your ${name}`,
        mission: 'Practice this capacity in your daily work',
        expectedOutcome: `Improve ${name} from ${currentScore.toFixed(1)} → ${targetScore.toFixed(1)} in 2 weeks`,
    };
}
