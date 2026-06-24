import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const capacities = [
  {
    slug: 'situational-awareness',
    name: 'Situational Awareness',
    description: `The ability to read what is not being said. Understanding the political dynamics, hidden agendas, and emotional undercurrents in any situation.`,
    whyAIProof: `AI can analyze explicit data but struggles with implicit signals.`,
    courses: ['stakeholder-mapping', 'political-intelligence', 'reading-the-room', 'organizational-dynamics']
  },
  {
    slug: 'outcome-orientation',
    name: 'Outcome Orientation',
    description: `The relentless focus on what actually matters. Cutting through noise, busywork, and politics to identify the real objectives.`,
    whyAIProof: `AI can optimize for defined metrics but cannot determine which metrics matter.`,
    courses: ['strategic-prioritization', 'outcome-vs-output', 'saying-no', 'impact-measurement']
  },
  {
    slug: 'relationship-capital',
    name: 'Relationship Capital',
    description: `Trust accumulated over time through consistent behavior, reliability, and genuine investment in others.`,
    whyAIProof: `Trust is earned through lived experience and demonstrated integrity over time.`,
    courses: ['trust-building', 'stakeholder-relationships', 'difficult-conversations', 'network-cultivation']
  },
  {
    slug: 'domain-mastery',
    name: 'Domain Mastery',
    description: `Deep contextual expertise that goes beyond facts to include organizational culture, unwritten rules, and historical context.`,
    whyAIProof: `AI can access general knowledge but lacks local context.`,
    courses: ['organizational-culture', 'stakeholder-history', 'institutional-knowledge', 'context-mapping']
  },
  {
    slug: 'decision-quality',
    name: 'Decision Quality',
    description: `Sound judgment under uncertainty. Knowing when to decide quickly and when to gather more information.`,
    whyAIProof: `AI can optimize for known parameters but real decisions involve unknown unknowns.`,
    courses: ['decision-frameworks', 'risk-assessment', 'uncertainty-management', 'bias-mitigation']
  },
  {
    slug: 'execution-velocity',
    name: 'Execution Velocity',
    description: `Being fast on the right things while appropriately slow on risky ones. Removing blockers, maintaining momentum.`,
    whyAIProof: `Execution requires navigating human dynamics—motivating teams, resolving conflicts, building momentum.`,
    courses: ['execution-excellence', 'team-dynamics', 'momentum-management', 'obstacle-removal']
  }
];

export async function POST() {
  try {
    console.log('Seeding 6 core capacities...');
    const results = [];

    for (const capacity of capacities) {
      const existing = await prisma.capacity.findUnique({
        where: { slug: capacity.slug }
      });

      if (existing) {
        console.log(`  Updating: ${capacity.name}`);
        const updated = await prisma.capacity.update({
          where: { slug: capacity.slug },
          data: capacity
        });
        results.push({ action: 'updated', capacity: updated.name });
      } else {
        console.log(`  Creating: ${capacity.name}`);
        const created = await prisma.capacity.create({
          data: capacity
        });
        results.push({ action: 'created', capacity: created.name });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Capacities seeded successfully',
      results
    });
  } catch (error) {
    console.error('Error seeding capacities:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const capacities = await prisma.capacity.findMany({
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      count: capacities.length,
      capacities: capacities.map(c => ({ slug: c.slug, name: c.name }))
    });
  } catch (error) {
    console.error('Error fetching capacities:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
