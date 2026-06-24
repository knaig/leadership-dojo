'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, ArrowRight, Play, CheckCircle, Clock } from 'lucide-react';
import { MissionStatus } from '@prisma/client';

interface Mission {
    id: string;
    title: string;
    description: string;
    capacity: {
        name: string;
        slug: string;
    };
    targetScore: number;
    baselineScore: number;
    currentScore: number | null;
    deadline: string;
    status: MissionStatus;
}

export function InterventionCard() {
    const [activeMission, setActiveMission] = useState<Mission | null>(null);
    const [recommendedMission, setRecommendedMission] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);

    useEffect(() => {
        const fetchActiveMission = async () => {
            try {
                // Fetch active or in-progress missions
                const res = await fetch('/api/missions?status=ACTIVE');
                const data = await res.json();

                if (data.success && data.missions.length > 0) {
                    // Start with the first active mission
                    setActiveMission(data.missions[0]);
                } else {
                    // If no active, try in-progress
                    const resProg = await fetch('/api/missions?status=IN_PROGRESS');
                    const dataProg = await resProg.json();
                    if (dataProg.success && dataProg.missions.length > 0) {
                        setActiveMission(dataProg.missions[0]);
                    } else {
                        // If no mission at all, fetch recommendations
                        fetchRecommendations();
                    }
                }
            } catch (error) {
                console.error('Failed to fetch active mission', error);
            } finally {
                setIsLoading(false);
            }
        };

        const fetchRecommendations = async () => {
            try {
                const res = await fetch('/api/recommendations');
                const data = await res.json();
                if (data.success && data.recommendations.length > 0) {
                    setRecommendedMission(data.recommendations[0]);
                }
            } catch (error) {
                console.error('Failed to fetch recommendations', error);
            }
        };

        fetchActiveMission();
    }, []);

    const handleAcceptMission = async () => {
        if (!recommendedMission) return;
        setIsAccepting(true);

        try {
            const response = await fetch('/api/missions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: recommendedMission.actionSummary,
                    description: recommendedMission.evidenceObservation,
                    // capacityId: recommendedMission.capacity.id, // removed, sending name instead
                    capacityName: recommendedMission.capacity, // string
                    recommendationId: recommendedMission.id,
                    targetScore: "8", // Default target for now
                    baselineScore: "5", // Default baseline
                    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks default
                })
            });

            if (response.ok) {
                const data = await response.json();
                setActiveMission(data.mission);
                setRecommendedMission(null);
            }
        } catch (error) {
            console.error('Failed to accept mission', error);
        } finally {
            setIsAccepting(false);
        }
    };

    if (isLoading) {
        return (
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <CardContent className="p-6">
                    <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-blue-200 rounded w-1/4"></div>
                        <div className="h-6 bg-blue-200 rounded w-3/4"></div>
                        <div className="h-4 bg-blue-200 rounded w-1/2"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Show Recommended Mission if no active mission
    if (!activeMission && recommendedMission) {
        return (
            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100/50 overflow-hidden">
                <CardHeader className="pb-3 border-b border-amber-100/50">
                    <div className="flex justify-between items-start">
                        <div>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 mb-2">
                                Recommended Mission
                            </Badge>
                            <CardTitle className="text-xl text-amber-900">{recommendedMission.actionSummary}</CardTitle>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-white/50 flex items-center justify-center">
                            <Target className="h-5 w-5 text-amber-600" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    <p className="text-amber-800/80 mb-6 text-sm leading-relaxed">
                        {recommendedMission.evidenceObservation}
                    </p>

                    <div className="flex items-center gap-4 text-sm text-amber-900/60 mb-6">
                        <div className="flex items-center gap-1.5">
                            <Play className="h-4 w-4" />
                            <span>{recommendedMission.capacity}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-4 w-4" />
                            <span>Target: {recommendedMission.actionBullets?.[0] || 'See details'}</span>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                            onClick={handleAcceptMission}
                            disabled={isAccepting}
                        >
                            {isAccepting ? 'Accepting...' : 'Accept Challenge'}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!activeMission) {
        return (
            <Card className="bg-muted border-dashed border-border">
                <CardContent className="p-6 text-center">
                    <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <h3 className="font-medium text-muted-foreground">No Active Missions</h3>
                    <p className="text-sm text-muted-foreground mb-4">Start a new practice mission to build your capacity.</p>
                    <Link href="/missions">
                        <Button variant="outline" size="sm">Find a Mission</Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 overflow-hidden">
            <CardHeader className="pb-3 border-b border-blue-100/50">
                <div className="flex justify-between items-start">
                    <div>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 mb-2">
                            Current Mission
                        </Badge>
                        <CardTitle className="text-xl text-blue-900">{activeMission.title}</CardTitle>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-white/50 flex items-center justify-center">
                        <Target className="h-5 w-5 text-blue-600" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <p className="text-blue-800/80 mb-6 text-sm leading-relaxed">
                    {activeMission.description}
                </p>

                <div className="flex items-center gap-4 text-sm text-blue-900/60 mb-6">
                    <div className="flex items-center gap-1.5">
                        <Play className="h-4 w-4" />
                        <span>{activeMission.capacity.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>{new Date(activeMission.deadline).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Link href={`/missions`} className="flex-1">
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {activeMission.status === 'ACTIVE' ? 'Start Mission' : 'Update Progress'}
                        </Button>
                    </Link>
                    <Link href={`/grow?tab=library&topic=${activeMission.capacity.slug}`}>
                        <Button variant="outline" className="bg-white/50 hover:bg-white border-blue-200 text-blue-700">
                            Resources
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
