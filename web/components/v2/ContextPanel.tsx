'use client';
import { useState, useEffect } from 'react';
import { User, Calendar, BrainCircuit, ArrowRight, TrendingUp, AlertTriangle } from 'lucide-react';

// Types matching the API response
interface Meeting {
    id: string;
    title: string;
    startTime: string;
    participants: string[];
}

interface Stakeholder {
    name: string;
    role: string | null;
    relationshipStrength: number;
}

interface KPI {
    name: string;
    status: string;
    currentValue: number | null;
    targetValue: number;
}

interface ContextData {
    upcomingMeetings: Meeting[];
    stakeholders: Stakeholder[];
    kpis: KPI[];
}

export function ContextPanel() {
    const [data, setData] = useState<ContextData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchContext() {
            try {
                const res = await fetch('/api/context');
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch (err) {
                console.error("Failed to fetch context", err);
            } finally {
                setLoading(false);
            }
        }
        fetchContext();
    }, []);

    if (loading) {
        return (
            <div className="h-full flex flex-col p-4 gap-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
                <div className="h-24 bg-muted/50 rounded-xl"></div>
                <div className="h-24 bg-muted/50 rounded-xl"></div>
            </div>
        );
    }

    const hasData = data && (data.upcomingMeetings.length > 0 || data.stakeholders.length > 0 || data.kpis.length > 0);

    return (
        <div className="h-full flex flex-col p-4 gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Context</h2>
                <span className="text-xs text-primary flex items-center gap-1">
                    <BrainCircuit size={12} className="animate-pulse" /> Live
                </span>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto">
                {!hasData && (
                    <div className="p-4 text-center text-muted-foreground text-xs border border-dashed border-border rounded-xl">
                        No active context found.<br />Connect Calendar/Email to populate.
                    </div>
                )}

                {/* KPI ALERTS (Priority) */}
                {data?.kpis.map((kpi, i) => (
                    <div key={i} className="p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2 text-rose-400">
                                <TrendingUp size={14} />
                                <span className="text-xs font-semibold">KPI Alert</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${kpi.status === 'OFF_TRACK' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                {kpi.status.replace('_', ' ')}
                            </span>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-1">{kpi.name}</h3>
                        <div className="text-xs text-muted-foreground">
                            Current: {kpi.currentValue} / Target: {kpi.targetValue}
                        </div>
                    </div>
                ))}

                {/* MEETINGS */}
                {data?.upcomingMeetings.map((m, i) => (
                    <div key={i} className="p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2 text-emerald-300">
                                <Calendar size={14} />
                                <span className="text-xs font-semibold">Meeting</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                                {new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-1">{m.title}</h3>
                        {m.participants.length > 0 && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                                with {m.participants.slice(0, 2).join(', ')}{m.participants.length > 2 ? ` +${m.participants.length - 2}` : ''}
                            </p>
                        )}
                    </div>
                ))}

                {/* STAKEHOLDERS */}
                {data?.stakeholders.map((s, i) => (
                    <div key={i} className="p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2 text-primary">
                                <User size={14} />
                                <span className="text-xs font-semibold">Stakeholder</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                Rel: {s.relationshipStrength.toFixed(1)}
                            </span>
                        </div>
                        <h3 className="text-lg font-medium text-foreground mb-1">{s.name}</h3>
                        <p className="text-xs text-muted-foreground">{s.role}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
