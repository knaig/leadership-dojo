'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RecommendationCard } from '@/components/recommendation/RecommendationCard';
import { Check, MessageSquare } from 'lucide-react';

export function FeedbackStream() {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchRecommendations();
    }, []);

    const fetchRecommendations = async () => {
        try {
            const response = await fetch('/api/recommendations');
            if (response.ok) {
                const data = await response.json();
                console.log('Recommendations received:', data.recommendations?.length);
                setRecommendations(data.recommendations || []);
            } else {
                const errText = await response.text();
                console.error('Fetch failed:', response.status, errText);
                setError(`Failed to load: ${response.status} ${response.statusText}`);
            }
        } catch (error: any) {
            console.error('Failed to fetch recommendations:', error);
            setError(error.message || 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    if (error) {
        return (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
                <p className="font-medium">Error loading recommendations</p>
                <p className="text-sm">{error}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-2 text-destructive border-destructive/20 hover:bg-destructive/10">
                    Retry
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2].map(i => (
                    <div key={i} className="h-48 bg-muted rounded-xl border border-border animate-pulse" />
                ))}
            </div>
        );
    }

    if (recommendations.length === 0) {
        return (
            <Card className="bg-muted border-dashed border-border">
                <CardContent className="py-12 text-center">
                    <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">All caught up</h3>
                    <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                        No actions needed right now. We're watching your work and will nudge you when there's something to practice.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-foreground">Your Action Plan</h2>
                <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                    {recommendations.length} Active
                </Badge>
            </div>

            <div className="space-y-4">
                {recommendations.map((rec) => (
                    <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
            </div>
        </div>
    );
}
