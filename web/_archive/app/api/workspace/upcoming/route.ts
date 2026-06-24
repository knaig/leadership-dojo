import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchPrescriptionSignals, generatePrescriptions } from '@/lib/intelligence/prescriptions';

export const dynamic = 'force-dynamic';

// GET /api/workspace/upcoming - Get upcoming events with prescriptions
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all signals needed for prescriptions
    const signals = await fetchPrescriptionSignals(session.user.id);

    // Generate prescriptions
    const { eventPrescriptions } = await generatePrescriptions(signals);

    // Sort by start time and filter to only include events that need attention
    const sortedEvents = eventPrescriptions
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return NextResponse.json({
      events: sortedEvents
    });
  } catch (error) {
    console.error('Failed to fetch upcoming events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upcoming events' },
      { status: 500 }
    );
  }
}
