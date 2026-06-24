'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  User,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QualityDataPoint {
  date: string;
  score: number;
}

interface CoachingUserSummary {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  coachingPhase: string;
  callCount: number;
  avgQuality: number;
  qualityTrend: 'up' | 'down' | 'flat';
  qualityHistory: QualityDataPoint[];
  activeThemes: string[];
  openCommitments: number;
  archetype?: string;
  archetypeConfidence?: number;
}

interface SystemMetrics {
  totalCallsToday: number;
  avgQualityToday: number;
  commitmentCompletionRate: number;
}

interface CoachingIntelligenceResponse {
  metrics: SystemMetrics;
  users: CoachingUserSummary[];
}

interface CallEvaluation {
  callId: string;
  date: string;
  duration: number;
  overallScore: number;
  kpis: Record<string, number>;
  summary: string;
}

interface CoachingTheme {
  theme: string;
  firstSeen: string;
  lastSeen: string;
  mentions: number;
  status: 'active' | 'resolved' | 'dormant';
}

interface Commitment {
  id: string;
  description: string;
  createdAt: string;
  dueDate?: string;
  status: 'open' | 'completed' | 'dropped';
  completedAt?: string;
}

interface BigFiveTrait {
  score: number;
  evidence?: string;
}

interface PersonalityProfile {
  bigFive?: Record<string, BigFiveTrait>;
  communicationStyle?: {
    preferredPace?: string;
    depthPreference?: string;
    humorResponse?: string;
    directnessLevel?: string;
    topicEntryStyle?: string;
    challengeTolerance?: string;
    emotionalExpression?: string;
  };
  emotionalTriggers?: {
    energizers?: string[];
    drainers?: string[];
    stressResponses?: string[];
    trustSignals?: string[];
  };
  decisionMakingStyle?: {
    primary?: string;
    underPressure?: string;
    blindSpots?: string[];
  };
  coachingAdaptations?: {
    whatWorksWithThisPerson?: string[];
    whatDoesntWork?: string[];
    miraTonesForThisUser?: string[];
  };
  confidenceLevel?: string;
  callsAnalyzed?: number;
  archetype?: { primary?: string; secondary?: string };
}

interface CommunicationProfile {
  pace?: string;
  depth?: string;
  humor?: string;
  directness?: string;
  preferredTopicEntry?: string;
  avoidPatterns?: string[];
}

interface GoalObjective {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  ownerType: string;
}

interface OnboardingData {
  coveredStory: boolean;
  coveredDrivesAndValues: boolean;
  coveredLife: boolean;
  coveredRole: boolean;
  coveredStakeholders: boolean;
  coveredLeadershipStyle: boolean;
  coveredGoals: boolean;
  coveredChallenges: boolean;
  coveredGrowth: boolean;
  totalOnboardingCalls: number;
}

interface PersonalThread {
  id: string;
  category: string;
  topic: string;
  stage: string;
  lastTouched: string;
  touchCount: number;
  userEngagement: string;
}

interface PersonalContextData {
  callCount: number;
  totalCallMinutes: number;
  firstCallDate?: string;
  lastCallDate?: string;
  knownTopics?: string[];
  gapTopics?: string[];
}

