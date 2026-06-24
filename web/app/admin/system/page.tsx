'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Server,
  Database,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calendar,
  Mail,
  HardDrive,
  Users,
  Layers,
  Network,
  Brain,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
// Badge available if needed for future use
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ---------- types ---------- */

interface QueueStatus {
  name: string;
  pending: number;
  active: number;
  failed: number;
}

interface SyncStatus {
  service: string;
  lastSync: string | null;
  status: 'ok' | 'stale' | 'error';
  error?: string;
}

interface UserSyncInfo {
  userId: string;
  userName: string;
  syncs: SyncStatus[];
}

interface KnowledgeStats {
  userId: string;
  userName: string;
  facts: number;
  entities: number;
  communities: number;
}

interface PipelineStatusResponse {
  worker: {
    status: 'running' | 'stopped' | 'unknown';
    uptime?: number;
    lastHeartbeat?: string;
  };
  queues: QueueStatus[];
  userSyncs: UserSyncInfo[];
  knowledgeGraph: KnowledgeStats[];
}

/* ---------- helpers ---------- */

type HealthLevel = 'healthy' | 'degraded' | 'down';

function healthLevel(status: string): HealthLevel {
  if (status === 'running' || status === 'ok') return 'healthy';
  if (status === 'stale' || status === 'unknown') return 'degraded';
  return 'down';
}

function HealthDot({ level }: { level: HealthLevel }) {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full shrink-0',
        level === 'healthy' && 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]',
        level === 'degraded' && 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]',
        level === 'down' && 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]'
      )}
    />
  );
}

function HealthIcon({ level }: { level: HealthLevel }) {
  if (level === 'healthy')
    return <CheckCircle2 className="h-5 w-5 text-green-400" />;
  if (level === 'degraded')
    return <AlertTriangle className="h-5 w-5 text-amber-400" />;
  return <XCircle className="h-5 w-5 text-red-400" />;
}

