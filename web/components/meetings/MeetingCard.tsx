'use client';

import { useState, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Star, MessageSquare, AlertTriangle } from 'lucide-react';
import { VoiceCallButton } from '@/components/voice/VoiceCallButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AttendeeChip } from './AttendeeChip';

interface AttendeeIntel {
  name: string;
  role: string | null;
  whatWorks: string | null;
  watchFor: string | null;
  sharedContext: string | null;
}

interface RoomReadStakeholder {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  stance: string | null;
  influence: string | null;
  powerLevel: string | null;
  archetype: string | null;
  relationshipStrength: number;
  daysSinceContact: number | null;
  isStale: boolean;
  concerns: string[];
  whatWorks: string[];
  briefTip: string | null;
}

interface RoomReadData {
  stakeholders: RoomReadStakeholder[];
  roomTemperature: number;
  tacticalAdvice: string | null;
  suggestedPreMeetings: { stakeholderId: string; name: string; reason: string }[];
}

const STANCE_STYLES: Record<string, string> = {
  CHAMPION: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  SUPPORTIVE: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  NEUTRAL: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  SKEPTIC: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  HOSTILE: 'bg-red-500/15 text-red-400 border-red-500/30',
  UNKNOWN: 'bg-slate-500/10 text-slate-400 border-dashed border-slate-500/30',
};

function stanceLabel(stance: string | null): string {
  if (!stance || stance === 'UNKNOWN') return 'Unknown';
  return stance.charAt(0) + stance.slice(1).toLowerCase();
}