interface UserCoachingDetail {
  calls: {
    id: string;
    callType: string;
    durationSeconds: number;
    summary: string;
    endedAt: string;
    evaluation?: {
      overallScore: number;
      newGroundScore: number;
      depthOfSharingScore: number;
      valueAddScore: number;
      contextUtilScore: number;
      repetitionScore: number;
      engagementScore: number;
      whatWorked?: string[];
      whatToImprove?: string[];
      commitmentsExtracted?: string[];
      newInfoLearned?: string[];
      recommendedTopics?: string[];
      postureMatch?: number;
      timingMatch?: number;
      selectedPosture?: string;
    };
  }[];
  plan?: {
    phase: string;
    coachingThemes: CoachingTheme[];
    communicationProfile: CommunicationProfile;
    personalityProfile: PersonalityProfile;
    commitments: Commitment[];
    avoidTopics: string[];
    updatedAt: string;
  };
  personalContext?: PersonalContextData;
  threads?: PersonalThread[];
  preferences?: {
    primaryArchetype?: string;
    secondaryArchetype?: string;
    conversationMode?: string;
    adaptationSignals?: Record<string, unknown>;
    preferredCallDuration?: number;
    postureReceptivity?: Record<string, number>;
    fatigueProfile?: Record<string, number>;
  };
  goals?: GoalObjective[];
  onboarding?: OnboardingData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qualityColor(score: number): string {
  if (score >= 8) return 'text-green-400';
  if (score >= 6) return 'text-amber-400';
  return 'text-red-400';
}

function qualityBg(score: number): string {
  if (score >= 8) return 'bg-green-400/10 border-green-400/20';
  if (score >= 6) return 'bg-amber-400/10 border-amber-400/20';
  return 'bg-red-400/10 border-red-400/20';
}

function qualityStroke(score: number): string {
  if (score >= 8) return '#4ade80';
  if (score >= 6) return '#fbbf24';
  return '#f87171';
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
  valueColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  subtitle?: string;
  valueColor?: string;
}) {
  return (
    <Card className="border-amber-400/10 bg-card/80">
      <CardContent className="pt-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-400/10">
            <Icon className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {label}
            </p>
            <p className={cn('text-2xl font-bold', valueColor || 'text-foreground')}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QualitySparkline({
  data,
  avgScore,
}: {
  data: QualityDataPoint[];
  avgScore: number;
}) {
  if (!data || data.length < 2) {
    return <span className="text-xs text-muted-foreground">--</span>;
  }
  return (
    <div className="w-20 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="score"
            stroke={qualityStroke(avgScore)}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CommitmentStatusIcon({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  if (status === 'dropped')
    return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

// ---------------------------------------------------------------------------
// User Detail Panel
// ---------------------------------------------------------------------------

function BigFiveBar({ label, score, evidence }: { label: string; score: number; evidence?: string }) {
  const pct = Math.round(score * 100);
  return (
    <div className="space-y-0.5" title={evidence || ''}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-foreground/80">{label}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 70 ? 'bg-amber-400' : pct >= 40 ? 'bg-amber-400/60' : 'bg-amber-400/30'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {evidence && (
        <p className="text-[10px] text-muted-foreground/70 italic leading-tight">{evidence}</p>
      )}
    </div>
  );
}

function OnboardingRing({ onboarding }: { onboarding: OnboardingData }) {
  const topics = [
    { key: 'coveredStory', label: 'Story', layer: 'Person' },
    { key: 'coveredDrivesAndValues', label: 'Values', layer: 'Person' },
    { key: 'coveredLife', label: 'Life', layer: 'Person' },
    { key: 'coveredRole', label: 'Role', layer: 'Leader' },
    { key: 'coveredStakeholders', label: 'People', layer: 'Leader' },
    { key: 'coveredLeadershipStyle', label: 'Style', layer: 'Leader' },
    { key: 'coveredGoals', label: 'Goals', layer: 'Ambition' },
    { key: 'coveredChallenges', label: 'Challenges', layer: 'Ambition' },
    { key: 'coveredGrowth', label: 'Growth', layer: 'Ambition' },
  ] as const;

  const covered = topics.filter(t => onboarding[t.key]).length;
  const pct = Math.round((covered / topics.length) * 100);
  const layerColors: Record<string, string> = {
    Person: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
    Leader: 'bg-amber-400/20 text-amber-400 border-amber-400/30',
    Ambition: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-muted" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
              className={pct === 100 ? 'text-emerald-400' : 'text-amber-400'}
              strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">{pct}%</span>
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">{covered}/{topics.length} topics covered</p>
          <p className="text-[10px] text-muted-foreground">{onboarding.totalOnboardingCalls} onboarding calls</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {topics.map(t => (
          <span key={t.key} className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border',
            onboarding[t.key] ? layerColors[t.layer] : 'bg-muted/50 text-muted-foreground border-border/50'
          )}>
            {onboarding[t.key] ? '\u2713' : '\u25CB'} {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserCoachingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'calls' | 'themes'>('profile');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/coaching-intelligence/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load user details');
        return res.json();
      })
      .then((data) => setDetail(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!detail) return null;

  const pp = detail.plan?.personalityProfile;
  const cp = detail.plan?.communicationProfile;
  const calls = detail.calls || [];
  const themes = (detail.plan?.coachingThemes ?? []) as CoachingTheme[];
  const commitments = (detail.plan?.commitments ?? []) as Commitment[];
  const goals = detail.goals || [];
  const threads = detail.threads || [];
  const pc = detail.personalContext;

  const tabs = [
    { id: 'profile' as const, label: 'Profile & Personality' },
    { id: 'calls' as const, label: `Calls (${calls.length})` },
    { id: 'themes' as const, label: 'Themes & Commitments' },
  ];

  return (
    <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/50 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors cursor-pointer',
              activeTab === tab.id
                ? 'bg-card text-foreground border border-border/50 border-b-0'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ PROFILE & PERSONALITY TAB ═══ */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Overview card */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              Overview
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Phase</p>
                <p className="text-sm font-medium text-foreground">{detail.plan?.phase || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Calls</p>
                <p className="text-sm font-medium text-foreground">{pc?.callCount || 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Call Minutes</p>
                <p className="text-sm font-medium text-foreground">{pc?.totalCallMinutes || 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Archetype</p>
                <p className="text-sm font-medium text-foreground">
                  {detail.preferences?.primaryArchetype || pp?.archetype?.primary || 'TBD'}
                  {(detail.preferences?.secondaryArchetype || pp?.archetype?.secondary) && (
                    <span className="text-muted-foreground"> / {detail.preferences?.secondaryArchetype || pp?.archetype?.secondary}</span>
                  )}
                </p>
              </div>
            </div>
            {pc?.lastCallDate && (
              <p className="text-[10px] text-muted-foreground">
                Last call: {formatDate(pc.lastCallDate)}
                {pc.firstCallDate && <> &middot; First: {formatDate(pc.firstCallDate)}</>}
              </p>
            )}
          </div>

          {/* Posture Receptivity Profile */}
          {detail.preferences?.postureReceptivity && Object.keys(detail.preferences.postureReceptivity).length > 0 && (
            <div className="rounded-lg border border-violet-200/50 dark:border-violet-800/30 bg-violet-50/30 dark:bg-violet-900/10 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                Posture Receptivity
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(detail.preferences.postureReceptivity)
                  .sort(([, a], [, b]) => b - a)
                  .map(([posture, score]) => (
                    <div key={posture} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="capitalize text-foreground">{posture}</span>
                          <span className="text-muted-foreground">{(score * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-0.5">
                          <div
                            className="h-full bg-violet-500 rounded-full"
                            style={{ width: `${Math.round(score * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Onboarding progress */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-400" />
              Onboarding Progress
            </h4>
            {detail.onboarding ? (
              <OnboardingRing onboarding={detail.onboarding} />
            ) : (
              <p className="text-xs text-muted-foreground">No onboarding data</p>
            )}
          </div>

          {/* Big Five personality */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              Personality (Big Five)
              {pp?.confidenceLevel && (
                <Badge variant="outline" className="text-[9px] ml-auto bg-muted/50 text-muted-foreground">
                  {pp.confidenceLevel} confidence &middot; {pp.callsAnalyzed || 0} calls analyzed
                </Badge>
              )}
            </h4>
            {pp?.bigFive && Object.keys(pp.bigFive).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(pp.bigFive).map(([trait, data]) => (
                  <BigFiveBar key={trait} label={trait.charAt(0).toUpperCase() + trait.slice(1)} score={data.score} evidence={data.evidence} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not enough data yet. Needs 5+ calls for initial profiling.</p>
            )}
          </div>

          {/* Communication & Decision style */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Communication & Decisions</h4>
            {(pp?.communicationStyle || cp) ? (
              <div className="space-y-2">
                {[
                  { label: 'Pace', value: pp?.communicationStyle?.preferredPace || cp?.pace },
                  { label: 'Depth', value: pp?.communicationStyle?.depthPreference || cp?.depth },
                  { label: 'Directness', value: pp?.communicationStyle?.directnessLevel || cp?.directness },
                  { label: 'Humor', value: pp?.communicationStyle?.humorResponse || cp?.humor },
                  { label: 'Topic Entry', value: pp?.communicationStyle?.topicEntryStyle || cp?.preferredTopicEntry },
                  { label: 'Challenge Tolerance', value: pp?.communicationStyle?.challengeTolerance },
                  { label: 'Emotional Expression', value: pp?.communicationStyle?.emotionalExpression },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{r.label}</span>
                    <span className="text-[11px] text-foreground font-medium">{r.value}</span>
                  </div>
                ))}
                {pp?.decisionMakingStyle && (
                  <>
                    <div className="border-t border-border/30 pt-2 mt-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Decisions</span>
                      <span className="text-[11px] text-foreground font-medium">{pp.decisionMakingStyle.primary}</span>
                    </div>
                    {pp.decisionMakingStyle.underPressure && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Under Pressure</span>
                        <span className="text-[11px] text-foreground font-medium">{pp.decisionMakingStyle.underPressure}</span>
                      </div>
                    )}
                    {pp.decisionMakingStyle.blindSpots && pp.decisionMakingStyle.blindSpots.length > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground">Blind spots:</span>
                        <p className="text-[11px] text-amber-300/80 mt-0.5">{pp.decisionMakingStyle.blindSpots.join(', ')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Needs more calls to assess</p>
            )}
          </div>

          {/* Emotional triggers */}
          {pp?.emotionalTriggers && (
            <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Emotional Landscape</h4>
              <div className="space-y-2">
                {pp.emotionalTriggers.energizers && pp.emotionalTriggers.energizers.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Energizers</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pp.emotionalTriggers.energizers.map(e => (
                        <Badge key={e} variant="outline" className="text-[10px] bg-green-400/10 text-green-400 border-green-400/20">{e}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {pp.emotionalTriggers.drainers && pp.emotionalTriggers.drainers.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Drainers</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pp.emotionalTriggers.drainers.map(d => (
                        <Badge key={d} variant="outline" className="text-[10px] bg-red-400/10 text-red-400 border-red-400/20">{d}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {pp.emotionalTriggers.stressResponses && pp.emotionalTriggers.stressResponses.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Under Stress</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{pp.emotionalTriggers.stressResponses.join(' / ')}</p>
                  </div>
                )}
                {pp.emotionalTriggers.trustSignals && pp.emotionalTriggers.trustSignals.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trust Signals</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{pp.emotionalTriggers.trustSignals.join(' / ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* How Mira adapts for this person */}
          {pp?.coachingAdaptations && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">How Mira Adapts</h4>
              <div className="space-y-2">
                {pp.coachingAdaptations.whatWorksWithThisPerson && pp.coachingAdaptations.whatWorksWithThisPerson.length > 0 && (
                  <div>
                    <span className="text-[10px] text-green-400 uppercase tracking-wider">What works</span>
                    <ul className="mt-1 space-y-0.5">
                      {pp.coachingAdaptations.whatWorksWithThisPerson.map((w, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-green-400/60 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pp.coachingAdaptations.whatDoesntWork && pp.coachingAdaptations.whatDoesntWork.length > 0 && (
                  <div>
                    <span className="text-[10px] text-red-400 uppercase tracking-wider">What doesn&apos;t work</span>
                    <ul className="mt-1 space-y-0.5">
                      {pp.coachingAdaptations.whatDoesntWork.map((w, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                          <XCircle className="w-3 h-3 text-red-400/60 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pp.coachingAdaptations.miraTonesForThisUser && pp.coachingAdaptations.miraTonesForThisUser.length > 0 && (
                  <div>
                    <span className="text-[10px] text-amber-400 uppercase tracking-wider">Mira&apos;s tone</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{pp.coachingAdaptations.miraTonesForThisUser.join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Goals & Aspirations */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              Goals &amp; Aspirations
            </h4>
            {goals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No goals tracked yet</p>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <div key={g.id} className="flex items-start gap-2 rounded-md border border-border/30 bg-card/40 p-2.5">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                      g.status === 'ACTIVE' ? 'bg-green-400' : g.status === 'DONE' ? 'bg-muted-foreground' : 'bg-amber-400'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground">{g.title}</p>
                      {g.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[9px]">{g.priority}</Badge>
                        <Badge variant="outline" className="text-[9px]">{g.status}</Badge>
                        {g.deadline && <span className="text-[9px] text-muted-foreground">Due {formatDate(g.deadline)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Known & Gap Topics */}
          {pc && (pc.knownTopics?.length || pc.gapTopics?.length) ? (
            <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Knowledge Coverage</h4>
              {pc.knownTopics && pc.knownTopics.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Known</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pc.knownTopics.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] bg-green-400/5 text-green-400/80 border-green-400/15">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {pc.gapTopics && pc.gapTopics.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Gaps to explore</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pc.gapTopics.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] bg-amber-400/5 text-amber-400/80 border-amber-400/15">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Personal Threads */}
          {threads.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-card/60 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Personal Threads</h4>
              <div className="space-y-1.5">
                {threads.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-[11px]">
                    <Badge variant="outline" className="text-[9px] shrink-0">{t.category}</Badge>
                    <span className="text-foreground truncate">{t.topic}</span>
                    <Badge variant="outline" className={cn('text-[9px] ml-auto shrink-0',
                      t.stage === 'GROWING' ? 'text-green-400 border-green-400/20' :
                      t.stage === 'PLANTED' ? 'text-blue-400 border-blue-400/20' :
                      'text-muted-foreground'
                    )}>{t.stage}</Badge>
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.touchCount}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Avoid topics */}
          {detail.plan?.avoidTopics && detail.plan.avoidTopics.length > 0 && (
            <div className="rounded-lg border border-red-400/15 bg-red-400/5 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Avoid Topics</h4>
              <div className="flex flex-wrap gap-1">
                {detail.plan.avoidTopics.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] text-red-400/80 border-red-400/20">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CALLS TAB ═══ */}
      {activeTab === 'calls' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {calls.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No calls yet</p>
          ) : calls.map(call => (
            <div key={call.id} className="rounded-lg border border-border/50 bg-card/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{call.callType}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {call.endedAt ? formatDate(call.endedAt) : '--'} &middot; {formatDuration(call.durationSeconds || 0)}
                  </span>
                </div>
                {call.evaluation && (
                  <span className={cn(
                    'text-sm font-bold px-2 py-0.5 rounded-full border',
                    qualityBg(call.evaluation.overallScore),
                    qualityColor(call.evaluation.overallScore)
                  )}>
                    {call.evaluation.overallScore.toFixed(1)}
                  </span>
                )}
              </div>
              {call.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">{call.summary}</p>
              )}
              {call.evaluation && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries({
                    Ground: call.evaluation.newGroundScore,
                    Depth: call.evaluation.depthOfSharingScore,
                    Value: call.evaluation.valueAddScore,
                    Context: call.evaluation.contextUtilScore,
                    Repetition: call.evaluation.repetitionScore,
                    Engage: call.evaluation.engagementScore,
                    ...(call.evaluation.postureMatch != null ? { Posture: call.evaluation.postureMatch } : {}),
                    ...(call.evaluation.timingMatch != null ? { Timing: call.evaluation.timingMatch } : {}),
                  }).map(([kpi, score]) => (
                    <span key={kpi} className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border',
                      qualityBg(score), qualityColor(score)
                    )}>
                      {kpi}: {score.toFixed(1)}
                    </span>
                  ))}
                  {call.evaluation.selectedPosture && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 capitalize">
                      {call.evaluation.selectedPosture}
                    </span>
                  )}
                </div>
              )}
              {call.evaluation?.whatWorked && call.evaluation.whatWorked.length > 0 && (
                <p className="text-[10px] text-green-400/70"><span className="font-medium">Worked:</span> {call.evaluation.whatWorked.join(', ')}</p>
              )}
              {call.evaluation?.whatToImprove && call.evaluation.whatToImprove.length > 0 && (
                <p className="text-[10px] text-amber-400/70"><span className="font-medium">Improve:</span> {call.evaluation.whatToImprove.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══ THEMES & COMMITMENTS TAB ═══ */}
      {activeTab === 'themes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Coaching Themes */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-400" />
              Coaching Themes
            </h4>
            {themes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No themes detected yet</p>
            ) : (
              <div className="space-y-2">
                {themes.map((theme) => (
                  <div key={theme.theme} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/60 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{theme.theme}</span>
                        <Badge variant={theme.status === 'active' ? 'default' : theme.status === 'resolved' ? 'secondary' : 'outline'}
                          className={cn('text-[10px]',
                            theme.status === 'active' && 'bg-green-400/20 text-green-400 border-green-400/30',
                            theme.status === 'resolved' && 'bg-muted text-muted-foreground',
                            theme.status === 'dormant' && 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                          )}>
                          {theme.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(theme.firstSeen)} &mdash; {formatDate(theme.lastSeen)} &middot; {theme.mentions} mention{theme.mentions !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commitments */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              Commitments
            </h4>
            {commitments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No commitments tracked</p>
            ) : (
              <div className="space-y-2">
                {commitments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/60 p-3">
                    <CommitmentStatusIcon status={c.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{c.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Created {formatDate(c.createdAt)}
                        {c.dueDate && <> &middot; Due {formatDate(c.dueDate)}</>}
                        {c.completedAt && <> &middot; Completed {formatDate(c.completedAt)}</>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Row
// ---------------------------------------------------------------------------

function UserCoachingRow({ user }: { user: CoachingUserSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-xl bg-card/60 overflow-hidden transition-colors hover:bg-card/80">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer"
      >
        {/* User info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-400/10 text-amber-400 font-semibold text-sm shrink-0">
            {(user.name || '?')
              .split(' ')
              .map((n) => n[0] ?? '')
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {/* Phase */}
        <Badge
          variant="outline"
          className="self-start sm:self-auto text-[11px] bg-amber-400/5 border-amber-400/20 text-amber-300"
        >
          {user.coachingPhase}
        </Badge>

        {/* Calls */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{user.callCount} calls</span>
        </div>

        {/* Quality score */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-full border text-sm font-bold shrink-0',
            qualityBg(user.avgQuality),
            qualityColor(user.avgQuality)
          )}
        >
          {(user.avgQuality ?? 0).toFixed(1)}
          <TrendIcon trend={user.qualityTrend} />
        </div>

        {/* Sparkline */}
        <QualitySparkline data={user.qualityHistory} avgScore={user.avgQuality} />

        {/* Themes */}
        <div className="hidden lg:flex items-center gap-1 flex-wrap max-w-[200px]">
          {user.activeThemes.slice(0, 3).map((theme) => (
            <Badge
              key={theme}
              variant="secondary"
              className="text-[10px] bg-muted/60 text-muted-foreground"
            >
              {theme}
            </Badge>
          ))}
          {user.activeThemes.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{user.activeThemes.length - 3}
            </span>
          )}
        </div>

        {/* Commitments */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Target className="w-3.5 h-3.5" />
          <span>{user.openCommitments} open</span>
        </div>

        {/* Archetype */}
        {user.archetype && (
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Brain className="w-3.5 h-3.5 text-amber-400/60" />
            <span className="truncate max-w-[100px]">{user.archetype}</span>
            {user.archetypeConfidence != null && (
              <span className="text-[10px] opacity-60">
                {(user.archetypeConfidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}

        {/* Expand/collapse */}
        <div className="shrink-0">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Mobile: themes shown below on small screens */}
      {!expanded && user.activeThemes.length > 0 && (
        <div className="lg:hidden flex items-center gap-1 flex-wrap px-4 pb-3">
          {user.activeThemes.slice(0, 4).map((theme) => (
            <Badge
              key={theme}
              variant="secondary"
              className="text-[10px] bg-muted/60 text-muted-foreground"
            >
              {theme}
            </Badge>
          ))}
          {user.activeThemes.length > 4 && (
            <span className="text-[10px] text-muted-foreground">
              +{user.activeThemes.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && <UserDetailPanel userId={user.userId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CoachingIntelligencePage() {
  const [data, setData] = useState<CoachingIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/coaching-intelligence')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load coaching intelligence');
        return res.json();
      })
      .then((d) => {
        // Map API response shape to the expected UI shape
        const raw = d ?? {};
        const rawMetrics = raw.metrics ?? raw.systemMetrics ?? {};
        const mappedMetrics: SystemMetrics = {
          totalCallsToday: rawMetrics.totalCallsToday ?? 0,
          avgQualityToday: rawMetrics.avgQualityToday ?? 0,
          commitmentCompletionRate: rawMetrics.commitmentCompletionRate ?? 0,
        };

        const trendMap: Record<string, 'up' | 'down' | 'flat'> = {
          improving: 'up',
          declining: 'down',
          stable: 'flat',
          insufficient_data: 'flat',
          up: 'up',
          down: 'down',
          flat: 'flat',
        };

        const rawUsers = Array.isArray(raw.users) ? raw.users : [];
        const mappedUsers: CoachingUserSummary[] = rawUsers.map((u: Record<string, unknown>) => ({
          userId: (u.userId as string) ?? '',
          name: (u.name as string) ?? 'Unnamed',
          email: (u.email as string) ?? '',
          avatarUrl: u.avatarUrl as string | undefined,
          coachingPhase: (u.coachingPhase as string) ?? (u.phase as string) ?? 'unknown',
          callCount: (u.callCount as number) ?? 0,
          avgQuality: (u.avgQuality as number) ?? 0,
          qualityTrend: trendMap[(u.qualityTrend as string) ?? ''] ?? 'flat',
          qualityHistory: Array.isArray(u.qualityHistory) ? u.qualityHistory as QualityDataPoint[] : [],
          activeThemes: Array.isArray(u.activeThemes) ? u.activeThemes as string[] : [],
          openCommitments: (u.openCommitments as number) ?? 0,
          archetype: u.archetype as string | undefined,
          archetypeConfidence: u.archetypeConfidence as number | undefined,
        }));

        return { metrics: mappedMetrics, users: mappedUsers } as CoachingIntelligenceResponse;
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Card className="border-red-400/20 bg-red-400/5">
          <CardContent>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchData}
              className="mt-2 text-xs text-amber-400 hover:underline cursor-pointer"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, users } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Brain className="w-5 h-5 text-amber-400" />
          Coaching Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          System-wide coaching quality, themes, and commitment tracking
        </p>
      </div>

      {/* System metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Calls Today"
          value={metrics.totalCallsToday}
          icon={Phone}
          subtitle="Completed calls"
        />
        <MetricCard
          label="Avg Quality Today"
          value={metrics.avgQualityToday.toFixed(1)}
          icon={Target}
          valueColor={qualityColor(metrics.avgQualityToday)}
          subtitle="Across all users"
        />
        <MetricCard
          label="Commitment Rate"
          value={`${(metrics.commitmentCompletionRate * 100).toFixed(0)}%`}
          icon={CheckCircle2}
          subtitle="Completion rate"
        />
      </div>

      {/* User coaching list */}
      <Card className="border-amber-400/10 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-amber-400" />
            Per-User Coaching
          </CardTitle>
          <CardDescription>
            {users.length} user{users.length !== 1 ? 's' : ''} with coaching data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No coaching data available yet. Calls will appear here once users
              start their coaching sessions.
            </p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <UserCoachingRow key={user.userId} user={user} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
