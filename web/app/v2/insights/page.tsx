'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Brain,
    CheckCircle2,
    XCircle,
    HelpCircle,
    RotateCcw,
    Loader2,
    Pencil,
    Check,
    X,
    RefreshCw,
    Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface Hypothesis {
    id: string;
    category: string;
    statement: string;
    evidence: string;
    confidence: number;
    status: string;
    sourceType: string;
    userResponse: string | null;
    validatedAt: string | null;
    createdAt: string;
}

interface HypothesesData {
    confirmed: Hypothesis[];
    pending: Hypothesis[];
    revised: Hypothesis[];
    rejected: Hypothesis[];
    total: number;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<string, string> = {
    STAKEHOLDER_DYNAMIC: 'People',
    WORK_PRIORITY: 'Priorities',
    TEAM_DYNAMIC: 'Team',
    POWER_ASYMMETRY: 'Dynamics',
    COMMUNICATION_PATTERN: 'Communication',
    LEADERSHIP_STYLE: 'Leadership',
    RELATIONSHIP_QUALITY: 'Relationships',
    PERSONAL_INSIGHT: 'Personal',
    STRATEGIC_PATTERN: 'Strategy',
};

function categoryLabel(cat: string): string {
    return CATEGORY_LABELS[cat] || cat.toLowerCase().replace(/_/g, ' ');
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════════════════════
// HYPOTHESIS CARD
// ═══════════════════════════════════════════════════════

function HypothesisCard({
    hypothesis,
    onAction,
}: {
    hypothesis: Hypothesis;
    onAction: (id: string, action: 'confirm' | 'correct' | 'dismiss', correction?: string) => Promise<void>;
}) {
    const [correcting, setCorrecting] = useState(false);
    const [correction, setCorrection] = useState('');
    const [acting, setActing] = useState(false);

    const handleAction = async (action: 'confirm' | 'correct' | 'dismiss') => {
        setActing(true);
        try {
            await onAction(hypothesis.id, action, action === 'correct' ? correction : undefined);
            setCorrecting(false);
            setCorrection('');
        } catch (err) {
            console.error('[Insights] Action failed:', err);
        } finally {
            setActing(false);
        }
    };

    const isConfirmed = hypothesis.status === 'CONFIRMED';
    const isRejected = hypothesis.status === 'REJECTED';
    const isRevised = hypothesis.status === 'REVISED';
    const isPending = ['PENDING', 'READY', 'PRESENTED'].includes(hypothesis.status);

    return (
        <div className={cn(
            'rounded-xl border p-4 transition-colors',
            isConfirmed && 'border-green-500/20 bg-green-500/5',
            isRejected && 'border-red-500/20 bg-red-500/5',
            isRevised && 'border-amber-500/20 bg-amber-500/5',
            isPending && 'border-border bg-card/60',
        )}>
            <div className="flex items-start gap-3">
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
                    {isConfirmed && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                    {isRejected && <XCircle className="h-4 w-4 text-red-400" />}
                    {isRevised && <RotateCcw className="h-4 w-4 text-amber-400" />}
                    {isPending && <HelpCircle className="h-4 w-4 text-muted-foreground" />}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                    {/* Statement */}
                    <p className="text-sm text-foreground leading-snug">{hypothesis.statement}</p>

                    {/* Evidence + metadata */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {categoryLabel(hypothesis.category)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            {formatDate(hypothesis.createdAt)}
                        </span>
                        {hypothesis.userResponse && (isConfirmed || isRejected || isRevised) && (
                            <span className="text-[10px] text-muted-foreground italic">
                                &ldquo;{hypothesis.userResponse}&rdquo;
                            </span>
                        )}
                    </div>

                    {/* Correction input */}
                    {correcting && (
                        <div className="space-y-2">
                            <textarea
                                value={correction}
                                onChange={e => setCorrection(e.target.value)}
                                placeholder="What's the correct version?"
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                rows={2}
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleAction('correct')}
                                    disabled={!correction.trim() || acting}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                                >
                                    {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    Save correction
                                </button>
                                <button
                                    onClick={() => { setCorrecting(false); setCorrection(''); }}
                                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Action buttons — only for pending/presented hypotheses */}
                    {isPending && !correcting && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleAction('confirm')}
                                disabled={acting}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-50"
                            >
                                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                That&apos;s right
                            </button>
                            <button
                                onClick={() => setCorrecting(true)}
                                disabled={acting}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
                            >
                                <Pencil className="h-3 w-3" />
                                Not quite
                            </button>
                            <button
                                onClick={() => handleAction('dismiss')}
                                disabled={acting}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            >
                                <X className="h-3 w-3" />
                                Wrong
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function InsightsPage() {
    const [data, setData] = useState<HypothesesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/hypotheses');
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`${res.status}: ${body.substring(0, 200)}`);
            }
            setData(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
            console.error('[Insights] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleAction = async (id: string, action: 'confirm' | 'correct' | 'dismiss', correction?: string) => {
        const res = await fetch('/api/hypotheses', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, action, correction }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Action failed: ${body}`);
        }
        // Refresh data
        fetchData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center space-y-2">
                <p className="text-sm text-red-400">{error}</p>
                <button onClick={fetchData} className="text-xs text-primary hover:underline">Retry</button>
            </div>
        );
    }

    if (!data) return null;

    const { confirmed, pending, revised, rejected } = data;
    const hasAny = data.total > 0;

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <Brain className="h-5 w-5 text-amber-400" />
                            What Mira Knows
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Help Mira learn faster by confirming or correcting what she thinks she knows about you.
                        </p>
                    </div>
                    <button
                        onClick={fetchData}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>

                {!hasAny && (
                    <div className="text-center py-16 space-y-2">
                        <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                            Mira hasn&apos;t formed any observations yet.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            After a few calls and some email/calendar analysis, her observations will appear here for you to validate.
                        </p>
                    </div>
                )}

                {/* Pending — things Mira wants validated */}
                {pending.length > 0 && (
                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <HelpCircle className="h-3.5 w-3.5" />
                            Mira is curious about ({pending.length})
                        </h2>
                        <div className="space-y-2">
                            {pending.map(h => (
                                <HypothesisCard key={h.id} hypothesis={h} onAction={handleAction} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Confirmed — what Mira knows */}
                {confirmed.length > 0 && (
                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                            Confirmed ({confirmed.length})
                        </h2>
                        <div className="space-y-2">
                            {confirmed.map(h => (
                                <HypothesisCard key={h.id} hypothesis={h} onAction={handleAction} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Revised — things Mira got partially right */}
                {revised.length > 0 && (
                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                            Corrected ({revised.length})
                        </h2>
                        <div className="space-y-2">
                            {revised.map(h => (
                                <HypothesisCard key={h.id} hypothesis={h} onAction={handleAction} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Rejected — things Mira got wrong */}
                {rejected.length > 0 && (
                    <section>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                            Mira got these wrong ({rejected.length})
                        </h2>
                        <div className="space-y-2">
                            {rejected.map(h => (
                                <HypothesisCard key={h.id} hypothesis={h} onAction={handleAction} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
