import { prisma } from '@/lib/db';
import { MissionStatus } from '@prisma/client';

/**
 * Mission Tracker Service
 * Manages practice missions, tracks evidence, validates progress
 */

export interface CreateMissionInput {
    userId: string;
    title: string;
    description: string;
    capacityId: string;
    recommendationId?: string;
    targetScore: number;
    baselineScore: number;
    deadline: Date;
}

export interface LogEvidenceInput {
    missionId: string;
    artifactId: string;
}

export interface ValidateMissionInput {
    missionId: string;
    currentScore: number;
    validationNotes?: string;
}

/**
 * Create a new practice mission for a user
 */
export async function createMission(input: CreateMissionInput) {
    return await prisma.practiceMission.create({
        data: {
            userId: input.userId,
            title: input.title,
            description: input.description,
            capacityId: input.capacityId,
            recommendationId: input.recommendationId,
            targetScore: input.targetScore,
            baselineScore: input.baselineScore,
            deadline: input.deadline,
            status: MissionStatus.ACTIVE,
        },
        include: {
            capacity: true,
            recommendation: true,
        },
    });
}

/**
 * Get all missions for a user
 */
export async function getUserMissions(userId: string, status?: MissionStatus) {
    return await prisma.practiceMission.findMany({
        where: {
            userId,
            ...(status && { status }),
        },
        include: {
            capacity: true,
            recommendation: true,
        },
        orderBy: [
            { status: 'asc' }, // ACTIVE first
            { deadline: 'asc' }, // Soonest deadline first
        ],
    });
}

/**
 * Get a specific mission by ID
 */
export async function getMissionById(missionId: string) {
    return await prisma.practiceMission.findUnique({
        where: { id: missionId },
        include: {
            capacity: true,
            recommendation: true,
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    });
}

/**
 * Start a mission (mark as IN_PROGRESS)
 */
export async function startMission(missionId: string) {
    return await prisma.practiceMission.update({
        where: { id: missionId },
        data: {
            status: MissionStatus.IN_PROGRESS,
            startedAt: new Date(),
        },
        include: {
            capacity: true,
            recommendation: true,
        },
    });
}

/**
 * Log evidence for a mission (add artifact ID)
 */
export async function logEvidence(input: LogEvidenceInput) {
    const mission = await prisma.practiceMission.findUnique({
        where: { id: input.missionId },
    });

    if (!mission) {
        throw new Error('Mission not found');
    }

    // Add artifact ID to the array if not already present
    const updatedArtifactIds = mission.artifactIds.includes(input.artifactId)
        ? mission.artifactIds
        : [...mission.artifactIds, input.artifactId];

    return await prisma.practiceMission.update({
        where: { id: input.missionId },
        data: {
            artifactIds: updatedArtifactIds,
            // Auto-transition to IN_PROGRESS if still ACTIVE
            ...(mission.status === MissionStatus.ACTIVE && {
                status: MissionStatus.IN_PROGRESS,
                startedAt: new Date(),
            }),
        },
        include: {
            capacity: true,
            recommendation: true,
        },
    });
}

/**
 * Complete a mission (mark as COMPLETED, ready for validation)
 */
export async function completeMission(missionId: string) {
    return await prisma.practiceMission.update({
        where: { id: missionId },
        data: {
            status: MissionStatus.COMPLETED,
            completedAt: new Date(),
        },
        include: {
            capacity: true,
            recommendation: true,
        },
    });
}

/**
 * Validate a mission (check if target was achieved)
 */
export async function validateMission(input: ValidateMissionInput) {
    const mission = await prisma.practiceMission.findUnique({
        where: { id: input.missionId },
    });

    if (!mission) {
        throw new Error('Mission not found');
    }

    const scoreChange = input.currentScore - mission.baselineScore;
    const targetAchieved = input.currentScore >= mission.targetScore;

    return await prisma.practiceMission.update({
        where: { id: input.missionId },
        data: {
            currentScore: input.currentScore,
            scoreChange,
            validated: true,
            validatedAt: new Date(),
            validationNotes: input.validationNotes,
            status: targetAchieved ? MissionStatus.VALIDATED : MissionStatus.FAILED,
        },
        include: {
            capacity: true,
            recommendation: true,
        },
    });
}

/**
 * Get mission statistics for a user
 */
export async function getMissionStats(userId: string) {
    const missions = await prisma.practiceMission.findMany({
        where: { userId },
    });

    const stats = {
        total: missions.length,
        active: missions.filter((m) => m.status === MissionStatus.ACTIVE).length,
        inProgress: missions.filter((m) => m.status === MissionStatus.IN_PROGRESS).length,
        completed: missions.filter((m) => m.status === MissionStatus.COMPLETED).length,
        validated: missions.filter((m) => m.status === MissionStatus.VALIDATED).length,
        failed: missions.filter((m) => m.status === MissionStatus.FAILED).length,
        averageScoreChange: 0,
        successRate: 0,
    };

    const validatedMissions = missions.filter((m) => m.validated && m.scoreChange !== null);
    if (validatedMissions.length > 0) {
        stats.averageScoreChange =
            validatedMissions.reduce((sum, m) => sum + (m.scoreChange || 0), 0) / validatedMissions.length;
        stats.successRate = (stats.validated / (stats.validated + stats.failed)) * 100;
    }

    return stats;
}
