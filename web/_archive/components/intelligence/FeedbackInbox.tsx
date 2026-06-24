'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Eye,
  Calendar,
  AlertTriangle,
  Trophy,
  Check,
  X,
  ChevronRight
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  type: 'NUDGE' | 'OBSERVATION' | 'WEEKLY_DIGEST' | 'INTERVENTION' | 'CELEBRATION';
  title: string;
  content: string;
  status: 'PENDING' | 'DELIVERED' | 'READ' | 'ACTED' | 'DISMISSED';
  recommendedCourses: string[];
  recommendedCases: string[];
  createdAt: string;
}

const typeConfig = {
  NUDGE: { icon: Bell, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Nudge' },
  OBSERVATION: { icon: Eye, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Observation' },
  WEEKLY_DIGEST: { icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Weekly Digest' },
  INTERVENTION: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Action Needed' },
  CELEBRATION: { icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Achievement' },
};

export function FeedbackInbox() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      const response = await fetch('/api/feedback?status=PENDING,DELIVERED');
      if (response.ok) {
        const data = await response.json();
        setFeedback(data.feedback || []);
      }
    } catch (error) {
      console.error('Failed to fetch feedback:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/feedback/${id}/read`, { method: 'POST' });
      setFeedback(feedback.map(f => f.id === id ? { ...f, status: 'READ' as const } : f));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismiss = async (id: string) => {
    try {
      await fetch(`/api/feedback/${id}/dismiss`, { method: 'POST' });
      setFeedback(feedback.filter(f => f.id !== id));
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feedback Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = feedback.filter(f => f.status === 'PENDING' || f.status === 'DELIVERED').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Feedback Inbox
              {pendingCount > 0 && (
                <Badge variant="default" className="rounded-full">
                  {pendingCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Personalized insights and recommendations</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {feedback.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pending feedback</p>
            <p className="text-sm mt-2">
              Check back after syncing more work data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {feedback.map((item) => {
              const config = typeConfig[item.type];
              const Icon = config.icon;
              const isExpanded = expandedId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border ${config.bg} ${
                    item.status === 'PENDING' ? 'border-l-4 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 ${config.color} mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-xs ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                      <h4 className="font-medium text-sm">{item.title}</h4>

                      {isExpanded && (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {item.content}
                          </p>

                          {(item.recommendedCourses.length > 0 || item.recommendedCases.length > 0) && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs font-medium mb-2">Recommended:</p>
                              <div className="flex flex-wrap gap-2">
                                {item.recommendedCourses.map((course) => (
                                  <Badge key={course} variant="secondary" className="text-xs">
                                    Course: {course}
                                  </Badge>
                                ))}
                                {item.recommendedCases.map((caseItem) => (
                                  <Badge key={caseItem} variant="secondary" className="text-xs">
                                    Case: {caseItem}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 mt-4">
                            <Button size="sm" variant="outline" onClick={() => markAsRead(item.id)}>
                              <Check className="h-4 w-4 mr-1" />
                              Mark as Read
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => dismiss(item.id)}>
                              <X className="h-4 w-4 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
