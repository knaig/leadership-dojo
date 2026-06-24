'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Zap
} from 'lucide-react';

interface CapacityScore {
  id: string;
  capacityId: string;
  capacity: {
    slug: string;
    name: string;
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

const trendConfig = {
  IMPROVING: { icon: TrendingUp, color: 'text-emerald-500', label: 'Improving' },
  STABLE: { icon: Minus, color: 'text-blue-500', label: 'Stable' },
  DECLINING: { icon: TrendingDown, color: 'text-red-500', label: 'Declining' },
  INSUFFICIENT_DATA: { icon: AlertCircle, color: 'text-muted-foreground', label: 'Need more data' },
};

export function CapacityRadar() {
  const [scores, setScores] = useState<CapacityScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchScores();
  }, []);

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Capacities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (scores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Capacities</CardTitle>
          <CardDescription>Track your growth across 6 core leadership capacities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No capacity data yet. Connect your work tools to start building your profile.
            </p>
            <a href="/settings/connectors" className="text-primary hover:underline">
              Connect Data Sources
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Capacities</CardTitle>
        <CardDescription>Based on {scores.reduce((sum, s) => sum + s.positiveCount + s.negativeCount + s.missedCount, 0)} observations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scores.map((score) => {
            const Icon = capacityIcons[score.capacity.slug] || Eye;
            const trend = trendConfig[score.trend];
            const TrendIcon = trend.icon;
            const scorePercent = (score.score / 5) * 100;

            return (
              <div key={score.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{score.capacity.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendIcon className={`h-4 w-4 ${trend.color}`} />
                    <span className="text-sm font-medium">{score.score.toFixed(1)}/5</span>
                  </div>
                </div>
                <Progress value={scorePercent} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{score.positiveCount} positive, {score.negativeCount} gaps, {score.missedCount} missed</span>
                  <Badge variant="outline" className={`${trend.color} text-xs`}>
                    {trend.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
