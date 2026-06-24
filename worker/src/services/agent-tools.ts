/**
 * Agent Tools Service
 *
 * Defines and executes tools that the AI agent can call via Gemini function calling.
 * Each tool wraps existing API functionality to be invoked by the LLM.
 */

import { prisma } from '../lib/prisma';
import { publishSystemEvent } from '../lib/pusher';
import { calendarSyncAgent } from '../agents/calendar-sync';
import { emailSyncAgent } from '../agents/email-sync';
import { driveSyncAgent } from '../agents/drive-sync';

// Tool definitions for Gemini function calling
export const AGENT_TOOLS = [
    {
        name: "sync_calendar",
        description: "Synchronize the user's Google Calendar to fetch upcoming meetings and update stakeholder profiles. Use this when the user asks to sync, refresh, or update their calendar data.",
        parameters: {
            type: "object" as const,
            properties: {},
            required: [] as string[]
        }
    },
    {
        name: "sync_email",
        description: "Synchronize the user's Gmail inbox to fetch recent email threads and update stakeholder profiles. Use this when the user asks to sync, refresh, or check their emails.",
        parameters: {
            type: "object" as const,
            properties: {},
            required: [] as string[]
        }
    },
    {
        name: "sync_drive",
        description: "Synchronize the user's Google Drive documents to get recent work context. Syncs documents modified in the last 30 days. Use this when the user asks about what they've been working on, wants to sync their documents, or needs context from their recent work.",
        parameters: {
            type: "object" as const,
            properties: {},
            required: [] as string[]
        }
    },
    {
        name: "get_upcoming_meetings",
        description: "Get the user's upcoming calendar meetings for the next few days. Use this to help the user prepare for meetings or understand their schedule.",
        parameters: {
            type: "object" as const,
            properties: {
                days: {
                    type: "number",
                    description: "Number of days ahead to look (default: 7)"
                }
            },
            required: [] as string[]
        }
    },
    {
        name: "create_goal",
        description: "Create a new goal for the user. Use this when the user expresses a clear goal they want to track.",
        parameters: {
            type: "object" as const,
            properties: {
                description: {
                    type: "string",
                    description: "The goal description"
                },
                magnitude: {
                    type: "string",
                    enum: ["CAREER", "QUARTERLY", "PROJECT", "TASK"],
                    description: "The scope/size of the goal"
                },
                deadline: {
                    type: "string",
                    description: "Optional deadline in ISO date format"
                }
            },
            required: ["description", "magnitude"]
        }
    },
    {
        name: "add_stakeholder",
        description: "Add or update a stakeholder profile. Use this when the user mentions an important person in their work context.",
        parameters: {
            type: "object" as const,
            properties: {
                name: {
                    type: "string",
                    description: "The stakeholder's name"
                },
                email: {
                    type: "string",
                    description: "The stakeholder's email address"
                },
                role: {
                    type: "string",
                    description: "The stakeholder's job role/title"
                },
                influenceLevel: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "How much influence this person has"
                },
                stanceOnProjects: {
                    type: "string",
                    enum: ["supportive", "neutral", "resistant"],
                    description: "Their general stance on your projects"
                }
            },
            required: ["name"]
        }
    },
    {
        name: "get_stakeholders",
        description: "Get the user's known stakeholders. Use this to understand who the user works with.",
        parameters: {
            type: "object" as const,
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum number of stakeholders to return (default: 10)"
                }
            },
            required: [] as string[]
        }
    },
    {
        name: "get_goals",
        description: "Get the user's active goals. Use this to understand what the user is working towards.",
        parameters: {
            type: "object" as const,
            properties: {
                includeCompleted: {
                    type: "boolean",
                    description: "Whether to include completed goals (default: false)"
                }
            },
            required: [] as string[]
        }
    }
];

// Tool execution functions
export async function executeTool(
    toolName: string,
    args: Record<string, any>,
    userId: string
): Promise<{ success: boolean; result: any; error?: string }> {
    console.log(`[AgentTools] Executing tool: ${toolName}`, args);

    try {
        switch (toolName) {
            case "sync_calendar":
                return await syncCalendar(userId);

            case "sync_email":
                return await syncEmail(userId);

            case "sync_drive":
                return await syncDrive(userId);

            case "get_upcoming_meetings":
                return await getUpcomingMeetings(userId, args.days || 7);

            case "create_goal":
                return await createGoal(userId, args.description, args.magnitude, args.deadline);

            case "add_stakeholder":
                return await addStakeholder(userId, args.name, args.email, args.role, args.influenceLevel, args.stanceOnProjects);

            case "get_stakeholders":
                return await getStakeholders(userId, args.limit || 10);

            case "get_goals":
                return await getGoals(userId, args.includeCompleted || false);

            default:
                return { success: false, result: null, error: `Unknown tool: ${toolName}` };
        }
    } catch (error: any) {
        console.error(`[AgentTools] Tool execution error:`, error);
        return { success: false, result: null, error: error.message };
    }
}

// Calendar Sync - execute immediately with real-time progress updates
async function syncCalendar(userId: string): Promise<{ success: boolean; result: any; error?: string }> {
    try {
        // Execute calendar sync directly (it handles its own Pusher notifications)
        const result = await calendarSyncAgent(userId);

        if (result.errors.length > 0) {
            return {
                success: false,
                result: null,
                error: result.errors.join(', ')
            };
        }

        return {
            success: true,
            result: {
                message: `Calendar sync complete. ${result.synced} events synced, ${result.newStakeholders} new contacts discovered.`,
                synced: result.synced,
                created: result.created,
                updated: result.updated,
                newStakeholders: result.newStakeholders
            }
        };
    } catch (error: any) {
        return { success: false, result: null, error: error.message };
    }
}

