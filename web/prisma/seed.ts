import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CORE_SKILLS = [
    // Cluster 1: Self-Leadership
    { name: "Emotional Regulation", slug: "emotional-regulation", cluster: "Self-Leadership" },
    { name: "Impulse Control", slug: "impulse-control", cluster: "Self-Leadership" },
    { name: "Values Integrity", slug: "values-integrity", cluster: "Self-Leadership" },

    // Cluster 2: Communication
    { name: "Executive Clarity", slug: "executive-clarity", cluster: "Communication" },
    { name: "Conflict De-escalation", slug: "conflict-de-escalation", cluster: "Communication" },
    { name: "Storytelling", slug: "storytelling", cluster: "Communication" },

    // Cluster 3: Relationship & Trust
    { name: "Trust Building", slug: "trust-building", cluster: "Relationship & Trust" },
    { name: "Stakeholder Alignment", slug: "stakeholder-alignment", cluster: "Relationship & Trust" },
    { name: "Active Empathy", slug: "active-empathy", cluster: "Relationship & Trust" },

    // Cluster 4: Team Leadership
    { name: "Delegation", slug: "delegation", cluster: "Team Leadership" },
    { name: "Feedback", slug: "feedback", cluster: "Team Leadership" },

    // Cluster 5: Decision & Execution
    { name: "Prioritization", slug: "prioritization", cluster: "Decision & Execution" },
    { name: "Crisis Containment", slug: "crisis-containment", cluster: "Decision & Execution" },

    // Cluster 6: Strategy & Systems
    { name: "Framing", slug: "framing", cluster: "Strategy & Systems" },
    { name: "Phase Shift Recognition", slug: "phase-shift", cluster: "Strategy & Systems" },

    // Cluster 7: Influence
    { name: "Influence without Authority", slug: "influence", cluster: "Influence & Negotiation" },
    { name: "Coalition Building", slug: "coalition-building", cluster: "Influence & Negotiation" },
    { name: "Partner Authority (Not a Vendor)", slug: "partner-authority", cluster: "Influence & Negotiation" },
    { name: "Strategic Framing", slug: "strategic-framing", cluster: "Influence & Negotiation" },

    // Cluster 8: Institutional
    { name: "Institutional Stewardship", slug: "institutional-stewardship", cluster: "Institutional Thinking" },
    { name: "Inertia Breaking", slug: "inertia-breaking", cluster: "Institutional Thinking" },

    // Cluster 9: Care-Offer Design (New Core)
    { name: "Care Diagnosis (Battles & Position)", slug: "care-diagnosis", cluster: "Care-Offer Design" },
    { name: "Offer Positioning", slug: "offer-positioning", cluster: "Care-Offer Design" },
];

