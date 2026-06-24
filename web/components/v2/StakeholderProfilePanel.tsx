'use client';
import { useState, useEffect } from 'react';
import {
    X, Star, StarOff, Loader2, Shield, Target,
    AlertTriangle, CheckCircle2,
    ChevronRight, Briefcase, Brain, Eye, Zap, Users,
    ArrowRight, RefreshCw, Globe, Sparkles, ExternalLink
} from 'lucide-react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface ProfileData {
    stakeholder: {
        id: string;
        name: string;
        email: string | null;
        role: string | null;
        organization: string | null;
        powerLevel: string;
        influenceRole: string;
        politicalStance: string;
        personaArchetype: string | null;
        communicationStyle: string | null;
        decisionStyle: string | null;
        riskTolerance: string | null;
        primaryMotivation: string | null;
        fears: string[];
        relationshipStrength: number;
        isImportant: boolean;
        userNotes: string | null;
        archetype: string | null;
        enrichedAt: string | null;
        enrichmentSource: string | null;
        linkedinUrl: string | null;
        linkedinHeadline: string | null;
        linkedinSummary: string | null;
        recentPublicActivity: string | null;
        externalIntel: Record<string, unknown> | null;
        companyDescription: string | null;
    };
    intelligence: {
        profileSummary: string | null;
        successPatterns: string[];
        failurePatterns: string[];
        objectionPatterns: string[];
        recentTopics: string[];
        currentMood: string | null;
        decisionMakingNotes: string | null;
        evidenceCount: number;
        lastRefreshedAt: string | null;
    } | null;
    archetypePlaybook: {
        label: string;
        brief: string;
        doThis: string;
        dontDoThis: string;
    } | null;
    outcomeStats: {
        total: number;
        landed: number;
        partial: number;
        missed: number;
    };
    meetingHistory: Array<{
        id: string;
        title: string;
        date: string;
        outcomeResult: string | null;
        desiredOutcome: string | null;
        outcome: string | null;
        category: string | null;
        review: {
            whatWorked: string[];
            whatFailed: string[];
            surprises: string[];
            aiInsights: string | null;
        } | null;
    }>;
    commitments: Array<{
        id: string;
        description: string;
        owner: string;
        dueDate: string | null;
        status: string;
        meeting: { title: string; startTime: string } | null;
    }>;
}

// ═══════════════════════════════════════════════════════
// ARCHETYPE DISPLAY
// ═══════════════════════════════════════════════════════

const ARCHETYPE_META: Record<string, { emoji: string; color: string }> = {
    DRIVER: { emoji: '🎯', color: 'text-red-400' },
    ANALYST: { emoji: '📊', color: 'text-blue-400' },
    COLLABORATOR: { emoji: '🤝', color: 'text-emerald-400' },
    VISIONARY: { emoji: '🔭', color: 'text-purple-400' },
    GUARDIAN: { emoji: '🛡️', color: 'text-amber-400' },
    POLITICIAN: { emoji: '♟️', color: 'text-slate-400' },
    CHAMPION: { emoji: '📣', color: 'text-orange-400' },
    PRAGMATIST: { emoji: '⚙️', color: 'text-cyan-400' },
    SKEPTIC: { emoji: '🔍', color: 'text-rose-400' },
    CONSERVATIVE: { emoji: '⚓', color: 'text-indigo-400' },
    OPERATOR: { emoji: '📋', color: 'text-teal-400' },
};

function outcomeColor(r: string) {
    return r === 'LANDED' ? 'text-emerald-500 bg-emerald-500/10'
        : r === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10'
        : 'text-red-400 bg-red-400/10';
}