// Email Sync - execute immediately with real-time progress updates
async function syncEmail(userId: string): Promise<{ success: boolean; result: any; error?: string }> {
    try {
        // Execute email sync directly (it handles its own Pusher notifications)
        const result = await emailSyncAgent(userId);

        if (result.errors.length > 0) {
            return {
                success: false,
                result: null,
                error: result.errors.join(', ')
            };
        }

        return {
            success: true,
            result: {
                message: `Email sync complete. ${result.synced} threads synced.`,
                synced: result.synced,
                created: result.created,
                updated: result.updated
            }
        };
    } catch (error: any) {
        return { success: false, result: null, error: error.message };
    }
}

// Drive Sync - execute immediately with real-time progress updates
async function syncDrive(userId: string): Promise<{ success: boolean; result: any; error?: string }> {
    try {
        // Execute drive sync directly (it handles its own Pusher notifications)
        const result = await driveSyncAgent(userId);

        if (result.errors.length > 0) {
            return {
                success: false,
                result: null,
                error: result.errors.join(', ')
            };
        }

        return {
            success: true,
            result: {
                message: `Drive sync complete. ${result.synced} documents synced (${result.created} new, ${result.updated} updated).`,
                synced: result.synced,
                created: result.created,
                updated: result.updated
            }
        };
    } catch (error: any) {
        return { success: false, result: null, error: error.message };
    }
}

// Get upcoming meetings from the synced data
async function getUpcomingMeetings(userId: string, days: number): Promise<{ success: boolean; result: any; error?: string }> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const meetings = await prisma.meetingSyncRecord.findMany({
        where: {
            userId,
            startTime: {
                gte: now,
                lte: futureDate
            }
        },
        orderBy: { startTime: 'asc' },
        take: 20
    });

    return {
        success: true,
        result: {
            count: meetings.length,
            meetings: meetings.map(m => ({
                title: m.title,
                startTime: m.startTime,
                endTime: m.endTime,
                participants: m.participants,
                meetingType: m.meetingType,
                location: m.location
            }))
        }
    };
}

// Create a goal
async function createGoal(
    userId: string,
    description: string,
    magnitude: string,
    deadline?: string
): Promise<{ success: boolean; result: any; error?: string }> {
    const goal = await prisma.goal.create({
        data: {
            userId,
            description,
            magnitude: magnitude as any,
            deadline: deadline ? new Date(deadline) : null,
            status: 'ACTIVE'
        }
    });

    // Notify user about the new goal
    await publishSystemEvent(userId, {
        type: 'goal_created',
        message: `🎯 New goal created: "${description}"`,
        data: { goalId: goal.id, magnitude: goal.magnitude }
    });

    return {
        success: true,
        result: {
            message: `Goal created: "${description}"`,
            goalId: goal.id,
            magnitude: goal.magnitude
        }
    };
}

// Add or update stakeholder
async function addStakeholder(
    userId: string,
    name: string,
    email?: string,
    role?: string,
    influenceLevel?: string,
    stanceOnProjects?: string
): Promise<{ success: boolean; result: any; error?: string }> {
    // Generate email if not provided (required for unique constraint)
    const stakeholderEmail = email || `${name.toLowerCase().replace(/\s+/g, '.')}@placeholder.local`;

    const stakeholder = await prisma.stakeholderProfile.upsert({
        where: { userId_email: { userId, email: stakeholderEmail } },
        create: {
            userId,
            name,
            email: stakeholderEmail,
            role,
            influenceLevel,
            stanceOnProjects,
            lastInteraction: new Date(),
            interactionCount: 1
        },
        update: {
            name,
            ...(role && { role }),
            ...(influenceLevel && { influenceLevel }),
            ...(stanceOnProjects && { stanceOnProjects }),
            lastInteraction: new Date()
        }
    });

    // Notify user about the stakeholder
    await publishSystemEvent(userId, {
        type: 'stakeholder_added',
        message: `👤 Stakeholder "${name}" added to your network.`,
        data: { stakeholderId: stakeholder.id, name }
    });

    return {
        success: true,
        result: {
            message: `Stakeholder "${name}" has been added/updated.`,
            stakeholderId: stakeholder.id
        }
    };
}

// Get stakeholders
async function getStakeholders(userId: string, limit: number): Promise<{ success: boolean; result: any; error?: string }> {
    const stakeholders = await prisma.stakeholderProfile.findMany({
        where: { userId },
        orderBy: { lastInteraction: 'desc' },
        take: limit
    });

    return {
        success: true,
        result: {
            count: stakeholders.length,
            stakeholders: stakeholders.map(s => ({
                name: s.name,
                email: s.email,
                role: s.role,
                influenceLevel: s.influenceLevel,
                stanceOnProjects: s.stanceOnProjects,
                lastInteraction: s.lastInteraction,
                interactionCount: s.interactionCount
            }))
        }
    };
}

// Get goals
async function getGoals(userId: string, includeCompleted: boolean): Promise<{ success: boolean; result: any; error?: string }> {
    const where: any = { userId };
    if (!includeCompleted) {
        where.status = { not: 'COMPLETED' };
    }

    const goals = await prisma.goal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    return {
        success: true,
        result: {
            count: goals.length,
            goals: goals.map(g => ({
                id: g.id,
                description: g.description,
                magnitude: g.magnitude,
                status: g.status,
                deadline: g.deadline,
                createdAt: g.createdAt
            }))
        }
    };
}
