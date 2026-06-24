/**
 * Prompt templates for analysis and coaching
 */

export function buildAnalysisPrompt(
  caseContext: any,
  roundData: any,
  userResponse: string
): string {
  const evaluatePoints = roundData.evaluate?.map((point: string) => `- ${point}`).join('\n') || '';

  return `You are analyzing a response in a DPI leadership training case.

CASE CONTEXT:
Country: ${caseContext.country}
Type: ${caseContext.case_type}
Stakeholder Map: ${JSON.stringify(caseContext.stakeholder_map, null, 2)}

ROUND ${roundData.round} - ${roundData.type}:
Situation: ${roundData.situation}

EVALUATION CRITERIA:
${evaluatePoints}

USER'S RESPONSE:
${userResponse}

Analyze this response and provide:

1. BEHAVIOR SCORES (0.0 to 1.0):
   - solution_jumping: How quickly did they jump to solutions vs. understanding? (lower is better)
   - stakeholder_awareness: Did they notice all relevant stakeholders? (higher is better)
   - timing_sensitivity: Did they recognize political timing factors? (higher is better)
   - legitimacy_awareness: Did they consider legitimacy and trust issues? (higher is better)

2. MODE DETECTION:
   What mode were they operating in?
   - builder: Focus on technical solutions, "we can build this"
   - founder: Taking ownership, heroic solutions, "I'll fix it"
   - advisor: Asking questions, facilitating, building local leadership

3. SPECIFIC OBSERVATIONS:
   What specifically in their response shows this mode/behavior?

Respond in JSON format:
{
  "solution_jumping": 0.X,
  "stakeholder_awareness": 0.X,
  "timing_sensitivity": 0.X,
  "legitimacy_awareness": 0.X,
  "detected_mode": "builder|founder|advisor",
  "observations": ["specific observation 1", "specific observation 2"]
}`;
}

export function buildCoachingPrompt(
  caseData: any,
  allResponses: string[],
  allAnalyses: any[]
): string {
  const responsesSummary = allResponses.slice(0, 5).map((resp, i) => {
    const analysis = allAnalyses[i] || {};
    return `Round ${i + 1} (${analysis.detectedMode || 'unknown'} mode):
Response: ${resp.substring(0, 200)}${resp.length > 200 ? '...' : ''}
Scores: solution_jumping=${analysis.scores?.solution_jumping?.toFixed(2) || '0.50'}, stakeholder_awareness=${analysis.scores?.stakeholder_awareness?.toFixed(2) || '0.50'}`;
  }).join('\n\n');

  const outcomeRound = caseData.rounds[caseData.rounds.length - 1];

  return `You are a senior public sector advisor coaching someone on DPI leadership skills.

CASE: ${caseData.title}
TYPE: ${caseData.case_type}

USER'S RESPONSES ACROSS ALL ROUNDS:
${responsesSummary}

OUTCOME FROM CASE:
${outcomeRound.situation}

Provide coaching that:

1. NAMES THE DOMINANT MODE they operated in (builder/founder/advisor)
2. IDENTIFIES SPECIFIC MOMENTS where that mode was visible
3. EXPLAINS what a senior advisor would have done differently (specific to COSS/DPI context)
4. IDENTIFIES recurring pattern if visible across multiple rounds
5. GIVES ONE CONCRETE BEHAVIOR to practice before their next real meeting

Tone: Senior advisor (not motivational, not academic). Calm, neutral, occasionally blunt.
Focus on observable behavior, not intentions. Name patterns without judgment.

Respond in JSON format:
{
  "dominant_mode": "builder|founder|advisor",
  "specific_moments": [
    "In Round X, when you said '...', you shifted to builder mode because...",
    "Round Y: you didn't mention [stakeholder] until prompted"
  ],
  "senior_advisor_approach": "A senior advisor would have...",
  "recurring_pattern": "This is the pattern: ...",
  "behavior_practice": "Before your next meeting: [one specific action]",
  "coaching_summary": "2-3 paragraph coaching message in the voice described above",
  "scores": {
    "solution_jumping": 0.X,
    "stakeholder_awareness": 0.X,
    "timing_sensitivity": 0.X,
    "legitimacy_awareness": 0.X
  }
}`;
}
