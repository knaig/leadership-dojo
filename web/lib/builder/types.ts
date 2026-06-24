export type CaseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface BuilderCase {
    id: string;
    title: string;
    slug: string;
    updatedAt: Date;
    versions: {
        status: CaseStatus;
        version: number;
        createdBy: string;
    }[];
}

export interface CaseContent {
    meta: {
        country: string;
        role: string;
        difficulty: 'Easy' | 'Medium' | 'Hard';
    };
    context: {
        description: string;
        stakeholders: StakeholderDef[];
    };
    rounds: BuilderRound[];
}

export interface StakeholderDef {
    id: string;
    name: string;
    role: string;
    agenda: string; // Hidden context
}

export interface BuilderRound {
    id: string;
    type: 'opening' | 'builder_trap' | 'narrative_moment' | 'outcome';
    title: string;
    description: string;
    options?: {
        text: string;
        risk: string;
        isOptimal: boolean;
    }[];
}
