import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INNER_CIRCLE_CASES = [
    {
        title: "Module 1: Diagnosing the Care",
        slug: "inner-circle-module-1",
        description: "Before you can build an alliance with a powerful person, you must first diagnose what they actually care about right now, not just what their job title is.",
        cluster: "Relationship Capital",
        skills: ["strategic-empathy", "stakeholder-mapping"],
        isCore: false,
        version: {
            version: 1,
            status: 'PUBLISHED',
            content: {
                meta: { country: "Global", role: "Director", difficulty: "Medium" },
                context: {
                    description: "You have been trying to get face time with Marcus, the new VP of Product, to align his team with yours. He has dodged your last three calendar invites. You just bumped into him by the coffee machine.",
                    stakeholders: [{ id: "sh1", name: "Marcus", role: "VP of Product", disposition: "Overwhelmed, defensive about his new mandate." }]
                },
                rounds: [
                    {
                        id: "r1",
                        type: "opening",
                        title: "The Coffee Machine Ambush",
                        description: "Marcus looks exhausted. 'Hey, sorry I haven't accepted that meeting. We're completely buried in the Q4 platform migration right now. What did you need to align on?'",
                        options: [
                            {
                                id: "opt1",
                                text: "'No worries! I just wanted 15 minutes to show you how our team's new marketing initiative can help drive user adoption for the platform once it launches.'",
                                analysis: "You just gave him more work in the future. He is drowning in the present.",
                                feedback: "You completely missed his 'Care'. He is buried *right now*. Talking about future adoption when he's trying to survive a migration is tone-deaf.",
                                outcome: { trustImpact: -15, powerShift: "Loss", nextRoundId: null }
                            },
                            {
                                id: "opt2",
                                text: "'The platform migration sounds brutal. Is it the data pipeline that's causing the bottleneck, or the legacy code integration?'",
                                analysis: "You ignored your own agenda to diagnose *his* pain point. Powerful people build networks by helping other powerful people solve their immediate problems.",
                                feedback: "Excellent. You pivoted immediately from what *you* want (alignment) to what *he* cares about (the migration).",
                                outcome: { trustImpact: 20, powerShift: "Gain", nextRoundId: null }
                            }
                        ]
                    }
                ]
            }
        }
    },
    {
        title: "Module 2: The Asymmetric Offer",
        slug: "inner-circle-module-2",
        description: "How to offer value to a powerful stakeholder without asking for anything in return, creating a debt of gratitude.",
        cluster: "Relationship Capital",
        skills: ["value-creation", "influence"],
        isCore: false,
        version: {
            version: 1,
            status: 'PUBLISHED',
            content: {
                meta: { country: "Global", role: "Director", difficulty: "Hard" },
                context: {
                    description: "You discovered that Marcus (VP of Product) is struggling with a legacy database vendor during his migration. Your team happens to have a strong relationship with that vendor's account manager.",
                    stakeholders: [{ id: "sh1", name: "Marcus", role: "VP of Product", disposition: "Stressed about vendor delays." }]
                },
                rounds: [
                    {
                        id: "r1",
                        type: "opening",
                        title: "The Offer",
                        description: "You draft an email to Marcus about the vendor issue.",
                        options: [
                            {
                                id: "opt1",
                                text: "'Hey Marcus, I heard about the vendor delays. I know their account manager well. If you approve our marketing alignment meeting for next week, I can make an intro to help speed things up.'",
                                analysis: "Transactional and low status. You are trying to trade a favor for a meeting.",
                                feedback: "Never make a transactional trade upward. It flags you as a mid-level operator, not an inner-circle peer.",
                                outcome: { trustImpact: -25, powerShift: "Loss", nextRoundId: null }
                            },
                            {
                                id: "opt2",
                                text: "'Hi Marcus - I heard the vendor is dragging their feet. I've worked closely with their VP of Accounts. I just texted him to escalate your ticket. You should see movement today. No need to reply to this.'",
                                analysis: "This is an asymmetric offer. You solved a massive headache for him, asked for absolutely nothing, and relieved him of the burden of even replying.",
                                feedback: "Perfect execution. This is how the inner circle operates. Pure value, zero transaction.",
                                outcome: { trustImpact: 35, powerShift: "Gain", nextRoundId: null }
                            }
                        ]
                    }
                ]
            }
        }
    }
];

async function main() {
    console.log('Seeding Inner Circle cases...');

    const curator = await prisma.user.upsert({
        where: { email: 'curator@example.com' },
        update: {},
        create: {
            email: 'curator@example.com',
            name: 'Chief Curator',
            role: 'ADMIN'
        }
    });

    for (const caseData of INNER_CIRCLE_CASES) {
        const { version: versionData, ...caseMeta } = caseData;

        const existingCase = await prisma.case.upsert({
            where: { slug: caseMeta.slug },
            update: caseMeta,
            create: caseMeta,
        });

        const version = await prisma.caseVersion.upsert({
            where: {
                caseId_version: {
                    caseId: existingCase.id,
                    version: versionData.version
                }
            },
            update: {
                status: 'PUBLISHED',
                content: versionData.content
            },
            create: {
                caseId: existingCase.id,
                version: versionData.version,
                status: 'PUBLISHED',
                createdBy: curator.id,
                content: versionData.content
            }
        });

        await prisma.case.update({
            where: { id: existingCase.id },
            data: { currentVersionId: version.id }
        });
        console.log(`Seeded ${caseData.title}`);
    }
}

main()
    .then(async () => { await prisma.$disconnect() })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
