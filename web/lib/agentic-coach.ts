import { prisma } from './db';
import { analyzeWorkspaceContext } from './google-apis';
import { decryptApiKey } from './encryption';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * Agentic Coach - Tracks user context and provides intelligent recommendations
 */

interface UserContext {
  userId: string;
  caseHistory: Array<{
    caseId: string;
    completedAt: Date;
    score: number | null;
    patterns: Record<string, number>;
  }>;
  reflections: Array<{
    content: string;
    date: Date;
    qualityScore: number;
  }>;
  cognitivePatterns: {
    actionBias: number;
    system1Tendency: number;
    stakeholderAwareness: number;
  };
  projects: Array<{
    name: string;
    status: string;
    risks: string[];
  }>;
  workspaceContext?: {
    upcomingMeetings: any[];
    recentDocuments: any[];
  };
}

/**
 * Build comprehensive user context from all data sources
 */
export async function buildUserContext(userId: string): Promise<UserContext> {
  // Get user with all related data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      progress: {
        orderBy: { completedAt: 'desc' },
        take: 20,
      },
      reflections: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      projects: {
        include: {
          meetings: {
            orderBy: { date: 'desc' },
            take: 5,
          },
        },
      },
      subscription: true,
      accounts: {
        where: { provider: 'google' },
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Extract cognitive patterns from case history
  const cognitivePatterns = analyzeCognitivePatterns(user.progress);

  // Get workspace context if Google is connected and user has access
  let workspaceContext;
  if (
    user.subscription?.hasGoogleIntegrations &&
    user.accounts.length > 0
  ) {
    try {
      const result = await analyzeWorkspaceContext(userId);
      // Only include data from successful services
      workspaceContext = {
        upcomingMeetings: result.calendar.data?.meetings || [],
        recentDocuments: result.drive.data?.documents || [],
      };
      console.log('[Agentic Coach] Workspace context fetched:',
        'calendar:', result.calendar.status,
        'drive:', result.drive.status,
        'gmail:', result.gmail.status);
    } catch (error) {
      console.error('Failed to fetch workspace context:', error);
    }
  }

  return {
    userId,
    caseHistory: user.progress.map(p => ({
      caseId: p.caseId,
      completedAt: p.completedAt || new Date(),
      score: p.score,
      patterns: (p.skillDelta as Record<string, number>) || {},
    })),
    reflections: user.reflections.map(r => ({
      content: r.content || '',
      date: r.createdAt,
      qualityScore: r.qualityScore || 0,
    })),
    cognitivePatterns,
    projects: user.projects.map(p => ({
      name: p.name,
      status: p.status || 'unknown',
      risks: (p.risks as string[]) || [],
    })),
    workspaceContext,
  };
}

/**
 * Analyze cognitive patterns from case history
 */
function analyzeCognitivePatterns(progress: any[]): {
  actionBias: number;
  system1Tendency: number;
  stakeholderAwareness: number;
} {
  if (progress.length === 0) {
    return {
      actionBias: 50,
      system1Tendency: 50,
      stakeholderAwareness: 50,
    };
  }

  let actionBias = 0;
  let system1 = 0;
  let stakeholder = 0;
  let count = 0;

  for (const p of progress) {
    if (p.skillDelta) {
      const delta = p.skillDelta as Record<string, number>;
      if (delta['action-bias']) actionBias += delta['action-bias'];
      if (delta['system-1-tendency']) system1 += delta['system-1-tendency'];
      if (delta['stakeholder-awareness']) stakeholder += delta['stakeholder-awareness'];
      count++;
    }
  }

  if (count === 0) {
    return {
      actionBias: 50,
      system1Tendency: 50,
      stakeholderAwareness: 50,
    };
  }

  return {
    actionBias: Math.max(0, Math.min(100, 50 + (actionBias / count) * 10)),
    system1Tendency: Math.max(0, Math.min(100, 50 + (system1 / count) * 10)),
    stakeholderAwareness: Math.max(0, Math.min(100, 50 + (stakeholder / count) * 10)),
  };
}

/**
 * Generate personalized recommendations using AI
 */
export async function generateRecommendations(
  userId: string
): Promise<{
  nextCases: string[];
  skillFocus: string[];
  insights: string;
  projectAlerts: Array<{
    project: string;
    risk: string;
    recommendation: string;
  }>;
}> {
  const context = await buildUserContext(userId);

  // Get user's API key
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      apiKeys: { where: { isActive: true } },
      subscription: true,
    },
  });

  if (!user?.subscription?.hasAgenticCoach) {
    throw new Error('Agentic coach requires Enterprise plan');
  }

  const anthropicKey = user.apiKeys.find(k => k.provider === 'anthropic');
  const openaiKey = user.apiKeys.find(k => k.provider === 'openai');

  if (!anthropicKey && !openaiKey) {
    throw new Error('No API key configured');
  }

  // Build prompt from context
  const prompt = buildRecommendationPrompt(context);

  // Generate recommendations using AI
  let recommendations: string;
  if (anthropicKey) {
    recommendations = await generateWithAnthropic(
      decryptApiKey(anthropicKey.encryptedKey),
      prompt
    );
  } else if (openaiKey) {
    recommendations = await generateWithOpenAI(
      decryptApiKey(openaiKey.encryptedKey),
      prompt
    );
  } else {
    throw new Error('No API key available');
  }

  // Parse AI response into structured format
  return parseRecommendations(recommendations, context);
}