function formatUptime(seconds: number | undefined): string {
  if (seconds == null) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SYNC_ICONS: Record<string, React.ElementType> = {
  calendar: Calendar,
  email: Mail,
  drive: HardDrive,
};

function queueHealthLevel(q: QueueStatus): HealthLevel {
  if (q.failed > 10) return 'down';
  if (q.pending > 50 || q.failed > 0) return 'degraded';
  return 'healthy';
}

/* ---------- page ---------- */

const REFRESH_INTERVAL = 30_000;

export default function AdminSystemPage() {
  const [data, setData] = useState<PipelineStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pipeline-status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Map API response shape to the expected UI shape.
      // The API returns { sync, analysis, intelligence } but the UI expects
      // { worker, queues, userSyncs, knowledgeGraph }.
      // Handle both shapes gracefully.
      const mapped: PipelineStatusResponse = {
        worker: json.worker ?? {
          status: json.sync?.summary ? 'running' : 'unknown',
          uptime: undefined,
          lastHeartbeat: undefined,
        },
        queues: Array.isArray(json.queues) ? json.queues : [],
        userSyncs: Array.isArray(json.userSyncs)
          ? json.userSyncs
          : // Build from sync.connectors if available
            (json.sync?.connectors ?? []).length > 0
            ? (() => {
                // Group connectors into a single "user" entry since API is per-current-user
                const connectors = json.sync.connectors as Array<Record<string, unknown>>;
                const syncs: SyncStatus[] = connectors.map((c: Record<string, unknown>) => ({
                  service: ((c.provider as string) ?? '').toLowerCase(),
                  lastSync: (c.lastSyncAt as string) ?? null,
                  status: c.status === 'CONNECTED'
                    ? 'ok' as const
                    : c.status === 'ERROR'
                    ? 'error' as const
                    : 'stale' as const,
                  error: (c.lastSyncStatus as string) !== 'ok' ? (c.lastSyncStatus as string) : undefined,
                }));
                return [{ userId: 'current', userName: 'Current User', syncs }] as UserSyncInfo[];
              })()
            : [],
        knowledgeGraph: Array.isArray(json.knowledgeGraph)
          ? json.knowledgeGraph
          : json.intelligence
          ? [{
              userId: 'current',
              userName: 'Current User',
              facts: (json.intelligence.totalObservations as number) ?? 0,
              entities: ((json.intelligence.capacityCoverage as unknown[]) ?? []).length,
              communities: 0,
            }]
          : [],
      };
      setData(mapped);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const workerLevel: HealthLevel = data
    ? healthLevel(data.worker.status)
    : 'degraded';

  const overallHealth: HealthLevel = (() => {
    if (!data) return 'degraded';
    if (data.worker.status === 'stopped') return 'down';
    const hasQueueIssues = data.queues.some(
      (q) => q.failed > 10 || q.pending > 100
    );
    const hasSyncErrors = data.userSyncs.some((u) =>
      u.syncs.some((s) => s.status === 'error')
    );
    if (hasQueueIssues || hasSyncErrors) return 'degraded';
    return 'healthy';
  })();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">
            System Health
          </h1>
          <HealthDot level={overallHealth} />
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
          <button
            onClick={() => {
              setLoading(true);
              fetchStatus();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm text-red-400">
                Failed to fetch system status: {error}
              </p>
              <button
                onClick={() => {
                  setLoading(true);
                  fetchStatus();
                }}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Worker status + queues row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Worker status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4" />
              Worker Daemon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <HealthIcon level={workerLevel} />
                  <div>
                    <p className="text-lg font-semibold capitalize text-foreground">
                      {data.worker.status}
                    </p>
                    {data.worker.uptime != null && (
                      <p className="text-xs text-muted-foreground">
                        Uptime: {formatUptime(data.worker.uptime)}
                      </p>
                    )}
                  </div>
                </div>
                {data.worker.lastHeartbeat && (
                  <p className="text-xs text-muted-foreground">
                    Last heartbeat: {timeAgo(data.worker.lastHeartbeat)}
                  </p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Queue depths */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4" />
              Job Queues
            </CardTitle>
            <CardDescription>Pending jobs by queue</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : data && data.queues.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.queues.map((q) => {
                  const level = queueHealthLevel(q);
                  return (
                    <div
                      key={q.name}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        level === 'healthy' && 'border-border bg-card',
                        level === 'degraded' &&
                          'border-amber-500/30 bg-amber-500/5',
                        level === 'down' && 'border-red-500/30 bg-red-500/5'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-foreground truncate">
                          {q.name}
                        </p>
                        <HealthDot level={level} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold text-foreground">
                          {q.pending}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          pending
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{q.active} active</span>
                        {q.failed > 0 && (
                          <span className="text-red-400">
                            {q.failed} failed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No queue data available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-user sync status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            User Sync Status
          </CardTitle>
          <CardDescription>
            Calendar, email, and drive sync health per user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : data && data.userSyncs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="text-left py-2 pr-4">User</th>
                    <th className="text-center py-2 px-3">Calendar</th>
                    <th className="text-center py-2 px-3">Email</th>
                    <th className="text-center py-2 px-3">Drive</th>
                  </tr>
                </thead>
                <tbody>
                  {data.userSyncs.map((user) => (
                    <tr
                      key={user.userId}
                      className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-foreground truncate max-w-[200px]">
                          {user.userName}
                        </p>
                      </td>
                      {['calendar', 'email', 'drive'].map((service) => {
                        const sync = user.syncs.find(
                          (s) => s.service === service
                        );
                        const Icon = SYNC_ICONS[service] ?? Database;
                        const level: HealthLevel = sync
                          ? healthLevel(sync.status)
                          : 'degraded';
                        return (
                          <td key={service} className="py-2.5 px-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <Icon
                                  className={cn(
                                    'h-3.5 w-3.5',
                                    level === 'healthy' && 'text-green-400',
                                    level === 'degraded' && 'text-amber-400',
                                    level === 'down' && 'text-red-400'
                                  )}
                                />
                                <HealthDot level={level} />
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {sync ? timeAgo(sync.lastSync) : 'N/A'}
                              </span>
                              {sync?.error && (
                                <span
                                  className="text-[10px] text-red-400 truncate max-w-[120px]"
                                  title={sync.error}
                                >
                                  {sync.error}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No user sync data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Knowledge graph stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4" />
            Knowledge Graph
          </CardTitle>
          <CardDescription>
            Facts, entities, and communities per user
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : data && data.knowledgeGraph.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.knowledgeGraph.map((kg) => (
                <div
                  key={kg.userId}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <p className="text-sm font-medium text-foreground mb-3 truncate">
                    {kg.userName}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {(kg.facts ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Facts
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {(kg.entities ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Entities
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {(kg.communities ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Communities
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Network className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No knowledge graph data available.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pb-4">
        <Clock className="h-3 w-3" />
        Auto-refreshes every 30 seconds
      </div>
    </div>
  );
}
