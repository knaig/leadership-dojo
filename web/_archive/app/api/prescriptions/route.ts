import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchPrescriptionSignals, generatePrescriptions } from '@/lib/intelligence/prescriptions';

export const dynamic = 'force-dynamic';

// GET /api/prescriptions - Get all prescriptions for user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all signals needed for prescriptions
    const signals = await fetchPrescriptionSignals(session.user.id);

    // Generate prescriptions
    const { eventPrescriptions, generalPrescriptions } = await generatePrescriptions(signals);

    // Extract urgent prescriptions (high priority from upcoming events)
    const urgentPrescriptions = eventPrescriptions
      .filter(e => e.riskLevel === 'HIGH')
      .flatMap(e => e.prescriptions)
      .slice(0, 3);

    // Extract this week prescriptions (medium priority)
    const thisWeekPrescriptions = generalPrescriptions
      .filter(p => p.urgency === 'MEDIUM')
      .slice(0, 3);

    // Extract development prescriptions (ongoing, based on capacity gaps)
    const developmentPrescriptions = generalPrescriptions
      .filter(p => p.urgency === 'LOW')
      .slice(0, 3);

    return NextResponse.json({
      urgent: urgentPrescriptions,
      thisWeek: thisWeekPrescriptions,
      development: developmentPrescriptions,
      // Also return raw data for custom rendering
      eventPrescriptions,
      generalPrescriptions
    });
  } catch (error) {
    console.error('Failed to fetch prescriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions' },
      { status: 500 }
    );
  }
}
