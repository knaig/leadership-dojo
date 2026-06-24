'use server';

import fs from 'fs/promises';
import path from 'path';

export interface CaseContext {
  yourRole: string;
  situation: string;
  pressure: string;
  reality: string;
}

export interface CaseRound {
  round: number;
  type: string;
  situation: string;
  prompt: string;
  evaluationCriteria: string[];
  coachingNotes: string;
}

export interface CaseFramework {
  name: string;
  description: string;
  application: string;
}

export interface FullCase {
  id: string;
  course: string;
  difficulty: string;
  title: string;
  country: string;
  caseType: string;
  learningObjectives: string[];
  context: CaseContext;
  rounds: CaseRound[];
  keyTakeaways?: string[];
  frameworks?: CaseFramework[];
  relatedCases?: string[];
}

const casesDir = path.join(process.cwd(), 'lib', 'cases');

export async function getCaseById(id: string): Promise<FullCase | null> {
  try {
    // Find the file that matches this ID
    const files = await fs.readdir(casesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(casesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const caseData = JSON.parse(content) as FullCase;

      if (caseData.id === id) {
        return caseData;
      }
    }

    return null;
  } catch (error) {
    console.error('Error loading case:', error);
    return null;
  }
}

export async function getCasesByCluster(clusterId: string): Promise<FullCase[]> {
  try {
    const files = await fs.readdir(casesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const cases: FullCase[] = [];

    for (const file of jsonFiles) {
      const filePath = path.join(casesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const caseData = JSON.parse(content) as FullCase;
      cases.push(caseData);
    }

    return cases;
  } catch (error) {
    console.error('Error loading cases:', error);
    return [];
  }
}