function buildRecommendationPrompt(context: UserContext): string {
  const workspaceInfo = context.workspaceContext
    ? `\n\n**Upcoming Meetings (Next 7 Days):**\n${context.workspaceContext.upcomingMeetings
      .slice(0, 5)
      .map(
        m =>
          `- ${m.summary} (${new Date(m.start).toLocaleDateString()}, ${m.attendees.length} attendees)`
      )
      .join('\n')}\n\n**Recent Documents:**\n${context.workspaceContext.recentDocuments
        .slice(0, 5)
        .map(d => `- ${d.name}`)
        .join('\n')}`
    : '';

  return `You are an executive coach analyzing a learner's progress in a COSS leadership training program. Based on their data, provide personalized recommendations.

**Learner Profile:**

**Case History (Last ${context.caseHistory.length} cases):**
${context.caseHistory
      .slice(0, 10)
      .map(
        c =>
          `- Case ${c.caseId}: Score ${c.score || 'N/A'}, Completed ${c.completedAt.toLocaleDateString()}`
      )
      .join('\n')}

**Cognitive Patterns:**
- Action Bias: ${context.cognitivePatterns.actionBias}% (0 = patient, 100 = impulsive)
- System 1 Tendency: ${context.cognitivePatterns.system1Tendency}% (0 = analytical, 100 = intuitive)
- Stakeholder Awareness: ${context.cognitivePatterns.stakeholderAwareness}% (0 = low, 100 = high)

**Recent Reflections Quality:**
${context.reflections
      .slice(0, 3)
      .map(r => `- ${r.date.toLocaleDateString()}: Score ${r.qualityScore}/100`)
      .join('\n')}

**Active Projects:**
${context.projects.map(p => `- ${p.name} (${p.status})${p.risks.length > 0 ? ` - Risks: ${p.risks.join(', ')}` : ''}`).join('\n')}
${workspaceInfo}

**Your Task:**
Provide personalized recommendations in the following JSON format:

{
  "nextCases": ["case-id-1", "case-id-2", "case-id-3"],
  "skillFocus": ["skill-area-1", "skill-area-2"],
  "insights": "2-3 paragraph analysis of their patterns and growth areas",
  "projectAlerts": [
    {
      "project": "project-name",
      "risk": "specific-risk",
      "recommendation": "actionable-advice"
    }
  ]
}

**Available Case Types:**
- Stakeholder navigation
- Power dynamics
- Decision under uncertainty
- Implementation challenges
- Coalition building
- Vendor management
- Cross-departmental coordination

**Guidelines:**
1. Recommend cases that address their weakest cognitive patterns
2. Identify skill gaps based on their case performance
3. Connect workspace activity (meetings, projects) to learning opportunities
4. Provide concrete, actionable insights
5. Be direct and specific, not generic

Return ONLY the JSON object, no additional text.`;
}

async function generateWithAnthropic(
  apiKey: string,
  prompt: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

async function generateWithOpenAI(
  apiKey: string,
  prompt: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 2048,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || '';
}

function parseRecommendations(
  aiResponse: string,
  context: UserContext
): {
  nextCases: string[];
  skillFocus: string[];
  insights: string;
  projectAlerts: Array<{
    project: string;
    risk: string;
    recommendation: string;
  }>;
} {
  try {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      nextCases: parsed.nextCases || [],
      skillFocus: parsed.skillFocus || [],
      insights: parsed.insights || 'No insights available.',
      projectAlerts: parsed.projectAlerts || [],
    };
  } catch (error) {
    console.error('Failed to parse AI recommendations:', error);
    // Return fallback recommendations
    return {
      nextCases: [],
      skillFocus: ['Stakeholder Analysis', 'Decision Making'],
      insights:
        'Continue practicing case studies to build your leadership skills.',
      projectAlerts: [],
    };
  }
}

/**
 * Update user's cognitive patterns based on case completion
 */
export async function updateCognitivePatterns(
  userId: string,
  caseId: string,
  userResponses: Record<string, string>
): Promise<void> {
  // This would analyze the user's responses and update their cognitive pattern scores
  // For now, this is a placeholder for the full implementation
  console.log('Updating cognitive patterns for user:', userId);
}
