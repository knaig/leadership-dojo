'use client';

import { useEffect, useState } from 'react';
import { FeedCard, FeedItem } from './FeedCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Target } from 'lucide-react';

export function DailyFeed() {
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const res = await fetch('/api/recommendations');
                const data = await res.json();
                if (data.success) {
                    setFeed(data.recommendations);
                }
            } catch (error) {
                console.error('Failed to fetch feed', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFeed();
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (feed.length === 0) {
        return (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center bg-muted/50">
                <div className="h-12 w-12 bg-card rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <Target className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground">All caught up</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
                    No actions needed right now. We're watching your work and will nudge you when there's something to practice.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                Today's Focus
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    Max 3
                </span>
            </h2>

            <div className="space-y-6">
                {feed.map((item) => (
                    <FeedCard key={item.id} item={item} />
                ))}
            </div>
        </div>
    );
}
