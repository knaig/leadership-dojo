import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getUserLLMConfig } from '@/lib/llm/user-config';
import { createProvider } from '@/lib/llm/factory';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/infer-role
 * Given a job title + company + industry, infer responsibilities, KPIs, and success criteria.
 * Returns suggestions for user to review and confirm.
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const body = await req.json();
    const { jobTitle, company, industry, team, companyStage } = body;

    if (!jobTitle) {
        return NextResponse.json({ error: 'jobTitle is required' }, { status: 400 });
    }

    try {
        const config = await getUserLLMConfig(userId);
        const llm = createProvider(config);

        const prompt = `You are an executive coaching AI. Given a person's role, infer their likely responsibilities, KPIs, and what success looks like.

Role: ${jobTitle}
${company ? `Company: ${company}` : ''}
${industry ? `Industry: ${industry}` : ''}
${team ? `Team/Department: ${team}` : ''}
${companyStage ? `Company stage: ${companyStage}` : ''}

Return a JSON object with:
{
  "scope": "1-2 sentence description of what this role owns",
  "responsibilities": ["5-8 key responsibilities"],
  "kpis": ["4-6 KPIs/metrics this role is measured on"],
  "successCriteria": ["3-5 concrete outcomes that define 'great' in this role"],
  "reportsTo": "likely reporting line (e.g., CTO, CEO, VP Engineering)",
  "businessOutcomes": [
    { "title": "outcome name", "metric": "how it's measured", "timeframe": "quarterly/annual" }
  ]
}

Be specific and actionable. Tailor to the company stage and industry if provided.
Return ONLY valid JSON, no markdown or explanation.`;

        const response = await llm.generateText(prompt);

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'Failed to parse role inference' }, { status: 500 });
        }

        const inferred = JSON.parse(jsonMatch[0]);

        // Save as draft (inferred, not confirmed)
        await prisma.userResponsibility.upsert({
            where: {
                id: await getExistingResponsibilityId(userId),
            },
            create: {
                userId,
                title: jobTitle,
                scope: inferred.scope || null,
                responsibilities: inferred.responsibilities || [],
                kpis: inferred.kpis || [],
                successCriteria: inferred.successCriteria || [],
                reportsTo: inferred.reportsTo || null,
                businessOutcomes: inferred.businessOutcomes || [],
                inferred: true,
                source: 'inference',
            },
            update: {
                title: jobTitle,
                scope: inferred.scope || null,
                responsibilities: inferred.responsibilities || [],
                kpis: inferred.kpis || [],
                successCriteria: inferred.successCriteria || [],
                reportsTo: inferred.reportsTo || null,
                businessOutcomes: inferred.businessOutcomes || [],
                inferred: true,
                confirmedAt: null,
            },
        });

        return NextResponse.json({
            inferred,
            message: 'Review and confirm your responsibilities',
        });
    } catch (error) {
        console.error('[Infer Role] Error:', error);
        return NextResponse.json({ error: 'Failed to infer role' }, { status: 500 });
    }
}

/**
 * PUT /api/onboarding/infer-role
 * Confirm/edit the inferred responsibilities
 */
export async function PUT(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    const body = await req.json();
    const { title, scope, responsibilities, kpis, successCriteria, reportsTo, teamSize, businessOutcomes } = body;

    try {
        const existingId = await getExistingResponsibilityId(userId);

        await prisma.userResponsibility.upsert({
            where: { id: existingId },
            create: {
                userId,
                title: title || 'Unknown',
                scope: scope || null,
                responsibilities: responsibilities || [],
                kpis: kpis || [],
                successCriteria: successCriteria || [],
                reportsTo: reportsTo || null,
                teamSize: teamSize || null,
                businessOutcomes: businessOutcomes || [],
                inferred: false,
                confirmedAt: new Date(),
                source: 'manual',
            },
            update: {
                title: title || undefined,
                scope: scope || null,
                responsibilities: responsibilities || [],
                kpis: kpis || [],
                successCriteria: successCriteria || [],
                reportsTo: reportsTo || null,
                teamSize: teamSize || null,
                businessOutcomes: businessOutcomes || [],
                inferred: false,
                confirmedAt: new Date(),
            },
        });

        // Also update BusinessContext with relevant data
        await prisma.businessContext.upsert({
            where: { userId },
            create: {
                userId,
                reportingTo: reportsTo || null,
                teamSize: teamSize || null,
                directReports: teamSize || null,
                strategicPriorities: (businessOutcomes || []).map((o: { title: string }) => o.title),
            },
            update: {
                reportingTo: reportsTo || undefined,
                teamSize: teamSize || undefined,
                directReports: teamSize || undefined,
                strategicPriorities: (businessOutcomes || []).map((o: { title: string }) => o.title),
            },
        });

        // Mark role step complete
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingProgress: true },
        });
        const progress = {
            ...(user?.onboardingProgress as Record<string, boolean> || {}),
            role: true,
            outcomes: (businessOutcomes || []).length > 0,
        };
        await prisma.user.update({
            where: { id: userId },
            data: { onboardingProgress: progress },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Confirm Role] Error:', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}

async function getExistingResponsibilityId(userId: string): Promise<string> {
    const existing = await prisma.userResponsibility.findFirst({
        where: { userId },
        select: { id: true },
    });
    return existing?.id || 'nonexistent-placeholder-id';
}
