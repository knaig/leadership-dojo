// Gamification and Progression System

export interface UserProgress {
  // Core stats
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: string | null;

  // Course progress
  coursesStarted: string[];
  coursesCompleted: string[];
  modulesCompleted: Record<string, number[]>; // courseId -> completed module indices

  // Case progress
  casesStarted: string[];
  casesCompleted: string[];
  caseRoundsCompleted: Record<string, number>; // caseId -> rounds completed

  // Achievements
  achievementsUnlocked: string[];

  // Timestamps
  joinedAt: string;
  updatedAt: string;
}

// Level definitions with titles and XP thresholds
export const levels = [
  { level: 1, title: "Newcomer", xpRequired: 0, icon: "🌱" },
  { level: 2, title: "Observer", xpRequired: 100, icon: "👀" },
  { level: 3, title: "Learner", xpRequired: 300, icon: "📚" },
  { level: 4, title: "Practitioner", xpRequired: 600, icon: "🎯" },
  { level: 5, title: "Strategist", xpRequired: 1000, icon: "🧭" },
  { level: 6, title: "Navigator", xpRequired: 1500, icon: "🗺️" },
  { level: 7, title: "Expert", xpRequired: 2200, icon: "⭐" },
  { level: 8, title: "Master", xpRequired: 3000, icon: "🏆" },
  { level: 9, title: "Sage", xpRequired: 4000, icon: "🎓" },
  { level: 10, title: "Legend", xpRequired: 5500, icon: "👑" },
  { level: 11, title: "Grandmaster", xpRequired: 7500, icon: "💎" },
  { level: 12, title: "Visionary", xpRequired: 10000, icon: "🌟" },
];

// XP rewards for different activities
export const xpRewards = {
  // Course activities
  startCourse: 10,
  completeModule: 25,
  completeCourse: 100,

  // Case activities
  startCase: 15,
  completeRound: 20,
  completeCase: 75,

  // Engagement activities
  dailyLogin: 5,
  weeklyStreak: 50,
  monthlyStreak: 200,

  // Special achievements
  firstCourse: 50,
  firstCase: 50,
  perfectWeek: 100, // Complete something every day for a week
};

// Achievement definitions
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'learning' | 'engagement' | 'mastery' | 'special';
  xpBonus: number;
  condition: (progress: UserProgress) => boolean;
}

