import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateSWOTAnalysis } from '@/lib/intelligence/insights';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const swot = await generateSWOTAnalysis(session.user.id);

        return NextResponse.json({ swot });
    } catch (error) {
        console.error('Failed to generate SWOT:', error);
        return NextResponse.json(
            { error: 'Failed to generate insights' },
            { status: 500 }
        );
    }
}
