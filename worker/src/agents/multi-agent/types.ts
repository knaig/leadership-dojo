/**
 * Multi-Agent Architecture Types
 *
 * This system uses specialized agents that work together:
 * 1. Router Agent - Determines user intent and orchestrates
 * 2. Context Agent - Retrieves and synthesizes relevant information
 * 3. Action Agent - Executes tools and takes actions
 * 4. Response Agent - Formulates the final user-facing response
 */

export interface AgentContext {
    userId: string;
    userName: string;
    userJobTitle: string;
    message: string;
    conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}

// Router Agent Output
export type ConversationChannel = 'OUTCOMES' | 'DEVILS_ADVOCATE' | 'SKILL_BUILDING' | 'PERSONAL' | 'GENERAL';

export interface RouterDecision {
    intent: UserIntent;
    channel: ConversationChannel;
    entities: ExtractedEntities;
    requiredAgents: AgentType[];
    confidence: number;
}

export type UserIntent =
    | 'SET_GOALS'           // User wants to create/set goals
    | 'GET_INFO'            // User wants information about something
    | 'TAKE_ACTION'         // User wants to do something (sync, send, etc.)
    | 'ANALYZE'             // User wants analysis/insights
    | 'CHAT'                // General conversation
    | 'PREPARE'             // Prepare for meeting/presentation
    | 'FOLLOW_UP'           // Follow up on previous topic
    | 'MEETING_OUTCOME'     // User responding with desired meeting outcome
    | 'MEETING_REVIEW'      // User providing post-meeting feedback
    | 'CALL_ME'             // User wants Mira to call them now
    | 'STAKEHOLDER_FEEDBACK'  // User correcting/confirming stakeholder info (importance, role, relationship)
    | 'IDENTITY_CONFIRMATION'; // User confirming/denying that two people are the same person

export interface ExtractedEntities {
    projects?: string[];      // e.g., ["AI4Inclusion", "Bhashini"]
    people?: string[];        // e.g., ["Amul", "Pranab"]
    timeframe?: string;       // e.g., "this week", "Q1"
    topics?: string[];        // e.g., ["architecture", "billing"]
    actionType?: string;      // e.g., "sync", "create", "schedule"
}

export type AgentType = 'context' | 'action' | 'response';

// Context Agent Output
export interface ContextSynthesis {
    projectSummaries: ProjectSummary[];
    relevantPeople: PersonContext[];
    relevantDocuments: DocumentContext[];
    relevantMeetings: MeetingContext[];
    relevantEmails: EmailContext[];
    suggestedActions: string[];
    keyInsights: string[];
}

export interface ProjectSummary {
    name: string;
    meetingCount: number;
    documentCount: number;
    keyPeople: string[];
    recentActivity: string;
    openQuestions: string[];
}

export interface PersonContext {
    name: string;
    email?: string;
    role?: string;
    relationship: string;  // "frequent collaborator", "stakeholder", etc.
    recentInteractions: string[];
    upcomingMeetings: string[];
    // Personality intelligence
    archetype?: string;
    archetypePlaybook?: string;  // tactical do/don't advice for this archetype
    commStyle?: string;
    motivation?: string;
    // Past outcome track record with this person
    outcomeHistory?: {
        total: number;
        landed: number;
        partial: number;
        missed: number;
        patterns: string[];  // "You land when you lead with data", "Works better when..."
    };
}

export interface DocumentContext {
    title: string;
    type: string;
    summary: string;
    lastModified: Date;
    relevanceReason: string;
}

export interface MeetingContext {
    title: string;
    date: Date;
    participants: string[];
    keyTopics: string[];
    relevanceReason: string;
    notes?: string;
    outcome?: string;
    relatedEmails?: Array<{ subject: string; from: string; date: Date; summary: string }>;
    relatedDocuments?: Array<{ title: string; lastModified: Date; summary: string }>;
}

export interface EmailContext {
    subject: string;
    from: string;
    date: Date;
    summary: string;
    relevanceReason: string;
}

// Action Agent Output
export interface ActionResult {
    success: boolean;
    actionTaken: string;
    result: any;
    followUpNeeded?: string;
}

// Response Agent Output
export interface FinalResponse {
    message: string;
    suggestedFollowUps?: string[];
    actionsPerformed?: string[];
}
