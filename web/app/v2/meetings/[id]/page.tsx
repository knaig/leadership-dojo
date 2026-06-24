'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
    Lightbulb, FileText, Users, Target, ChevronRight,
    Loader2, Clock, RefreshCw, Mail, Sparkles, User,
    CircleCheck, Circle
} from 'lucide-react';

interface Commitment {
    id: string;
    owner: string;
    description: string;
    dueDate: string | null;
    status: string;
}

interface MeetingReview {
    whatWorked: string[];
    whatFailed: string[];
    surprises: string[];
    aiInsights: string | null;
    suggestedImprovements: string[];
}

interface MeetingDetail {
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    attendees: { name: string; email: string; response: string }[];
    meetingType: string | null;
    meetingCategory: string | null;
    desiredOutcome: string | null;
    outcomeResult: string | null;
    outcome: string | null;
    followUps: string[];
    lifecycleStage: string | null;
    notes: string | null;
    review: MeetingReview | null;
    commitments: Commitment[];
}

interface InfluenceStep {
    action: string;
    stakeholderName: string;
    timing: 'before' | 'during' | 'after';
    priority: 'critical' | 'important' | 'nice-to-have';
    stakeholderId?: string | null;
}

interface SuggestedPreMeeting {
    stakeholderName: string;
    reason: string;
    talkingPoints: string[];
    stakeholderId?: string | null;
}

interface InfluencePlan {
    id: string;
    roomTemperature: number;
    roomRead: { narrative: string; stakeholders: InfluenceStep[] };
    tacticalAdvice: string;
    influenceSteps: InfluenceStep[];
    suggestedMeetings: SuggestedPreMeeting[];
    status: string;
    createdAt: string;
}

