'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { BookOpen, Clock, GraduationCap, ChevronRight, ArrowLeft, CheckCircle2, Lock, Play } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { courseSummaries } from '@/lib/course-index';
import { getCourseById } from '@/lib/actions/courses';

type CourseSummary = typeof courseSummaries[0];

type CourseSummaryWithProgress = CourseSummary & {
  progress?: number;
  status?: 'not-started' | 'in-progress' | 'completed';
};

// Generic types for flexible content structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentValue = string | number | boolean | null | ContentObject | ContentArray;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentObject = { [key: string]: ContentValue };
type ContentArray = ContentValue[];

interface CourseModule {
  id: string;
  title: string;
  duration: string;
  type: string;
  content?: ContentObject;
  exercises?: ContentArray;
}

// Generic recursive content renderer
function renderContent(value: ContentValue, depth: number = 0, parentKey?: string): React.ReactNode {
  // Handle null/undefined
  if (value === null || value === undefined) return null;

  // Handle primitives (string, number, boolean)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Empty array
    if (value.length === 0) return null;

    // Array of strings - render as bullet list
    if (value.every(item => typeof item === 'string')) {
      return (
        <ul className="space-y-1 ml-4">
          {value.map((item, idx) => (
            <li key={idx} className="text-sm flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>{String(item)}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Array of objects - render each object as a card or section
    return (
      <div className="space-y-3">
        {value.map((item, idx) => {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return (
              <div key={idx} className="border-l-2 border-primary/30 pl-4 py-2">
                {renderObjectContent(item as ContentObject, depth + 1)}
              </div>
            );
          }
          // Fallback for other array items
          return <div key={idx}>{renderContent(item, depth + 1)}</div>;
        })}
      </div>
    );
  }

  // Handle objects
  if (typeof value === 'object') {
    return renderObjectContent(value as ContentObject, depth);
  }

  return null;
}

// Render object content with special handling for common keys
function renderObjectContent(obj: ContentObject, depth: number = 0): React.ReactNode {
  const entries = Object.entries(obj);

  // Find a "title" field to use as header (common patterns: title, pattern, technique, strategy, etc.)
  const titleKeys = ['title', 'pattern', 'technique', 'strategy', 'approach', 'scenario', 'practice', 'step', 'stage', 'principle', 'method', 'concept', 'insight', 'signal', 'category', 'type', 'element', 'level', 'framework', 'model', 'dimension', 'habit', 'commitment', 'activity', 'application', 'audience', 'barrier', 'behavior', 'challenge', 'component', 'dynamic', 'mistake', 'source', 'tactic', 'phrase', 'objection', 'solution', 'template', 'funder', 'quadrant', 'indicator', 'section'];
  const titleKey = titleKeys.find(k => obj[k] && typeof obj[k] === 'string');
  const titleValue = titleKey ? obj[titleKey] as string : null;

  // Keys to skip or handle specially
  const skipKeys = new Set(['id', 'slug']);
  const highlightKeys = new Set(['inGovernmentContext', 'governmentContext', 'governmentExample', 'governmentApplication']);
  const insightKeys = new Set(['keyInsight', 'insight']);

  return (
    <div className="space-y-2">
      {titleValue && (
        <h6 className="font-medium text-sm">{titleValue}</h6>
      )}
      {entries.map(([key, val]) => {
        // Skip title key if already rendered, skip internal keys
        if (key === titleKey || skipKeys.has(key)) return null;
        if (val === null || val === undefined) return null;

        // Handle government context (blue highlight)
        if (highlightKeys.has(key) && typeof val === 'string') {
          return (
            <div key={key} className="bg-blue-500/10 p-2 rounded text-sm">
              <span className="text-blue-400 text-xs font-medium block mb-1">In Government Context</span>
              {val}
            </div>
          );
        }

        // Handle key insights (amber highlight)
        if (insightKeys.has(key) && typeof val === 'string') {
          return (
            <div key={key} className="bg-amber-500/10 p-2 rounded text-sm">
              <span className="text-amber-400 text-xs font-medium block mb-1">💡 Key Insight</span>
              {val}
            </div>
          );
        }

        // Handle string values directly (description, example, how, why, etc.)
        if (typeof val === 'string') {
          // Short label keys just render the value
          const labelKeys = ['description', 'how', 'why', 'example', 'explanation', 'consequence', 'benefit', 'implication', 'guidance', 'remedy', 'mitigation', 'interpretation', 'meaning', 'context', 'formula', 'scoring', 'planning', 'strategy', 'approach'];
          if (labelKeys.includes(key)) {
            return (
              <p key={key} className="text-sm text-muted-foreground">{val}</p>
            );
          }
          // Other string keys - show with label
          return (
            <div key={key} className="text-sm">
              <span className="text-muted-foreground capitalize">{formatKey(key)}: </span>
              <span>{val}</span>
            </div>
          );
        }

        // Handle arrays and nested objects
        if (typeof val === 'object') {
          const label = formatKey(key);
          return (
            <div key={key} className="mt-2">
              {depth < 2 && (
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
              )}
              <div className={depth < 2 ? "mt-1" : ""}>
                {renderContent(val, depth + 1, key)}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// Format camelCase or snake_case keys to readable labels
function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

interface FullCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tier: number;
  difficulty: string;
  duration: string;
  learningObjectives: string[];
  modules: CourseModule[];
}

export default function LearningPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [fullCourse, setFullCourse] = useState<FullCourse | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [selectedModuleIdx, setSelectedModuleIdx] = useState<number | null>(null);

  // Add mock progress data
  const courses: CourseSummaryWithProgress[] = courseSummaries.map((course, idx) => ({
    ...course,
    progress: idx === 0 ? 60 : idx === 1 ? 25 : 0,
    status: idx === 0 ? 'in-progress' as const : idx === 1 ? 'in-progress' as const : 'not-started' as const
  }));

  const selectedCourseSummary = selectedCourseId
    ? courses.find(c => c.id === selectedCourseId)
    : null;

  // Load full course data when a course is selected
  useEffect(() => {
    if (selectedCourseId) {
      setLoadingCourse(true);
      getCourseById(selectedCourseId)
        .then((course) => {
          setFullCourse(course as FullCourse | null);
          setLoadingCourse(false);
        })
        .catch((err) => {
          console.error('Error loading course:', err);
          setLoadingCourse(false);
        });
    } else {
      setFullCourse(null);
    }
  }, [selectedCourseId]);

  const tiers = [
    { id: 1, name: 'Cognitive Foundations', color: 'bg-emerald-500' },
    { id: 2, name: 'Stakeholder & Execution', color: 'bg-blue-500' },
    { id: 3, name: 'Strategic & Ecosystem', color: 'bg-purple-500' },
    { id: 4, name: 'Advanced Leadership', color: 'bg-amber-500' },
  ];

  const filteredCourses = selectedTier
    ? courses.filter(c => c.tier === selectedTier)
    : courses;

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'in-progress': return <Play className="h-4 w-4 text-blue-500" />;
      default: return <Lock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'foundation': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'intermediate': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'advanced': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'expert': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const selectedModule = selectedModuleIdx !== null && fullCourse?.modules
    ? fullCourse.modules[selectedModuleIdx]
    : null;

  // Module detail view - uses generic recursive renderer for all content
  if (selectedModule && fullCourse) {
    const content = selectedModule.content || {};
    const typedContent = content as ContentObject;
    const overview = typedContent.overview as string | undefined;
    const keyPoints = typedContent.keyPoints as ContentArray | undefined;
    const keyInsight = typedContent.keyInsight as string | undefined;
    const { overview: _o, keyPoints: _kp, keyInsight: _ki, ...otherContent } = typedContent;

    return (
      <AppShell>
        <div className="p-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedModuleIdx(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {fullCourse.title}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">Module {selectedModuleIdx! + 1}</Badge>
                <Badge variant="outline">{selectedModule.duration}</Badge>
                <Badge variant="outline" className="capitalize">{selectedModule.type}</Badge>
              </div>
              <CardTitle className="text-2xl">{selectedModule.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Overview */}
              {overview && (
                <div>
                  <h4 className="font-semibold mb-3 text-lg">Overview</h4>
                  <p className="text-muted-foreground leading-relaxed">{overview}</p>
                </div>
              )}

              {/* Key Points - rendered with generic renderer */}
              {keyPoints && Array.isArray(keyPoints) && keyPoints.length > 0 && (
                <div className="space-y-6">
                  {keyPoints.map((keyPoint, kpIdx) => {
                    if (typeof keyPoint !== 'object' || keyPoint === null || Array.isArray(keyPoint)) {
                      return null;
                    }
                    const kp = keyPoint as ContentObject;
                    const title = kp.title as string || `Key Point ${kpIdx + 1}`;

                    // Extract special fields
                    const { title: _, ...kpContent } = kp;

                    return (
                      <Card key={kpIdx} className="bg-muted/30">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">{title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {renderObjectContent(kpContent, 0)}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Any other content fields - rendered generically */}
              {Object.keys(otherContent).length > 0 && (
                <div className="space-y-6">
                  {Object.entries(otherContent).map(([key, value]) => {
                    if (value === null || value === undefined) return null;
                    return (
                      <div key={key}>
                        <h4 className="font-semibold mb-3 text-lg capitalize">{formatKey(key)}</h4>
                        {renderContent(value, 0, key)}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Key Insight */}
              {keyInsight && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2 text-amber-400">💡 Key Insight</h4>
                  <p className="text-sm">{keyInsight}</p>
                </div>
              )}

              {/* Exercises - rendered generically */}
              {selectedModule.exercises && Array.isArray(selectedModule.exercises) && selectedModule.exercises.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-lg">Exercises</h4>
                  <div className="space-y-3">
                    {selectedModule.exercises.map((exercise, exIdx) => {
                      if (typeof exercise !== 'object' || exercise === null || Array.isArray(exercise)) {
                        return <div key={exIdx} className="text-sm">{String(exercise)}</div>;
                      }
                      const ex = exercise as ContentObject;
                      return (
                        <Card key={exIdx} className="bg-emerald-500/5 border-emerald-500/20">
                          <CardContent className="p-4">
                            {ex.type && <Badge variant="outline" className="mb-2 capitalize">{String(ex.type)}</Badge>}
                            {ex.prompt && <p className="text-sm">{String(ex.prompt)}</p>}
                            {/* Render any other exercise fields */}
                            {Object.entries(ex).filter(([k]) => k !== 'type' && k !== 'prompt').map(([k, v]) => (
                              <div key={k} className="mt-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase">{formatKey(k)}</span>
                                <div className="mt-1">{renderContent(v, 0, k)}</div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              <Separator />

              {/* Navigation */}
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  disabled={selectedModuleIdx === 0}
                  onClick={() => setSelectedModuleIdx(selectedModuleIdx! - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous Module
                </Button>
                <Button
                  disabled={selectedModuleIdx! >= fullCourse.modules.length - 1}
                  onClick={() => setSelectedModuleIdx(selectedModuleIdx! + 1)}
                >
                  Next Module
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (selectedCourseSummary) {
    return (
      <AppShell>
        <div className="p-8">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setSelectedCourseId(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Courses
            </Button>
          </div>

          {loadingCourse ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading course content...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Course Info */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={getDifficultyColor(selectedCourseSummary.difficulty)}>
                        {selectedCourseSummary.difficulty || 'Foundation'}
                      </Badge>
                      <Badge variant="secondary">Tier {selectedCourseSummary.tier || 1}</Badge>
                    </div>
                    <CardTitle className="text-2xl">{fullCourse?.title || selectedCourseSummary.title}</CardTitle>
                    <CardDescription className="text-base">{fullCourse?.subtitle || selectedCourseSummary.subtitle}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <p className="text-muted-foreground">{fullCourse?.description || selectedCourseSummary.description}</p>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedCourseSummary.duration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <span>{fullCourse?.modules?.length || selectedCourseSummary.moduleCount} modules</span>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-semibold mb-3">Learning Objectives</h4>
                      <ul className="space-y-2">
                        {(fullCourse?.learningObjectives || selectedCourseSummary.learningObjectives)?.map((obj, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => {
                        // Start the first module
                        if (fullCourse?.modules?.[0]) {
                          setSelectedModuleIdx(0);
                        }
                      }}
                    >
                      Start Course
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Modules List */}
              <div className="lg:col-span-2">
                <h3 className="text-xl font-semibold mb-4">Course Modules</h3>
                <div className="space-y-3">
                  {fullCourse?.modules ? (
                    fullCourse.modules.map((module, idx) => (
                      <Card
                        key={module.id}
                        className="hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedModuleIdx(idx)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium bg-muted text-muted-foreground">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-4">
                                <h4 className="font-medium">{module.title}</h4>
                                <span className="text-sm text-muted-foreground shrink-0">{module.duration}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {typeof module.content?.overview === 'string' ? module.content.overview.substring(0, 150) : ''}...
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    // Fallback to placeholders while loading
                    Array.from({ length: selectedCourseSummary.moduleCount }).map((_, idx) => (
                      <Card key={idx} className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium bg-muted text-muted-foreground">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium">Module {idx + 1}</h4>
                              <p className="text-sm text-muted-foreground">Loading...</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Course Library</h1>
              <p className="text-sm text-muted-foreground">{courses.length} courses available</p>
            </div>
          </div>
        </div>

        {/* Tier Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Button
            variant={selectedTier === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTier(null)}
          >
            All Courses
          </Button>
          {tiers.map(tier => (
            <Button
              key={tier.id}
              variant={selectedTier === tier.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTier(tier.id)}
              className="gap-2"
            >
              <div className={`w-2 h-2 rounded-full ${tier.color}`} />
              {tier.name}
            </Button>
          ))}
        </div>

        {/* Course Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map(course => (
            <Card
              key={course.id}
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => setSelectedCourseId(course.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={getDifficultyColor(course.difficulty)}>
                    {course.difficulty || 'Foundation'}
                  </Badge>
                  {getStatusIcon(course.status)}
                </div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors line-clamp-2">
                  {course.title}
                </CardTitle>
                <CardDescription className="line-clamp-1">{course.subtitle}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {course.description}
                </p>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{course.duration}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    <span>{course.moduleCount} modules</span>
                  </div>
                </div>

                {course.progress !== undefined && course.progress > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span>{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} className="h-1.5" />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Badge variant="secondary" className="text-xs">
                    Tier {course.tier} - {course.category}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
