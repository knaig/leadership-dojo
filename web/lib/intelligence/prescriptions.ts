import { prisma } from '@/lib/prisma';

// Types
export interface PrescriptionSignals {
  userId: string;
  upcomingEvents: UpcomingEvent[];
  recentObservations: Observation[];
  capacityScores: CapacityScore[];
  stakeholderProfiles: StakeholderProfile[];
}

export interface UpcomingEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  description?: string;
}

export interface Observation {
  id: string;
  capacityId: string;
  capacitySlug: string;
  type: 'POSITIVE' | 'NEGATIVE' | 'MISSED_OPPORTUNITY';
  context: string;
  createdAt: Date;
}

export interface CapacityScore {
  capacityId: string;
  capacitySlug: string;
  capacityName: string;
  score: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
}

export interface StakeholderProfile {
  id: string;
  email: string;
  name: string;
  relationshipScore: number;
  lastInteraction?: Date;
  stance?: string;
}

export interface ContentMetadata {
  id: string;
  type: 'COURSE' | 'CASE' | 'MODULE';
  title: string;
  slug: string;
  capacities: string[];      // Capacity slugs this addresses
  situations: string[];      // Situation tags (e.g., "difficult-stakeholder", "budget-discussion")
  triggers: string[];        // What triggers this recommendation
  duration: number;          // Minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];  // Content IDs that should be completed first
}

export interface Prescription {
  id: string;
  triggerType: 'UPCOMING_EVENT' | 'OBSERVATION' | 'CAPACITY_GAP' | 'PATTERN_DETECTED';
  triggerId?: string;
  contentType: 'COURSE' | 'CASE' | 'MODULE';
  contentId: string;
  title: string;
  duration: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  dueBy?: Date;
  capacitySlug?: string;
  score: number;  // For ranking
}

