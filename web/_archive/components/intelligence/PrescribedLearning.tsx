'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  BookOpen,
  Target,
  Clock,
  ChevronRight,
  AlertTriangle,
  Calendar,
  TrendingUp
} from 'lucide-react';

interface Prescription {
  id: string;
  contentType: 'COURSE' | 'CASE' | 'MODULE';
  contentId: string;
  title: string;
  duration: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  dueBy?: string;
  capacitySlug?: string;
}

export function PrescribedLearning() {
  const [prescriptions, setPrescriptions] = useState<{
    urgent: Prescription[];
    thisWeek: Prescription[];
    development: Prescription[];
  }>({
    urgent: [],
    thisWeek: [],
    development: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const fetchPrescriptions = async () => {
    try {
      const response = await fetch('/api/prescriptions');
      if (response.ok) {
        const data = await response.json();
        setPrescriptions({
          urgent: data.urgent || [],
          thisWeek: data.thisWeek || [],
          development: data.development || []
        });
      }
    } catch (error) {
      console.error('Failed to fetch prescriptions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDueBy = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
  };

  const hasAnyPrescriptions =
    prescriptions.urgent.length > 0 ||
    prescriptions.thisWeek.length > 0 ||
    prescriptions.development.length > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Prescribed for You
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyPrescriptions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Prescribed for You
          </CardTitle>
          <CardDescription>Learning recommendations based on your work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No prescriptions yet. Capture work events to get personalized recommendations.
            </p>
            <Link href="/workspace">
              <Button variant="outline">Go to Workspace</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Prescribed for You
        </CardTitle>
        <CardDescription>Learning recommendations based on your work patterns</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Urgent */}
        {prescriptions.urgent.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-500">Urgent</span>
            </div>
            <div className="space-y-2">
              {prescriptions.urgent.map((p) => (
                <PrescriptionItem key={p.id} prescription={p} formatDueBy={formatDueBy} />
              ))}
            </div>
          </div>
        )}

        {/* This Week */}
        {prescriptions.thisWeek.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">This Week</span>
            </div>
            <div className="space-y-2">
              {prescriptions.thisWeek.map((p) => (
                <PrescriptionItem key={p.id} prescription={p} formatDueBy={formatDueBy} />
              ))}
            </div>
          </div>
        )}

        {/* Ongoing Development */}
        {prescriptions.development.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Ongoing Development</span>
            </div>
            <div className="space-y-2">
              {prescriptions.development.map((p) => (
                <PrescriptionItem key={p.id} prescription={p} formatDueBy={formatDueBy} />
              ))}
            </div>
          </div>
        )}

        {/* View All Link */}
        <Link href="/library?tab=for-you" className="block">
          <Button variant="outline" className="w-full">
            View All Recommendations
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function PrescriptionItem({
  prescription,
  formatDueBy
}: {
  prescription: Prescription;
  formatDueBy: (date?: string) => string | null;
}) {
  const dueByText = formatDueBy(prescription.dueBy);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {prescription.contentType === 'CASE' ? (
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-amber-500" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-emerald-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{prescription.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {prescription.duration} min
            </span>
            {dueByText && (
              <>
                <span>•</span>
                <span className={prescription.urgency === 'HIGH' ? 'text-red-500' : ''}>
                  {dueByText}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <Link
        href={
          prescription.contentType === 'CASE'
            ? `/cases/${prescription.contentId}`
            : `/learning?course=${prescription.contentId}`
        }
      >
        <Button size="sm" variant="ghost">
          Start
        </Button>
      </Link>
    </div>
  );
}
