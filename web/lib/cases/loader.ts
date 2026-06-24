import { CaseData } from './types';

// Import case JSON files
import pngDigitalId from './png_digital_id.json';
import moroccoPayment from './morocco_payment_election.json';
import saDataLocalization from './sa_data_localization.json';
import kenyaDataBreach from './kenya_data_breach.json';
import brazilMinistryTurf from './brazil_ministry_turf.json';
import indiaStateCoordination from './india_state_coordination.json';
import vendorProcurementTrap from './vendor_procurement_trap.json';

const cases: CaseData[] = [
  pngDigitalId as CaseData,
  moroccoPayment as CaseData,
  saDataLocalization as CaseData,
  kenyaDataBreach as CaseData,
  brazilMinistryTurf as CaseData,
  indiaStateCoordination as CaseData,
  vendorProcurementTrap as CaseData
];

export function getAllCases(): CaseData[] {
  return cases;
}

// Alias for getAllCases
export function loadAllCases(): CaseData[] {
  return getAllCases();
}

export function getCaseById(id: string): CaseData | undefined {
  return cases.find(c => c.id === id);
}

// Alias for getCaseById
export function loadCaseById(id: string): CaseData | undefined {
  return getCaseById(id);
}

export function getCasesByType(type: string): CaseData[] {
  return cases.filter(c => c.case_type === type);
}

export function getCaseTypes(): string[] {
  return Array.from(new Set(cases.map(c => c.case_type)));
}