const SEED_CASES = [
    // Phase 1 Cases
    {
        title: "The Angry Minister",
        slug: "angry-minister",
        description: "Managing impulse control when publically challenged by a senior official.",
        cluster: "Self-Leadership",
        skills: ["emotional-regulation", "impulse-control"],
        isCore: true,
    },
    {
        title: "The Unethical Request",
        slug: "unethical-request",
        description: "Values-based refusal of a donor/lobbyist.",
        cluster: "Self-Leadership",
        skills: ["values-integrity"],
        isCore: true,
    },
    {
        title: "The Leaked Memo",
        slug: "leaked-memo",
        description: "Writing a crisis communiqué with executive clarity.",
        cluster: "Communication",
        skills: ["executive-clarity", "crisis-containment"],
        isCore: true,
    },
    // Phase 2
    {
        title: "The Skeptical Partner",
        slug: "skeptical-partner",
        description: "Building trust with a suspicious external agency.",
        cluster: "Relationship & Trust",
        skills: ["trust-building", "stakeholder-alignment"],
        isCore: true,
    },
    {
        title: "The Listener's Trap",
        slug: "listeners-trap",
        description: "A high-stakes negotiation where success depends on hearing what is NOT said. (Empathy Drill).",
        cluster: "Relationship & Trust",
        skills: ["active-empathy"],
        isCore: true,
    },
    {
        title: "The Micromanager's Trap",
        slug: "micromanager-trap",
        description: "Delegating a high-stakes project to a junior lead.",
        cluster: "Team Leadership",
        skills: ["delegation", "feedback"],
        isCore: true,
    },
    // Phase 3 - Gov Specific
    {
        title: "The Vendor Trap",
        slug: "vendor-trap",
        description: "A Principal Secretary treats you like a service provider. Re-frame the dynamic to 'Equal Partner' without losing access.",
        cluster: "Influence & Negotiation",
        skills: ["partner-authority", "influence"],
        isCore: true,
    },
    {
        title: "The Infinite Delay",
        slug: "infinite-delay",
        description: "The project has stalled in 'Review' for 6 months. Diagnose the political inertia and find the lever to move it.",
        cluster: "Institutional Thinking",
        skills: ["inertia-breaking", "institutional-stewardship"],
        isCore: true,
    },
    {
        title: "The Reluctant Champion",
        slug: "reluctant-champion",
        description: "Converting a passive, risk-averse stakeholder into an active project champion.",
        cluster: "Influence & Negotiation",
        skills: ["coalition-building", "stakeholder-alignment"],
        isCore: true,
    },
    {
        title: "The Narrative War",
        slug: "narrative-war",
        description: "A pure drill on Re-framing. You are being attacked on 'Cost'. Pivot the frame to 'National Sovereignty' to win the room.",
        cluster: "Influence & Negotiation",
        skills: ["strategic-framing", "influence"],
        isCore: true,
    },
    // Phase 3 - Care-Offer
    {
        title: "The Mismatched Proposal",
        slug: "mismatched-proposal",
        description: "Your detailed technical proposal is rejected. Diagnose the CFO's true 'Care' (Risk/Reputation) and re-frame the 'Offer'.",
        cluster: "Care-Offer Design",
        skills: ["care-diagnosis", "offer-positioning"],
        isCore: true,
    },
    {
        title: "The Hidden Battle",
        slug: "hidden-battle",
        description: "A customer is delaying signing. Uncover the internal battle they are fighting that makes your offer risky for them.",
        cluster: "Care-Offer Design",
        skills: ["care-diagnosis", "stakeholder-alignment"],
        isCore: true,
    },
    {
        title: "The Inner Circle",
        slug: "inner-circle-network",
        description: "A course on cultivating influence with powerful stakeholders not by asking for favors, but by diagnosing their cares and adding asymmetric value.",
        cluster: "Relationship & Trust",
        skills: ["trust-building", "coalition-building", "stakeholder-alignment"],
        isCore: false,
    },
    {
        title: "The Competent Leader's Dilemma",
        slug: "competent-leader-power",
        description: "Despite high competence, you struggle to command respect. This drill focuses on altering micro-behaviors—pacing of speech, demonstrating strategic empathy, and resisting the urge to sprint to solutions—to project grounded authority.",
        cluster: "Self-Leadership",
        skills: ["executive-clarity", "active-empathy", "emotional-regulation"],
        isCore: false,
    },
];

async function main() {
    console.log('Seeding skills...');
    try {
        for (const skill of CORE_SKILLS) {
            // @ts-ignore
            await prisma.skill.upsert({
                where: { slug: skill.slug },
                update: {},
                create: skill,
            });
        }
    } catch (e) {
        console.warn("Skill model might be missing if client not generated", e);
    }

    console.log('Seeding cases...');
    const curator = await prisma.user.upsert({
        where: { email: 'curator@example.com' },
        update: {},
        create: {
            email: 'curator@example.com',
            name: 'Chief Curator',
            role: 'ADMIN'
        }
    });

    for (const c of SEED_CASES) {
        // 1. Check if case exists to avoid dupes in this script run
        const existing = await prisma.case.findUnique({ where: { slug: c.slug } });
        if (existing) {
            console.log(`Case ${c.slug} already exists, skipping.`);
            continue;
        }

        // 2. Create Shell
        const newCase = await prisma.case.create({
            data: {
                title: c.title,
                slug: c.slug,
                description: c.description,
                cluster: c.cluster,
                skills: c.skills ?? [],
                isCore: c.isCore,
            }
        });

        // 3. Create Version
        // @ts-ignore
        const version = await prisma.caseVersion.create({
            data: {
                caseId: newCase.id,
                version: 1,
                status: 'PUBLISHED',
                createdBy: curator.id,
                content: {
                    meta: {
                        country: "Papua New Guinea",
                        role: "Advisor",
                        difficulty: "Medium"
                    },
                    context: {
                        description: c.description,
                        stakeholders: []
                    },
                    rounds: [
                        {
                            id: "r1",
                            type: "opening",
                            title: "The Situation",
                            description: "You have just arrived...",
                            options: []
                        }
                    ]
                }
            }
        });

        // 4. Link
        await prisma.case.update({
            where: { id: newCase.id },
            data: {
                currentVersionId: version.id
            }
        });
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
