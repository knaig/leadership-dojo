'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Coffee, AlertCircle } from 'lucide-react';
import { MeetingCard } from './MeetingCard';
import { Skeleton } from '@/components/ui/skeleton';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import { useAuth } from '@clerk/nextjs';

interface AttendeeIntel {
  name: string;
  role: string | null;
  whatWorks: string | null;
  watchFor: string | null;
  sharedContext: string | null;
}

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  meetingType: string | null;
  attendees: { name: string; email: string; response: string }[];
  lifecycleStage: string | null;
  outcomeResult: string | null;
  outcome: string | null;
  desiredOutcome: string | null;
  stakes: 'low' | 'medium' | 'high';
  edge: string | null;
  attendeeIntel: AttendeeIntel[];
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
  minutesUntilNext: number | null;
}

interface GameplanData {
  date: string;
  dateLabel: string;
  meetings: Meeting[];
  summary: {
    total: number;
    highStakes: number;
    readyCount: number;
    totalFaceTime: number;
  };
}

function toLocalDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultDate(): string {
  const now = new Date();
  if (now.getHours() >= 17) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toLocalDateStr(tomorrow);
  }
  return toLocalDateStr(now);
}

function formatDateLabelClient(dateStr: string): string {
  const target = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone edge
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = new Date(target);
  targetDay.setHours(0, 0, 0, 0);

  const diffDays = Math.round((targetDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const dayName = target.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  if (diffDays === 0) return `Today — ${dayName}, ${monthDay}`;
  if (diffDays === 1) return `Tomorrow — ${dayName}, ${monthDay}`;
  if (diffDays === -1) return `Yesterday — ${dayName}, ${monthDay}`;
  return `${dayName}, ${monthDay}`;
}

function formatFaceTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatGap(minutes: number): string {
  if (minutes >= 120) {
    const h = Math.floor(minutes / 60);
    return `${h}h gap`;
  }
  return `${minutes} min gap`;
}

export function MeetingHub({ compact = false }: { compact?: boolean }) {
  const { userId } = useAuth();
  const [date, setDate] = useState(getDefaultDate());
  const [data, setData] = useState<GameplanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

  const fetchGameplan = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(`/api/meetings/gameplan?date=${targetDate}&tz=${tzOffset}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.error || `Request failed (${res.status})`);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGameplan(date);
  }, [date, fetchGameplan]);

  // Auto-refresh when calendar sync completes (via Pusher)
  useEffect(() => {
    if (!userId) return;
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!pusherKey || !pusherCluster) return;

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      authorizer: (channel) => ({
        authorize: async (socketId: string, callback: (error: Error | null, authData: any) => void) => {
          try {
            const response = await fetch('/api/pusher/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              credentials: 'include',
              body: new URLSearchParams({ socket_id: socketId, channel_name: channel.name }),
            });
            if (!response.ok) {
              callback(new Error('Auth failed'), null);
              return;
            }
            callback(null, await response.json());
          } catch (error) {
            callback(error as Error, null);
          }
        },
      }),
    });

    const channel = pusher.subscribe(`private-user-${userId}`);
    channel.bind('system-event', (data: { type: string; data?: { status?: string } }) => {
      if (data.type === 'calendar_sync_complete' && data.data?.status === 'complete') {
        fetchGameplan(dateRef.current);
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`private-user-${userId}`);
      pusher.disconnect();
    };
  }, [userId, fetchGameplan]);

  function shiftDate(days: number) {
    const d = new Date(date + 'T12:00:00'); // noon avoids DST/timezone edge cases
    d.setDate(d.getDate() + days);
    setDate(toLocalDateStr(d));
  }

  // Always use client-computed label — it correctly handles Today/Tomorrow
  // using the user's local timezone (server can't reliably do this)
  const dateLabel = formatDateLabelClient(date);

  return (
    <div className={compact ? "p-4 h-full overflow-y-auto" : "p-6 w-full"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h1 className={compact ? "text-lg font-semibold text-foreground" : "text-2xl font-serif font-light text-foreground"}>
          {compact ? 'Meetings' : 'Your Gameplan'}
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftDate(-1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft size={compact ? 16 : 20} />
          </button>
          <button
            onClick={() => shiftDate(1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Next day"
          >
            <ChevronRight size={compact ? 16 : 20} />
          </button>
        </div>
      </div>

      {/* Date label — always visible */}
      <div className={compact ? "mb-3" : "mb-6"}>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
        {data && !loading && data.summary.total > 0 && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {data.summary.total} meeting{data.summary.total !== 1 ? 's' : ''}
            {data.summary.highStakes > 0 && ` · ${data.summary.highStakes} high-stakes`}
            {!compact && data.summary.readyCount > 0 && ` · ${data.summary.readyCount} ready`}
            {data.summary.totalFaceTime > 0 && ` · ${formatFaceTime(data.summary.totalFaceTime)} face time`}
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className={`text-center ${compact ? 'py-8' : 'py-16'}`}>
          <AlertCircle className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} text-muted-foreground/40 mx-auto mb-3`} />
          <p className="text-muted-foreground text-sm">{error}</p>
          <button
            onClick={() => fetchGameplan(date)}
            className="text-sm text-primary hover:text-primary/80 mt-2 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && error === null && data && data.meetings.length === 0 && (
        <div className="text-center py-16">
          <Coffee className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">
            No meetings {dateLabel.split('—')[0]?.trim()?.toLowerCase() || 'this day'}.
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">Enjoy the focus time.</p>
        </div>
      )}

      {/* Meeting cards with gap indicators */}
      {!loading && error === null && data && data.meetings.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.meetings.map((meeting) => (
            <div key={meeting.id}>
              <MeetingCard
                id={meeting.id}
                title={meeting.title}
                description={meeting.description}
                startTime={meeting.startTime}
                endTime={meeting.endTime}
                meetingType={meeting.meetingType}
                attendees={meeting.attendees}
                stakes={meeting.stakes}
                edge={meeting.edge}
                attendeeIntel={meeting.attendeeIntel}
                outcomeResult={meeting.outcomeResult}
                outcome={meeting.outcome}
                desiredOutcome={meeting.desiredOutcome}
                userGrowthTip={meeting.userGrowthTip}
                userRole={meeting.userRole}
                projectContext={meeting.projectContext}
                confidence={meeting.confidence ?? 0}
                hasOutcome={meeting.hasOutcome}
                outcomeSuggestions={meeting.outcomeSuggestions}
                hasBrief={meeting.hasBrief}
                hasDeepPrep={meeting.hasDeepPrep}
                conversationPrepId={meeting.conversationPrepId}
                userImportanceOverride={meeting.userImportanceOverride}
                userNotes={meeting.userNotes}
                compact={compact}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
