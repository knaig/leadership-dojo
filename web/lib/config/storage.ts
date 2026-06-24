/**
 * localStorage utilities for configuration and progress
 */

import { LLMConfig } from '../llm/types';
import { CaseSession, CaseProgress } from '../cases/types';

const STORAGE_KEYS = {
  LLM_CONFIG: 'coss_llm_config',
  CURRENT_SESSION: 'coss_current_session',
  CASE_HISTORY: 'coss_case_history',
  ONBOARDING_COMPLETE: 'coss_onboarding_complete'
};

// LLM Configuration
export function saveLLMConfig(config: LLMConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.LLM_CONFIG, JSON.stringify(config));
}

export function getLLMConfig(): LLMConfig | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEYS.LLM_CONFIG);
  return stored ? JSON.parse(stored) : null;
}

// Current Case Session
export function saveCurrentSession(session: CaseSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
}

export function getCurrentSession(): CaseSession | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
  return stored ? JSON.parse(stored) : null;
}

export function clearCurrentSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
}

// Case History
export function saveCaseProgress(progress: CaseProgress): void {
  if (typeof window === 'undefined') return;
  const history = getCaseHistory();
  history.push(progress);
  localStorage.setItem(STORAGE_KEYS.CASE_HISTORY, JSON.stringify(history));
}

export function getCaseHistory(): CaseProgress[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEYS.CASE_HISTORY);
  return stored ? JSON.parse(stored) : [];
}

export function getCaseProgressById(caseId: string): CaseProgress | null {
  const history = getCaseHistory();
  // Return most recent completion of this case
  return history.filter(p => p.caseId === caseId).pop() || null;
}

// Onboarding
export function setOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
}

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) === 'true';
}

// Clear all data
export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}
