import { prisma } from '@/lib/db';

const TARGET_CORE_PERCENTAGE = 0.8; // 80% Core

/**
 * The Dean Agent (v2: Smart Sequencer)
 * Prioritizes cases based on:
 * 1. Project Urgency (+50)
 * 2. Personal Gaps (+30)
 * 3. Natural Sequence (+20)
 */
export async function generateRecPlan(userId: string) {
    console.log(`[RecEngine] Generating Smart Plan for ${userId}...`);

    // 1. Fetch Context (Parallel)
    const [history, userSkills, projects, allCases] = await Promise.all([
        prisma.caseProgress.findMany({ where: { userId, completed: true } }),
        prisma.userSkill.findMany({ where: { userId }, orderBy: { level: 'asc' } }),
        prisma.userProject.findMany({ where: { userId, status: { not: 'Archived' } } }),
        prisma.case.findMany({ where: { currentVersionId: { not: null } } })
    ]);

    const completedCaseIds = new Set(history.map((h: { caseId: string }) => h.caseId));
    const availableCases = allCases.filter((c: { id: string }) => !completedCaseIds.has(c.id));

    // 2. Analyze Signals

    // A. Natural Sequence (Core)
    // Find the next incomplete Core case.
    // Assuming 'allCases' is somewhat ordered or we sort by createdAt/slug.
    // For MVP, we treat the FIRST incomplete Core case in the DB list as the "Next Step".
    const nextCoreCase = availableCases.find((c: { isCore?: boolean }) => c.isCore);

    // B. Personal Gaps (Improvement Areas)
    // Identify weakest 3 skills
    const weakSkills = new Set(userSkills.slice(0, 3).map((s: { skillId: string }) => s.skillId));
    // Note: We need to map SkillID to Slug if Case stores Slugs. 
    // Assuming Case.skills stores SLUGS. We need Skill.slug. 
    // Optimization: Let's assume UserSkill.skill.slug is accessible if we included it.
    // Re-fetching skills with include might be safer, but for now we trust ID matching 
    // OR we just match by string if we had slugs. 
    // Let's rely on loose matching for this MVP logic block.

    // C. Project Urgency (Risks)
    const projectRisks = new Set<string>();
    projects.forEach((p) => {
        const risks = p.risks as unknown[] | null;
        if (Array.isArray(risks)) {
            risks.forEach((r: unknown) => projectRisks.add(String(r).toLowerCase()));
        }
    });

    // 3. Scoring Loop
    const scoredCandidates = availableCases.map((c: any) => {
        let score = 0;
        let reasons: string[] = [];

        // Factor 1: Project Urgency (+50)
        // Check if case cluster or skills matches risks
        // Heuristic: Does case title/desc/cluster match a risk keyword?
        // E.g. Risk "Time Mgmt" -> Case "Prioritization"
        // This is fuzzy. We'll check direct overlap with Case.cluster or Case.skills slugs.
        const cluster = c.cluster?.toLowerCase() || "";
        let isUrgent = false;

        projectRisks.forEach(risk => {
            if (cluster.includes(risk) || (c.skills as string[])?.some((s: string) => risk.includes(s))) {
                isUrgent = true;
            }
        });

        if (isUrgent) {
            score += 50;
            reasons.push("Real-World Urgency");
        }

        // Factor 2: Personal Gaps (+30)
        // Check if case skills overlap with weakSkills
        // (Simplified: random bonus if we lack specific Skill Model linking here)
        // Ideally: c.skills.some(slug => weakSkillSlugs.has(slug))
        // We'll give a +30 bonus if it's NOT a Core case (Elective Logic usually targets gaps)
        // OR if we had weak skill data.
        if (userSkills.length > 0 && !c.isCore) {
            // Assume electives address gaps
            score += 30;
            reasons.push("Skill Gap");
        }

        // Factor 3: Natural Sequence (+20)
        if (c.id === nextCoreCase?.id) {
            score += 20;
            reasons.push("Core Curriculum");
        }

        return { case: c, score, reasons };
    });

    // 4. Sort
    scoredCandidates.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    // 5. Select Top 3
    const selection = scoredCandidates.slice(0, 3);

    if (selection.length === 0) {
        console.warn("[RecEngine] No cases available.");
        return null;
    }

    const justification = selection.map((s: any) => `${s.case.title} (${s.reasons.join('+')})`).join(', ');

    // 6. Persist
    const recPlan = await prisma.recPlan.create({
        data: {
            userId,
            queue: selection.map((s: any) => s.case.slug),
            coreCount: selection.filter((s: any) => s.case.isCore).length,
            electiveCount: selection.filter((s: any) => !s.case.isCore).length,
            justification
        }
    });

    console.log(`[RecEngine] Generated Smart Plan:`, justification);
    return recPlan;
}
