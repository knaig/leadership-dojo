import { prisma } from '@/lib/prisma';
import { WorkArtifact, ObservationType, Severity } from '@prisma/client';
import { createProvider } from '@/lib/llm/factory';
import { getUserLLMConfig } from '@/lib/llm/user-config';

interface CapacityObservation {
  capacitySlug: string;
  type: ObservationType;
  context: string;
  observation: string;
  evidence: string;
  score: number;
  confidence: number;
  severity: Severity;
}

interface AnalysisResult {
  observations: CapacityObservation[];
  summary: string;
  dominantCapacities: string[];
  growthAreas: string[];
  scores?: { [dimension: string]: number };
}

const ANALYSIS_PROMPT = `You are analyzing a work artifact to identify demonstrations of leadership capacities.

## The 6 Core Capacities

1. **Situational Awareness** (situational-awareness)
   - Reading what is not said
   - Understanding political dynamics
   - Detecting stakeholder concerns before they surface

2. **Outcome Orientation** (outcome-orientation)
   - Focus on what actually matters
   - Cutting through noise to identify real objectives
   - Prioritizing impact over activity

3. **Relationship Capital** (relationship-capital)
   - Trust built over time through consistent behavior
   - Investment in relationships before needing them
   - Managing relationship health proactively

4. **Domain Mastery** (domain-mastery)
   - Deep contextual expertise
   - Understanding organizational culture and history
   - Knowing the unwritten rules

5. **Decision Quality** (decision-quality)
   - Sound judgment under uncertainty
   - Balancing speed with thoroughness
   - Knowing when to decide vs. when to gather more info

6. **Execution Velocity** (execution-velocity)
   - Fast on the right things, appropriately slow on risky ones
   - Removing blockers and maintaining momentum
   - Balancing urgency with sustainability

## Artifact to Analyze

Type: {{artifactType}}
Title: {{title}}
Date: {{occurredAt}}
Participants: {{participants}}

Content:
{{content}}

## Task

Analyze this artifact for evidence of capacity demonstration or gaps. For each relevant observation, provide:

1. capacitySlug: One of the 6 capacity slugs listed above
2. type: POSITIVE (demonstrated well), NEGATIVE (demonstrated poorly), or MISSED_OPPORTUNITY (could have applied but did not)
3. context: Brief description of what was happening (max 100 chars)
4. observation: What you observed about the capacity (max 200 chars)
5. evidence: Specific quote or description from the artifact (max 300 chars)
6. score: -1.0 to 1.0 (negative for gaps, positive for strengths)
7. confidence: 0.0 to 1.0 (how confident you are in this observation)
8. severity: HIGH, MEDIUM, or LOW (impact significance)

**CRITICAL CONSTRAINTS:**
- Maximum 10 observations per artifact (prioritize the most significant)
- Strictly adhere to character limits above
- Keep summary under 200 characters
- Total response must be under 5000 tokens

Be specific and evidence-based. Only report observations with clear evidence. Do not force observations - if the artifact does not clearly demonstrate a capacity, do not include it.

Respond with JSON in this format:
{
  "observations": [
    {
      "capacitySlug": "string",
      "type": "POSITIVE" | "NEGATIVE" | "MISSED_OPPORTUNITY",
      "context": "string",
      "observation": "string",
      "evidence": "string",
      "score": number,
      "confidence": number,
      "severity": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "summary": "Brief overall summary of the artifact analysis",
  "dominantCapacities": ["capacity slugs that were most present"],
  "growthAreas": ["capacity slugs where improvement is needed"]
}`;

/**
 * Analyze a work artifact for capacity demonstrations
 */