export const achievements: Achievement[] = [
  // Learning achievements
  {
    id: "first-steps",
    title: "First Steps",
    description: "Start your first course",
    icon: "🚀",
    category: "learning",
    xpBonus: 50,
    condition: (p) => p.coursesStarted.length >= 1,
  },
  {
    id: "first-completion",
    title: "First Completion",
    description: "Complete your first course",
    icon: "🎯",
    category: "learning",
    xpBonus: 100,
    condition: (p) => p.coursesCompleted.length >= 1,
  },
  {
    id: "course-collector",
    title: "Course Collector",
    description: "Complete 5 courses",
    icon: "📚",
    category: "learning",
    xpBonus: 200,
    condition: (p) => p.coursesCompleted.length >= 5,
  },
  {
    id: "course-master",
    title: "Course Master",
    description: "Complete 10 courses",
    icon: "🎓",
    category: "learning",
    xpBonus: 500,
    condition: (p) => p.coursesCompleted.length >= 10,
  },
  {
    id: "knowledge-seeker",
    title: "Knowledge Seeker",
    description: "Complete 20 courses",
    icon: "🏛️",
    category: "learning",
    xpBonus: 1000,
    condition: (p) => p.coursesCompleted.length >= 20,
  },

  // Case achievements
  {
    id: "case-opener",
    title: "Case Opener",
    description: "Start your first case study",
    icon: "📂",
    category: "learning",
    xpBonus: 50,
    condition: (p) => p.casesStarted.length >= 1,
  },
  {
    id: "case-solver",
    title: "Case Solver",
    description: "Complete your first case study",
    icon: "✅",
    category: "learning",
    xpBonus: 100,
    condition: (p) => p.casesCompleted.length >= 1,
  },
  {
    id: "case-veteran",
    title: "Case Veteran",
    description: "Complete 10 case studies",
    icon: "🏅",
    category: "mastery",
    xpBonus: 300,
    condition: (p) => p.casesCompleted.length >= 10,
  },
  {
    id: "case-master",
    title: "Case Master",
    description: "Complete 25 case studies",
    icon: "🏆",
    category: "mastery",
    xpBonus: 750,
    condition: (p) => p.casesCompleted.length >= 25,
  },

  // Engagement achievements
  {
    id: "streak-starter",
    title: "Streak Starter",
    description: "Maintain a 3-day learning streak",
    icon: "🔥",
    category: "engagement",
    xpBonus: 25,
    condition: (p) => p.streak >= 3,
  },
  {
    id: "week-warrior",
    title: "Week Warrior",
    description: "Maintain a 7-day learning streak",
    icon: "⚡",
    category: "engagement",
    xpBonus: 75,
    condition: (p) => p.streak >= 7,
  },
  {
    id: "fortnight-fighter",
    title: "Fortnight Fighter",
    description: "Maintain a 14-day learning streak",
    icon: "💪",
    category: "engagement",
    xpBonus: 150,
    condition: (p) => p.streak >= 14,
  },
  {
    id: "month-master",
    title: "Month Master",
    description: "Maintain a 30-day learning streak",
    icon: "🌟",
    category: "engagement",
    xpBonus: 400,
    condition: (p) => p.streak >= 30,
  },

  // Mastery achievements
  {
    id: "cognitive-foundations",
    title: "Cognitive Foundations",
    description: "Complete all courses in Cognitive Foundations tier",
    icon: "🧠",
    category: "mastery",
    xpBonus: 500,
    condition: (p) => {
      const tierCourses = ['system-1-2-thinking', 'cognitive-biases-government', 'mental-models',
                          'action-bias-strategic-patience', 'decision-under-uncertainty'];
      return tierCourses.every(c => p.coursesCompleted.includes(c));
    },
  },
  {
    id: "stakeholder-expert",
    title: "Stakeholder Expert",
    description: "Complete all courses in Stakeholder Dynamics tier",
    icon: "🤝",
    category: "mastery",
    xpBonus: 500,
    condition: (p) => {
      const tierCourses = ['power-mapping-analysis', 'political-subtext', 'cross-cultural-navigation',
                          'managing-up', 'conflict-management'];
      return tierCourses.every(c => p.coursesCompleted.includes(c));
    },
  },
  {
    id: "community-builder",
    title: "Community Builder",
    description: "Complete all community building courses",
    icon: "🏘️",
    category: "mastery",
    xpBonus: 500,
    condition: (p) => {
      const communityCourses = ['community-building-fundamentals', 'digital-community-social-media',
                                'ai-powered-community-engagement'];
      return communityCourses.every(c => p.coursesCompleted.includes(c));
    },
  },

  // Special achievements
  {
    id: "early-adopter",
    title: "Early Adopter",
    description: "Join during the first month of launch",
    icon: "🌅",
    category: "special",
    xpBonus: 100,
    condition: () => false, // Manually awarded
  },
  {
    id: "completionist",
    title: "Completionist",
    description: "Complete all available courses",
    icon: "💯",
    category: "special",
    xpBonus: 2000,
    condition: (p) => p.coursesCompleted.length >= 41, // Update as courses are added
  },
  {
    id: "polymath",
    title: "Polymath",
    description: "Reach level 10",
    icon: "🎭",
    category: "special",
    xpBonus: 500,
    condition: (p) => p.level >= 10,
  },
];

