
'use client';
import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Target, Users, Zap, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface Goal {
    id: string;
    description: string;
    magnitude: string;
    status: string;
    stakeholders: any[];
    actions: any[];
}

export default function GoalsDashboard() {
    const [goals, setGoals] = useState<Goal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchGoals = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/work-copilot/goals');
            const data = await res.json();
            if (Array.isArray(data)) setGoals(data);
        } catch (e) {
            console.error(e);
            setError('Failed to load goals');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGoals();
    }, []);

    return (
        <div className="p-8 w-full space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground mb-2">Strategic Objectives</h1>
                    <p className="text-muted-foreground">Goals being managed by Mira</p>
                </div>
                <Link href="/chat?prep=Help me review my goals" className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-2 transition-all">
                    <Sparkles size={16} />
                    <span>Talk to Mira</span>
                </Link>
            </header>

            {error ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                    <p className="text-muted-foreground">{error}</p>
                    <button onClick={() => { setError(null); fetchGoals(); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground">
                        Try again
                    </button>
                </div>
            ) : loading ? (
                <div className="text-muted-foreground animate-pulse">Loading strategy map...</div>
            ) : goals.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-2xl bg-muted">
                    <Target size={40} className="mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground">No Active Goals</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mt-2">
                        Start a conversation with your Co-pilot to capture your first strategic objective.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {goals.map(goal => (
                        <div key={goal.id} className="group bg-card border border-border hover:border-indigo-500/30 rounded-2xl p-6 transition-all">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`text-[10px] font-mono px-2 py-1 rounded border 
                                    ${goal.magnitude === 'CAREER' ? 'text-amber-400 border-amber-400/20 bg-amber-400/10' : 'text-muted-foreground border-border bg-muted'}
                                `}>
                                    {goal.magnitude}
                                </span>
                                <span className="text-xs text-muted-foreground">{goal.status}</span>
                            </div>

                            <h3 className="text-lg font-medium text-foreground mb-4 line-clamp-2 min-h-[3.5rem]">
                                {goal.description}
                            </h3>

                            <div className="space-y-4">
                                {/* Stakeholders */}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Users size={16} className="text-muted-foreground" />
                                    <span>{goal.stakeholders.length} Key People</span>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Zap size={16} className="text-muted-foreground" />
                                        <span>Recent Actions</span>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                                        {goal.actions.slice(0, 2).map((action: any) => (
                                            <div key={action.id} className="flex items-center gap-2 text-xs">
                                                {action.status === 'COMPLETED'
                                                    ? <CheckCircle size={12} className="text-emerald-500" />
                                                    : <div className="w-3 h-3 rounded-full border border-slate-600" />
                                                }
                                                <span className={`${action.status === 'COMPLETED' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                                    {action.description}
                                                </span>
                                            </div>
                                        ))}
                                        {goal.actions.length === 0 && (
                                            <span className="text-xs text-muted-foreground italic">No actions yet</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-border flex justify-end">
                                <button onClick={() => window.location.href = `/chat?q=Tell me about my goal: ${goal.description}`} className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    View Details <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