export interface EnrichedUpcomingEvent extends UpcomingEvent {
  stakeholders: StakeholderProfile[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  prescriptions: Prescription[];
  contextNotes?: string;
}

// Content library with metadata for matching
// In production, this would come from the database
const CONTENT_LIBRARY: ContentMetadata[] = [
  // Courses
  {
    id: 'course-stakeholder-recovery',
    type: 'COURSE',
    title: 'Rebuilding Stakeholder Trust',
    slug: 'stakeholder-recovery',
    capacities: ['relationship-capital'],
    situations: ['tension-recovery', 'difficult-stakeholder', 'trust-repair'],
    triggers: ['low-relationship-score', 'recent-conflict'],
    duration: 45,
    difficulty: 'intermediate'
  },
  {
    id: 'course-political-navigation',
    type: 'COURSE',
    title: 'Political Navigation',
    slug: 'political-navigation',
    capacities: ['situational-awareness', 'relationship-capital'],
    situations: ['political-dynamics', 'organizational-politics', 'power-mapping'],
    triggers: ['missed-political-signals', 'political-misstep'],
    duration: 60,
    difficulty: 'advanced'
  },
  {
    id: 'course-decision-frameworks',
    type: 'COURSE',
    title: 'Decision Quality Under Uncertainty',
    slug: 'decision-frameworks',
    capacities: ['decision-quality'],
    situations: ['complex-decision', 'uncertain-data', 'high-stakes'],
    triggers: ['poor-decision-outcome', 'analysis-paralysis'],
    duration: 50,
    difficulty: 'intermediate'
  },
  {
    id: 'course-execution-velocity',
    type: 'COURSE',
    title: 'Fast on the Right Things',
    slug: 'execution-velocity',
    capacities: ['execution-velocity', 'outcome-orientation'],
    situations: ['deadline-pressure', 'competing-priorities', 'resource-constraints'],
    triggers: ['missed-deadline', 'scope-creep', 'slow-progress'],
    duration: 40,
    difficulty: 'intermediate'
  },
  {
    id: 'course-reading-rooms',
    type: 'COURSE',
    title: 'Reading the Room',
    slug: 'reading-rooms',
    capacities: ['situational-awareness'],
    situations: ['meeting-dynamics', 'pre-decided-room', 'hidden-agendas'],
    triggers: ['missed-signals', 'surprised-by-outcome'],
    duration: 35,
    difficulty: 'intermediate'
  },
  // Cases
  {
    id: 'case-skeptical-cfo',
    type: 'CASE',
    title: 'The Skeptical CFO',
    slug: 'skeptical-cfo',
    capacities: ['relationship-capital', 'situational-awareness'],
    situations: ['budget-discussion', 'skeptical-executive', 'data-driven-stakeholder', 'finance-leader'],
    triggers: ['finance-meeting', 'analytical-pushback'],
    duration: 25,
    difficulty: 'intermediate'
  },
  {
    id: 'case-coalition-builder',
    type: 'CASE',
    title: 'The Coalition Builder',
    slug: 'coalition-builder',
    capacities: ['relationship-capital', 'outcome-orientation'],
    situations: ['multiple-stakeholders', 'conflicting-interests', 'alignment-needed'],
    triggers: ['multi-stakeholder-meeting', 'competing-priorities'],
    duration: 30,
    difficulty: 'advanced'
  },
  {
    id: 'case-fait-accompli',
    type: 'CASE',
    title: 'The Fait Accompli',
    slug: 'fait-accompli',
    capacities: ['situational-awareness', 'decision-quality'],
    situations: ['pre-decided-room', 'political-maneuvering', 'late-awareness'],
    triggers: ['missed-political-signals', 'surprised-by-decision'],
    duration: 25,
    difficulty: 'intermediate'
  },
  {
    id: 'case-urgent-pivot',
    type: 'CASE',
    title: 'The Urgent Pivot',
    slug: 'urgent-pivot',
    capacities: ['execution-velocity', 'decision-quality'],
    situations: ['crisis-response', 'rapid-change', 'stakeholder-pressure'],
    triggers: ['urgent-change', 'crisis-detected'],
    duration: 20,
    difficulty: 'intermediate'
  },
  {
    id: 'case-hidden-dynamics',
    type: 'CASE',
    title: 'Hidden Stakeholder Dynamics',
    slug: 'hidden-dynamics',
    capacities: ['situational-awareness', 'domain-mastery'],
    situations: ['hidden-agendas', 'stakeholder-history', 'organizational-politics'],
    triggers: ['surprising-stakeholder-behavior', 'hidden-conflict'],
    duration: 25,
    difficulty: 'advanced'
  },
  // Modules (quick reads)
  {
    id: 'module-recovery-conversation',
    type: 'MODULE',
    title: 'The Recovery Conversation',
    slug: 'recovery-conversation',
    capacities: ['relationship-capital'],
    situations: ['tension-recovery', 'difficult-conversation', 'trust-repair'],
    triggers: ['recent-conflict', 'relationship-damage'],
    duration: 10,
    difficulty: 'intermediate'
  },
  {
    id: 'module-pre-meeting-radar',
    type: 'MODULE',
    title: 'Pre-Meeting Political Radar',
    slug: 'pre-meeting-radar',
    capacities: ['situational-awareness'],
    situations: ['meeting-prep', 'political-dynamics', 'stakeholder-mapping'],
    triggers: ['important-meeting', 'political-meeting'],
    duration: 8,
    difficulty: 'beginner'
  },
  {
    id: 'module-stakeholder-mapping',
    type: 'MODULE',
    title: 'Quick Stakeholder Mapping',
    slug: 'stakeholder-mapping',
    capacities: ['situational-awareness', 'relationship-capital'],
    situations: ['new-stakeholders', 'complex-meeting', 'multi-party'],
    triggers: ['multi-stakeholder-meeting', 'new-stakeholder'],
    duration: 12,
    difficulty: 'beginner'
  }
];

// Situation detection from event data
function detectSituations(event: UpcomingEvent, stakeholders: StakeholderProfile[]): string[] {
  const situations: string[] = [];
  const titleLower = event.title.toLowerCase();
  const descLower = (event.description || '').toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Finance/budget related
  if (combined.includes('budget') || combined.includes('finance') || combined.includes('cfo')) {
    situations.push('budget-discussion', 'finance-leader');
  }

  // Multiple stakeholders
  if (event.attendees.length > 3) {
    situations.push('multiple-stakeholders', 'multi-stakeholder-meeting');
  }

  // Low relationship stakeholders
  const lowRelationshipStakeholders = stakeholders.filter(s => s.relationshipScore < 0.4);
  if (lowRelationshipStakeholders.length > 0) {
    situations.push('difficult-stakeholder', 'tension-recovery');
  }

  // Skeptical stakeholders
  const skepticalStakeholders = stakeholders.filter(s => s.stance === 'skeptical' || s.stance === 'resistant');
  if (skepticalStakeholders.length > 0) {
    situations.push('skeptical-executive', 'analytical-pushback');
  }

  // Decision/approval meetings
  if (combined.includes('decision') || combined.includes('approval') || combined.includes('review')) {
    situations.push('complex-decision', 'high-stakes');
  }

  // Strategy/planning
  if (combined.includes('strategy') || combined.includes('planning') || combined.includes('roadmap')) {
    situations.push('alignment-needed', 'competing-priorities');
  }

  // Crisis/urgent
  if (combined.includes('urgent') || combined.includes('crisis') || combined.includes('escalation')) {
    situations.push('crisis-response', 'rapid-change');
  }

  return [...new Set(situations)];
}

// Calculate event risk level
function calculateRiskLevel(event: UpcomingEvent, stakeholders: StakeholderProfile[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  let riskScore = 0;

  // Low relationship stakeholders increase risk
  const lowRelationship = stakeholders.filter(s => s.relationshipScore < 0.4).length;
  riskScore += lowRelationship * 2;

  // Skeptical/resistant stakeholders increase risk
  const skeptical = stakeholders.filter(s => s.stance === 'skeptical' || s.stance === 'resistant').length;
  riskScore += skeptical * 1.5;

  // Many attendees increase complexity
  if (event.attendees.length > 5) riskScore += 1;

  // Keywords in title/description
  const combined = `${event.title} ${event.description || ''}`.toLowerCase();
  if (combined.includes('budget') || combined.includes('approval')) riskScore += 1;
  if (combined.includes('urgent') || combined.includes('crisis')) riskScore += 2;
  if (combined.includes('escalation') || combined.includes('conflict')) riskScore += 2;

  if (riskScore >= 4) return 'HIGH';
  if (riskScore >= 2) return 'MEDIUM';
  return 'LOW';
}

// Generate context notes for event
function generateContextNotes(event: UpcomingEvent, stakeholders: StakeholderProfile[]): string | undefined {
  const notes: string[] = [];

  const lowRelationship = stakeholders.filter(s => s.relationshipScore < 0.4);
  if (lowRelationship.length > 0) {
    notes.push(`Relationship tension with ${lowRelationship.map(s => s.name).join(', ')}`);
  }

  const skeptical = stakeholders.filter(s => s.stance === 'skeptical');
  if (skeptical.length > 0) {
    notes.push(`${skeptical.map(s => s.name).join(', ')} may push back`);
  }

  return notes.length > 0 ? notes.join('. ') + '.' : undefined;
}

// Match content to signals
function matchContent(
  contentLibrary: ContentMetadata[],
  situations: string[],
  capacityGaps: string[],
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
): ContentMetadata[] {
  return contentLibrary
    .filter(content => {
      // Match by situations
      const situationMatch = content.situations.some(s => situations.includes(s));
      // Match by capacity gaps
      const capacityMatch = content.capacities.some(c => capacityGaps.includes(c));

      return situationMatch || capacityMatch;
    })
    .sort((a, b) => {
      // Prioritize by relevance
      const aScore = (
        a.situations.filter(s => situations.includes(s)).length * 2 +
        a.capacities.filter(c => capacityGaps.includes(c)).length
      );
      const bScore = (
        b.situations.filter(s => situations.includes(s)).length * 2 +
        b.capacities.filter(c => capacityGaps.includes(c)).length
      );

      // For high urgency, prefer shorter content
      if (urgency === 'HIGH') {
        return (bScore - a.duration / 10) - (aScore - b.duration / 10);
      }

      return bScore - aScore;
    });
}

// Main prescription generator
export async function generatePrescriptions(signals: PrescriptionSignals): Promise<{
  eventPrescriptions: EnrichedUpcomingEvent[];
  generalPrescriptions: Prescription[];
}> {
  const eventPrescriptions: EnrichedUpcomingEvent[] = [];
  const generalPrescriptions: Prescription[] = [];

  // Get capacity gaps (scores below 3.0)
  const capacityGaps = signals.capacityScores
    .filter(c => c.score < 3.0)
    .map(c => c.capacitySlug);

  // Get recently problematic capacities from observations
  const recentGapCapacities = signals.recentObservations
    .filter(o => o.type === 'NEGATIVE' || o.type === 'MISSED_OPPORTUNITY')
    .map(o => o.capacitySlug);

  const allGaps = [...new Set([...capacityGaps, ...recentGapCapacities])];

  // Process each upcoming event
  for (const event of signals.upcomingEvents) {
    // Find relevant stakeholders
    const eventStakeholders = signals.stakeholderProfiles.filter(s =>
      event.attendees.some(a => a.toLowerCase().includes(s.email.toLowerCase()) ||
        a.toLowerCase().includes(s.name.toLowerCase()))
    );

    // Detect situations
    const situations = detectSituations(event, eventStakeholders);

    // Calculate risk level
    const riskLevel = calculateRiskLevel(event, eventStakeholders);

    // Generate context notes
    const contextNotes = generateContextNotes(event, eventStakeholders);

    // Match content
    const matchedContent = matchContent(CONTENT_LIBRARY, situations, allGaps, riskLevel);

    // Create prescriptions for this event
    const prescriptions: Prescription[] = matchedContent.slice(0, 3).map((content, idx) => ({
      id: `${event.id}-${content.id}`,
      triggerType: 'UPCOMING_EVENT' as const,
      triggerId: event.id,
      contentType: content.type,
      contentId: content.slug,
      title: content.title,
      duration: content.duration,
      urgency: riskLevel,
      reason: generateReason(content, situations, eventStakeholders),
      dueBy: event.startTime,
      capacitySlug: content.capacities[0],
      score: (3 - idx) * (riskLevel === 'HIGH' ? 3 : riskLevel === 'MEDIUM' ? 2 : 1)
    }));

    eventPrescriptions.push({
      ...event,
      stakeholders: eventStakeholders,
      riskLevel,
      prescriptions,
      contextNotes
    });
  }

  // Generate general prescriptions from observations and capacity gaps
  for (const observation of signals.recentObservations) {
    if (observation.type === 'NEGATIVE' || observation.type === 'MISSED_OPPORTUNITY') {
      const matchedContent = CONTENT_LIBRARY.filter(c =>
        c.capacities.includes(observation.capacitySlug)
      );

      if (matchedContent.length > 0) {
        const content = matchedContent[0];
        generalPrescriptions.push({
          id: `obs-${observation.id}-${content.id}`,
          triggerType: 'OBSERVATION',
          triggerId: observation.id,
          contentType: content.type,
          contentId: content.slug,
          title: content.title,
          duration: content.duration,
          urgency: 'MEDIUM',
          reason: `Addresses ${observation.type === 'NEGATIVE' ? 'gap' : 'missed opportunity'} in ${observation.context}`,
          capacitySlug: content.capacities[0],
          score: 2
        });
      }
    }
  }

  // Add prescriptions for low capacity scores
  for (const score of signals.capacityScores) {
    if (score.score < 2.5 && score.trend !== 'IMPROVING') {
      const matchedContent = CONTENT_LIBRARY.filter(c =>
        c.capacities.includes(score.capacitySlug) && c.type === 'COURSE'
      );

      if (matchedContent.length > 0) {
        const content = matchedContent[0];
        // Check if not already prescribed
        if (!generalPrescriptions.some(p => p.contentId === content.slug)) {
          generalPrescriptions.push({
            id: `cap-${score.capacityId}-${content.id}`,
            triggerType: 'CAPACITY_GAP',
            triggerId: score.capacityId,
            contentType: content.type,
            contentId: content.slug,
            title: content.title,
            duration: content.duration,
            urgency: 'LOW',
            reason: `${score.capacityName} is a growth area (${score.score.toFixed(1)}/5)`,
            capacitySlug: content.capacities[0],
            score: 1
          });
        }
      }
    }
  }

  // Sort general prescriptions by score
  generalPrescriptions.sort((a, b) => b.score - a.score);

  // Deduplicate
  const seen = new Set<string>();
  const deduped = generalPrescriptions.filter(p => {
    if (seen.has(p.contentId)) return false;
    seen.add(p.contentId);
    return true;
  });

  return {
    eventPrescriptions,
    generalPrescriptions: deduped.slice(0, 5)
  };
}

function generateReason(
  content: ContentMetadata,
  situations: string[],
  stakeholders: StakeholderProfile[]
): string {
  // Generate human-readable reason
  const lowRelationship = stakeholders.filter(s => s.relationshipScore < 0.4);

  if (lowRelationship.length > 0 && content.capacities.includes('relationship-capital')) {
    return `Relationship building with ${lowRelationship[0].name}`;
  }

  if (situations.includes('budget-discussion') && content.situations.includes('finance-leader')) {
    return 'Prep for finance discussion';
  }

  if (situations.includes('multiple-stakeholders') && content.situations.includes('multiple-stakeholders')) {
    return 'Navigate multiple perspectives';
  }

  if (situations.includes('difficult-stakeholder')) {
    return 'Handle tension constructively';
  }

  return `Builds ${content.capacities[0].replace('-', ' ')}`;
}

// Helper to fetch signals from database
export async function fetchPrescriptionSignals(userId: string): Promise<PrescriptionSignals> {
  // Get upcoming events (next 7 days) from calendar artifacts
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const calendarArtifacts = await prisma.workArtifact.findMany({
    where: {
      userId,
      type: 'MEETING_ATTENDED',
      occurredAt: {
        gte: new Date(),
        lte: sevenDaysFromNow
      }
    },
    orderBy: { occurredAt: 'asc' },
    take: 20
  });

  const upcomingEvents: UpcomingEvent[] = calendarArtifacts.map(a => {
    const metadata = a.metadata as Record<string, unknown> || {};
    return {
      id: a.id,
      title: a.title || 'Untitled Event',
      startTime: a.occurredAt,
      endTime: new Date(a.occurredAt.getTime() + 60 * 60 * 1000), // Default 1 hour
      attendees: (metadata.attendees as string[]) || [],
      description: (metadata.description as string) || undefined
    };
  });

  // Get recent observations (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const observations = await prisma.skillObservation.findMany({
    where: {
      userId,
      createdAt: { gte: thirtyDaysAgo }
    },
    include: {
      capacity: {
        select: { slug: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const recentObservations: Observation[] = observations.map(o => ({
    id: o.id,
    capacityId: o.capacityId,
    capacitySlug: o.capacity.slug,
    type: o.type as 'POSITIVE' | 'NEGATIVE' | 'MISSED_OPPORTUNITY',
    context: o.context,
    createdAt: o.createdAt
  }));

  // Get capacity scores
  const capacityScores = await prisma.capacityScore.findMany({
    where: { userId },
    include: {
      capacity: {
        select: { slug: true, name: true }
      }
    }
  });

  const scores: CapacityScore[] = capacityScores.map(c => ({
    capacityId: c.capacityId,
    capacitySlug: c.capacity.slug,
    capacityName: c.capacity.name,
    score: c.score,
    trend: c.trend as 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA'
  }));

  // Get stakeholder profiles
  const stakeholders = await prisma.stakeholderProfile.findMany({
    where: { userId },
    take: 100
  });

  const stakeholderProfiles: StakeholderProfile[] = stakeholders.map(s => ({
    id: s.id,
    email: s.email || '',
    name: s.name,
    relationshipScore: s.relationshipStrength,
    lastInteraction: s.lastInteraction || undefined,
    stance: s.stanceOnProjects || undefined
  }));

  return {
    userId,
    upcomingEvents,
    recentObservations,
    capacityScores: scores,
    stakeholderProfiles
  };
}
