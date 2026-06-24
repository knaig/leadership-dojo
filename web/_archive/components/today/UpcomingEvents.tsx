'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Users,
  BookOpen,
  Target,
  ChevronRight,
  ExternalLink,
  Info
} from 'lucide-react';

interface Stakeholder {
  name: string;
  email: string;
  relationshipScore: number;
  lastInteraction?: string;
  stance?: string;
}

interface Prescription {
  id: string;
  contentType: 'COURSE' | 'CASE' | 'MODULE';
  contentId: string;
  title: string;
  duration: number;
  reason: string;
  capacitySlug?: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  location?: string;
  description?: string;
  // Enriched data
  stakeholders: Stakeholder[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  prescriptions: Prescription[];
  contextNotes?: string;
}

export function UpcomingEvents() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  useEffect(() => {
    fetchUpcomingEvents();
  }, []);

  const fetchUpcomingEvents = async () => {
    try {
      const response = await fetch('/api/workspace/upcoming');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
        // Auto-expand first high-risk event
        const firstHighRisk = data.events?.find((e: UpcomingEvent) => e.riskLevel === 'HIGH');
        if (firstHighRisk) {
          setExpandedEvent(firstHighRisk.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch upcoming events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'MEDIUM': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
  };

  const getRelationshipColor = (score: number) => {
    if (score < 0.4) return 'text-red-500';
    if (score < 0.7) return 'text-amber-500';
    return 'text-emerald-500';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No upcoming events</h3>
            <p className="text-muted-foreground mb-4">
              Connect your calendar to see events that need preparation
            </p>
            <Link href="/settings/connectors">
              <Button>Connect Calendar</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const dateKey = formatDate(event.startTime);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, UpcomingEvent[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedEvents).map(([date, dateEvents]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">{date}</h3>
          <div className="space-y-4">
            {dateEvents.map((event) => {
              const isExpanded = expandedEvent === event.id;

              return (
                <Card
                  key={event.id}
                  className={`transition-all ${event.riskLevel === 'HIGH' ? 'border-red-500/30' : ''
                    }`}
                >
                  <CardHeader
                    className="cursor-pointer"
                    onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {formatTime(event.startTime)} - {formatTime(event.endTime)}
                          </span>
                          {event.riskLevel === 'HIGH' && (
                            <Badge className={getRiskColor(event.riskLevel)}>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Needs Attention
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-lg">{event.title}</CardTitle>
                        {event.attendees.length > 0 && (
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Users className="h-3 w-3" />
                            {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                          </CardDescription>
                        )}
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''
                          }`}
                      />
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="border-t pt-4 space-y-6">
                      {/* Stakeholder Context */}
                      {event.stakeholders.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Key Stakeholders
                          </h4>
                          <div className="space-y-3">
                            {event.stakeholders.map((stakeholder, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                              >
                                <div>
                                  <p className="font-medium">{stakeholder.name}</p>
                                  {stakeholder.lastInteraction && (
                                    <p className="text-sm text-muted-foreground">
                                      Last: {stakeholder.lastInteraction}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className={`font-medium ${getRelationshipColor(stakeholder.relationshipScore)}`}>
                                    {Math.round(stakeholder.relationshipScore * 10)}/10
                                  </p>
                                  {stakeholder.stance && (
                                    <p className="text-xs text-muted-foreground">{stakeholder.stance}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Context Notes */}
                      {event.contextNotes && (
                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-blue-500">Context</p>
                              <p className="text-sm mt-1">{event.contextNotes}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Prescriptions */}
                      {event.prescriptions.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            Recommended Prep
                          </h4>
                          <div className="space-y-2">
                            {event.prescriptions.map((prescription) => (
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
                                    <p className="font-medium">{prescription.title}</p>
                                    <p className="text-sm text-muted-foreground">
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
                                  <Button size="sm">
                                    Start
                                    <ExternalLink className="h-3 w-3 ml-1" />
                                  </Button>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No prescriptions message */}
                      {event.prescriptions.length === 0 && event.riskLevel === 'LOW' && (
                        <div className="text-center py-4 text-muted-foreground">
                          <p className="text-sm">No special preparation needed for this event</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <Link href={`/capture?tab=capture&eventId=${event.id}`}>
                          <Button variant="outline" size="sm">
                            Add Notes
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // TODO: Implement prep tracking - mark event as prepared
                            alert('Event marked as prepped! (Feature coming soon)');
                          }}
                        >
                          Mark as Prepped
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
