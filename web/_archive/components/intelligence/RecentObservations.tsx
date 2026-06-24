'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';

interface Observation {
  id: string;
  type: 'POSITIVE' | 'NEGATIVE' | 'MISSED_OPPORTUNITY' | 'NEUTRAL';
  observation: string;
  evidence: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  capacity: {
    slug: string;
    name: string;
  };
  artifact?: {
    title: string;
    type: string;
  };
  createdAt: string;
}

const typeConfig = {
  POSITIVE: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Strength' },
  NEGATIVE: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Gap' },
  MISSED_OPPORTUNITY: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Missed' },
  NEUTRAL: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Neutral' },
};

export function RecentObservations({ limit = 5 }: { limit?: number }) {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchObservations();
  }, []);

  const fetchObservations = async () => {
    try {
      const response = await fetch(`/api/observations?limit=${limit}`);
      if (response.ok) {
        const data = await response.json();
        setObservations(data.observations || []);
      }
    } catch (error) {
      console.error('Failed to fetch observations:', error);
    } finally {
      setIsLoading(false);
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
          <CardTitle>Recent Observations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (observations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Observations</CardTitle>
          <CardDescription>Evidence-based insights from your work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>No observations yet.</p>
            <p className="text-sm mt-2">
              Connect your data sources and sync to start getting insights.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Observations</CardTitle>
        <CardDescription>Evidence-based insights from your work</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {observations.map((obs) => {
            const config = typeConfig[obs.type];
            const Icon = config.icon;

            return (
              <div key={obs.id} className={`p-4 rounded-lg ${config.bg}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 ${config.color} mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {obs.capacity.name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(obs.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{obs.observation}</p>
                    {obs.artifact && (
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {obs.artifact.title || obs.artifact.type}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
