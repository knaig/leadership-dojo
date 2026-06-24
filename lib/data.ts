import fs from "fs";
import path from "path";

const CASES_DIR = path.join(process.cwd(), "data/cases");
const COURSES_DIR = path.join(process.cwd(), "data/courses");

export interface Round {
  round: number;
  type: string;
  situation: string;
  prompt: string;
  evaluate?: string[];
  coaching_focus?: string[];
}

export interface StakeholderInfo {
  power: string;
  stance: string;
  interests: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  case_type: string;
  country: string;
  context: {
    political_landscape?: string;
    recent_events?: string;
    cultural_factors?: string;
    your_position?: string;
  };
  stakeholder_map: Record<string, StakeholderInfo> | null;
  rounds: Round[];
  tags: string[];
}

export interface CourseModule {
  id: string;
  title: string;
  duration: string;
  type: string;
  content: Record<string, unknown>;
}

export interface Course {
  id: string;
  slug: string;
  courseNumber: number;
  title: string;
  subtitle: string;
  tier: number;
  category: string;
  duration: string;
  difficulty: string;
  description: string;
  learningObjectives: string[];
  prerequisites: string[];
  relatedCourses: string[];
  modules: CourseModule[];
}

// Normalize the two case formats that exist in the JSON files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCase(raw: any): CaseStudy {
  const rounds: Round[] = (raw.rounds ?? []).map((r: any) => ({
    round: r.round,
    type: r.type,
    situation: r.situation ?? "",
    prompt: r.prompt ?? "",
    evaluate: r.evaluate ?? r.evaluationCriteria ?? undefined,
    coaching_focus: r.coaching_focus ?? r.coachingNotes
      ? Array.isArray(r.coachingNotes)
        ? r.coachingNotes
        : r.coaching_focus
      : undefined,
  }));

  return {
    id: raw.id,
    title: raw.title,
    case_type: raw.case_type ?? raw.caseType ?? "general",
    country: raw.country ?? "",
    context: raw.context ?? {},
    stakeholder_map: raw.stakeholder_map ?? null,
    rounds,
    tags: raw.tags ?? [],
  };
}

function readCaseFiles(): CaseStudy[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  const exclude = ["types.ts", "loader.ts", "matcher.ts"];
  return fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json") && !exclude.includes(f))
    .map((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf-8"));
        return normalizeCase(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as CaseStudy[];
}

export function getAllCases(): CaseStudy[] {
  return readCaseFiles();
}

export function getCase(id: string): CaseStudy | null {
  const filePath = path.join(CASES_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return normalizeCase(raw);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJsonFiles<T>(dir: string, exclude: string[] = []): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !exclude.includes(f))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as T;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as T[];
}

export function getAllCourses(): Course[] {
  return readJsonFiles<Course>(COURSES_DIR).sort(
    (a, b) => a.courseNumber - b.courseNumber
  );
}

export function getCourse(id: string): Course | null {
  const all = getAllCourses();
  return all.find((c) => c.id === id || c.slug === id) ?? null;
}