// Calculate level from XP
export function calculateLevel(xp: number): { level: number; title: string; icon: string; progress: number; xpToNext: number } {
  let currentLevel = levels[0];
  let nextLevel = levels[1];

  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].xpRequired) {
      currentLevel = levels[i];
      nextLevel = levels[i + 1] || levels[i];
      break;
    }
  }

  const xpInLevel = xp - currentLevel.xpRequired;
  const xpForLevel = nextLevel.xpRequired - currentLevel.xpRequired;
  const progress = xpForLevel > 0 ? (xpInLevel / xpForLevel) * 100 : 100;

  return {
    level: currentLevel.level,
    title: currentLevel.title,
    icon: currentLevel.icon,
    progress: Math.min(progress, 100),
    xpToNext: Math.max(0, nextLevel.xpRequired - xp),
  };
}

// Check for newly unlocked achievements
export function checkAchievements(progress: UserProgress): Achievement[] {
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of achievements) {
    if (!progress.achievementsUnlocked.includes(achievement.id) && achievement.condition(progress)) {
      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}

// Calculate streak
export function calculateStreak(lastActiveDate: string | null, today: string): { streak: number; isActive: boolean } {
  if (!lastActiveDate) {
    return { streak: 0, isActive: true };
  }

  const last = new Date(lastActiveDate);
  const current = new Date(today);
  const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { streak: 1, isActive: true }; // Same day
  } else if (diffDays === 1) {
    return { streak: 1, isActive: true }; // Consecutive day, streak continues
  } else {
    return { streak: 0, isActive: false }; // Streak broken
  }
}

// Learning paths - suggested course sequences
export const learningPaths = [
  {
    id: "foundations",
    title: "Foundations Track",
    description: "Build your cognitive and analytical foundations",
    icon: "🏗️",
    courses: [
      "system-1-2-thinking",
      "cognitive-biases-government",
      "mental-models",
      "action-bias-strategic-patience",
      "decision-under-uncertainty",
    ],
    estimatedHours: 20,
    difficulty: "Beginner",
  },
  {
    id: "stakeholder-mastery",
    title: "Stakeholder Mastery",
    description: "Master the art of navigating people and politics",
    icon: "🤝",
    courses: [
      "power-mapping-analysis",
      "political-subtext",
      "cross-cultural-navigation",
      "managing-up",
      "conflict-management",
      "negotiation-skills",
      "building-coalitions",
    ],
    estimatedHours: 30,
    difficulty: "Intermediate",
  },
  {
    id: "execution-excellence",
    title: "Execution Excellence",
    description: "Turn strategy into successful implementation",
    icon: "⚙️",
    courses: [
      "project-coordination",
      "agile-in-government",
      "change-management",
      "measurement-and-kpis",
      "adaptive-management",
      "user-adoption-scaling",
    ],
    estimatedHours: 25,
    difficulty: "Intermediate",
  },
  {
    id: "community-leadership",
    title: "Community Leadership",
    description: "Build and scale engaged communities",
    icon: "🏘️",
    courses: [
      "community-building-fundamentals",
      "digital-community-social-media",
      "ai-powered-community-engagement",
    ],
    estimatedHours: 14,
    difficulty: "Intermediate",
  },
  {
    id: "dpi-specialist",
    title: "DPI Specialist",
    description: "Deep expertise in digital public infrastructure",
    icon: "🌐",
    courses: [
      "dpi-ecosystem-overview",
      "working-with-donors",
      "vendor-ecosystem",
      "technical-literacy-core",
      "sustainability-exit",
    ],
    estimatedHours: 20,
    difficulty: "Advanced",
  },
];

// Get user's current learning path progress
export function getPathProgress(
  pathId: string,
  completedCourses: string[]
): { completed: number; total: number; percentage: number } {
  const path = learningPaths.find(p => p.id === pathId);
  if (!path) {
    return { completed: 0, total: 0, percentage: 0 };
  }

  const completed = path.courses.filter(c => completedCourses.includes(c)).length;
  const total = path.courses.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}

// Default progress for new users
export const defaultProgress: UserProgress = {
  xp: 0,
  level: 1,
  streak: 0,
  lastActiveDate: null,
  coursesStarted: [],
  coursesCompleted: [],
  modulesCompleted: {},
  casesStarted: [],
  casesCompleted: [],
  caseRoundsCompleted: {},
  achievementsUnlocked: [],
  joinedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
