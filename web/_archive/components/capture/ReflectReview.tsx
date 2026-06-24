'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  ChevronRight,
  BookOpen,
  Target,
  ExternalLink,
  Clock,
  Calendar
} from 'lucide-react';

interface Observation {
  id: string;
  type: 'POSITIVE' | 'NEGATIVE' | 'MISSED_OPPORTUNITY';
  capacity: {
    slug: string;
    name: string;
  };
  observation: string;
  evidence: string;
  context: string;
  score: number;
  userAgreed?: boolean;
  userFeedback?: string;
}

interface Prescription {
  id: string;
  contentType: 'COURSE' | 'CASE' | 'MODULE';
  contentId: string;
  title: string;
  duration: number;
  reason: string;
}

interface Artifact {
  id: string;
  type: string;
  title: string;
  occurredAt: string;
  observations: Observation[];
  prescriptions: Prescription[];
}

export function ReflectReview() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [feedbackInput, setFeedbackInput] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchArtifacts();
  }, []);

  const fetchArtifacts = async () => {
    try {
      const response = await fetch('/api/workspace/artifacts?analyzed=true&limit=10');
      if (response.ok) {
        const data = await response.json();
        setArtifacts(data.artifacts || []);
        // Auto-expand first artifact with observations
        const firstWithObs = data.artifacts?.find((a: Artifact) => a.observations.length > 0);
        if (firstWithObs) {
          setExpandedArtifact(firstWithObs.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch artifacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (observationId: string, agreed: boolean) => {
    try {
      await fetch(`/api/observations/${observationId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreed,
          feedback: feedbackInput[observationId] || null
        })
      });

      // Update local state
      setArtifacts(prev =>
        prev.map(artifact => ({
          ...artifact,
          observations: artifact.observations.map(obs =>
            obs.id === observationId
              ? { ...obs, userAgreed: agreed, userFeedback: feedbackInput[observationId] }
              : obs
          )
        }))
      );
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'POSITIVE':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'NEGATIVE':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'MISSED_OPPORTUNITY':
        return <Lightbulb className="h-5 w-5 text-amber-500" />;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'POSITIVE':
        return <Badge className="bg-emerald-500/10 text-emerald-500">Strength</Badge>;
      case 'NEGATIVE':
        return <Badge className="bg-red-500/10 text-red-500">Growth Area</Badge>;
      case 'MISSED_OPPORTUNITY':
        return <Badge className="bg-amber-500/10 text-amber-500">Missed Opportunity</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getArtifactIcon = (type: string) => {
    if (type.includes('MEETING')) return <Calendar className="h-4 w-4" />;
    if (type.includes('EMAIL')) return <MessageSquare className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nothing to reflect on yet</h3>
            <p className="text-muted-foreground mb-4">
              Capture work events to get insights and feedback
            </p>
            <Link href="/workspace?tab=capture">
              <Button variant="outline">Go to Capture</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Recent Work Insights</h3>
          <p className="text-sm text-muted-foreground">
            Review observations from your analyzed work artifacts
          </p>
        </div>
        <Button variant="outline" size="sm">
          View All History
        </Button>
      </div>

      {artifacts.map((artifact) => {
        const isExpanded = expandedArtifact === artifact.id;
        const hasObservations = artifact.observations.length > 0;

        return (
          <Card key={artifact.id}>
            <CardHeader
              className="cursor-pointer"
              onClick={() => setExpandedArtifact(isExpanded ? null : artifact.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    {getArtifactIcon(artifact.type)}
                  </div>
                  <div>
                    <CardTitle className="text-base">{artifact.title || 'Untitled'}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <span>{formatDate(artifact.occurredAt)}</span>
                      {hasObservations && (
                        <>
                          <span>•</span>
                          <span>{artifact.observations.length} insight{artifact.observations.length > 1 ? 's' : ''}</span>
                        </>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <ChevronRight
                  className={`h-5 w-5 text-muted-foreground transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="border-t pt-4 space-y-6">
                {/* Observations */}
                {artifact.observations.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">What we observed</h4>
                    {artifact.observations.map((observation) => (
                      <div
                        key={observation.id}
                        className="p-4 rounded-lg border space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {getTypeIcon(observation.type)}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                {getTypeBadge(observation.type)}
                                <Badge variant="outline">{observation.capacity.name}</Badge>
                              </div>
                              <p className="text-sm">{observation.observation}</p>
                            </div>
                          </div>
                        </div>

                        {observation.evidence && (
                          <div className="ml-8 p-3 rounded bg-muted/50 text-sm italic">
                            "{observation.evidence}"
                          </div>
                        )}

                        {/* Feedback Section */}
                        {observation.userAgreed === undefined ? (
                          <div className="ml-8 space-y-3">
                            <p className="text-sm text-muted-foreground">Do you agree with this observation?</p>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFeedback(observation.id, true)}
                                className="gap-2"
                              >
                                <ThumbsUp className="h-4 w-4" />
                                Yes
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFeedback(observation.id, false)}
                                className="gap-2"
                              >
                                <ThumbsDown className="h-4 w-4" />
                                Not quite
                              </Button>
                            </div>
                            <Textarea
                              placeholder="Add context the system might have missed..."
                              value={feedbackInput[observation.id] || ''}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                setFeedbackInput(prev => ({
                                  ...prev,
                                  [observation.id]: e.target.value
                                }))
                              }
                              className="text-sm"
                            />
                          </div>
                        ) : (
                          <div className="ml-8 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {observation.userAgreed ? (
                                <><ThumbsUp className="h-3 w-3" /> You agreed</>
                              ) : (
                                <><ThumbsDown className="h-3 w-3" /> You disagreed</>
                              )}
                              {observation.userFeedback && (
                                <span>: "{observation.userFeedback}"</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No specific observations for this artifact.
                  </p>
                )}

                {/* Prescriptions */}
                {artifact.prescriptions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">To strengthen this area</h4>
                    {artifact.prescriptions.map((prescription) => (
                      <div
                        key={prescription.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          {prescription.contentType === 'CASE' ? (
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                              <Target className="h-5 w-5 text-amber-500" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-emerald-500" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm">{prescription.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {prescription.duration} min • {prescription.reason}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={
                            prescription.contentType === 'CASE'
                              ? `/cases/${prescription.contentId}`
                              : `/learning?course=${prescription.contentId}`
                          }
                        >
                          <Button size="sm" variant="outline">
                            Start
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