function roomTempColor(temp: number): string {
  if (temp > 0.6) return 'bg-emerald-500';
  if (temp >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
}

function roomTempTextColor(temp: number): string {
  if (temp > 0.6) return 'text-emerald-500';
  if (temp >= 0.4) return 'text-amber-500';
  return 'text-red-400';
}

interface MeetingCardProps {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  meetingType: string | null;
  attendees: { name: string; email: string; response: string }[];
  stakes: 'low' | 'medium' | 'high';
  edge: string | null;
  attendeeIntel: AttendeeIntel[];
  outcomeResult: string | null;
  outcome: string | null;
  desiredOutcome: string | null;
  userGrowthTip: string | null;
  userRole: string | null;
  projectContext: string | null;
  confidence: number;
  hasOutcome: boolean;
  outcomeSuggestions?: string[];
  hasBrief: boolean;
  hasDeepPrep: boolean;
  conversationPrepId: string | null;
  userImportanceOverride: string | null;
  userNotes: string | null;
  compact?: boolean;
}

const IMPORTANCE_OPTIONS = [
  { value: 'critical', label: 'Critical', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { value: 'high', label: 'High', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'low', label: 'Low', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
];

const STAKES_CONFIG = {
  low: { color: 'bg-green-500', label: 'Low Stakes' },
  medium: { color: 'bg-amber-500', label: 'Medium Stakes' },
  high: { color: 'bg-red-500', label: 'High Stakes' }
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MeetingCard(props: MeetingCardProps) {
  const {
    id, title, description, startTime, endTime: _endTime, attendees, stakes, edge,
    attendeeIntel, outcomeResult, outcome: outcomeSummary, desiredOutcome, userGrowthTip, userRole, projectContext, confidence,
    hasOutcome, outcomeSuggestions = [], hasBrief, hasDeepPrep, conversationPrepId,
    userImportanceOverride, userNotes,
    compact = false
  } = props;

  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [outcome, setOutcome] = useState(desiredOutcome || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [outcomeSet, setOutcomeSet] = useState(hasOutcome);
  const [creatingPrep, setCreatingPrep] = useState(false);
  const [importance, setImportance] = useState<string | null>(userImportanceOverride);
  const [notes, setNotes] = useState(userNotes || '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [learnedMsg, setLearnedMsg] = useState<string | null>(null);
  const [roomRead, setRoomRead] = useState<RoomReadData | null>(null);
  const [roomReadLoading, setRoomReadLoading] = useState(false);
  const roomReadFetched = useRef(false);

  const fetchRoomRead = useCallback(async () => {
    if (roomReadFetched.current) return;
    roomReadFetched.current = true;
    setRoomReadLoading(true);
    try {
      const res = await fetch(`/api/meetings/${id}/room-read`);
      if (res.ok) {
        const data = await res.json();
        if (data.stakeholders?.length > 0) {
          setRoomRead(data);
        }
      }
    } catch {
      // Fall back to AttendeeChip display
    } finally {
      setRoomReadLoading(false);
    }
  }, [id]);

  const stakesConfig = STAKES_CONFIG[stakes];
  const attendeeNames = attendees.map(a => a.name).slice(0, 4);
  const extraCount = Math.max(0, attendees.length - 4);

  async function handleSaveOutcome() {
    if (!outcome.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${id}/outcome`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desiredOutcome: outcome.trim() })
      });
      if (res.ok) {
        setSaved(true);
        setOutcomeSet(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // Silent fail for now
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMeta(newImportance?: string | null, newNotes?: string) {
    setSavingMeta(true);
    setLearnedMsg(null);
    try {
      const body: Record<string, string | null> = {};
      if (newImportance !== undefined) body.userImportanceOverride = newImportance;
      if (newNotes !== undefined) body.userNotes = newNotes || null;
      const res = await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.learnedMessage) {
          setLearnedMsg(data.learnedMessage);
          setTimeout(() => setLearnedMsg(null), 3000);
        }
      }
    } catch {
      // Silent fail
    } finally {
      setSavingMeta(false);
    }
  }

  function handleImportanceClick(value: string) {
    const newVal = importance === value ? null : value;
    setImportance(newVal);
    handleSaveMeta(newVal, undefined);
  }

  async function handleGenerateDeepPrep() {
    setCreatingPrep(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          primaryObjective: outcome || `Prepare for ${title}`,
          stakeholders: attendees.map(a => a.name),
          scheduledAt: startTime
        })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/conversations/${data.conversation.id}`);
      }
    } catch {
      // Silent fail
    } finally {
      setCreatingPrep(false);
    }
  }

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        expanded
          ? 'border-primary/30 bg-card shadow-lg'
          : 'border-border bg-card hover:border-primary/30'
      }`}
    >
      {/* Level 1 — Collapsed header */}
      <button
        onClick={() => { if (!expanded) fetchRoomRead(); setExpanded(!expanded); }}
        className={`w-full text-left flex items-start gap-2 ${compact ? 'p-3' : 'p-4 gap-3'}`}
      >
        <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
          <div className={`w-2 h-2 rounded-full ${stakesConfig.color}`} />
          {importance && (importance === 'critical' || importance === 'high') && (
            <Star size={12} className="text-amber-400 fill-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">{formatTime(startTime)}</span>
              {userRole && !compact && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">
                  {userRole}
                </span>
              )}
            </div>
            {!compact && (
              <div className="flex items-center gap-2">
                {projectContext && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate max-w-[120px]">
                    {projectContext}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{stakesConfig.label}</span>
              </div>
            )}
          </div>
          <div className={`font-medium mt-0.5 ${compact ? 'text-sm' : ''}`}>{title}</div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span className={compact ? 'line-clamp-1' : ''}>
              {attendeeNames.join(', ')}
              {extraCount > 0 && ` +${extraCount}`}
            </span>
          </div>
          {edge && !compact && (
            <div className="text-xs text-muted-foreground/80 italic mt-1.5 line-clamp-1">
              &ldquo;{edge}&rdquo;
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
          {/* Confidence indicator */}
          <div className="flex items-center gap-0.5 mr-1" title={`AI confidence: ${confidence}%`}>
            <div className="w-6 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${confidence >= 60 ? 'bg-green-500' : confidence >= 30 ? 'bg-amber-500' : 'bg-red-400'}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
          {outcomeResult && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              outcomeResult === 'LANDED' ? 'text-emerald-500 bg-emerald-500/10' :
              outcomeResult === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10' :
              'text-red-400 bg-red-400/10'
            }`}>
              {outcomeResult === 'LANDED' ? 'Landed' : outcomeResult === 'PARTIAL' ? 'Partial' : 'Missed'}
            </span>
          )}
          {!outcomeResult && (
            <>
              <span className={`text-xs ${outcomeSet ? 'opacity-100' : 'opacity-30'}`} title="Outcome set">🎯</span>
              <span className={`text-xs ${hasBrief ? 'opacity-100' : 'opacity-30'}`} title="Brief sent">📋</span>
              {!compact && <span className={`text-xs ${hasDeepPrep ? 'opacity-100' : 'opacity-30'}`} title="Deep prep">📖</span>}
            </>
          )}
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Level 2 — Expanded detail */}
      {expanded && (
        <div className={`border-t border-border space-y-4 ${compact ? 'px-3 pb-3 pt-3' : 'px-4 pb-4 pt-4 space-y-5'}`}>
          {/* Meeting Description */}
          {description && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Meeting Context
              </h4>
              <p className="text-sm text-foreground/80 line-clamp-3">{description}</p>
            </div>
          )}

          {/* Importance & Notes */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Importance
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {IMPORTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleImportanceClick(opt.value)}
                  disabled={savingMeta}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    importance === opt.value
                      ? opt.color
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {learnedMsg && (
              <p className="text-xs text-primary mt-1.5 animate-in fade-in">{learnedMsg}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              <MessageSquare size={12} className="inline mr-1" />
              Your Notes
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context for Mira (e.g. 'need to discuss budget cuts')"
                className="flex-1 bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveMeta(undefined, notes);
                }}
              />
              <button
                onClick={() => handleSaveMeta(undefined, notes)}
                disabled={savingMeta}
                className="px-3 py-2 text-sm font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors"
              >
                {savingMeta ? '...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Confidence Bar */}
          {confidence < 50 && (
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">AI Readiness: {confidence}%</span>
                  <span className="text-[10px] text-muted-foreground">Add context to improve</span>
                </div>
                <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${confidence >= 30 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${confidence}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Attendee Intel / Room Read */}
          {(attendeeIntel.length > 0 || roomRead) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                Who&apos;s in the Room
                {roomReadLoading && (
                  <span className="text-[10px] font-normal text-muted-foreground/60 animate-pulse">Reading room...</span>
                )}
                {roomRead && !roomReadLoading && (
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${roomTempColor(roomRead.roomTemperature)}`} />
                    <span className={`text-[10px] font-medium ${roomTempTextColor(roomRead.roomTemperature)}`}>
                      {Math.round(roomRead.roomTemperature * 100)}%
                    </span>
                  </span>
                )}
              </h4>

              {roomRead ? (
                <div className="space-y-2">
                  <div className={compact ? "space-y-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
                    {roomRead.stakeholders.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-lg border bg-secondary/50 border-border"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-sm">{s.name}</span>
                            {s.role && <span className="text-xs text-muted-foreground ml-1.5">{s.role}</span>}
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${STANCE_STYLES[s.stance || 'UNKNOWN'] || STANCE_STYLES.UNKNOWN}`}>
                            {stanceLabel(s.stance)}
                          </span>
                        </div>
                        {s.briefTip && (
                          <p className="text-xs text-foreground/70 mt-1.5 leading-relaxed">{s.briefTip}</p>
                        )}
                        {s.isStale && s.daysSinceContact && (
                          <div className="flex items-center gap-1 mt-1.5">
                            <AlertTriangle size={10} className="text-amber-500" />
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">
                              {s.daysSinceContact}d since last contact
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {roomRead.tacticalAdvice && (
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs text-foreground/80 leading-relaxed">{roomRead.tacticalAdvice}</p>
                    </div>
                  )}

                  {roomRead.suggestedPreMeetings.length > 0 && (
                    <div className="space-y-1">
                      {roomRead.suggestedPreMeetings.map((pm) => (
                        <div key={pm.stakeholderId} className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                          <span className="text-xs text-amber-600 dark:text-amber-400 mt-px shrink-0">↗</span>
                          <p className="text-xs text-foreground/70">
                            <span className="font-medium">Meet {pm.name} first</span>
                            <span className="text-muted-foreground"> — {pm.reason}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={compact ? "space-y-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
                  {attendeeIntel.map((a) => (
                    <AttendeeChip
                      key={a.name}
                      name={a.name}
                      role={a.role}
                      whatWorks={a.whatWorks}
                      watchFor={a.watchFor}
                      sharedContext={a.sharedContext}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Outcome */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Your Outcome
            </h4>
            {/* One-tap suggestions */}
            {!outcomeSet && outcomeSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {outcomeSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => { setOutcome(suggestion); }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary/5 text-foreground/80 hover:bg-primary/10 hover:border-primary/40 transition-colors text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="What do you want to walk away with?"
                className="flex-1 bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveOutcome()}
              />
              <button
                onClick={handleSaveOutcome}
                disabled={saving || !outcome.trim()}
                className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saved ? '✓ Saved' : saving ? '...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Edge */}
          {edge && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Your Edge
              </h4>
              <p className="text-sm text-foreground/90">{edge}</p>
            </div>
          )}

          {/* Growth tip */}
          {userGrowthTip && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                ⚡ Watch For
              </h4>
              <p className="text-sm text-foreground/80">
                Your growth area: <span className="font-medium">{userGrowthTip}</span>.
                Be intentional about practicing this in the meeting.
              </p>
            </div>
          )}

          {/* Post-Meeting Review Summary */}
          {outcomeResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  outcomeResult === 'LANDED' ? 'text-emerald-500 bg-emerald-500/10' :
                  outcomeResult === 'PARTIAL' ? 'text-amber-500 bg-amber-500/10' :
                  'text-red-400 bg-red-400/10'
                }`}>
                  {outcomeResult === 'LANDED' ? 'Landed' : outcomeResult === 'PARTIAL' ? 'Partial' : 'Missed'}
                </span>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Post-Meeting Review
                </h4>
              </div>
              {desiredOutcome && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/70">Goal:</span> {desiredOutcome}
                </div>
              )}
              {outcomeSummary && (
                <div className="text-sm text-foreground/80">{outcomeSummary}</div>
              )}
              <Link
                href={`/v2/meetings/${id}`}
                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                View full review →
              </Link>
            </div>
          )}

          {/* Actions: Voice Prep/Debrief + Insights + Deep Prep */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <VoiceCallButton
                compact
                callType={new Date(startTime) < new Date() ? 'post_meeting_debrief' : 'pre_meeting_prep'}
                meetingId={id}
              />
              <Link
                href={`/v2/meetings/${id}`}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {new Date(startTime) < new Date() ? 'Review & Insights →' : 'Meeting Details →'}
              </Link>
            </div>
            {conversationPrepId && hasDeepPrep ? (
              <Link
                href={`/conversations/${conversationPrepId}`}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Deep Prep →
              </Link>
            ) : (
              <button
                onClick={conversationPrepId ? () => router.push(`/conversations/${conversationPrepId}`) : handleGenerateDeepPrep}
                disabled={creatingPrep}
                className="text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
              >
                {creatingPrep ? 'Creating...' : 'Deep Prep →'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
