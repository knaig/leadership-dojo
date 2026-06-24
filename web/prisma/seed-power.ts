import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPETENT_LEADER_CASE = {
    title: "The Competent Leader's Dilemma",
    slug: "competent-leader-power",
    description: "Despite high competence, you struggle to command respect. This drill focuses on altering micro-behaviors—pacing of speech, demonstrating strategic empathy, and resisting the urge to sprint to solutions—to project grounded authority.",
    cluster: "Self-Leadership",
    skills: ["executive-clarity", "active-empathy", "emotional-regulation"],
    isCore: false,
};

const COMPETENT_LEADER_VERSION = {
    version: 1,
    status: 'PUBLISHED',
    content: {
        meta: {
            country: "Global",
            role: "Senior Director",
            difficulty: "Hard"
        },
        context: {
            description: "You are a highly competent Senior Director. You recently presented a bulletproof strategic plan to the VP group. However, instead of validating your plan, the VPs got bogged down in minor details, talked over you, and ultimately deferred the decision to someone with less domain expertise but more 'executive presence'. You are losing your power in the room because you are perceived as a 'doer' rather than a 'leader'. Today, you have a 1-on-1 with the SVP to recover the situation. You tend to speak fast when passionate, skip pleasantries to 'get to the point', and get frustrated when people don't immediately grasp the logic.",
            stakeholders: [
                {
                    id: "sh1",
                    name: "Sarah (SVP)",
                    role: "Senior Vice President",
                    disposition: "Results-oriented, values confident pacing and grounded authority over anxious competence."
                }
            ]
        },
        rounds: [
            {
                id: "r1",
                type: "opening",
                title: "The Check-In",
                description: "You walk into Sarah's office. She looks up from her laptop, clearly stressed. 'I've only got 10 minutes. What's the status on the Q3 plan after yesterday's disaster?' \n\nYour instinct is to immediately defend the plan and explain why the other VPs were wrong, speaking quickly to fit it all into the 10 minutes.",
                options: [
                    {
                        id: "opt1_1",
                        text: "(Fast pace) 'The plan is completely sound, Sarah. The VPs didn't understand the financial models on slide 4. If we just execute the three-phase rollout I proposed, we will hit our targets. Here are the numbers again...'",
                        analysis: "You are sprinting to the solution over-anxiously. Speaking fast when challenged signals low status and defensiveness. You are ignoring her emotional state (stressed).",
                        feedback: "Too fast, too defensive. You correctly diagnosed the math problem, but failed the power dynamic test. Sarah needs a peer, not an anxious analyst.",
                        outcome: {
                            trustImpact: -20,
                            powerShift: "Loss",
                            nextRoundId: "r2_weak"
                        }
                    },
                    {
                        id: "opt1_2",
                        text: "(Slow, grounded pace) Pause for 2 seconds. 'It wasn't our best showing. Before we dive into the Q3 recovery... you seem like you're dealing with a few fires today. Do you need a minute before we shift gears to this?'",
                        analysis: "This projects immense executive presence. By pausing and speaking slowly, you signal you are not intimidated by her time pressure. By noting her stress (strategic empathy), you position yourself as a peer who can handle her reality, rather than a subordinate seeking validation.",
                        feedback: "Excellent. Slowing down your pacing under pressure is a core power move. Showing empathy upward builds peer-level respect. People respect those who aren't desperate for their approval.",
                        outcome: {
                            trustImpact: 20,
                            powerShift: "Gain",
                            nextRoundId: "r2_strong"
                        }
                    },
                    {
                        id: "opt1_3",
                        text: "(Moderate pace) 'The VPs raised some fair points, but the core strategy holds. I've already revised the implementation timeline to address their concerns. Take a look at this updated deck.'",
                        analysis: "Competent, but submissive. You are still rushing to 'solve' the problem and prove your worth by doing more work. It cements your reputation as the person who fixes things, not the person who leads.",
                        feedback: "You're acting like a competent manager, but not a powerful leader. You bypassed the emotional dynamic of the room entirely.",
                        outcome: {
                            trustImpact: 0,
                            powerShift: "Neutral",
                            nextRoundId: "r2_neutral"
                        }
                    }
                ]
            },
            {
                id: "r2_strong",
                type: "dilemma",
                title: "The Peer Test",
                description: "Sarah exhales and closes her laptop. 'Thanks. Rough morning with the Board. Look, your Q3 plan is technically brilliant. But you lost the room yesterday. People don't feel like you're listening to them, you just fire data at them. How are you going to fix this?'",
                options: [
                    {
                        id: "opt2_1",
                        text: "'I'll set up 1-on-1s with each VP today, walk them through the logic slowly, and make sure I answer all their technical questions so they get comfortable.'",
                        analysis: "You fall back on your competence trap. You think the problem is they don't understand the work. The problem is they don't feel respected by *you*.",
                        feedback: "You missed the core issue. Information delivery is not influence. You are still treating them like a math equation.",
                        outcome: {
                            trustImpact: -15,
                            powerShift: "Loss",
                            nextRoundId: "r3_fail"
                        }
                    },
                    {
                        id: "opt2_2",
                        text: "Pause. 'You're right. I let my frustration that they weren't grasping the strategy cause me to bulldoze them. I need to slow down, ask for their input earlier, and let them feel ownership over the pieces they care about. I'll start with John.'",
                        analysis: "Perfect alignment. You take extreme ownership without being defensive. You name the exact behavioral fix (slowing down, building empathy, sharing ownership). This is what powerful people do.",
                        feedback: "You demonstrated high emotional regulation and situational awareness. You diagnosed your own behavior correctly without being defensive.",
                        outcome: {
                            trustImpact: 25,
                            powerShift: "Gain",
                            nextRoundId: "r3_success"
                        }
                    }
                ]
            },
            {
                id: "r3_success",
                type: "closing",
                title: "Grounded Authority",
                description: "Sarah nods slowly. 'Exactly. They don't care how much you know until they know how much you care. If you can control your pacing in the room like you just did right now with me... you'll run this whole division.'",
                options: [
                    {
                        id: "opt3_end",
                        text: "Complete Case",
                        analysis: "Power is not just competence. It is pacing, emotional regulation, and making others feel seen (empathy). Never rush to prove you are right.",
                        feedback: "You successfully projected executive presence by slowing down, using strategic empathy, and resisting the urge to over-explain.",
                        outcome: {
                            trustImpact: 0,
                            powerShift: "Neutral",
                            nextRoundId: null
                        }
                    }
                ]
            }
        ]
    }
};

async function main() {
    console.log('Seeding Competent Leader Dilemma case...');

    // Create or find case
    const caseData = await prisma.case.upsert({
        where: { slug: COMPETENT_LEADER_CASE.slug },
        update: COMPETENT_LEADER_CASE,
        create: COMPETENT_LEADER_CASE,
    });

    const curator = await prisma.user.upsert({
        where: { email: 'curator@example.com' },
        update: {},
        create: {
            email: 'curator@example.com',
            name: 'Chief Curator',
            role: 'ADMIN'
        }
    });

    // Create version
    const version = await prisma.caseVersion.upsert({
        where: {
            caseId_version: {
                caseId: caseData.id,
                version: 1,
            }
        },
        update: {
            status: 'PUBLISHED',
            content: COMPETENT_LEADER_VERSION.content
        },
        create: {
            caseId: caseData.id,
            version: 1,
            status: 'PUBLISHED',
            createdBy: curator.id,
            content: COMPETENT_LEADER_VERSION.content
        }
    });

    // Link version
    await prisma.case.update({
        where: { id: caseData.id },
        data: {
            currentVersionId: version.id
        }
    });

    console.log('Successfully seeded Competent Leader case.');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    });