const OUTCOME_CONFIG = {
    LANDED: { icon: CheckCircle2, label: 'Landed', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    PARTIAL: { icon: AlertTriangle, label: 'Partial', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    MISSED: { icon: XCircle, label: 'Missed', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
};

const CATEGORY_LABELS: Record<string, string> = {
    NEEDLE_MOVER: 'Needle Mover',
    TACTICAL: 'Tactical',
    OPERATIONAL: 'Operational',
    GROWTH: 'Growth',
};

function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
        ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(start: string, end: string): string {
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function MeetingDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        fetch(`/api/meetings/${id}`)
            .then(res => {
                if (!res.ok) throw new Error(res.status === 404 ? 'Meeting not found' : 'Failed to load');
                return res.json();
            })
            .then(data => setMeeting(data.meeting))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !meeting) {
        return (
            <div className="flex-1 overflow-y-auto px-4 lg:px-8 p-6">
                <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
                    <ArrowLeft size={16} /> Back
                </button>
                <p className="text-muted-foreground text-center py-12">{error || 'Meeting not found'}</p>
            </div>
        );
    }

    const outcomeConfig = meeting.outcomeResult ? OUTCOME_CONFIG[meeting.outcomeResult as keyof typeof OUTCOME_CONFIG] : null;
    const OutcomeIcon = outcomeConfig?.icon;
    const isPast = new Date(meeting.endTime) < new Date();
    const hasReview = !!meeting.review;
    const attendeeNames = meeting.attendees?.map(a => a.name).join(', ') || '';

    return (
        <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-6">
            {/* Back nav */}
            <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={16} /> Back to meetings
            </button>

            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    {outcomeConfig && OutcomeIcon && (
                        <span className={`flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full ${outcomeConfig.bg} ${outcomeConfig.color}`}>
                            <OutcomeIcon size={14} />
                            {outcomeConfig.label}
                        </span>
                    )}
                    {meeting.meetingCategory && (
                        <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                            {CATEGORY_LABELS[meeting.meetingCategory] || meeting.meetingCategory}
                        </span>
                    )}
                </div>
                <h1 className="text-xl font-semibold text-foreground">{meeting.title}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatDateTime(meeting.startTime)}
                    </span>
                    <span>&middot; {formatDuration(meeting.startTime, meeting.endTime)}</span>
                </div>
                {attendeeNames && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                        <Users size={12} />
                        <span>{attendeeNames}</span>
                    </div>
                )}
            </div>

            {/* Two-column layout: Review left, Commitments + Notes right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left column: Outcome + AI Insights + What Worked/Failed */}
            <div className="space-y-4">

            {/* Outcome vs Goal */}
            {(meeting.desiredOutcome || meeting.outcome) && (
                <div className={`rounded-xl border p-4 space-y-3 ${outcomeConfig ? outcomeConfig.border : 'border-border'} bg-card`}>
                    {meeting.desiredOutcome && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <Target size={12} className="text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Goal</span>
                            </div>
                            <p className="text-sm text-foreground">{meeting.desiredOutcome}</p>
                        </div>
                    )}
                    {meeting.outcome && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <FileText size={12} className="text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What happened</span>
                            </div>
                            <p className="text-sm text-foreground/80">{meeting.outcome}</p>
                        </div>
                    )}
                </div>
            )}

            {/* AI Insights */}
            {hasReview && meeting.review!.aiInsights && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb size={14} className="text-primary" />
                        <span className="text-xs font-medium text-primary">Mira&apos;s Take</span>
                    </div>
                    <p className="text-sm leading-relaxed">{meeting.review!.aiInsights}</p>
                </div>
            )}

            {/* What Worked / What Failed / Surprises — side by side on wide */}
            {hasReview && (meeting.review!.whatWorked.length > 0 || meeting.review!.whatFailed.length > 0 || meeting.review!.surprises.length > 0) && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    {meeting.review!.whatWorked.length > 0 && (
                        <div className="rounded-xl border border-emerald-500/20 bg-card p-4">
                            <h3 className="text-xs font-medium text-emerald-500 uppercase tracking-wider mb-2">What worked</h3>
                            <ul className="space-y-1.5">
                                {meeting.review!.whatWorked.map((item, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {meeting.review!.whatFailed.length > 0 && (
                        <div className="rounded-xl border border-red-400/20 bg-card p-4">
                            <h3 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">What didn&apos;t work</h3>
                            <ul className="space-y-1.5">
                                {meeting.review!.whatFailed.map((item, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {meeting.review!.surprises.length > 0 && (
                        <div className="rounded-xl border border-amber-500/20 bg-card p-4">
                            <h3 className="text-xs font-medium text-amber-500 uppercase tracking-wider mb-2">Surprises</h3>
                            <ul className="space-y-1.5">
                                {meeting.review!.surprises.map((item, i) => (
                                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                        <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            </div>{/* end left column */}

            {/* Right column: Commitments + Follow-ups */}
            <div className="space-y-4">

            {/* Commitments */}
            {meeting.commitments.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Commitments ({meeting.commitments.length})
                    </h3>
                    <div className="space-y-2">
                        {meeting.commitments.map(c => (
                            <div key={c.id} className="flex items-start gap-3 py-1.5">
                                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                    c.status === 'FULFILLED' ? 'bg-emerald-500' :
                                    c.status === 'OVERDUE' ? 'bg-red-400' :
                                    'bg-amber-500'
                                }`} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground">{c.description}</p>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                        <span>{c.owner}</span>
                                        {c.dueDate && (
                                            <>
                                                <span>&middot;</span>
                                                <span>Due {new Date(c.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    c.status === 'FULFILLED' ? 'text-emerald-500 bg-emerald-500/10' :
                                    c.status === 'OVERDUE' ? 'text-red-400 bg-red-400/10' :
                                    'text-muted-foreground bg-muted'
                                }`}>
                                    {c.status === 'FULFILLED' ? 'Done' : c.status === 'OVERDUE' ? 'Overdue' : 'Pending'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Follow-ups */}
            {meeting.followUps && meeting.followUps.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Follow-ups</h3>
                    <ul className="space-y-1.5">
                        {meeting.followUps.map((item, i) => (
                            <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                <ChevronRight size={14} className="text-primary mt-0.5 flex-shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Suggested Improvements */}
            {hasReview && meeting.review!.suggestedImprovements.length > 0 && (
                <div className="rounded-xl border border-primary/20 bg-card p-4">
                    <h3 className="text-xs font-medium text-primary uppercase tracking-wider mb-3">For next time</h3>
                    <ul className="space-y-1.5">
                        {meeting.review!.suggestedImprovements.map((item, i) => (
                            <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                <Lightbulb size={14} className="text-primary mt-0.5 flex-shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Meeting Notes (collapsible) + Fetch button */}
            {meeting.notes ? (
                <MeetingNotesSection notes={meeting.notes} meetingId={meeting.id} onNotesUpdated={(notes) => setMeeting(m => m ? { ...m, notes } : m)} />
            ) : isPast ? (
                <FetchNotesButton meetingId={meeting.id} onNotesFound={(notes) => setMeeting(m => m ? { ...m, notes } : m)} />
            ) : null}

            </div>{/* end right column */}
            </div>{/* end two-column grid */}

            {/* No review yet — prompt */}
            {isPast && !outcomeConfig && (
                <Link
                    href={`/chat?prep=How did my meeting "${meeting.title}" go?`}
                    className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 hover:border-primary/40 transition-colors"
                >
                    <Target size={16} className="text-primary" />
                    <span className="text-sm text-foreground flex-1">Log how this meeting went</span>
                    <ChevronRight size={14} className="text-primary" />
                </Link>
            )}

            {/* Influence Plan */}
            <InfluencePlanSection meetingId={meeting.id} isFuture={!isPast} attendeeCount={meeting.attendees?.length ?? 0} />
        </div>
    );
}

function MeetingNotesSection({ notes, meetingId, onNotesUpdated }: { notes: string; meetingId: string; onNotesUpdated: (notes: string) => void }) {
    const [expanded, setExpanded] = useState(false);
    const [refetching, setRefetching] = useState(false);
    const preview = notes.substring(0, 300);
    const isLong = notes.length > 300;

    const handleRefetch = async () => {
        setRefetching(true);
        try {
            const res = await fetch(`/api/meetings/${meetingId}/notes`, { method: 'POST' });
            const data = await res.json();
            if (data.found) {
                onNotesUpdated(data.preview + (data.notesLength > 500 ? '...' : ''));
                // Re-fetch the full meeting to get complete notes
                const meetingRes = await fetch(`/api/meetings/${meetingId}/notes`);
                const meetingData = await meetingRes.json();
                if (meetingData.notes) onNotesUpdated(meetingData.notes);
            }
        } finally {
            setRefetching(false);
        }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 w-full text-left"
            >
                <FileText size={12} className="text-muted-foreground" />
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex-1">
                    Meeting Notes
                </h3>
                <button
                    onClick={(e) => { e.stopPropagation(); handleRefetch(); }}
                    disabled={refetching}
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mr-2"
                    title="Re-fetch from Gmail"
                >
                    <RefreshCw size={10} className={refetching ? 'animate-spin' : ''} />
                </button>
                {isLong && (
                    <span className="text-xs text-primary">
                        {expanded ? 'Show less' : 'Show more'}
                    </span>
                )}
            </button>
            <div className="mt-2 text-sm text-foreground/70 whitespace-pre-wrap leading-relaxed">
                {expanded || !isLong ? notes : `${preview}...`}
            </div>
        </div>
    );
}

function FetchNotesButton({ meetingId, onNotesFound }: { meetingId: string; onNotesFound: (notes: string) => void }) {
    const [fetching, setFetching] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const handleFetch = async () => {
        setFetching(true);
        setResult(null);
        try {
            const res = await fetch(`/api/meetings/${meetingId}/notes`, { method: 'POST' });
            const data = await res.json();
            if (data.found) {
                setResult(`Found notes from ${data.source} (${data.notesLength} chars)`);
                // Fetch full notes
                const notesRes = await fetch(`/api/meetings/${meetingId}/notes`);
                const notesData = await notesRes.json();
                if (notesData.notes) onNotesFound(notesData.notes);
            } else {
                setResult(data.message || 'No notes found in Gmail or Drive.');
            }
        } catch {
            setResult('Failed to fetch notes.');
        } finally {
            setFetching(false);
        }
    };

    return (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
            <div className="flex items-center gap-3">
                <Mail size={16} className="text-muted-foreground" />
                <div className="flex-1">
                    <p className="text-sm text-muted-foreground">No meeting notes yet</p>
                    {result && <p className="text-xs text-muted-foreground/70 mt-1">{result}</p>}
                </div>
                <button
                    onClick={handleFetch}
                    disabled={fetching}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                    {fetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {fetching ? 'Searching...' : 'Fetch from Gmail'}
                </button>
            </div>
        </div>
    );
}

const TIMING_CONFIG = {
    before: { label: 'Before', bg: 'bg-blue-500/10', text: 'text-blue-500' },
    during: { label: 'During', bg: 'bg-amber-500/10', text: 'text-amber-500' },
    after: { label: 'After', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
};

const PRIORITY_CONFIG = {
    critical: { dot: 'bg-red-400', label: 'Critical' },
    important: { dot: 'bg-amber-400', label: 'Important' },
    'nice-to-have': { dot: 'bg-muted-foreground', label: 'Nice to have' },
};

function InfluencePlanSection({ meetingId, isFuture, attendeeCount }: { meetingId: string; isFuture: boolean; attendeeCount: number }) {
    const [plan, setPlan] = useState<InfluencePlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

    useEffect(() => {
        fetch(`/api/meetings/${meetingId}/influence-plan`)
            .then(res => res.json())
            .then(data => setPlan(data.plan))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [meetingId]);

    const handleGenerate = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch(`/api/meetings/${meetingId}/influence-plan`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to generate');
            }
            const data = await res.json();
            setPlan(data.plan);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate plan');
        } finally {
            setGenerating(false);
        }
    };

    const toggleStep = (i: number) => {
        setCheckedSteps(prev => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    };

    if (loading) return null;

    if (!plan && isFuture && attendeeCount >= 3) {
        return (
            <div className="rounded-xl border border-dashed border-primary/20 bg-card/50 p-5">
                <div className="flex items-center gap-3">
                    <Sparkles size={16} className="text-primary" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Influence Plan</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Get tactical advice on room dynamics and stakeholder strategy</p>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {generating ? 'Analyzing room...' : 'Generate Influence Plan'}
                    </button>
                </div>
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>
        );
    }

    if (!plan) return null;

    const tempPct = Math.round((plan.roomTemperature ?? 0.5) * 100);
    const tempColor = tempPct >= 70 ? 'bg-emerald-500' : tempPct >= 40 ? 'bg-amber-500' : 'bg-red-400';
    const tempLabel = tempPct >= 70 ? 'Favorable' : tempPct >= 40 ? 'Mixed' : 'Challenging';
    const steps = plan.influenceSteps || [];
    const preMeetings = plan.suggestedMeetings || [];
    const narrative = typeof plan.roomRead === 'object' ? plan.roomRead.narrative : plan.roomRead;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    Influence Plan
                </h2>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                    {generating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                    Regenerate
                </button>
            </div>

            {/* Room Temperature */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Room Temperature</span>
                    <span className="text-xs font-medium text-foreground">{tempPct}% {tempLabel}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${tempColor} transition-all duration-700`} style={{ width: `${tempPct}%` }} />
                </div>
            </div>

            {/* Room Read */}
            {narrative && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Users size={12} className="text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Room Read</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/80">{narrative}</p>
                </div>
            )}

            {/* Tactical Advice */}
            {plan.tacticalAdvice && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Lightbulb size={14} className="text-primary" />
                        <span className="text-xs font-medium text-primary">Mira&apos;s Take</span>
                    </div>
                    <p className="text-sm leading-relaxed">{plan.tacticalAdvice}</p>
                </div>
            )}

            {/* Influence Steps Checklist */}
            {steps.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Influence Steps ({steps.length})
                    </h3>
                    <div className="space-y-2">
                        {steps.map((step, i) => {
                            const timing = TIMING_CONFIG[step.timing] || TIMING_CONFIG.during;
                            const priority = PRIORITY_CONFIG[step.priority] || PRIORITY_CONFIG.important;
                            const checked = checkedSteps.has(i);
                            return (
                                <button
                                    key={i}
                                    onClick={() => toggleStep(i)}
                                    className={`w-full flex items-start gap-3 py-2 px-1 rounded-lg text-left transition-colors hover:bg-muted/50 ${checked ? 'opacity-50' : ''}`}
                                >
                                    {checked
                                        ? <CircleCheck size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                        : <Circle size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm text-foreground ${checked ? 'line-through' : ''}`}>
                                            {step.action}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            {step.stakeholderName && (
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <User size={9} /> {step.stakeholderName}
                                                </span>
                                            )}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${timing.bg} ${timing.text}`}>
                                                {timing.label}
                                            </span>
                                            <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} title={priority.label} />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Suggested Pre-Meetings */}
            {preMeetings.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                        Suggested Pre-Meetings
                    </h3>
                    <div className="space-y-3">
                        {preMeetings.map((m, i) => (
                            <div key={i} className="border-l-2 border-primary/30 pl-3 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">{m.stakeholderName}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{m.reason}</p>
                                {m.talkingPoints?.length > 0 && (
                                    <ul className="space-y-0.5 mt-1">
                                        {m.talkingPoints.map((tp, j) => (
                                            <li key={j} className="text-xs text-foreground/70 flex items-start gap-1.5">
                                                <ChevronRight size={10} className="text-primary mt-0.5 flex-shrink-0" />
                                                {tp}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    );
}
