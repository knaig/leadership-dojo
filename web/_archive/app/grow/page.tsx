'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  BookOpen,
  Target,
  Search,
  Clock,
  Star,
  ChevronRight,
  Filter,
  Sparkles
} from 'lucide-react';

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  duration: number;
  moduleCount: number;
  completedModules: number;
  capacities: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  recommended?: boolean;
  recommendReason?: string;
}

interface Case {
  id: string;
  slug: string;
  title: string;
  description: string;
  duration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  capacities: string[];
  completed: boolean;
  recommended?: boolean;
  recommendReason?: string;
}

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState('for-you');
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch library content
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      // In production, this would fetch from API
      // For now, using mock data
      setCourses([
        {
          id: '1',
          slug: 'stakeholder-recovery',
          title: 'Rebuilding Stakeholder Trust',
          description: 'Learn frameworks for recovering from damaged relationships',
          duration: 45,
          moduleCount: 6,
          completedModules: 2,
          capacities: ['relationship-capital'],
          difficulty: 'intermediate',
          recommended: true,
          recommendReason: 'Based on recent meeting tensions'
        },
        {
          id: '2',
          slug: 'political-navigation',
          title: 'Political Navigation',
          description: 'Master organizational politics and power dynamics',
          duration: 60,
          moduleCount: 8,
          completedModules: 0,
          capacities: ['situational-awareness', 'relationship-capital'],
          difficulty: 'advanced',
          recommended: true,
          recommendReason: 'Your situational awareness is a growth area'
        },
        {
          id: '3',
          slug: 'decision-frameworks',
          title: 'Decision Quality Under Uncertainty',
          description: 'Improve judgment when data is incomplete',
          duration: 50,
          moduleCount: 5,
          completedModules: 5,
          capacities: ['decision-quality'],
          difficulty: 'intermediate'
        },
        {
          id: '4',
          slug: 'execution-velocity',
          title: 'Fast on the Right Things',
          description: 'Balance speed with strategic importance',
          duration: 40,
          moduleCount: 4,
          completedModules: 0,
          capacities: ['execution-velocity', 'outcome-orientation'],
          difficulty: 'intermediate'
        },
        {
          id: '5',
          slug: 'reading-rooms',
          title: 'Reading the Room',
          description: 'Detect unspoken dynamics and hidden agendas',
          duration: 35,
          moduleCount: 4,
          completedModules: 1,
          capacities: ['situational-awareness'],
          difficulty: 'intermediate'
        }
      ]);

      setCases([
        {
          id: '1',
          slug: 'skeptical-cfo',
          title: 'The Skeptical CFO',
          description: 'Navigate a budget review with an analytically demanding finance leader',
          duration: 25,
          difficulty: 'intermediate',
          capacities: ['relationship-capital', 'situational-awareness'],
          completed: false,
          recommended: true,
          recommendReason: 'Matches your upcoming finance meeting'
        },
        {
          id: '2',
          slug: 'coalition-builder',
          title: 'The Coalition Builder',
          description: 'Align stakeholders with conflicting interests',
          duration: 30,
          difficulty: 'advanced',
          capacities: ['relationship-capital', 'outcome-orientation'],
          completed: false
        },
        {
          id: '3',
          slug: 'fait-accompli',
          title: 'The Fait Accompli',
          description: 'Respond when a decision has been made without you',
          duration: 25,
          difficulty: 'intermediate',
          capacities: ['situational-awareness', 'decision-quality'],
          completed: true
        },
        {
          id: '4',
          slug: 'urgent-pivot',
          title: 'The Urgent Pivot',
          description: 'Lead a rapid change under stakeholder pressure',
          duration: 20,
          difficulty: 'intermediate',
          capacities: ['execution-velocity', 'decision-quality'],
          completed: false
        },
        {
          id: '5',
          slug: 'hidden-dynamics',
          title: 'Hidden Stakeholder Dynamics',
          description: 'Uncover and navigate political undercurrents',
          duration: 25,
          difficulty: 'advanced',
          capacities: ['situational-awareness', 'domain-mastery'],
          completed: false,
          recommended: true,
          recommendReason: 'Builds situational awareness'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-emerald-500/10 text-emerald-500';
      case 'intermediate': return 'bg-amber-500/10 text-amber-500';
      case 'advanced': return 'bg-red-500/10 text-red-500';
      default: return '';
    }
  };

  const filteredCourses = courses.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCases = cases.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recommendedCourses = courses.filter(c => c.recommended);
  const recommendedCases = cases.filter(c => c.recommended);

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Library</h1>
          <p className="text-muted-foreground mt-1">
            Courses and cases to build your leadership capacities
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses and cases..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="for-you" className="gap-2">
              <Sparkles className="h-4 w-4" />
              For You
            </TabsTrigger>
            <TabsTrigger value="courses" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Courses
            </TabsTrigger>
            <TabsTrigger value="cases" className="gap-2">
              <Target className="h-4 w-4" />
              Cases
            </TabsTrigger>
          </TabsList>

          {/* For You Tab */}
          <TabsContent value="for-you" className="space-y-8">
            {/* Recommended based on work */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Recommended for You</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Based on your work patterns and capacity gaps
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...recommendedCourses, ...recommendedCases].slice(0, 4).map((item) => {
                  const isCourse = 'moduleCount' in item;
                  const uniqueKey = isCourse ? `course-${item.id}` : `case-${item.id}`;
                  return (
                    <Card key={uniqueKey} className="border-primary/20 bg-primary/5">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {isCourse ? (
                              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <BookOpen className="h-5 w-5 text-emerald-500" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <Target className="h-5 w-5 text-amber-500" />
                              </div>
                            )}
                            <div>
                              <CardTitle className="text-base">{item.title}</CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {isCourse ? 'Course' : 'Case'}
                                </Badge>
                                <Badge className={getDifficultyColor(item.difficulty)}>
                                  {item.difficulty}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                        {item.recommendReason && (
                          <div className="flex items-center gap-2 text-xs text-primary mb-3">
                            <Sparkles className="h-3 w-3" />
                            {item.recommendReason}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {item.duration} min
                          </div>
                          <Link href={isCourse ? `/learning?course=${item.slug}` : `/cases/${item.slug}`}>
                            <Button size="sm">
                              Start
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* In Progress */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Continue Learning</h2>
              <div className="space-y-3">
                {courses.filter(c => c.completedModules > 0 && c.completedModules < c.moduleCount).map((course) => (
                  <Card key={course.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <BookOpen className="h-6 w-6 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-medium">{course.title}</h3>
                          <div className="flex items-center gap-4 mt-1">
                            <Progress
                              value={(course.completedModules / course.moduleCount) * 100}
                              className="h-2 flex-1"
                            />
                            <span className="text-sm text-muted-foreground">
                              {course.completedModules}/{course.moduleCount} modules
                            </span>
                          </div>
                        </div>
                        <Link href={`/learning?course=${course.slug}`}>
                          <Button variant="outline" size="sm">
                            Continue
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Courses Tab */}
          <TabsContent value="courses" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCourses.map((course) => (
                <Card key={course.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <BookOpen className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{course.title}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getDifficultyColor(course.difficulty)}>
                              {course.difficulty}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {course.moduleCount} modules
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">{course.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {course.capacities.map(c => (
                        <Badge key={c} variant="outline" className="text-xs">
                          {c.replace('-', ' ')}
                        </Badge>
                      ))}
                    </div>
                    {course.completedModules > 0 && (
                      <Progress
                        value={(course.completedModules / course.moduleCount) * 100}
                        className="h-2 mb-3"
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {course.duration} min
                      </div>
                      <Link href={`/learning?course=${course.slug}`}>
                        <Button size="sm" variant={course.completedModules > 0 ? 'outline' : 'default'}>
                          {course.completedModules > 0 ? 'Continue' : 'Start'}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Cases Tab */}
          <TabsContent value="cases" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCases.map((caseItem) => (
                <Card key={caseItem.id} className={caseItem.completed ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Target className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{caseItem.title}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={getDifficultyColor(caseItem.difficulty)}>
                              {caseItem.difficulty}
                            </Badge>
                            {caseItem.completed && (
                              <Badge variant="outline" className="text-emerald-500">
                                Completed
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">{caseItem.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {caseItem.capacities.map(c => (
                        <Badge key={c} variant="outline" className="text-xs">
                          {c.replace('-', ' ')}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {caseItem.duration} min
                      </div>
                      <Link href={`/cases/${caseItem.slug}`}>
                        <Button size="sm" variant={caseItem.completed ? 'outline' : 'default'}>
                          {caseItem.completed ? 'Replay' : 'Start'}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
