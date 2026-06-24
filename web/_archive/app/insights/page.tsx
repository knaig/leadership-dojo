'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Eye,
  Target,
  Users,
  Brain,
  Scale,
  Zap,
  ChevronRight,
  Calendar,
  BookOpen,
  BarChart3,
  History
} from 'lucide-react';

interface CapacityScore {
  id: string;
  capacity: {
    slug: string;
    name: string;
    description: string;
  };
  score: number;
  confidence: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
  positiveCount: number;
  negativeCount: number;
  missedCount: number;
  lastObservation: string | null;
}

const capacityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'situational-awareness': Eye,
  'outcome-orientation': Target,
  'relationship-capital': Users,
  'domain-mastery': Brain,
  'decision-quality': Scale,
  'execution-velocity': Zap,
};

const capacityDescriptions: Record<string, string> = {
  'situational-awareness': 'Reading what\'s not said - political dynamics, hidden agendas, timing',
  'outcome-orientation': 'Focus on what matters - results over activities',
  'relationship-capital': 'Trust built over time - your network of influence',
  'domain-mastery': 'Contextual expertise - knowing your terrain deeply',
  'decision-quality': 'Judgment under uncertainty - making good calls with incomplete data',
  'execution-velocity': 'Fast on the right things - bias toward action that matters',
};

