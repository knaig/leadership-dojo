'use client';
import { useState, useEffect } from 'react';
import { MessageSquare, Play, Calendar, Trophy, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

interface ActiveMission {
    id: string;
    title: string;
    description: string;
}

interface PastSession {
    id: string;
    title: string;
    completedAt: string;
    currentScore: number | null;
    targetScore: number;
}

export default function CoachingPage() {
    const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
    const [pastSessions, setPastSessions] = useState<PastSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadSessions = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/coaching/sessions');
            if (res.ok) {
                const json = await res.json();
                setActiveMission(json.activeMission);
                setPastSessions(json.pastSessions || []);
            }
        } catch (e) {
            console.error(e);
            setError('Failed to load coaching sessions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    return (
        <div className="flex-1 h-full overflow-y-auto bg-background p-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground tracking-tight">Coaching</h1>
                        <p className="text-muted-foreground mt-2">
                            Practice difficult conversations and get real-time feedback.
                        </p>
                    </div>
                </div>

                {error ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                        <p className="text-muted-foreground">{error}</p>
                        <button onClick={() => { setError(null); loadSessions(); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                            Try again
                        </button>
                    </div>
                ) : isLoading ? (
                    <div className="space-y-6">
                        <Skeleton className="h-64 rounded-xl bg-muted" />
                        <Skeleton className="h-24 rounded-xl bg-muted" />
                        <Skeleton className="h-24 rounded-xl bg-muted" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Active Scenario / Empty State */}
                        {activeMission ? (
                            <Card className="col-span-full bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border-indigo-500/20 border">
                                <CardContent className="p-8 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 text-indigo-400 mb-2">
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                            </span>
                                            <span className="text-sm font-semibold uppercase tracking-wider">Active Scenario</span>
                                        </div>
                                        <h3 className="text-2xl font-bold text-foreground mb-2">{activeMission.title}</h3>
                                        <p className="text-muted-foreground max-w-xl mb-6 line-clamp-2">
                                            {activeMission.description}
                                        </p>
                                        <Link href={`/chat?q=${encodeURIComponent(`Let's continue my coaching session: ${activeMission.title}`)}`}>
                                            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-foreground shadow-lg shadow-indigo-500/25">
                                                <Play className="w-5 h-5 mr-2 fill-current" /> Continue Simulation
                                            </Button>
                                        </Link>
                                    </div>
                                    <div className="hidden lg:block">
                                        <MessageSquare className="w-32 h-32 text-indigo-500/20" />
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="col-span-full bg-muted border-dashed border-border">
                                <CardContent className="p-12 text-center">
                                    <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Trophy className="h-8 w-8 text-indigo-400" />
                                    </div>
                                    <h3 className="text-xl font-medium text-foreground mb-2">Ready to practice?</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                        Start a coaching session with Mira to practice leadership skills in a safe environment.
                                    </p>
                                    <Link href="/chat?q=I%20want%20to%20start%20a%20coaching%20session.%20Help%20me%20practice%20a%20difficult%20conversation.">
                                        <Button className="bg-indigo-600 hover:bg-indigo-700">
                                            <Plus className="w-4 h-4 mr-2" /> Start New Session
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        )}

                        {/* Past Sessions */}
                        <div className="col-span-full mt-8">
                            <h3 className="text-lg font-semibold text-foreground mb-4">Past Sessions</h3>
                            {pastSessions.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No completed sessions yet.</p>
                            ) : (
                                <div className="space-y-4">
                                    {pastSessions.map((session) => (
                                        <div key={session.id} className="flex items-center justify-between p-4 rounded-xl bg-muted border border-border hover:border-border transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-foreground font-medium">{session.title}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Completed {new Date(session.completedAt).toLocaleDateString()} • Score: {session.currentScore}/{session.targetScore}
                                                    </p>
                                                </div>
                                            </div>
                                            <Link href={`/chat?q=${encodeURIComponent(`Show me the report for my coaching session: ${session.title}`)}`}>
                                                <Button variant="ghost" className="text-indigo-400 hover:text-indigo-300">
                                                    View Report
                                                </Button>
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
