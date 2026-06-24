'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Phone,
  Clock,
  Star,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  CalendarDays,
  User,
  FileText,
  BarChart3,
  RefreshCw,
  Settings2,
  Play,
  Pause,
  PhoneCall,
  Loader2,
  Check,
  Edit2,
  X,
  Brain,
  ArrowRight,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ExternalLink,
  TrendingUp,
  Zap,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ---------- types ---------- */

interface EvaluationScore {
  metric: string;
  score: number;
  comment?: string;
}

interface CallRecord {
  id: string;
  userName: string;
  userId: string;
  callType: 'onboarding' | 'daily' | 'meeting';
  status: 'completed' | 'no-answer' | 'failed' | 'in-progress';
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  qualityScore?: number;
  summary?: string;
  transcript?: string;
  variablesSent?: Record<string, unknown>;
  evaluationScores?: EvaluationScore[];
  // Posture intelligence
  primaryPosture?: string;
  secondaryPosture?: string;
  postureMatch?: number;
  timingMatch?: number;
  callWorthiness?: number;
  triggerSignals?: Array<{ dimension: string; type: string; strength: number }>;
}

interface ScheduledCallRecord {
  id: string;
  userId: string;
  callType: string;
  status: string;
  scheduledFor: string;
  primaryPosture?: string | null;
  secondaryPosture?: string | null;
  callWorthiness?: number | null;
  outcome?: string | null;
  meetingId?: string | null;
  retryCount: number;
  user: { name: string | null; email: string };
}

interface CallsResponse {
  calls: CallRecord[];
  stats: {
    totalCalls: number;
    avgDuration: number;
    avgQuality: number | null;
  };
}

/* ---------- helpers ---------- */

const CALL_TYPE_COLORS: Record<string, string> = {
  onboarding: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  daily: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  meeting: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-400',
  'no-answer': 'text-amber-400',
  failed: 'text-red-400',
  'in-progress': 'text-blue-400',
};

function qualityColor(score: number | undefined): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function qualityBg(score: number | undefined): string {
  if (score == null) return 'bg-muted';
  if (score >= 80) return 'bg-green-400/15';
  if (score >= 60) return 'bg-amber-400/15';
  return 'bg-red-400/15';
}