export async function analyzeArtifact(
  artifact: WorkArtifact,
  userId: string
): Promise<AnalysisResult> {
  // Get user's LLM config
  const llmConfig = await getUserLLMConfig(userId);
  console.log(`[Analyzer] Analyzing for userId: ${userId}`);
  console.log(`[Analyzer] Config found: ${llmConfig.provider}`);

  if (llmConfig.provider === 'none') {
    // Return empty analysis if no LLM configured
    console.warn(`[Analyzer] No LLM configured for userId ${userId}. Skipping.`);
    return {
      observations: [],
      summary: 'LLM not configured. Please add an API key in settings to enable analysis.',
      dominantCapacities: [],
      growthAreas: [],
    };
  }

  const provider = createProvider(llmConfig);

  // Enrich with linked meeting notes if available
  let enrichedContent = artifact.content || '(No content)';

  if (artifact.type === 'MEETING_ATTENDED' && artifact.linkedNoteId) {
    try {
      const linkedNote = await prisma.workArtifact.findUnique({
        where: { id: artifact.linkedNoteId },
        select: { content: true, title: true },
      });

      if (linkedNote && linkedNote.content) {
        enrichedContent = `
=== MEETING CONTEXT ===
${artifact.content || '(No meeting description)'}

=== MEETING NOTES ===
${linkedNote.content}

Note: This analysis combines the calendar event with detailed meeting notes for comprehensive insight.
`;
      }
    } catch (error) {
      console.error('Failed to fetch linked note:', error);
      // Continue with original content
    }
  }

  // Build the prompt
  const prompt = ANALYSIS_PROMPT
    .replace('{{artifactType}}', artifact.type)
    .replace('{{title}}', artifact.title || 'Untitled')
    .replace('{{occurredAt}}', artifact.occurredAt.toISOString())
    .replace('{{participants}}', JSON.stringify(artifact.participants || []))
    .replace('{{content}}', enrichedContent);

  // Call LLM
  // Call LLM
  let response;
  try {
    response = await provider.analyze(prompt, {
      model: llmConfig.model,
      temperature: 0.3, // Lower temperature for more consistent analysis
      maxTokens: 8000, // Increased to handle complex artifacts without truncation
    });
  } catch (err) {
    console.error(`[Analyzer] LLM Call Failed for artifact ${artifact.id}:`, err);
    throw new Error(`LLM Analysis Failed: ${String(err)}`);
  }

  // Use the provider's response directly
  const analysisResult: AnalysisResult = {
    observations: response.observations || [],
    summary: response.summary ||
      (response.observations.length > 0
        ? `Analyzed ${artifact.type} and found ${response.observations.length} observations.`
        : 'No leadership observations found.'),
    dominantCapacities: response.dominantCapacities || [],
    growthAreas: response.growthAreas || [],
    scores: response.scores
  };

  // Get capacity IDs
  const capacities = await prisma.capacity.findMany();
  const capacityMap = new Map(capacities.map(c => [c.slug, c.id]));

  // Create observations in database
  for (const obs of analysisResult.observations) {
    const capacityId = capacityMap.get(obs.capacitySlug);
    if (!capacityId) {
      console.warn(`Unknown capacity slug: ${obs.capacitySlug}`);
      continue;
    }

    await prisma.skillObservation.create({
      data: {
        userId,
        capacityId,
        artifactId: artifact.id,
        type: obs.type as ObservationType,
        context: obs.context,
        observation: obs.observation,
        evidence: obs.evidence,
        score: Math.max(-1, Math.min(1, obs.score)), // Clamp to [-1, 1]
        confidence: Math.max(0, Math.min(1, obs.confidence)), // Clamp to [0, 1]
        severity: obs.severity as Severity,
      },
    });

    // Update capacity score
    await updateCapacityScore(userId, capacityId, obs);
  }

  return analysisResult;
}

/**
 * Update the user's capacity score based on a new observation
 */
async function updateCapacityScore(
  userId: string,
  capacityId: string,
  observation: CapacityObservation
): Promise<void> {
  // Get or create capacity score
  let capacityScore = await prisma.capacityScore.findUnique({
    where: {
      userId_capacityId: {
        userId,
        capacityId,
      },
    },
  });

  if (!capacityScore) {
    capacityScore = await prisma.capacityScore.create({
      data: {
        userId,
        capacityId,
        score: 2.5, // Start at middle of 0-5 scale
        confidence: 0.1,
        trend: 'INSUFFICIENT_DATA',
        positiveCount: 0,
        negativeCount: 0,
        missedCount: 0,
      },
    });
  }

  // Update counts based on observation type
  const updateData: Record<string, unknown> = {
    lastObservation: new Date(),
  };

  switch (observation.type) {
    case 'POSITIVE':
      updateData.positiveCount = capacityScore.positiveCount + 1;
      break;
    case 'NEGATIVE':
      updateData.negativeCount = capacityScore.negativeCount + 1;
      break;
    case 'MISSED_OPPORTUNITY':
      updateData.missedCount = capacityScore.missedCount + 1;
      break;
  }

  // Calculate new score using weighted average
  const totalObs = capacityScore.positiveCount + capacityScore.negativeCount + capacityScore.missedCount + 1;
  const positiveWeight = observation.type === 'POSITIVE' ? 1 : 0;
  const negativeWeight = observation.type === 'NEGATIVE' || observation.type === 'MISSED_OPPORTUNITY' ? 1 : 0;

  // Adjust score: positive observations increase, negative/missed decrease
  // Impact weighted by confidence and severity
  const impactMultiplier = observation.confidence * (observation.severity === 'HIGH' ? 1.5 : observation.severity === 'MEDIUM' ? 1.0 : 0.5);
  const scoreAdjustment = (positiveWeight - negativeWeight) * 0.1 * impactMultiplier;

  const newScore = Math.max(0, Math.min(5, capacityScore.score + scoreAdjustment));
  const newConfidence = Math.min(1, 0.1 + (totalObs * 0.05)); // Confidence grows with more observations

  // Determine trend
  const previousScore = capacityScore.score;
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';

  if (totalObs >= 5) {
    const scoreDiff = newScore - previousScore;
    if (scoreDiff > 0.1) trend = 'IMPROVING';
    else if (scoreDiff < -0.1) trend = 'DECLINING';
    else trend = 'STABLE';
  }

  await prisma.capacityScore.update({
    where: { id: capacityScore.id },
    data: {
      ...updateData,
      score: newScore,
      confidence: newConfidence,
      trend,
    },
  });
}
