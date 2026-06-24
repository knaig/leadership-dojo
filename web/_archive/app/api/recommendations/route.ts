import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRecommendationsFeed } from '@/lib/recommendation-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recommendations
 * Generate personalized recommendations for the current user
 */
export async function GET() {
    try {
        const { userId } = await auth();
        console.log('[API] Recommendations request. User ID:', userId);

        if (!userId) {
            console.log('[API] Unauthorized: No user ID');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const recommendations = await getRecommendationsFeed(userId);
        console.log(`[API] Returning ${recommendations.length} recommendations`);

        return NextResponse.json({
            success: true,
            recommendations,
        });
    } catch (error) {
        console.error('[API] Error generating recommendations:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate recommendations',
            },
            { status: 500 }
        );
    }
}
