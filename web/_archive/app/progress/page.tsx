'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AppShell } from '@/components/layout/AppShell';
import {
  BookOpen,
  Target,
  Trophy,
  TrendingUp,
  Clock,
  CheckCircle2,
  Star,
  Flame,
  Award,
  ChevronRight,
  Zap,
  Lock,
  Sparkles
} from 'lucide-react';
import {
  levels,
  achievements,
  learningPaths,
  calculateLevel,
  getPathProgress,
  type UserProgress,
  type Achievement
} from '@/lib/progression';

// Mock user progress - in production, this would come from a database/API
const mockUserProgress: UserProgress = {
  xp: 485,
  level: 4,
  streak: 5,
  lastActiveDate: new Date().toISOString(),
  coursesStarted: ['system-1-2-thinking', 'cognitive-biases-government', 'mental-models'],
  coursesCompleted: ['system-1-2-thinking', 'cognitive-biases-government'],
  modulesCompleted: {
    'system-1-2-thinking': [0, 1, 2, 3, 4, 5, 6, 7],
    'cognitive-biases-government': [0, 1, 2, 3, 4, 5, 6, 7],
    'mental-models': [0, 1, 2, 3]
  },
  casesStarted: ['ministry-power-play', 'png-digital-id', 'budget-battle'],
  casesCompleted: ['ministry-power-play', 'png-digital-id'],
  caseRoundsCompleted: {
    'ministry-power-play': 4,
    'png-digital-id': 4,
    'budget-battle': 2
  },
  achievementsUnlocked: ['first-steps', 'first-completion', 'case-opener', 'case-solver', 'streak-starter'],
  joinedAt: '2025-01-01T00:00:00Z',
  updatedAt: new Date().toISOString()
};

