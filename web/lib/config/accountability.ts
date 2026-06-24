/**
 * Accountability tracking - reflections, lockouts, pattern detection
 * 
 * Philosophy: "Annoying in the right ways"
 * - Lockouts after 2 missed reflections
 * - Quality detection rejects vague reflections
 * - Pattern detection shows practice-reality gap
 */

import { CaseProgress } from '../cases/types';

export interface Reflection {
  id: string;
  caseId: string;
  date: string;
  hadRelevantMeetings: boolean;
  meetingDescription?: string;
  whatHappened?: string;
  whatYouDid?: string;
  modeDetected?: 'builder' | 'founder' | 'advisor' | 'mixed';
  whatYouMissed?: {
    stakeholders: string;
    politicalTiming: string;
    legitimacyConcerns: string;
    yourImpulses: string;
  };
  oneDifferently?: string;
  noMeetingsReason?: string;
  qualityScore: number;
  rejected?: boolean;
  rejectionReason?: string;
}

export interface ReflectionDebt {
  pendingReflections: string[];
  missedCount: number;
  isLockedOut: boolean;
}

export interface BehaviorPattern {
  type: 'PRACTICE_REALITY_GAP' | 'BEHAVIOR_STAGNATION' | 'REFLECTION_AVOIDANCE' | 'GAMING_DETECTED';
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  description: string;
  recommendation: string;
}

const STORAGE_KEYS = {
  REFLECTIONS: 'coss_reflections',
  REFLECTION_DEBT: 'coss_reflection_debt',
  PATTERNS: 'coss_patterns'
};

// Reflections
export function saveReflection(reflection: Reflection): void {
  if (typeof window === 'undefined') return;
  const reflections = getReflections();
  reflections.push(reflection);
  localStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(reflections));
  
  const debt = getReflectionDebt();
  debt.pendingReflections = debt.pendingReflections.filter(id => id !== reflection.caseId);
  saveReflectionDebt(debt);
}

export function getReflections(): Reflection[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.REFLECTIONS);
  return stored ? JSON.parse(stored) : [];
}

export function getRecentReflections(days: number = 14): Reflection[] {
  const reflections = getReflections();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return reflections.filter(r => new Date(r.date) >= cutoff);
}

// Reflection Debt
export function addReflectionDebt(caseId: string): void {
  if (typeof window === 'undefined') return;
  const debt = getReflectionDebt();
  if (!debt.pendingReflections.includes(caseId)) {
    debt.pendingReflections.push(caseId);
  }
  if (debt.pendingReflections.length >= 2) {
    debt.isLockedOut = true;
    debt.missedCount = debt.pendingReflections.length;
  }
  saveReflectionDebt(debt);
}

export function getReflectionDebt(): ReflectionDebt {
  if (typeof window === 'undefined') return {
    pendingReflections: [],
    missedCount: 0,
    isLockedOut: false
  };
  const stored = localStorage.getItem(STORAGE_KEYS.REFLECTION_DEBT);
  return stored ? JSON.parse(stored) : {
    pendingReflections: [],
    missedCount: 0,
    isLockedOut: false
  };
}

function saveReflectionDebt(debt: ReflectionDebt): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.REFLECTION_DEBT, JSON.stringify(debt));
}

export function checkLockout(): boolean {
  const debt = getReflectionDebt();
  return debt.isLockedOut;
}

// Quality Assessment
export function assessReflectionQuality(reflection: Partial<Reflection>): {
  score: number;
  issues: string[];
  accepted: boolean;
} {
  const issues: string[] = [];
  let score = 100;

  if (!reflection.hadRelevantMeetings) {
    if (!reflection.noMeetingsReason || reflection.noMeetingsReason.length < 10) {
      issues.push('Please explain why you had no relevant meetings');
      score -= 50;
    }
    return { score, issues, accepted: score >= 50 };
  }

  if (reflection.whatHappened && reflection.whatHappened.length < 50) {
    issues.push('"What happened" is too short. Be specific.');
    score -= 20;
  }

  if (reflection.whatYouDid && reflection.whatYouDid.length < 30) {
    issues.push('"What you did" is too vague. Give exact words or actions.');
    score -= 20;
  }

  const genericPhrases = ['i should be better', 'i need to improve', 'i should focus more'];
  const reflectionText = [
    reflection.whatHappened,
    reflection.whatYouDid,
    reflection.oneDifferently
  ].join(' ').toLowerCase();

  if (genericPhrases.some(phrase => reflectionText.includes(phrase))) {
    issues.push('Avoid generic language. Be specific about behaviors.');
    score -= 15;
  }

  return { score, issues, accepted: score >= 60 };
}

// Pattern Detection
export function detectPatterns(
  recentCases: CaseProgress[],
  recentReflections: Reflection[]
): BehaviorPattern[] {
  const patterns: BehaviorPattern[] = [];

  const practiceAdvisorRate = recentCases.filter(
    c => c.dominantMode === 'advisor'
  ).length / Math.max(recentCases.length, 1);

  const reflectionAdvisorRate = recentReflections.filter(
    r => r.modeDetected === 'advisor'
  ).length / Math.max(recentReflections.length, 1);

  const gap = practiceAdvisorRate - reflectionAdvisorRate;

  if (gap > 0.3 && recentCases.length >= 3 && recentReflections.length >= 3) {
    patterns.push({
      type: 'PRACTICE_REALITY_GAP',
      severity: gap > 0.5 ? 'high' : 'medium',
      detectedAt: new Date().toISOString(),
      description: `You're scoring high in practice (${(practiceAdvisorRate * 100).toFixed(0)}% advisor) but real meetings show ${(reflectionAdvisorRate * 100).toFixed(0)}% advisor mode.`,
      recommendation: 'Review coaching notes before your next meeting.'
    });
  }

  return patterns;
}

export function getPatterns(): BehaviorPattern[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.PATTERNS);
  return stored ? JSON.parse(stored) : [];
}

export function getRecentPatterns(days: number = 30): BehaviorPattern[] {
  const patterns = getPatterns();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return patterns.filter(p => new Date(p.detectedAt) >= cutoff);
}
