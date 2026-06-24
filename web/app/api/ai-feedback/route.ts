import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { decryptApiKey } from '@/lib/encryption';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId, round, userResponse, situation, evaluationCriteria } = await req.json();

    if (!caseId || !userResponse || !situation) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user and check subscription
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        subscription: true,
        apiKeys: {
          where: { isActive: true }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has AI feedback access
    if (!user.subscription?.hasAiFeedback) {
      return NextResponse.json(
        { error: 'AI feedback requires Pro or Enterprise plan' },
        { status: 403 }
      );
    }

    // Check usage limits
    if (
      user.subscription.tier === 'PRO' &&
      user.subscription.aiFeedbackUsedThisMonth >= user.subscription.monthlyAiFeedbackLimit
    ) {
      return NextResponse.json(
        { error: 'Monthly AI feedback limit reached. Upgrade to Enterprise for unlimited feedback.' },
        { status: 429 }
      );
    }

    // Get user's API keys
    const openaiKey = user.apiKeys.find(k => k.provider === 'openai');
    const anthropicKey = user.apiKeys.find(k => k.provider === 'anthropic');

    if (!openaiKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'No API keys configured. Please add an OpenAI or Anthropic API key in settings.' },
        { status: 400 }
      );
    }

    // Generate feedback using available API
    let feedback;
    if (anthropicKey) {
      feedback = await generateAnthropicFeedback(
        decryptApiKey(anthropicKey.encryptedKey),
        situation,
        userResponse,
        evaluationCriteria
      );

      // Update last used
      await prisma.userApiKey.update({
        where: { id: anthropicKey.id },
        data: { lastUsed: new Date() }
      });
    } else if (openaiKey) {
      feedback = await generateOpenAIFeedback(
        decryptApiKey(openaiKey.encryptedKey),
        situation,
        userResponse,
        evaluationCriteria
      );

      // Update last used
      await prisma.userApiKey.update({
        where: { id: openaiKey.id },
        data: { lastUsed: new Date() }
      });
    }

    // Update usage count
    await prisma.subscription.update({
      where: { id: user.subscription.id },
      data: {
        aiFeedbackUsedThisMonth: {
          increment: 1
        }
      }
    });

    return NextResponse.json({ feedback });
  } catch (error: any) {
    console.error('AI feedback error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate feedback' },
      { status: 500 }
    );
  }
}

async function generateAnthropicFeedback(
  apiKey: string,
  situation: string,
  userResponse: string,
  evaluationCriteria?: string[]
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const criteriaText = evaluationCriteria && evaluationCriteria.length > 0
    ? `\n\nEvaluation Criteria:\n${evaluationCriteria.map(c => `- ${c}`).join('\n')}`
    : '';

  const prompt = `You are an expert executive coach specializing in leadership development for public infrastructure advisors. You help learners develop better judgment through case-based learning.

Situation:
${situation}

Learner's Response:
${userResponse}
${criteriaText}

Provide constructive feedback on their response. Focus on:
1. What patterns they're recognizing (or missing)
2. The quality of their analysis - are they seeing stakeholder dynamics, power relationships, real motivations?
3. Specific improvements to their thinking process
4. What they should pay attention to next time

Be direct but supportive. Use concrete examples from their response. Don't just say "good job" - push their thinking forward.

Keep feedback concise (3-4 paragraphs max).`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

async function generateOpenAIFeedback(
  apiKey: string,
  situation: string,
  userResponse: string,
  evaluationCriteria?: string[]
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const criteriaText = evaluationCriteria && evaluationCriteria.length > 0
    ? `\n\nEvaluation Criteria:\n${evaluationCriteria.map(c => `- ${c}`).join('\n')}`
    : '';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert executive coach specializing in leadership development for public infrastructure advisors. You help learners develop better judgment through case-based learning.'
      },
      {
        role: 'user',
        content: `Situation:\n${situation}\n\nLearner's Response:\n${userResponse}${criteriaText}\n\nProvide constructive feedback on their response. Focus on:\n1. What patterns they're recognizing (or missing)\n2. The quality of their analysis - are they seeing stakeholder dynamics, power relationships, real motivations?\n3. Specific improvements to their thinking process\n4. What they should pay attention to next time\n\nBe direct but supportive. Use concrete examples from their response. Don't just say "good job" - push their thinking forward.\n\nKeep feedback concise (3-4 paragraphs max).`
      }
    ],
    max_tokens: 1024,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || '';
}
