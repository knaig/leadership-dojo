import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const capacities = [
  {
    slug: 'situational-awareness',
    name: 'Situational Awareness',
    description: `The ability to read what is not being said. Understanding the political dynamics, hidden agendas, and emotional undercurrents in any situation. Detecting stakeholder concerns before they surface and anticipating reactions to decisions.

This capacity involves pattern recognition across conversations, relationships, and organizational dynamics. It's about sensing when something is "off" and knowing why.`,
    whyAIProof: `AI can analyze explicit data but struggles with implicit signals. The raised eyebrow in a meeting, the hesitation before someone speaks, the sudden silence when a topic is mentioned—these are human signals that require human interpretation.

Context matters enormously. The same words mean different things depending on who says them, when, and to whom. This contextual interpretation requires lived experience and emotional intelligence that AI cannot replicate.`,
    courses: [
      'stakeholder-mapping',
      'political-intelligence',
      'reading-the-room',
      'organizational-dynamics'
    ]
  },
  {
    slug: 'outcome-orientation',
    name: 'Outcome Orientation',
    description: `The relentless focus on what actually matters. Cutting through noise, busywork, and politics to identify the real objectives that will move the needle. Prioritizing impact over activity, results over process.

This means constantly asking: "What outcome are we actually trying to achieve?" and refusing to get distracted by secondary concerns or status quo thinking.`,
    whyAIProof: `AI can optimize for defined metrics but cannot determine which metrics matter. The hard part isn't achieving a goal—it's knowing which goal to pursue. This requires judgment about values, trade-offs, and long-term consequences.

Outcome orientation often means saying no to good things to focus on great things. AI lacks the wisdom to make these prioritization calls in complex organizational contexts.`,
    courses: [
      'strategic-prioritization',
      'outcome-vs-output',
      'saying-no',
      'impact-measurement'
    ]
  },
  {
    slug: 'relationship-capital',
    name: 'Relationship Capital',
    description: `Trust accumulated over time through consistent behavior, reliability, and genuine investment in others. This capital can be "spent" when you need support, forgiveness, or benefit of the doubt.

Building relationship capital means investing in relationships before you need them, being reliable even when it's inconvenient, and treating people as ends rather than means.`,
    whyAIProof: `Trust is earned through lived experience and demonstrated integrity over time. AI can simulate caring but cannot actually care. People sense the difference.

Relationship capital depends on vulnerability, authenticity, and mutual investment—qualities that require genuine human connection. You cannot outsource relationship building to an algorithm.`,
    courses: [
      'trust-building',
      'stakeholder-relationships',
      'difficult-conversations',
      'network-cultivation'
    ]
  },
  {
    slug: 'domain-mastery',
    name: 'Domain Mastery',
    description: `Deep contextual expertise that goes beyond facts to include organizational culture, unwritten rules, and historical context. Knowing not just what is true, but what matters and why in your specific context.

Domain mastery means understanding the "why" behind organizational decisions, the sensitivities to navigate, and the informal power structures that actually determine outcomes.`,
    whyAIProof: `AI can access general knowledge but lacks local context. Every organization has its own culture, history, and dynamics. What works in one place may fail spectacularly in another.

Domain mastery is accumulated through experience and cannot be compressed into a prompt. It includes tacit knowledge—things you know but cannot easily articulate—that only comes from being embedded in a context.`,
    courses: [
      'organizational-culture',
      'stakeholder-history',
      'institutional-knowledge',
      'context-mapping'
    ]
  },
  {
    slug: 'decision-quality',
    name: 'Decision Quality',
    description: `Sound judgment under uncertainty. Knowing when to decide quickly and when to gather more information. Balancing analysis with action, and being willing to make difficult calls without complete information.

This includes understanding decision reversibility, managing risk appropriately, and maintaining accountability for decisions even when outcomes are uncertain.`,
    whyAIProof: `AI can optimize for known parameters but real decisions involve unknown unknowns. The hardest decisions involve trade-offs between incommensurable values—things that cannot be reduced to a common metric.

Decision quality requires moral courage, accountability, and the willingness to bear consequences. AI cannot be held accountable, and accountability fundamentally shapes how decisions should be made.`,
    courses: [
      'decision-frameworks',
      'risk-assessment',
      'uncertainty-management',
      'bias-mitigation'
    ]
  },
  {
    slug: 'execution-velocity',
    name: 'Execution Velocity',
    description: `Being fast on the right things while appropriately slow on risky ones. Removing blockers, maintaining momentum, and keeping teams focused and energized. Balancing urgency with sustainability.

This means knowing when to push hard and when to pause, how to unstick stalled initiatives, and how to create the conditions for sustained high performance.`,
    whyAIProof: `Execution requires navigating human dynamics—motivating teams, resolving conflicts, building momentum. AI can create plans but cannot inspire people to execute them.

Speed often requires judgment calls about when to break rules, take shortcuts, or escalate issues. These decisions require understanding context, relationships, and consequences in ways AI cannot.`,
    courses: [
      'execution-excellence',
      'team-dynamics',
      'momentum-management',
      'obstacle-removal'
    ]
  }
];

async function seed() {
  console.log('Seeding 6 core capacities...');

  for (const capacity of capacities) {
    const existing = await prisma.capacity.findUnique({
      where: { slug: capacity.slug }
    });

    if (existing) {
      console.log(`  Updating: ${capacity.name}`);
      await prisma.capacity.update({
        where: { slug: capacity.slug },
        data: capacity
      });
    } else {
      console.log(`  Creating: ${capacity.name}`);
      await prisma.capacity.create({
        data: capacity
      });
    }
  }

  console.log('Done seeding capacities!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
