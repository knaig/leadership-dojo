'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { CourseNode, NodeStatus } from '@/lib/course/CourseContext';

// Hardcoded curriculum map for now (The "Golden Path")
// In Phase 3 (Content Engine), this will come from the DB too.
const CURRICULUM_NODES = [
    { id: 'intro', title: 'Onboarding', type: 'milestone' as const, x: 10, y: 50 },
    { id: 'png_digital_id', title: 'Papua New Guinea', type: 'case' as const, x: 30, y: 50 },
    { id: 'brazil_case', title: 'Brazil', type: 'case' as const, x: 50, y: 50 }, // Placeholder
    { id: 'reflection_1', title: 'First Reflection', type: 'reflection' as const, x: 70, y: 50 },
    { id: 'cert_l1', title: 'Level 1 Complete', type: 'milestone' as const, x: 90, y: 50 },
];

export async function getUserProgress() {
    const session = await auth();
    if (!session?.user?.email) return null;

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { progress: true, reflections: true }
    });

    if (!user) return null;

    // Map DB progress to Nodes
    // Logic: 
    // 1. Onboarding is always complete if they are here (logic to be refined)
    // 2. Check CaseProgress for specific IDs
    // 3. Unlock next node if previous is complete

    let nodes: CourseNode[] = CURRICULUM_NODES.map(node => ({
        ...node,
        status: 'locked' as NodeStatus
    }));

    // Logic to determine status
    // For prototype, we unlock the first case.
    nodes[0].status = 'completed'; // Onboarding

    const pngProgress = user.progress.find(p => p.caseId === 'png_digital_id');

    if (pngProgress?.completed) {
        nodes[1].status = 'completed';
        nodes[2].status = 'active'; // Unlock Brazil
    } else {
        nodes[1].status = 'active'; // PNG is current
    }

    return {
        currentLevel: 1, // TODO: Calc from User field
        nodes
    };
}