function formatDuration(seconds: number | undefined): string {
  if (seconds == null) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/* ---------- components ---------- */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-20" />
          ) : (
            <>
              <p className="text-lg font-semibold text-foreground">{value}</p>
              {sub && (
                <p className="text-xs text-muted-foreground truncate">{sub}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CallRow({
  call,
  expanded,
  onToggle,
}: {
  call: CallRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {/* User */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {call.userName}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(call.startedAt)} at {formatTime(call.startedAt)}
          </p>
        </div>

        {/* Type badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] uppercase tracking-wider',
            CALL_TYPE_COLORS[call.callType]
          )}
        >
          {call.callType}
        </Badge>

        {/* Duration */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground w-16 justify-end">
          <Clock className="h-3 w-3" />
          {formatDuration(call.durationSeconds)}
        </div>

        {/* Quality */}
        <div
          className={cn(
            'hidden sm:flex items-center gap-1 text-xs font-medium w-14 justify-end rounded-md px-1.5 py-0.5',
            qualityColor(call.qualityScore),
            qualityBg(call.qualityScore)
          )}
        >
          <Star className="h-3 w-3" />
          {call.qualityScore != null ? call.qualityScore : '--'}
        </div>

        {/* Posture Badge */}
        {call.primaryPosture && (
          <span
            className="hidden sm:inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            title={`${call.primaryPosture}${call.secondaryPosture ? ` + ${call.secondaryPosture}` : ''}`}
          >
            {call.primaryPosture}
          </span>
        )}

        {/* Status */}
        <span
          className={cn(
            'text-xs font-medium capitalize w-20 text-right',
            STATUS_COLORS[call.status] ?? 'text-muted-foreground'
          )}
        >
          {call.status.replace('-', ' ')}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="bg-muted/20 px-4 py-4 pl-11 space-y-4 text-sm">
          {/* Mobile-only duration + quality */}
          <div className="flex gap-4 sm:hidden">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDuration(call.durationSeconds)}
            </div>
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                qualityColor(call.qualityScore)
              )}
            >
              <Star className="h-3 w-3" />
              {call.qualityScore ?? '--'}
            </div>
          </div>

          {/* Summary */}
          {call.summary && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Summary
              </h4>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {call.summary}
              </p>
            </div>
          )}

          {/* Evaluation scores */}
          {call.evaluationScores && call.evaluationScores.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Evaluation Scores
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {call.evaluationScores.map((es) => (
                  <div
                    key={es.metric}
                    className="rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground truncate">
                      {es.metric}
                    </p>
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        qualityColor(es.score)
                      )}
                    >
                      {es.score}
                    </p>
                    {es.comment && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {es.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Posture Intelligence */}
          {call.primaryPosture && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Coaching Posture
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Primary</p>
                  <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 capitalize">{call.primaryPosture}</p>
                </div>
                {call.secondaryPosture && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Secondary</p>
                    <p className="text-sm font-semibold capitalize">{call.secondaryPosture}</p>
                  </div>
                )}
                {call.postureMatch != null && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Posture Match</p>
                    <p className={cn('text-sm font-semibold', qualityColor(call.postureMatch))}>{call.postureMatch}/10</p>
                  </div>
                )}
                {call.timingMatch != null && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Timing Match</p>
                    <p className={cn('text-sm font-semibold', qualityColor(call.timingMatch))}>{call.timingMatch}/10</p>
                  </div>
                )}
                {call.callWorthiness != null && (
                  <div className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Call Worthiness</p>
                    <p className="text-sm font-semibold">{call.callWorthiness}</p>
                  </div>
                )}
              </div>
              {call.triggerSignals && call.triggerSignals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {call.triggerSignals.map((s, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.type} ({(s.strength * 100).toFixed(0)}%)
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Variables sent */}
          {call.variablesSent &&
            Object.keys(call.variablesSent).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Variables Sent
                </h4>
                <pre className="rounded-lg border border-border bg-card p-3 text-xs text-foreground/80 overflow-x-auto max-h-48">
                  {JSON.stringify(call.variablesSent, null, 2)}
                </pre>
              </div>
            )}

          {/* Transcript */}
          {call.transcript && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Transcript
              </h4>
              <div className="rounded-lg border border-border bg-card p-3 text-xs text-foreground/80 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {call.transcript}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- learning loop types ---------- */

interface HypothesisLoopStats {
  total: number;
  pending: number;
  presented: number;
  confirmed: number;
  revised: number;
  rejected: number;
  followUpsGenerated: number;
  accuracyRate: number;
}

interface ValidationEvent {
  id: string;
  statement: string;
  status: string;
  category: string;
  userResponse: string | null;
  validatedAt: string | null;
  confidence: number;
  isFollowUp: boolean;
  isRevision: boolean;
  userName: string;
}

interface FollowUpEvent {
  id: string;
  statement: string;
  status: string;
  confidence: number;
  createdAt: string;
  parentStatement: string | null;
  parentStatus: string | null;
  userName: string;
}

interface LatestEvaluation {
  userName: string;
  callType: string;
  summary: string | null;
  overallScore: number;
  whatWorked: string[];
  whatToImprove: string[];
  recommendedTopics: string[];
  createdAt: string;
}

interface LearningLoopData {
  hypothesisLoop: HypothesisLoopStats;
  recentValidations: ValidationEvent[];
  recentFollowUps: FollowUpEvent[];
  qualityTrend: Array<{ weekStart: string; avgOverall: number; avgValueAdd: number; count: number }>;
  latestEvaluations: LatestEvaluation[];
  learningExamples: Array<{
    userName: string;
    fromCall: { date: string; recommendation: string; score: number };
    toCall: { date: string; hadDirective: boolean; score: number | null };
  }>;
  langfuseUrl: string;
}

/* ---------- learning loop component ---------- */

function LearningLoop() {
  const [data, setData] = useState<LearningLoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/admin/learning-loop')
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading learning loop...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { hypothesisLoop: hl } = data;

  return (
    <Card className="border-amber-400/10">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-amber-400" />
            Learning Loop
            <Badge variant="outline" className="text-[10px] bg-amber-400/5 border-amber-400/20 text-amber-300">
              feedback evidence
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {data.langfuseUrl && (
              <a
                href={data.langfuseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-amber-400 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Langfuse
              </a>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-muted-foreground hover:text-foreground"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </CardTitle>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0 space-y-5">
          {/* Hypothesis pipeline stats */}
          <div>
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Hypothesis Pipeline
            </h4>
            <div className="flex items-center gap-1 flex-wrap">
              <PipelineStage label="Generated" count={hl.total} color="text-muted-foreground" icon={Lightbulb} />
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <PipelineStage label="Queued" count={hl.pending} color="text-blue-400" icon={Clock} />
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <PipelineStage label="Presented" count={hl.presented} color="text-amber-400" icon={Phone} />
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <PipelineStage label="Confirmed" count={hl.confirmed} color="text-green-400" icon={CheckCircle2} />
              <PipelineStage label="Revised" count={hl.revised} color="text-amber-400" icon={RotateCcw} />
              <PipelineStage label="Rejected" count={hl.rejected} color="text-red-400" icon={XCircle} />
              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <PipelineStage label="Follow-ups" count={hl.followUpsGenerated} color="text-purple-400" icon={Zap} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="text-muted-foreground">
                Accuracy: <span className={cn('font-semibold', hl.accuracyRate >= 70 ? 'text-green-400' : hl.accuracyRate >= 50 ? 'text-amber-400' : 'text-red-400')}>
                  {hl.accuracyRate}%
                </span>
              </span>
              <span className="text-muted-foreground">
                Autoresearch depth: <span className="font-semibold text-purple-400">{hl.followUpsGenerated}</span> follow-ups from confirmed hypotheses
              </span>
            </div>
          </div>

          {/* Recent validations */}
          {data.recentValidations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Validations (7d)
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {data.recentValidations.slice(0, 8).map(v => (
                  <div key={v.id} className="flex items-start gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2">
                    <span className={cn('mt-0.5 shrink-0', v.status === 'CONFIRMED' ? 'text-green-400' : v.status === 'REVISED' ? 'text-amber-400' : 'text-red-400')}>
                      {v.status === 'CONFIRMED' ? <CheckCircle2 className="h-3.5 w-3.5" /> : v.status === 'REVISED' ? <RotateCcw className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-foreground leading-snug">{v.statement}</p>
                      {v.userResponse && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 italic">&ldquo;{v.userResponse}&rdquo;</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{v.userName}</span>
                        {v.isFollowUp && <Badge variant="outline" className="text-[9px] bg-purple-400/10 text-purple-400 border-purple-400/20">autoresearch</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Autoresearch chain — follow-ups generated from confirmed hypotheses */}
          {data.recentFollowUps.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Autoresearch Chain (hypothesis &rarr; deeper follow-up)
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {data.recentFollowUps.slice(0, 5).map(f => (
                  <div key={f.id} className="rounded-lg border border-purple-400/15 bg-purple-400/5 px-3 py-2">
                    {f.parentStatement && (
                      <p className="text-[10px] text-muted-foreground line-through decoration-green-400/50 mb-0.5">
                        {f.parentStatement}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-foreground">
                      <Zap className="h-3 w-3 text-purple-400 shrink-0" />
                      {f.statement}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{f.userName} &middot; {new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest call evaluations — what was learned and what's recommended next */}
          {data.latestEvaluations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Call Analysis &rarr; Next Call Improvements
              </h4>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {data.latestEvaluations.slice(0, 5).map((ev, i) => (
                  <div key={i} className="rounded-lg border border-border/50 bg-card/60 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{ev.userName}</span>
                        <Badge variant="outline" className="text-[9px]">{ev.callType}</Badge>
                      </div>
                      <span className={cn('text-xs font-bold', ev.overallScore >= 8 ? 'text-green-400' : ev.overallScore >= 6 ? 'text-amber-400' : 'text-red-400')}>
                        {ev.overallScore.toFixed(1)}
                      </span>
                    </div>
                    {ev.summary && <p className="text-[11px] text-muted-foreground">{ev.summary}</p>}
                    {ev.whatToImprove.length > 0 && (
                      <div className="flex items-start gap-1">
                        <TrendingUp className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-400">{ev.whatToImprove[0]}</p>
                      </div>
                    )}
                    {ev.recommendedTopics.length > 0 && (
                      <div className="flex items-start gap-1">
                        <ArrowRight className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-blue-400">Next: {ev.recommendedTopics.join(', ')}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-call learning examples */}
          {data.learningExamples.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Cross-Call Learning Evidence
              </h4>
              <div className="space-y-1.5">
                {data.learningExamples.map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="text-muted-foreground">{ex.userName}:</span>{' '}
                      <span className="text-foreground">&ldquo;{ex.fromCall.recommendation}&rdquo;</span>
                    </div>
                    <ArrowRight className="h-3 w-3 text-green-400 shrink-0" />
                    <div className="shrink-0 text-right">
                      <span className={cn('font-semibold', (ex.toCall.score ?? 0) > ex.fromCall.score ? 'text-green-400' : 'text-muted-foreground')}>
                        {ex.fromCall.score.toFixed(1)} → {ex.toCall.score?.toFixed(1) ?? '?'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {data.recentValidations.length === 0 && data.latestEvaluations.length === 0 && hl.total === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No learning loop data yet.</p>
              <p className="text-xs mt-1">Once calls are evaluated and hypotheses tested, the feedback loop evidence will appear here.</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function PipelineStage({
  label,
  count,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/50">
      <Icon className={cn('h-3 w-3', color)} />
      <span className={cn('text-xs font-semibold tabular-nums', color)}>{count}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

/* ---------- call scheduler types ---------- */

interface ScheduleUser {
  userId: string;
  userName: string;
  email: string;
  role: string;
  schedule: {
    enabled: boolean;
    mode: string; // calendar_aware | fixed_time
    time: string;
    leadMinutes: number;
    minGap: number;
    frequencyMinutes: number | null;
    windowStart: string | null;
    windowEnd: string | null;
    maxRetries: number;
    retryAfterMin: number;
    maxCallsPerDay: number | null;
  } | null;
  stats: {
    callsLast7d: number;
    callsToday: number;
    lastCallAt: string | null;
    lastCallStatus: string | null;
    avgDuration: number | null;
  };
  upcoming: { scheduledFor: string; callType: string; status: string }[];
}

/* ---------- call scheduler section ---------- */

function CallScheduler() {
  const [users, setUsers] = useState<ScheduleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [triggeringCall, setTriggeringCall] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/call-scheduling');
      if (!res.ok) {
        const body = await res.text();
        setError(`API error ${res.status}: ${body.substring(0, 200)}`);
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const startEdit = (user: ScheduleUser) => {
    setEditingId(user.userId);
    setEditForm({
      dailyCallEnabled: user.schedule?.enabled ?? false,
      callScheduleMode: user.schedule?.mode ?? 'calendar_aware',
      dailyCallTime: user.schedule?.time ?? '07:45',
      meetingPrepLeadMinutes: user.schedule?.leadMinutes ?? 15,
      meetingPrepMinGap: user.schedule?.minGap ?? 12,
      maxCallsPerDay: user.schedule?.maxCallsPerDay ?? 3,
      dailyCallMaxRetries: user.schedule?.maxRetries ?? 1,
      dailyCallRetryAfterMin: user.schedule?.retryAfterMin ?? 60,
    });
  };

  const saveEdit = async (userId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/call-scheduling/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[CallScheduler] Save failed: ${res.status} ${body}`);
      } else {
        setEditingId(null);
        fetchSchedules();
      }
    } catch (err) {
      console.error('[CallScheduler] Save error:', err);
    }
    setSaving(false);
  };

  const triggerCall = async (userId: string) => {
    setTriggeringCall(userId);
    try {
      const res = await fetch('/api/admin/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, callType: 'daily_checkin' }),
      });
      if (!res.ok) console.error(`[CallScheduler] Trigger failed: ${res.status}`);
      setTimeout(fetchSchedules, 2000);
    } catch (err) {
      console.error('[CallScheduler] Trigger error:', err);
    }
    setTriggeringCall(null);
  };

  const toggleEnabled = async (userId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/admin/call-scheduling/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCallEnabled: !currentEnabled }),
      });
      if (!res.ok) console.error(`[CallScheduler] Toggle failed: ${res.status}`);
      fetchSchedules();
    } catch (err) {
      console.error('[CallScheduler] Toggle error:', err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading schedules...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="h-4 w-4" />
          Call Scheduler
          <span className="text-xs font-normal text-muted-foreground">({users.length} users)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span className="w-6" />
          <span className="flex-1 min-w-0">User</span>
          <span className="w-16 text-center">Status</span>
          <span className="w-20 text-center hidden sm:block">Mode</span>
          <span className="w-16 text-center hidden md:block">7d Calls</span>
          <span className="w-14 text-center hidden md:block">Today</span>
          <span className="w-20 text-center hidden lg:block">Last Call</span>
          <span className="w-14 text-center hidden lg:block">Avg Dur</span>
          <span className="w-24 text-right">Actions</span>
        </div>

        {error ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={fetchSchedules} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No users found</div>
        ) : (
          users.map(user => {
            const isEditing = editingId === user.userId;
            const enabled = user.schedule?.enabled ?? false;

            return (
              <div key={user.userId} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleEnabled(user.userId, enabled)}
                    className={cn('w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                      enabled ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'
                    )}
                    title={enabled ? 'Disable calls' : 'Enable calls'}
                  >
                    {enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </button>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{user.userName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                  </div>

                  {/* Status */}
                  <div className="w-16 text-center">
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                      enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'
                    )}>
                      {enabled ? 'Active' : 'Off'}
                    </span>
                  </div>

                  {/* Mode/Time */}
                  <div className="w-20 text-center text-[10px] text-muted-foreground hidden sm:block">
                    {user.schedule?.mode === 'calendar_aware' ? (
                      <span className="text-blue-400" title={`${user.schedule.leadMinutes}min before meetings, fallback ${user.schedule.time}`}>
                        Calendar
                      </span>
                    ) : (
                      <span>{user.schedule?.time || '--'}</span>
                    )}
                  </div>

                  {/* 7d calls */}
                  <div className="w-16 text-center text-xs tabular-nums hidden md:block">
                    <span className={cn(user.stats.callsLast7d > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                      {user.stats.callsLast7d}
                    </span>
                  </div>

                  {/* Today */}
                  <div className="w-14 text-center text-xs tabular-nums hidden md:block">
                    <span className={cn(user.stats.callsToday > 0 ? 'text-emerald-500 font-medium' : 'text-muted-foreground')}>
                      {user.stats.callsToday}
                    </span>
                  </div>

                  {/* Last call */}
                  <div className="w-20 text-center text-[10px] text-muted-foreground hidden lg:block">
                    {user.stats.lastCallAt ? (
                      <div>
                        <div>{new Date(user.stats.lastCallAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                        <div className={cn(
                          user.stats.lastCallStatus === 'ended' ? 'text-emerald-500' :
                          user.stats.lastCallStatus === 'no-answer' ? 'text-amber-400' : 'text-muted-foreground'
                        )}>{user.stats.lastCallStatus}</div>
                      </div>
                    ) : '--'}
                  </div>

                  {/* Avg duration */}
                  <div className="w-14 text-center text-xs tabular-nums text-muted-foreground hidden lg:block">
                    {user.stats.avgDuration ? formatDuration(user.stats.avgDuration) : '--'}
                  </div>

                  {/* Actions */}
                  <div className="w-24 flex items-center justify-end gap-1">
                    <button
                      onClick={() => triggerCall(user.userId)}
                      disabled={triggeringCall === user.userId}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Trigger call now"
                    >
                      {triggeringCall === user.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : <PhoneCall className="h-3 w-3" />}
                      Call
                    </button>
                    <button
                      onClick={() => isEditing ? setEditingId(null) : startEdit(user)}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      title="Edit schedule"
                    >
                      {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Upcoming calls */}
                {user.upcoming.length > 0 && !isEditing && (
                  <div className="px-4 pb-2 pl-12">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Next: {new Date(user.upcoming[0].scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-primary/60">{user.upcoming[0].callType}</span>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <div className="bg-muted/20 px-4 py-4 pl-12 border-t border-border/50 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-3">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase">Mode</label>
                      <div className="flex rounded-md border border-border overflow-hidden">
                        <button
                          onClick={() => setEditForm(f => ({ ...f, callScheduleMode: 'calendar_aware' }))}
                          className={cn('px-3 py-1 text-[10px] font-medium transition-colors',
                            editForm.callScheduleMode === 'calendar_aware'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Calendar-aware
                        </button>
                        <button
                          onClick={() => setEditForm(f => ({ ...f, callScheduleMode: 'fixed_time' }))}
                          className={cn('px-3 py-1 text-[10px] font-medium transition-colors border-l border-border',
                            editForm.callScheduleMode === 'fixed_time'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          Fixed time
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
                      {editForm.callScheduleMode === 'calendar_aware' ? (
                        <>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                              Lead time
                              <span className="font-normal normal-case ml-1">(min before meeting)</span>
                            </label>
                            <input
                              type="number"
                              min={5}
                              max={30}
                              value={(editForm.meetingPrepLeadMinutes as number) ?? 15}
                              onChange={e => setEditForm(f => ({ ...f, meetingPrepLeadMinutes: parseInt(e.target.value) || 15 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                              Max calls/day
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={(editForm.maxCallsPerDay as number) ?? 3}
                              onChange={e => setEditForm(f => ({ ...f, maxCallsPerDay: parseInt(e.target.value) || 3 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                              Min gap
                              <span className="font-normal normal-case ml-1">(skip back-to-back)</span>
                            </label>
                            <input
                              type="number"
                              min={5}
                              max={30}
                              value={(editForm.meetingPrepMinGap as number) ?? 12}
                              onChange={e => setEditForm(f => ({ ...f, meetingPrepMinGap: parseInt(e.target.value) || 12 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                              Fallback time
                              <span className="font-normal normal-case ml-1">(no-meeting days)</span>
                            </label>
                            <input
                              type="time"
                              value={(editForm.dailyCallTime as string) || '07:45'}
                              onChange={e => setEditForm(f => ({ ...f, dailyCallTime: e.target.value }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">Call Time</label>
                            <input
                              type="time"
                              value={(editForm.dailyCallTime as string) || '07:45'}
                              onChange={e => setEditForm(f => ({ ...f, dailyCallTime: e.target.value }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">Max Retries</label>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={(editForm.dailyCallMaxRetries as number) ?? 1}
                              onChange={e => setEditForm(f => ({ ...f, dailyCallMaxRetries: parseInt(e.target.value) || 0 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">Retry After (min)</label>
                            <input
                              type="number"
                              min={15}
                              max={240}
                              value={(editForm.dailyCallRetryAfterMin as number) ?? 60}
                              onChange={e => setEditForm(f => ({ ...f, dailyCallRetryAfterMin: parseInt(e.target.value) || 60 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">Max calls/day</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={(editForm.maxCallsPerDay as number) ?? 3}
                              onChange={e => setEditForm(f => ({ ...f, maxCallsPerDay: parseInt(e.target.value) || 3 }))}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {editForm.callScheduleMode === 'calendar_aware' && (
                      <p className="text-[10px] text-muted-foreground">
                        Mira will call {(editForm.meetingPrepLeadMinutes as number) ?? 15} min before each meeting, up to {(editForm.maxCallsPerDay as number) ?? 3}x/day.
                        Skips back-to-back meetings with less than {(editForm.meetingPrepMinGap as number) ?? 12} min gap.
                        Falls back to {(editForm.dailyCallTime as string) || '07:45'} IST on days with no meetings.
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveEdit(user.userId)}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- page ---------- */

export default function AdminCallsPage() {
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Today's call plan
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCallRecord[] | null>(null);
  const [scheduledSummary, setScheduledSummary] = useState<{
    total: number; pending: number; completed: number; noAnswer: number; calling: number;
    usersWithCalls: number; usersWithNoCalls: { userId: string; name: string | null }[];
  } | null>(null);

  const fetchScheduled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/calls/scheduled');
      if (!res.ok) return;
      const json = await res.json();
      setScheduledCalls(json.calls || []);
      setScheduledSummary(json.summary || null);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (search) params.set('search', search);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/admin/calls?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Map API response shape — API returns "metrics" not "stats", and may lack avgQuality
      const rawCalls = Array.isArray(json.calls) ? json.calls : [];
      const rawStats = json.stats ?? json.metrics ?? {};
      setData({
        calls: rawCalls,
        stats: {
          totalCalls: rawStats.totalCalls ?? rawCalls.length ?? 0,
          avgDuration: rawStats.avgDuration ?? 0,
          avgQuality: rawStats.avgQuality ?? null,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calls');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const filteredCalls = useMemo(() => {
    if (!data) return [];
    return data.calls;
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">
            Call Observatory
          </h1>
        </div>
        <button
          onClick={fetchCalls}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Phone}
          label="Total Calls"
          value={(data?.stats?.totalCalls ?? 0).toLocaleString()}
          loading={loading}
        />
        <StatCard
          icon={Clock}
          label="Avg Duration"
          value={formatDuration(data?.stats?.avgDuration)}
          loading={loading}
        />
        <StatCard
          icon={BarChart3}
          label="Avg Quality"
          value={data?.stats?.avgQuality != null ? `${data.stats.avgQuality}` : '--'}
          sub={
            data?.stats?.avgQuality != null
              ? data.stats.avgQuality >= 80
                ? 'Healthy'
                : data.stats.avgQuality >= 60
                  ? 'Needs attention'
                  : 'Critical'
              : undefined
          }
          loading={loading}
        />
      </div>

      {/* Today's Call Plan */}
      {scheduledCalls && scheduledCalls.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-violet-400" />
              Today&apos;s Call Plan
              <span className="ml-auto text-xs text-muted-foreground font-normal">
                {scheduledSummary?.pending ?? 0} pending &middot; {scheduledSummary?.completed ?? 0} done &middot; {scheduledSummary?.noAnswer ?? 0} missed
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {scheduledCalls.map((sc) => {
                const time = new Date(sc.scheduledFor);
                const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
                const isPast = time < new Date();
                return (
                  <div key={sc.id} className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                    sc.status === 'completed' ? 'border-green-200 dark:border-green-900/30 bg-green-50/30 dark:bg-green-900/10' :
                    sc.status === 'no_answer' ? 'border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10' :
                    sc.status === 'calling' ? 'border-amber-200 dark:border-amber-900/30 bg-amber-50/30 dark:bg-amber-900/10' :
                    'border-border bg-card'
                  )}>
                    <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{timeStr}</span>
                    <span className="font-medium text-foreground truncate">{sc.user?.name || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground">{sc.callType}</span>
                    {sc.primaryPosture && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 capitalize">
                        {sc.primaryPosture}
                      </span>
                    )}
                    <span className={cn(
                      'ml-auto text-[10px] font-medium capitalize',
                      sc.status === 'completed' ? 'text-green-600' :
                      sc.status === 'no_answer' ? 'text-red-500' :
                      sc.status === 'calling' ? 'text-amber-500' :
                      isPast ? 'text-muted-foreground' : 'text-foreground'
                    )}>
                      {sc.status === 'pending' && isPast ? 'overdue' : sc.status}
                    </span>
                  </div>
                );
              })}
            </div>
            {scheduledSummary?.usersWithNoCalls && scheduledSummary.usersWithNoCalls.length > 0 && (
              <div className="mt-3 px-1">
                <p className="text-[10px] text-amber-500 font-medium">
                  No calls planned: {scheduledSummary.usersWithNoCalls.map(u => u.name || 'Unknown').join(', ')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Learning Loop — feedback evidence */}
      <LearningLoop />

      {/* Call Scheduler */}
      <CallScheduler />

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by user name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Type */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All types</option>
                <option value="onboarding">Onboarding</option>
                <option value="daily">Daily</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="py-4">
            <p className="text-sm text-red-400">
              Failed to load calls: {error}
            </p>
            <button
              onClick={fetchCalls}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      )}

      {/* Call list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            Recent Calls
            {!loading && data && (
              <span className="text-xs font-normal text-muted-foreground">
                ({filteredCalls.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span className="w-4" />
            <span className="flex-1">User</span>
            <span className="w-20 text-center">Type</span>
            <span className="hidden sm:block w-16 text-right">Duration</span>
            <span className="hidden sm:block w-14 text-right">Quality</span>
            <span className="w-20 text-right">Status</span>
          </div>

          {loading ? (
            <div className="space-y-1 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-10 flex-1 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Phone className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No calls found</p>
              <p className="text-xs mt-1">
                Try adjusting your filters or check back later.
              </p>
            </div>
          ) : (
            filteredCalls.map((call) => (
              <CallRow
                key={call.id}
                call={call}
                expanded={expandedId === call.id}
                onToggle={() =>
                  setExpandedId(expandedId === call.id ? null : call.id)
                }
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
