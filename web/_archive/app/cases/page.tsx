'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AppShell } from '@/components/layout/AppShell';
import {
  Target,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Clock,
  Users,
  Zap,
  LayoutGrid,
  List,
  MapPin,
  BookOpen,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { caseSummaries, caseClusters, type CaseSummary } from '@/lib/case-index';
import { getCaseById, type FullCase } from '@/lib/actions/cases';

export default function CaseDiscovery() {
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('list');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [fullCase, setFullCase] = useState<FullCase | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [loading, setLoading] = useState(false);

  // Load full case when selected
  useEffect(() => {
    if (selectedCaseId) {
      setLoading(true);
      getCaseById(selectedCaseId).then(caseData => {
        setFullCase(caseData);
        setCurrentRound(0);
        setLoading(false);
      });
    } else {
      setFullCase(null);
      setCurrentRound(0);
    }
  }, [selectedCaseId]);

  const handleBeginCase = (caseId: string) => {
    setSelectedCaseId(caseId);
  };

  const handleBackToList = () => {
    setSelectedCaseId(null);
    setSelectedCluster(null);
  };

  const handleExploreCluster = (clusterId: string) => {
    setSelectedCluster(clusterId);
  };

  const cognitiveProfile = {
    system1Tendency: 68,
    actionBias: 72,
    stakeholderAwareness: 45,
  };

  // Build clusters from real data
  const clusterMeta: Record<string, { icon: string; color: string; yourGap: string }> = {
    stakeholder: { icon: '◊', color: 'amber', yourGap: 'high' },
    uncertainty: { icon: '△', color: 'emerald', yourGap: 'medium' },
    execution: { icon: '▢', color: 'blue', yourGap: 'low' },
    crisis: { icon: '✦', color: 'red', yourGap: 'medium' },
    change: { icon: '⟡', color: 'purple', yourGap: 'high' }
  };

  const clusters = Object.entries(caseClusters).map(([id, cluster]) => ({
    id,
    title: cluster.title,
    description: cluster.description,
    cases: cluster.caseIds.length,
    yourGap: clusterMeta[id]?.yourGap || 'medium',
    icon: clusterMeta[id]?.icon || '○',
    color: clusterMeta[id]?.color || 'blue'
  }));

  // Get recommended case from real data
  const recommendedCaseSummary = caseSummaries.find(c => c.id === 'brazil_ministry_turf') || caseSummaries[0];
  const recommendedCase = {
    id: recommendedCaseSummary.id,
    title: recommendedCaseSummary.title,
    cluster: 'stakeholder',
    reason: 'Targets your stakeholder awareness gap',
    preview: recommendedCaseSummary.contextSummary,
    difficulty: recommendedCaseSummary.difficulty.charAt(0).toUpperCase() + recommendedCaseSummary.difficulty.slice(1),
    duration: `${recommendedCaseSummary.roundCount * 10}-${recommendedCaseSummary.roundCount * 15} min`,
    stages: recommendedCaseSummary.roundCount
  };

  // Get cases for selected cluster
  const getClusterCases = (clusterId: string): CaseSummary[] => {
    const cluster = caseClusters[clusterId as keyof typeof caseClusters];
    if (!cluster) return [];
    return cluster.caseIds
      .map(id => caseSummaries.find(c => c.id === id))
      .filter((c): c is CaseSummary => c !== undefined);
  };

  const getGapColor = (gap: string) => {
    switch (gap) {
      case 'high': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'medium': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'low': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getClusterColor = (color: string) => {
    const colors: Record<string, string> = {
      amber: 'bg-amber-500/20 border-amber-500/30 text-amber-500',
      emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500',
      blue: 'bg-blue-500/20 border-blue-500/30 text-blue-500',
      red: 'bg-red-500/20 border-red-500/30 text-red-500',
      purple: 'bg-purple-500/20 border-purple-500/30 text-purple-500',
    };
    return colors[color] || colors.blue;
  };

  // Case Detail View
  if (selectedCaseId && fullCase) {
    const round = fullCase.rounds[currentRound];
    return (
      <AppShell>
        <div className="p-8 max-w-4xl mx-auto">
          {/* Back Navigation */}
          <Button
            variant="ghost"
            onClick={handleBackToList}
            className="mb-6 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Cases
          </Button>

          {/* Case Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{fullCase.difficulty}</Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {fullCase.country}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold mb-2">{fullCase.title}</h1>
            <p className="text-muted-foreground">{fullCase.course.replace(/-/g, ' ')}</p>
          </div>

          {/* Learning Objectives */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-500" />
                Learning Objectives
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {fullCase.learningObjectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-amber-500 mt-1">•</span>
                    {obj}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Context */}
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">Your Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Your Role</p>
                <p className="text-sm">{fullCase.context.yourRole}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Situation</p>
                <p className="text-sm">{fullCase.context.situation}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pressure</p>
                <p className="text-sm">{fullCase.context.pressure}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reality</p>
                <p className="text-sm">{fullCase.context.reality}</p>
              </div>
            </CardContent>
          </Card>

          {/* Round Navigation */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Round:</span>
            {fullCase.rounds.map((_, i) => (
              <Button
                key={i}
                variant={currentRound === i ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentRound(i)}
                className="w-8 h-8 p-0"
              >
                {i + 1}
              </Button>
            ))}
          </div>

          {/* Current Round */}
          {round && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Round {round.round}: {round.type.replace(/_/g, ' ')}
                  </CardTitle>
                  <Badge variant="secondary">{round.type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Situation */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-amber-500" />
                    Situation
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                    {round.situation}
                  </div>
                </div>

                {/* Prompt */}
                <div className="border-l-4 border-amber-500 pl-4">
                  <h4 className="text-sm font-medium mb-2">The Question</h4>
                  <p className="text-base font-medium">{round.prompt}</p>
                </div>

                {/* Evaluation Criteria (hidden by default, shown after response) */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" />
                    View Evaluation Criteria
                  </summary>
                  <div className="mt-3 pl-6 space-y-2">
                    {round.evaluationCriteria.map((criteria, i) => (
                      <p key={i} className="text-sm text-muted-foreground">{criteria}</p>
                    ))}
                  </div>
                </details>

                {/* Coaching Notes (hidden by default) */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Show Coaching Notes
                  </summary>
                  <div className="mt-3 pl-6 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                    <p className="text-sm">{round.coachingNotes}</p>
                  </div>
                </details>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setCurrentRound(Math.max(0, currentRound - 1))}
              disabled={currentRound === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous Round
            </Button>
            <Button
              onClick={() => setCurrentRound(Math.min(fullCase.rounds.length - 1, currentRound + 1))}
              disabled={currentRound === fullCase.rounds.length - 1}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              Next Round
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {/* Key Takeaways (at the end) */}
          {currentRound === fullCase.rounds.length - 1 && fullCase.keyTakeaways && (
            <Card className="mt-8 border-emerald-500/30 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-500" />
                  Key Takeaways
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {fullCase.keyTakeaways.map((takeaway, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-500 mt-1">•</span>
                      {takeaway}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Frameworks */}
          {currentRound === fullCase.rounds.length - 1 && fullCase.frameworks && (
            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold">Frameworks & Mental Models</h3>
              {fullCase.frameworks.map((framework, i) => (
                <Card key={i}>
                  <CardHeader>
                    <CardTitle className="text-base">{framework.name}</CardTitle>
                    <CardDescription>{framework.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm"><span className="font-medium">Application:</span> {framework.application}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Related Cases */}
          {currentRound === fullCase.rounds.length - 1 && fullCase.relatedCases && fullCase.relatedCases.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Related Cases</h3>
              <div className="flex flex-wrap gap-2">
                {fullCase.relatedCases.map((relatedId) => {
                  const relatedCase = caseSummaries.find(c => c.id === relatedId);
                  if (!relatedCase) return null;
                  return (
                    <Button
                      key={relatedId}
                      variant="outline"
                      size="sm"
                      onClick={() => handleBeginCase(relatedId)}
                    >
                      {relatedCase.title}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // Loading state
  if (loading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-pulse text-4xl mb-4">◊</div>
            <p className="text-muted-foreground">Loading case...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Cluster Detail View
  if (selectedCluster) {
    const cluster = clusters.find(c => c.id === selectedCluster);
    const clusterCases = getClusterCases(selectedCluster);

    return (
      <AppShell>
        <div className="p-8">
          {/* Back Navigation */}
          <Button
            variant="ghost"
            onClick={() => setSelectedCluster(null)}
            className="mb-6 -ml-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Clusters
          </Button>

          {/* Cluster Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-3xl border ${getClusterColor(cluster?.color || 'blue')}`}>
              {cluster?.icon}
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{cluster?.title}</h1>
              <p className="text-muted-foreground">{cluster?.description}</p>
              <p className="text-sm text-muted-foreground mt-1">{clusterCases.length} cases available</p>
            </div>
          </div>

          {/* Cases in this Cluster */}
          <div className="space-y-4">
            {clusterCases.map(caseItem => (
              <Card
                key={caseItem.id}
                className="hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => handleBeginCase(caseItem.id)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">{caseItem.title}</h3>
                        <Badge variant="outline">{caseItem.difficulty}</Badge>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {caseItem.country}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{caseItem.contextSummary}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {caseItem.roundCount} rounds
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {caseItem.roundCount * 10}-{caseItem.roundCount * 15} min
                        </span>
                      </div>
                    </div>
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-black self-center"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent double-trigger from card onClick
                        handleBeginCase(caseItem.id);
                      }}
                    >
                      Begin
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // Main List View
  return (
    <AppShell>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Target className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Case Studies</h1>
              <p className="text-sm text-muted-foreground">{caseSummaries.length} cases across {Object.keys(caseClusters).length} knowledge clusters</p>
            </div>
          </div>
        </div>

        {/* Cognitive Profile Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">System 1 Tendency</span>
                <span className="text-xl font-semibold text-amber-500">{cognitiveProfile.system1Tendency}%</span>
              </div>
              <Progress value={cognitiveProfile.system1Tendency} className="h-1.5 mb-2" />
              <p className="text-xs text-muted-foreground">You rely on intuition in high-pressure moments</p>
            </CardContent>
          </Card>

          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Action Bias</span>
                <span className="text-xl font-semibold text-red-500">{cognitiveProfile.actionBias}%</span>
              </div>
              <Progress value={cognitiveProfile.actionBias} className="h-1.5 mb-2" />
              <p className="text-xs text-muted-foreground">Strong preference for "doing something"</p>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Stakeholder Reading</span>
                  <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-xs">Focus Area</Badge>
                </div>
                <span className="text-xl font-semibold">{cognitiveProfile.stakeholderAwareness}%</span>
              </div>
              <Progress value={cognitiveProfile.stakeholderAwareness} className="h-1.5 mb-2" />
              <p className="text-xs text-muted-foreground">Gap: Technical focus before political dynamics</p>
            </CardContent>
          </Card>
        </div>

        {/* Recommended Case */}
        <Card className="mb-8 border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-lg bg-amber-500/20 flex items-center justify-center text-3xl">
                ◊
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-amber-500/20 text-amber-400">Recommended for you</Badge>
                  <span className="text-xs text-muted-foreground">{recommendedCase.difficulty} • {recommendedCase.duration}</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{recommendedCase.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{recommendedCase.preview}</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {recommendedCase.stages} decision points
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Multi-stakeholder
                    </span>
                  </div>
                  <Button
                    className="ml-auto bg-amber-500 hover:bg-amber-600 text-black"
                    onClick={() => handleBeginCase(recommendedCase.id)}
                  >
                    Begin Case
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Clusters */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Knowledge Clusters</h2>
              <p className="text-sm text-muted-foreground">{caseSummaries.length} cases across {Object.keys(caseClusters).length} thematic areas</p>
            </div>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
                className="gap-1"
              >
                <List className="h-4 w-4" />
                List
              </Button>
              <Button
                variant={view === 'map' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('map')}
                className="gap-1"
              >
                <LayoutGrid className="h-4 w-4" />
                Map
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {clusters.map(cluster => (
              <Card
                key={cluster.id}
                className="hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => handleExploreCluster(cluster.id)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-2xl border ${getClusterColor(cluster.color)}`}>
                      {cluster.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">{cluster.title}</h3>
                        {cluster.yourGap === 'high' && (
                          <Badge variant="outline" className={getGapColor(cluster.yourGap)}>
                            Priority Area
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{cluster.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{cluster.cases} cases available</span>
                        <span>•</span>
                        <span>Skill gap: {cluster.yourGap}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-amber-500 hover:text-amber-400 self-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExploreCluster(cluster.id);
                      }}
                    >
                      Explore <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Gap Analysis Legend */}
          <Card className="mt-6">
            <CardContent className="pt-6">
              <h4 className="text-sm font-medium mb-3">Your Gap Analysis</h4>
              <div className="flex items-center gap-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span>High priority for development</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Medium priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span>Current strength</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
