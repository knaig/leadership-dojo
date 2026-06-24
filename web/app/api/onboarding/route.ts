import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

// Map relationship labels to power dynamics
const RELATIONSHIP_MAP: Record<string, { powerLevel: 'HIGH' | 'MEDIUM' | 'LOW'; influenceRole: 'DECISION_MAKER' | 'INFLUENCER' | 'GATEKEEPER' | 'END_USER' | 'UNKNOWN' }> = {
    'My manager': { powerLevel: 'HIGH', influenceRole: 'DECISION_MAKER' },
    'My direct report': { powerLevel: 'LOW', influenceRole: 'END_USER' },
    'Peer/colleague': { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    'Cross-functional partner': { powerLevel: 'MEDIUM', influenceRole: 'INFLUENCER' },
    'External/customer': { powerLevel: 'HIGH', influenceRole: 'GATEKEEPER' },
    'Executive sponsor': { powerLevel: 'HIGH', influenceRole: 'DECISION_MAKER' },
};

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ensure User record exists in DB (Clerk creates auth but not DB record)
    await ensureUserExists(userId);

    const body = await req.json();

    // Handle skip
    if (body.skip) {
        await prisma.user.update({
            where: { id: userId },
            data: { onboardingComplete: true }
        });
        return NextResponse.json({ success: true });
    }

    const { jobTitle, company, team, orgBrief, industry, companyStage, kpis, stakeholders, stepOnly } = body;

    try {
        // Get current progress
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingProgress: true },
        });
        const progress: Record<string, boolean> = {
            ...(currentUser?.onboardingProgress as Record<string, boolean> || {}),
        };

        // Update user profile
        const profileData: Record<string, unknown> = {};
        if (jobTitle) profileData.jobTitle = jobTitle;
        if (company) profileData.company = company;
        if (team || industry) profileData.industry = team || industry;
        if (companyStage) profileData.companyStage = companyStage;

        if (jobTitle && company) progress.profile = true;

        // If stepOnly is set, only mark complete + save profile, don't finalize everything
        if (stepOnly) {
            profileData.onboardingProgress = progress;
            await prisma.user.update({
                where: { id: userId },
                data: profileData,
            });
            return NextResponse.json({ success: true, progress });
        }

        profileData.onboardingComplete = true;
        profileData.onboardingProgress = progress;

        await prisma.user.update({
            where: { id: userId },
            data: profileData,
        });

        // Save org brief and team in DomainContext if provided
        if (orgBrief || team) {
            await prisma.domainContext.upsert({
                where: { userId },
                create: {
                    userId,
                    organization: { brief: orgBrief || '', team: team || '' },
                },
                update: {
                    organization: { brief: orgBrief || '', team: team || '' },
                },
            });
        }

        // Create KPIs (legacy support)
        const validKpis = (kpis || []).filter((k: any) => k.name);
        for (let i = 0; i < validKpis.length; i++) {
            const kpi = validKpis[i];
            await prisma.userKPI.create({
                data: {
                    userId,
                    name: kpi.name,
                    description: kpi.target || null,
                    metric: 'completion',
                    targetValue: 100,
                    targetDate: kpi.deadline ? new Date(kpi.deadline) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
                    priority: i + 1,
                    type: 'STRATEGIC',
                    timeframe: 'QUARTERLY',
                    isPersonal: false,
                    status: 'ON_TRACK',
                    confidence: 50
                }
            });
        }

        // Create Stakeholders
        const validStakeholders = (stakeholders || []).filter((s: any) => s.name);
        for (const sh of validStakeholders) {
            const mapping = RELATIONSHIP_MAP[sh.relationship] || { powerLevel: 'MEDIUM', influenceRole: 'UNKNOWN' };

            await prisma.stakeholderProfile.create({
                data: {
                    userId,
                    name: sh.name,
                    email: sh.email || null,
                    role: sh.relationship || null,
                    powerLevel: mapping.powerLevel,
                    influenceRole: mapping.influenceRole,
                    influenceLevel: mapping.powerLevel.toLowerCase(), // keep legacy field in sync
                    validationStatus: 'UNVERIFIED'
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Onboarding error:', error);
        return NextResponse.json({ error: 'Failed to save onboarding data' }, { status: 500 });
    }
}
