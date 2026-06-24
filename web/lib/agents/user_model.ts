import { prisma } from '@/lib/db';

// Type for the Delta Evidence
interface SkillEvidence {
    [skillSlug: string]: number; // e.g., "emotional-regulation": 0.5
}

/**
 * The Psychologist Agent
 * Updates user skill mastery based on evidence from a completed case session.
 */
export async function updateUserSkills(userId: string, caseProgressId: string) {

    // 1. Fetch the Progress and Evidence
    const progress = await prisma.caseProgress.findUnique({
        where: { id: caseProgressId },
        include: { user: true }
    });

    if (!progress || !progress.completed || !progress.skillDelta) {
        console.warn(`[UserModeling] No valid evidence found for progress ${caseProgressId}`);
        return;
    }

    const evidence = progress.skillDelta as SkillEvidence;
    const updates = [];

    // 2. Process each skill update
    for (const [slug, delta] of Object.entries(evidence)) {
        // Find the skill ID by slug
        const skill = await prisma.skill.findUnique({ where: { slug } });
        if (!skill) {
            console.warn(`[UserModeling] Unknown skill slug: ${slug}`);
            continue;
        }

        // Upsert the UserSkill
        // Logic: New Level = Current Level + (Delta * LearningRate)
        // For now, we just add the delta directly, clamped 0-5.

        const current = await prisma.userSkill.findUnique({
            where: { userId_skillId: { userId, skillId: skill.id } }
        });

        let newLevel = (current?.level || 0) + delta;

        // Clamp between 0 and 5
        newLevel = Math.max(0, Math.min(5, newLevel));

        // Update Confidence (simple increment for now)
        let newConfidence = (current?.confidence || 0) + 0.1;
        newConfidence = Math.min(1, newConfidence);

        const update = await prisma.userSkill.upsert({
            where: { userId_skillId: { userId, skillId: skill.id } },
            create: {
                userId,
                skillId: skill.id,
                level: newLevel,
                confidence: 0.1,
                lastUpdated: new Date()
            },
            update: {
                level: newLevel,
                confidence: newConfidence,
                lastUpdated: new Date()
            }
        });

        updates.push(update);
    }

    console.log(`[UserModeling] Updated ${updates.length} skills for User ${userId}`);
    return updates;
}

/**
 * Helper to get the full Skill Graph for a user
 */
export async function getUserSkillGraph(userId: string) {
    return prisma.userSkill.findMany({
        where: { userId },
        include: { skill: true }
    });
}