function outcomeLabel(r: string) {
    return r === 'LANDED' ? 'Landed' : r === 'PARTIAL' ? 'Partial' : 'Missed';
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

interface Props {
    stakeholderId: string;
    onClose: () => void;
    onToggleImportant?: (id: string, isImportant: boolean) => void;
    onCorrectArchetype?: (id: string, currentArchetype: string | null) => void;
}

export function StakeholderProfilePanel({ stakeholderId, onClose, onToggleImportant, onCorrectArchetype }: Props) {
    const [data, setData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [togglingImportant, setTogglingImportant] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);

    /* eslint-disable react-hooks/set-state-in-effect -- standard data fetching pattern */
    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(`/api/stakeholders/${stakeholderId}`)
            .then(async r => {
                if (!r.ok) {
                    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
                    throw new Error(err.error || `Failed to load (${r.status})`);
                }
                return r.json();
            })
            .then(d => setData(d))
            .catch((e) => {
                console.error('[Profile] Load failed:', e);
                setError(e.message || 'Failed to load profile');
            })
            .finally(() => setLoading(false));
    }, [stakeholderId]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const handleToggleImportant = async () => {
        if (!data || togglingImportant) return;
        setTogglingImportant(true);
        const newValue = !data.stakeholder.isImportant;
        try {
            await fetch('/api/network', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: stakeholderId, isImportant: newValue }),
            });
            setData(prev => prev ? { ...prev, stakeholder: { ...prev.stakeholder, isImportant: newValue } } : prev);
            onToggleImportant?.(stakeholderId, newValue);
        } catch {}
        setTogglingImportant(false);
    };

    const handleEnrich = async () => {
        if (enriching) return;
        setEnriching(true);
        setEnrichMessage(null);
        try {
            const res = await fetch(`/api/stakeholders/${stakeholderId}/enrich`, { method: 'POST' });
            const result = await res.json();
            if (!res.ok) {
                setEnrichMessage(result.error || 'Enrichment failed');
            } else {
                setEnrichMessage(result.message);
                // Reload profile after a short delay to pick up enrichment results
                if (result.status === 'queued') {
                    setTimeout(async () => {
                        try {
                            const refreshRes = await fetch(`/api/stakeholders/${stakeholderId}`);
                            if (refreshRes.ok) {
                                const refreshed = await refreshRes.json();
                                setData(refreshed);
                            }
                        } catch {}
                        setEnrichMessage(null);
                    }, 8000);
                }
            }
        } catch {
            setEnrichMessage('Failed to start enrichment');
        }
        setEnriching(false);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex justify-end">
                <div className="absolute inset-0 bg-black/40" onClick={onClose} />
                <div className="relative w-full max-w-md bg-background border-l border-border shadow-2xl flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="fixed inset-0 z-50 flex justify-end">
                <div className="absolute inset-0 bg-black/40" onClick={onClose} />
                <div className="relative w-full max-w-md bg-background border-l border-border shadow-2xl p-6">
                    <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded hover:bg-muted"><X size={18} /></button>
                    <p className="text-sm text-muted-foreground">Could not load profile.</p>
                    {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                </div>
            </div>
        );
    }

    const { stakeholder: s, intelligence: intel, archetypePlaybook, outcomeStats, meetingHistory, commitments } = data;
    const archMeta = s.personaArchetype ? ARCHETYPE_META[s.personaArchetype] : null;
    const hitRate = outcomeStats.total > 0 ? Math.round((outcomeStats.landed / outcomeStats.total) * 100) : null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-md bg-background border-l border-border shadow-2xl overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 flex items-start justify-between z-10">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold truncate">{s.name}</h2>
                            <button
                                onClick={handleToggleImportant}
                                disabled={togglingImportant}
                                className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors"
                                title={s.isImportant ? 'Unpin as key person' : 'Pin as key person'}
                            >
                                {s.isImportant
                                    ? <Star size={16} className="text-amber-400 fill-amber-400" />
                                    : <StarOff size={16} className="text-muted-foreground" />
                                }
                            </button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                            {s.role && <span>{s.role}</span>}
                            {s.role && s.organization && <span> at </span>}
                            {s.organization && <span className="font-medium">{s.organization}</span>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
                </div>

                {/* Enrich Profile Button */}
                <div className="px-4 pt-3">
                    {s.enrichedAt ? (
                        <button
                            onClick={handleEnrich}
                            disabled={enriching}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-xs"
                        >
                            <span className="text-muted-foreground">
                                Last enriched {new Date(s.enrichedAt).toLocaleDateString()}
                                {s.enrichmentSource && <span className="ml-1 opacity-60">via {s.enrichmentSource.replace('_', ' ')}</span>}
                            </span>
                            {enriching
                                ? <Loader2 size={14} className="animate-spin text-muted-foreground" />
                                : <RefreshCw size={14} className="text-muted-foreground" />
                            }
                        </button>
                    ) : (
                        <button
                            onClick={handleEnrich}
                            disabled={enriching}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
                        >
                            {enriching
                                ? <><Loader2 size={14} className="animate-spin" /> Enriching...</>
                                : <><Sparkles size={14} /> Enrich Profile</>
                            }
                        </button>
                    )}
                    {enrichMessage && (
                        <div className="mt-1.5 text-[10px] text-muted-foreground text-center">{enrichMessage}</div>
                    )}
                </div>

                <div className="p-4 space-y-5">
                    {/* Archetype Card */}
                    {s.personaArchetype && archetypePlaybook && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">{archMeta?.emoji}</span>
                                    <div>
                                        <div className={`text-sm font-semibold ${archMeta?.color || ''}`}>
                                            {archetypePlaybook.label}
                                        </div>
                                        <div className="text-xs text-muted-foreground">{archetypePlaybook.brief}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onCorrectArchetype?.(s.id, s.personaArchetype)}
                                    className="text-[10px] text-muted-foreground hover:text-primary underline"
                                >
                                    Not right?
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="space-y-1">
                                    <div className="font-medium text-emerald-500 flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Do this
                                    </div>
                                    <p className="text-muted-foreground leading-relaxed">{archetypePlaybook.doThis}</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="font-medium text-amber-500 flex items-center gap-1">
                                        <AlertTriangle size={12} /> Avoid
                                    </div>
                                    <p className="text-muted-foreground leading-relaxed">{archetypePlaybook.dontDoThis}</p>
                                </div>
                            </div>
                            {intel?.evidenceCount != null && (
                                <div className="text-[10px] text-muted-foreground/60">
                                    Based on {intel.evidenceCount} data points
                                </div>
                            )}
                        </div>
                    )}

                    {/* External Intel (from enrichment) */}
                    {(s.linkedinHeadline || s.recentPublicActivity || s.externalIntel || s.companyDescription) && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Globe size={14} /> External Intel
                            </div>
                            {s.linkedinHeadline && (
                                <div className="space-y-1">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">LinkedIn</div>
                                    <div className="text-sm font-medium">{s.linkedinHeadline}</div>
                                    {s.linkedinUrl && (
                                        <a
                                            href={s.linkedinUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                                        >
                                            View profile <ExternalLink size={10} />
                                        </a>
                                    )}
                                </div>
                            )}
                            {s.linkedinSummary && (
                                <p className="text-xs text-muted-foreground leading-relaxed">{s.linkedinSummary}</p>
                            )}
                            {s.companyDescription && (
                                <div className="space-y-1">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Company</div>
                                    <p className="text-xs text-muted-foreground">{s.companyDescription}</p>
                                </div>
                            )}
                            {s.recentPublicActivity && (
                                <div className="space-y-1">
                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Activity</div>
                                    <p className="text-xs text-muted-foreground whitespace-pre-line">{s.recentPublicActivity}</p>
                                </div>
                            )}
                            {s.externalIntel && typeof s.externalIntel === 'object' && (
                                <div className="space-y-1">
                                    {Object.entries(s.externalIntel).map(([key, value]) => (
                                        value && (
                                            <div key={key} className="text-xs text-muted-foreground">
                                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{key.replace(/([A-Z])/g, ' $1').trim()}: </span>
                                                {String(value)}
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Profile Summary */}
                    {intel?.profileSummary && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Brain size={14} /> Mira&apos;s Read
                            </div>
                            <p className="text-sm leading-relaxed">{intel.profileSummary}</p>
                            {intel.currentMood && (
                                <div className="text-xs text-muted-foreground">
                                    Current mood: <span className="font-medium">{intel.currentMood}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Attributes Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        {s.communicationStyle && (
                            <div className="rounded-lg border border-border bg-card p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Communication</div>
                                <div className="text-sm font-medium mt-1">{s.communicationStyle.replace('_', ' ')}</div>
                            </div>
                        )}
                        {s.decisionStyle && (
                            <div className="rounded-lg border border-border bg-card p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Decisions</div>
                                <div className="text-sm font-medium mt-1">{s.decisionStyle}</div>
                            </div>
                        )}
                        {s.riskTolerance && (
                            <div className="rounded-lg border border-border bg-card p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Tolerance</div>
                                <div className="text-sm font-medium mt-1">{s.riskTolerance}</div>
                            </div>
                        )}
                        {s.primaryMotivation && (
                            <div className="rounded-lg border border-border bg-card p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Driven by</div>
                                <div className="text-sm font-medium mt-1">{s.primaryMotivation}</div>
                            </div>
                        )}
                    </div>

                    {/* Track Record */}
                    {outcomeStats.total > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Target size={14} /> Your Track Record
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-primary">{hitRate}%</div>
                                    <div className="text-[10px] text-muted-foreground">Hit Rate</div>
                                </div>
                                <div className="flex-1 flex items-center gap-1">
                                    {/* Mini bar chart */}
                                    {outcomeStats.landed > 0 && (
                                        <div
                                            className="h-6 bg-emerald-500/20 rounded text-[10px] text-emerald-500 flex items-center justify-center font-medium"
                                            style={{ flex: outcomeStats.landed }}
                                        >
                                            {outcomeStats.landed}
                                        </div>
                                    )}
                                    {outcomeStats.partial > 0 && (
                                        <div
                                            className="h-6 bg-amber-500/20 rounded text-[10px] text-amber-500 flex items-center justify-center font-medium"
                                            style={{ flex: outcomeStats.partial }}
                                        >
                                            {outcomeStats.partial}
                                        </div>
                                    )}
                                    {outcomeStats.missed > 0 && (
                                        <div
                                            className="h-6 bg-red-400/20 rounded text-[10px] text-red-400 flex items-center justify-center font-medium"
                                            style={{ flex: outcomeStats.missed }}
                                        >
                                            {outcomeStats.missed}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {outcomeStats.landed}/{outcomeStats.total} meetings landed
                            </div>
                        </div>
                    )}

                    {/* What Works / Growth Areas */}
                    {intel && (intel.successPatterns.length > 0 || intel.failurePatterns.length > 0) && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Zap size={14} /> Your Playbook
                            </div>
                            {intel.successPatterns.length > 0 && (
                                <div className="space-y-1">
                                    <div className="text-xs font-medium text-emerald-500">What works</div>
                                    {intel.successPatterns.map((p, i) => (
                                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                            <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                                            {p}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {intel.failurePatterns.length > 0 && (
                                <div className="space-y-1">
                                    <div className="text-xs font-medium text-amber-500">Growth areas</div>
                                    {intel.failurePatterns.map((p, i) => (
                                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                            <ArrowRight size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                            {p}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {intel.objectionPatterns.length > 0 && (
                                <div className="space-y-1">
                                    <div className="text-xs font-medium text-blue-400">Their concerns</div>
                                    {intel.objectionPatterns.map((p, i) => (
                                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                            <Eye size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                            {p}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Fears */}
                    {s.fears && s.fears.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                <Shield size={14} /> What they protect
                            </div>
                            {s.fears.map((f, i) => (
                                <div key={i} className="text-xs text-muted-foreground">{f}</div>
                            ))}
                        </div>
                    )}

                    {/* Recent Topics */}
                    {intel?.recentTopics && intel.recentTopics.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Recent topics</div>
                            <div className="flex flex-wrap gap-1.5">
                                {intel.recentTopics.map((t, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Meeting History */}
                    {meetingHistory.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                <Users size={14} /> Meeting History
                            </div>
                            <div className="space-y-2">
                                {meetingHistory.slice(0, 5).map(m => (
                                    <MeetingHistoryCard key={m.id} meeting={m} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Open Commitments */}
                    {commitments.filter(c => c.status === 'PENDING').length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                                <Briefcase size={14} /> Open Commitments
                            </div>
                            {commitments.filter(c => c.status === 'PENDING').map(c => (
                                <div key={c.id} className="text-xs border border-border rounded-lg p-2.5 space-y-1">
                                    <div className="font-medium">{c.description}</div>
                                    <div className="text-muted-foreground">
                                        Owner: {c.owner}
                                        {c.dueDate && <span> &middot; Due {new Date(c.dueDate).toLocaleDateString()}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* User Notes */}
                    {s.userNotes && (
                        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Your Notes</div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.userNotes}</p>
                        </div>
                    )}

                    {/* Ask Mira */}
                    <Link
                        href={`/chat?q=${encodeURIComponent(`How should I approach ${s.name} about `)}`}
                        className="block w-full text-center text-xs py-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                    >
                        Ask Mira about {s.name.split(' ')[0]}
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MEETING HISTORY CARD (expandable)
// ═══════════════════════════════════════════════════════

function MeetingHistoryCard({ meeting }: { meeting: ProfileData['meetingHistory'][0] }) {
    const [expanded, setExpanded] = useState(false);
    const hasReview = meeting.review && (
        meeting.review.whatWorked.length > 0 ||
        meeting.review.whatFailed.length > 0 ||
        meeting.review.aiInsights
    );

    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button
                onClick={() => hasReview && setExpanded(!expanded)}
                className={`w-full text-left p-2.5 flex items-center gap-2 text-xs ${hasReview ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default'}`}
            >
                {meeting.outcomeResult && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${outcomeColor(meeting.outcomeResult)}`}>
                        {outcomeLabel(meeting.outcomeResult)}
                    </span>
                )}
                <span className="flex-1 truncate font-medium">{meeting.title}</span>
                <span className="text-muted-foreground flex-shrink-0">
                    {new Date(meeting.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                {hasReview && (
                    <ChevronRight size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
                )}
            </button>
            {expanded && meeting.review && (
                <div className="border-t border-border p-2.5 space-y-2 bg-muted/30">
                    {meeting.desiredOutcome && (
                        <div className="text-[10px] text-muted-foreground">
                            Goal: <span className="font-medium text-foreground">{meeting.desiredOutcome}</span>
                        </div>
                    )}
                    {meeting.review.whatWorked.length > 0 && (
                        <div className="space-y-0.5">
                            <div className="text-[10px] font-medium text-emerald-500">What worked</div>
                            {meeting.review.whatWorked.map((w, i) => (
                                <div key={i} className="text-[10px] text-muted-foreground pl-2">{w}</div>
                            ))}
                        </div>
                    )}
                    {meeting.review.whatFailed.length > 0 && (
                        <div className="space-y-0.5">
                            <div className="text-[10px] font-medium text-amber-500">Growth area</div>
                            {meeting.review.whatFailed.map((w, i) => (
                                <div key={i} className="text-[10px] text-muted-foreground pl-2">{w}</div>
                            ))}
                        </div>
                    )}
                    {meeting.review.aiInsights && (
                        <div className="text-[10px] text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                            {meeting.review.aiInsights}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
