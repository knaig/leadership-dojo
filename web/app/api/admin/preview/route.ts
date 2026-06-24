import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';
import { previewPrompt } from '@/lib/prompt-service';

// POST /api/admin/preview — Preview what a user would receive
export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dbUser = await prisma.user.findUnique({ where: { email: user.emailAddresses[0]?.emailAddress } });
    if (!dbUser || (dbUser.role !== 'ADMIN' && dbUser.role !== 'CURATOR')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { templateName, userId, variableOverrides } = body;

    if (!templateName) {
        return NextResponse.json({ error: 'templateName is required' }, { status: 400 });
    }

    // Build sample variables from a real user if provided
    let variables: Record<string, string> = {
        userName: 'Test User',
        voiceRules: '(voice rules would be injected here)',
        relationshipNote: '(relationship note would be injected here)',
        personalBlock: '',
        todaySummary: 'No meetings today.',
        weekSummary: 'No data.',
    };

    if (userId) {
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, jobTitle: true },
        });
        if (targetUser) {
            variables.userName = targetUser.name?.split(' ')[0] || 'there';
            if (targetUser.jobTitle) variables.userJobTitle = targetUser.jobTitle;
        }

        // Get the shared voice rules from DB
        const voiceRules = await prisma.promptTemplate.findFirst({
            where: { name: 'shared-voice-rules', status: 'active' },
        });
        if (voiceRules) variables.voiceRules = voiceRules.content;
    }

    // Apply any overrides from the request
    if (variableOverrides && typeof variableOverrides === 'object') {
        Object.assign(variables, variableOverrides);
    }

    const result = await previewPrompt(templateName, variables, userId || undefined);

    return NextResponse.json(result);
}