const trendConfig = {
  IMPROVING: { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Improving' },
  STABLE: { icon: Minus, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Stable' },
  DECLINING: { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Declining' },
  INSUFFICIENT_DATA: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Need more data' },
};

// ... types
interface ConfidenceMetrics {
  score: number;
  volume: number;
  consistency: number;
  timeSpanDays: number;
  dataPoints: number;
}

interface SWOTItem {
  type: 'STRENGTH' | 'WEAKNESS' | 'OPPORTUNITY' | 'THREAT';
  capacity: string;
  description: string;
  confidence: ConfidenceMetrics;
  evidence: string[];
}

export default function GrowthPage() {
  const [scores, setScores] = useState<CapacityScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('capacities');

  const [swot, setSwot] = useState<SWOTItem[]>([]);
  const [swotLoading, setSwotLoading] = useState(false);

  useEffect(() => {
    fetchScores();
    if (activeTab === 'insights') {
      fetchSWOT();
    }
  }, [activeTab]);

  const fetchScores = async () => {
    try {
      const response = await fetch('/api/capacities/scores');
      if (response.ok) {
        const data = await response.json();
        setScores(data.scores || []);
      }
    } catch (error) {
      console.error('Failed to fetch capacity scores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSWOT = async () => {
    if (swot.length > 0) return;
    setSwotLoading(true);
    try {
      const response = await fetch('/api/intelligence/swot');
      if (response.ok) {
        const data = await response.json();
        setSwot(data.swot || []);
      }
    } catch (error) {
      console.error('Failed to fetch SWOT:', error);
    } finally {
      setSwotLoading(false);
    }
  };

  const totalObservations = scores.reduce(
    (sum, s) => sum + s.positiveCount + s.negativeCount + s.missedCount,
    0
  );

  const averageScore = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
    : 0;

  const topCapacity = scores.length > 0
    ? scores.reduce((max, s) => s.score > max.score ? s : max, scores[0])
    : null;

  const growthArea = scores.length > 0
    ? scores.reduce((min, s) => s.score < min.score ? s : min, scores[0])
    : null;

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Growth</h1>
          <p className="text-muted-foreground mt-1">
            Track your development across the 6 core leadership capacities
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{averageScore.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">Average Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalObservations}</p>
                  <p className="text-sm text-muted-foreground">Observations</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  {topCapacity && capacityIcons[topCapacity.capacity.slug] ? (
                    (() => {
                      const Icon = capacityIcons[topCapacity.capacity.slug];
                      return <Icon className="h-6 w-6 text-blue-500" />;
                    })()
                  ) : (
                    <Target className="h-6 w-6 text-blue-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold truncate">
                    {topCapacity?.capacity.name || 'N/A'}
                  </p>
                  <p className="text-sm text-muted-foreground">Top Strength</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  {growthArea && capacityIcons[growthArea.capacity.slug] ? (
                    (() => {
                      const Icon = capacityIcons[growthArea.capacity.slug];
                      return <Icon className="h-6 w-6 text-amber-500" />;
                    })()
                  ) : (
                    <AlertCircle className="h-6 w-6 text-amber-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold truncate">
                    {growthArea?.capacity.name || 'N/A'}
                  </p>
                  <p className="text-sm text-muted-foreground">Growth Focus</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="capacities">Capacities</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          {/* Capacities Tab */}
          <TabsContent value="capacities" className="space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-xl" />
                ))}
              </div>
            ) : scores.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No capacity data yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Connect your work tools and capture work events to build your profile
                    </p>
                    <div className="flex justify-center gap-3">
                      <Link href="/settings/connectors">
                        <Button variant="outline">Connect Data Sources</Button>
                      </Link>
                      <Link href="/workspace">
                        <Button>Go to Workspace</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scores.map((score) => {
                  const Icon = capacityIcons[score.capacity.slug] || Eye;
                  const trend = trendConfig[score.trend];
                  const TrendIcon = trend.icon;
                  const scorePercent = (score.score / 5) * 100;
                  const description = capacityDescriptions[score.capacity.slug] || score.capacity.description;

                  return (
                    <Card key={score.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-lg ${trend.bg} flex items-center justify-center`}>
                              <Icon className={`h-6 w-6 ${trend.color}`} />
                            </div>
                            <div>
                              <CardTitle className="text-base">{score.capacity.name}</CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={`${trend.bg} ${trend.color}`}>
                                  <TrendIcon className="h-3 w-3 mr-1" />
                                  {trend.label}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold">{score.score.toFixed(1)}</p>
                            <p className="text-xs text-muted-foreground">/ 5.0</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">{description}</p>
                        <Progress value={scorePercent} className="h-2 mb-3" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {score.positiveCount} positive • {score.negativeCount} gaps • {score.missedCount} missed
                          </span>
                          <Link href={`/grow?capacity=${score.capacity.slug}`}>
                            <Button variant="ghost" size="sm" className="h-6 text-xs">
                              Practice
                              <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Observation History</CardTitle>
                <CardDescription>Your capacity observations over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4" />
                  <p>Historical view coming soon</p>
                  <p className="text-sm mt-2">Track your growth trajectory over weeks and months</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths & Weaknesses */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      Strengths
                    </CardTitle>
                    <CardDescription>Consistently demonstrated high performance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {swotLoading ? (
                      <div className="text-sm text-muted-foreground p-4 text-center">Analyzing patterns...</div>
                    ) : swot.filter(i => i.type === 'STRENGTH').length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 text-center bg-muted/50 rounded">
                        No clear strengths identified yet. Keep logging work!
                      </div>
                    ) : (
                      swot.filter(i => i.type === 'STRENGTH').map((item, idx) => (
                        <SWOTCard key={idx} item={item} />
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-blue-500" />
                      Opportunities
                    </CardTitle>
                    <CardDescription>Areas showing promise but needing consistency</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {swotLoading ? (
                      <div className="text-sm text-muted-foreground">Loading...</div>
                    ) : swot.filter(i => i.type === 'OPPORTUNITY').length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 text-center bg-muted/50 rounded">
                        No specific opportunities identified.
                      </div>
                    ) : (
                      swot.filter(i => i.type === 'OPPORTUNITY').map((item, idx) => (
                        <SWOTCard key={idx} item={item} />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Weaknesses & Threats */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      Focus Areas (Weaknesses)
                    </CardTitle>
                    <CardDescription>Areas consistently needing improvement</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {swotLoading ? (
                      <div className="text-sm text-muted-foreground">Loading...</div>
                    ) : swot.filter(i => i.type === 'WEAKNESS').length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 text-center bg-muted/50 rounded">
                        No critical focus areas identified. Great job!
                      </div>
                    ) : (
                      swot.filter(i => i.type === 'WEAKNESS').map((item, idx) => (
                        <SWOTCard key={idx} item={item} />
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-slate-500" />
                      Blind Spots (Threats)
                    </CardTitle>
                    <CardDescription>Emerging gaps or inconsistent performance</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {swotLoading ? (
                      <div className="text-sm text-muted-foreground">Loading...</div>
                    ) : swot.filter(i => i.type === 'THREAT').length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 text-center bg-muted/50 rounded">
                        No blind spots detected currently.
                      </div>
                    ) : (
                      swot.filter(i => i.type === 'THREAT').map((item, idx) => (
                        <SWOTCard key={idx} item={item} />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SWOTCard({ item }: { item: SWOTItem }) {
  const confidence = item.confidence;
  const confidencePercent = Math.round(confidence.score * 100);

  let confidenceColor = 'bg-slate-500';
  if (confidence.score >= 0.7) confidenceColor = 'bg-emerald-500';
  else if (confidence.score >= 0.4) confidenceColor = 'bg-amber-500';

  return (
    <div className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors group">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-sm">{item.capacity}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" title={`Based on ${confidence.dataPoints} observations over ${confidence.timeSpanDays} days`}>
          <span>{confidencePercent}% Confidence</span>
          <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full ${confidenceColor}`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-3">{item.description}</p>

      {/* Evidence & Metrics (Hidden by default, hover to reveal or always visible if preferred) */}
      <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground grid grid-cols-3 gap-2">
        <div>
          <span className="block font-medium text-foreground">Volume</span>
          {confidence.dataPoints} Data Points
        </div>
        <div>
          <span className="block font-medium text-foreground">Consistency</span>
          {Math.round(confidence.consistency * 100)}% Match
        </div>
        <div>
          <span className="block font-medium text-foreground">Time Span</span>
          {confidence.timeSpanDays} Days
        </div>
      </div>
    </div>
  );
}
