'use server';

import fs from 'fs';
import path from 'path';

export interface CourseModule {
  id: string;
  title: string;
  duration: string;
  type: string;
  content?: {
    overview: string;
    keyPoints?: Array<{
      title: string;
      [key: string]: unknown;
    }>;
    keyInsight?: string;
  };
  exercises?: Array<{
    type: string;
    prompt: string;
  }>;
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
  assessmentApproach: string;
  targetAudience: string;
}

export interface CourseSummary {
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
  moduleCount: number;
}

const COURSES_DIR = path.join(process.cwd(), 'lib', 'courses');

// Cache for course summaries
let courseSummariesCache: CourseSummary[] | null = null;

export async function getAllCourseSummaries(): Promise<CourseSummary[]> {
  // Return cached data if available
  if (courseSummariesCache) {
    return courseSummariesCache;
  }

  const files = fs.readdirSync(COURSES_DIR).filter(f => f.endsWith('.json'));

  const courses: CourseSummary[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(COURSES_DIR, file), 'utf-8');
      const course = JSON.parse(content) as Course;

      // Only extract what we need for the list view
      courses.push({
        id: course.id,
        slug: course.slug,
        courseNumber: course.courseNumber,
        title: course.title,
        subtitle: course.subtitle,
        tier: course.tier,
        category: course.category,
        duration: course.duration,
        difficulty: course.difficulty,
        description: course.description,
        learningObjectives: course.learningObjectives || [],
        moduleCount: course.modules?.length || 0,
      });
    } catch (e) {
      console.error(`Error loading course ${file}:`, e);
    }
  }

  courseSummariesCache = courses.sort((a, b) => a.courseNumber - b.courseNumber);
  return courseSummariesCache;
}

export async function getAllCourses(): Promise<Course[]> {
  const files = fs.readdirSync(COURSES_DIR).filter(f => f.endsWith('.json'));

  const courses: Course[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(COURSES_DIR, file), 'utf-8');
      const course = JSON.parse(content) as Course;
      courses.push(course);
    } catch (e) {
      console.error(`Error loading course ${file}:`, e);
    }
  }

  return courses.sort((a, b) => a.courseNumber - b.courseNumber);
}

export async function getCourseBySlug(slug: string): Promise<Course | null> {
  const files = fs.readdirSync(COURSES_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(COURSES_DIR, file), 'utf-8');
      const course = JSON.parse(content) as Course;
      if (course.slug === slug) {
        return course;
      }
    } catch (e) {
      console.error(`Error loading course ${file}:`, e);
    }
  }

  return null;
}

export async function getCourseById(id: string): Promise<Course | null> {
  const files = fs.readdirSync(COURSES_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(COURSES_DIR, file), 'utf-8');
      const course = JSON.parse(content) as Course;
      if (course.id === id) {
        return course;
      }
    } catch (e) {
      console.error(`Error loading course ${file}:`, e);
    }
  }

  return null;
}
