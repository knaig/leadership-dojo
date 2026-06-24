/**
 * Identity Resolution Module
 *
 * Layered identity resolution for stakeholder profiles.
 *
 * Layer 0: Profile classification (profile-classifier.ts)
 * Layer 1: Structural signals (structural-signals.ts)
 * Layer 2: Behavioral signals (behavioral-signals.ts)
 * Merge: Golden record survivorship (survivorship.ts)
 */

export { classifyProfile, filterToPersons } from './profile-classifier';
export type { ProfileClass } from './profile-classifier';

export { computeStructuralSignals, totalScore, jaroWinkler } from './structural-signals';
export type { StructuralSignal } from './structural-signals';

export { buildMeetingIndex, computeBehavioralSignals } from './behavioral-signals';
export type { BehavioralSignal } from './behavioral-signals';

export { choosePrimary, computeMerge } from './survivorship';
export type { MergeableProfile } from './survivorship';