export default function ProgressPage() {
  const router = useRouter();
  const progress = mockUserProgress;
  const levelInfo = calculateLevel(progress.xp);

  // Get unlocked achievements
  const unlockedAchievements = achievements.filter(a =>
    progress.achievementsUnlocked.includes(a.id)
  );

  // Get next achievements to unlock
  const nextAchievements = achievements.filter(a =>
    !progress.achievementsUnlocked.includes(a.id)
  ).slice(0, 3);

  const recentActivity = [
    { type: 'course', title: 'Mental Models', action: 'Completed Module 4', xp: 25, date: '2 hours ago' },
    { type: 'achievement', title: 'Streak Starter', action: 'Achievement unlocked', xp: 25, date: 'Yesterday' },
    { type: 'case', title: 'Budget Battle', action: 'Completed Round 2', xp: 20, date: 'Yesterday' },
    { type: 'course', title: 'Cognitive Biases', action: 'Course completed', xp: 100, date: '3 days ago' },
  ];

  return (
    <AppShell>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Hero Section - Level & XP */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-amber-500/20">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                {/* Level Badge */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <span className="text-4xl">{levelInfo.icon}</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-background border-2 border-amber-500 rounded-full px-2 py-0.5 text-sm font-bold">
                    {levelInfo.level}
                  </div>
                </div>

                {/* Level Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold">{levelInfo.title}</h1>
                    <Badge variant="outline" className="border-amber-500/50 text-amber-500">
                      Level {levelInfo.level}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{progress.xp.toLocaleString()} XP</span>
                      <span className="text-muted-foreground">
                        {levelInfo.xpToNext > 0
                          ? `${levelInfo.xpToNext.toLocaleString()} XP to Level ${levelInfo.level + 1}`
                          : 'Max Level!'
                        }
                      </span>
                    </div>
                    <Progress value={levelInfo.progress} className="h-3 bg-amber-500/20" />
                  </div>

                  {/* Quick Stats Row */}
                  <div className="flex flex-wrap gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-500" />
                      <span className="font-semibold">{progress.streak}</span>
                      <span className="text-sm text-muted-foreground">day streak</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-emerald-500" />
                      <span className="font-semibold">{progress.coursesCompleted.length}</span>
                      <span className="text-sm text-muted-foreground">courses</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-blue-500" />
                      <span className="font-semibold">{progress.casesCompleted.length}</span>
                      <span className="text-sm text-muted-foreground">cases</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-purple-500" />
                      <span className="font-semibold">{unlockedAchievements.length}</span>
                      <span className="text-sm text-muted-foreground">achievements</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Left 2 columns */}
          <div className="lg:col-span-2 space-y-8">
            {/* Learning Paths */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      Learning Paths
                    </CardTitle>
                    <CardDescription>Follow curated course sequences to master key skills</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {learningPaths.map((path) => {
                  const pathProgress = getPathProgress(path.id, progress.coursesCompleted);
                  const isStarted = pathProgress.completed > 0;
                  const isCompleted = pathProgress.completed === pathProgress.total;

                  return (
                    <div
                      key={path.id}
                      className="p-4 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => router.push('/learning')}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${
                          isCompleted
                            ? 'bg-emerald-500/20 ring-2 ring-emerald-500'
                            : isStarted
                              ? 'bg-amber-500/20'
                              : 'bg-muted'
                        }`}>
                          {path.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{path.title}</h4>
                            <Badge variant="outline" className="text-xs">
                              {path.difficulty}
                            </Badge>
                            {isCompleted && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{path.description}</p>
                          <div className="flex items-center gap-4">
                            <Progress value={pathProgress.percentage} className="flex-1 h-2" />
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {pathProgress.completed}/{pathProgress.total} courses
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Achievements Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      Achievements
                    </CardTitle>
                    <CardDescription>
                      {unlockedAchievements.length} of {achievements.length} unlocked
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm">
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Unlocked Achievements */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Recently Unlocked</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {unlockedAchievements.slice(0, 6).map((achievement) => (
                      <div
                        key={achievement.id}
                        className="p-3 rounded-lg border bg-gradient-to-br from-amber-500/5 to-orange-500/5 border-amber-500/20"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{achievement.icon}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{achievement.title}</p>
                            <p className="text-xs text-amber-500">+{achievement.xpBonus} XP</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next Achievements */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Up Next</h4>
                  <div className="space-y-2">
                    {nextAchievements.map((achievement) => (
                      <div
                        key={achievement.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{achievement.title}</p>
                          <p className="text-xs text-muted-foreground">{achievement.description}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          +{achievement.xpBonus} XP
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Level Progression */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  Level Progression
                </CardTitle>
                <CardDescription>Your journey through the ranks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Progress Line */}
                  <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-muted" />

                  <div className="space-y-4">
                    {levels.slice(0, 8).map((level, idx) => {
                      const isUnlocked = progress.xp >= level.xpRequired;
                      const isCurrent = levelInfo.level === level.level;

                      return (
                        <div key={level.level} className="flex items-center gap-4 relative">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center z-10 ${
                            isCurrent
                              ? 'bg-gradient-to-br from-amber-400 to-orange-500 ring-4 ring-amber-500/20'
                              : isUnlocked
                                ? 'bg-emerald-500/20 border-2 border-emerald-500'
                                : 'bg-muted border-2 border-muted-foreground/20'
                          }`}>
                            <span className={`text-xl ${!isUnlocked && 'grayscale opacity-50'}`}>
                              {level.icon}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${!isUnlocked && 'text-muted-foreground'}`}>
                                {level.title}
                              </span>
                              {isCurrent && (
                                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                                  Current
                                </Badge>
                              )}
                              {isUnlocked && !isCurrent && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              )}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {level.xpRequired.toLocaleString()} XP required
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Show more levels hint */}
                    <div className="flex items-center gap-4 relative">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center z-10 bg-muted border-2 border-dashed border-muted-foreground/20">
                        <span className="text-muted-foreground">...</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {levels.length - 8} more levels to discover
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right column */}
          <div className="space-y-6">
            {/* Streak Card */}
            <Card className={progress.streak >= 7 ? 'ring-2 ring-orange-500/50 bg-orange-500/5' : ''}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Flame className={`h-5 w-5 ${progress.streak >= 3 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                  Learning Streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div className="text-5xl font-bold text-orange-500 mb-1">
                    {progress.streak}
                  </div>
                  <p className="text-sm text-muted-foreground">days in a row</p>
                </div>

                {/* Week visualization */}
                <div className="flex justify-center gap-2 mt-4">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                    <div key={idx} className="text-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        idx < progress.streak % 7 || (progress.streak >= 7 && idx < 7)
                          ? 'bg-orange-500 text-white'
                          : idx === progress.streak % 7
                            ? 'bg-orange-500/20 ring-2 ring-orange-500'
                            : 'bg-muted'
                      }`}>
                        {idx < progress.streak % 7 || (progress.streak >= 7) ? (
                          <Flame className="h-4 w-4" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{day}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-center text-sm text-muted-foreground mt-4">
                  {progress.streak >= 7
                    ? 'Amazing! Keep the fire burning!'
                    : `${7 - (progress.streak % 7)} more days for weekly bonus!`
                  }
                </p>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentActivity.map((activity, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      activity.type === 'course'
                        ? 'bg-emerald-500/20'
                        : activity.type === 'case'
                          ? 'bg-blue-500/20'
                          : 'bg-purple-500/20'
                    }`}>
                      {activity.type === 'course' ? (
                        <BookOpen className="h-4 w-4 text-emerald-500" />
                      ) : activity.type === 'case' ? (
                        <Target className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Award className="h-4 w-4 text-purple-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{activity.action}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">
                          <Zap className="h-3 w-3 mr-1" />
                          +{activity.xp} XP
                        </Badge>
                        <span className="text-xs text-muted-foreground">{activity.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Continue Learning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="default"
                  className="w-full justify-start bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => router.push('/learning')}
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Resume Mental Models
                  <Badge variant="secondary" className="ml-auto bg-white/20">50%</Badge>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/cases')}
                >
                  <Target className="h-4 w-4 mr-2" />
                  Continue Budget Battle
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => router.push('/learning')}
                >
                  <Star className="h-4 w-4 mr-2" />
                  Explore New Courses
                </Button>
              </CardContent>
            </Card>

            {/* XP Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5 text-amber-500" />
                  XP Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Courses</span>
                    <span className="font-medium">250 XP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Cases</span>
                    <span className="font-medium">150 XP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Achievements</span>
                    <span className="font-medium">75 XP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Streaks</span>
                    <span className="font-medium">10 XP</span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between font-medium">
                    <span>Total</span>
                    <span className="text-amber-500">{progress.xp} XP</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
