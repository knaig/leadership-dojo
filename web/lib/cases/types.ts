/**
 * Case data types - matching actual JSON structure
 */

export interface CaseData {
  id: string;
  title: string;
  case_type: string;
  country: string;
  context: {
    political_landscape: string;
    recent_events: string;
    cultural_factors: string;
    your_position: string;
  };
  stakeholder_map: {
    [stakeholder: string]: {
      power: string;
      stance: string;
      interests: string;
    };
  };
  rounds: Round[];
  tags: string[];
}

// Alias for compatibility
export type Case = CaseData;

export interface Round {
  round: number;
  type: string;
  situation: string;
  prompt: string;
  evaluate: string[];
  coaching_focus?: string[];
}

export interface CaseSession {
  caseId: string;
  startedAt: string;
  currentRound: number;
  responses: string[];
  analyses: any[];
  completed: boolean;
  coaching?: any;
}

export interface CaseProgress {
  caseId: string;
  completedAt: string;
  dominantMode: string;
  scores: {
    [dimension: string]: number;
  };
  behaviorPractice: string;
}
