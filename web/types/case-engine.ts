export interface Stakeholder {
    id: string;
    name: string;
    role: string;
    stance: 'blocker' | 'neutral' | 'ally';
    influence: string; // "High", "Low"
    motivation: string;
}

export interface MentalModel {
    id: string;
    name: string;
    description: string;
    source: string;
    applicationReason: string;
}

export interface TalkingPoint {
    label: string;
    script: string;
}

export interface QuantitativeAnalysis {
    title: string;
    content: string; // Markdown
}

export interface VisualDiagram {
    title: string;
    mermaidCode: string;
}

export interface ChallengeOption {
    letter: string;
    label: string;
    response: string;
    isCorrect: boolean;
}

export interface ChallengeData {
    scenario: string;
    quote?: string;
    prompt: string;
    options: ChallengeOption[];
}

export interface RevealData {
    correctOption: string;
    explanation: string;
    principle: string;
}

export interface Meeting {
    id: string;
    title: string;
    startTime: Date;
    historicalTension?: string;
}

export interface CaseData {
    id: string;
    title: string;
    subtitle: string;
    duration: string;
    category: string;
    relevantMeeting?: Meeting;
    stakeholders: Stakeholder[];
    mentalModel: MentalModel;
    talkingPoints: TalkingPoint[];
    quantitativeAnalysis: QuantitativeAnalysis;
    visualDiagram: VisualDiagram;
    challenge: ChallengeData;
    reveal: RevealData;
}
