'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Shield,
  User,
  Crown,
  Briefcase,
  Search,
  Phone,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'STUDENT' | 'MANAGER' | 'CURATOR' | 'ADMIN';

type SyncStatus = 'synced' | 'error' | 'never';

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: string;
  subscriptionTier: string | null;
  coachingPhase: string | null;
  totalCalls: number;
  lastCallDate: string | null;
  syncStatus: {
    calendar: SyncStatus;
    email: SyncStatus;
    drive: SyncStatus;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES: Role[] = ['STUDENT', 'MANAGER', 'CURATOR', 'ADMIN'];

const ROLE_CONFIG: Record<Role, { icon: typeof User; badgeClass: string; label: string }> = {
  ADMIN: {
    icon: Shield,
    badgeClass: 'bg-red-500/15 text-red-600 border-red-500/25',
    label: 'Admin',
  },
  CURATOR: {
    icon: Crown,
    badgeClass: 'bg-purple-500/15 text-purple-600 border-purple-500/25',
    label: 'Curator',
  },
  MANAGER: {
    icon: Briefcase,
    badgeClass: 'bg-blue-500/15 text-blue-600 border-blue-500/25',
    label: 'Manager',
  },
  STUDENT: {
    icon: User,
    badgeClass: 'bg-muted text-muted-foreground border-border',
    label: 'Student',
  },
};

const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovery',
  building_trust: 'Building Trust',
  deep_coaching: 'Deep Coaching',
  sustained_partnership: 'Sustained',
};

const SYNC_DOT: Record<SyncStatus, string> = {
  synced: 'bg-green-400',
  error: 'bg-red-400',
  never: 'bg-muted-foreground/30',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function RoleBadge({ role }: { role: Role }) {
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('gap-1', config.badgeClass)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function SyncDot({ status, label }: { status: SyncStatus; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={`${label}: ${status}`}>
      <span className={cn('w-2 h-2 rounded-full shrink-0', SYNC_DOT[status])} />
      <span className="hidden lg:inline">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role Selector
// ---------------------------------------------------------------------------

function RoleSelect({
  userId,
  currentRole,
  onRoleChanged,
}: {
  userId: string;
  currentRole: Role;
  onRoleChanged: (userId: string, newRole: Role) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newRole = e.target.value as Role;
      if (newRole === currentRole) return;

      setSaving(true);
      setResult(null);

      try {
        const res = await fetch(`/api/admin/users/${userId}/role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });

        if (!res.ok) throw new Error('Failed to update role');

        onRoleChanged(userId, newRole);
        setResult('success');
      } catch {
        setResult('error');
      } finally {
        setSaving(false);
        setTimeout(() => setResult(null), 2500);
      }
    },
    [userId, currentRole, onRoleChanged],
  );

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <select
          value={currentRole}
          onChange={handleChange}
          disabled={saving}
          className={cn(
            'appearance-none bg-card border border-border rounded-md pl-2.5 pr-7 py-1 text-xs font-medium',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'cursor-pointer transition-colors',
          )}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_CONFIG[r].label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
      {result === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500 animate-in fade-in" />}
      {result === 'error' && <XCircle className="w-4 h-4 text-red-500 animate-in fade-in" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="hidden md:block">
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-6 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-20" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div
            key={row}
            className="px-6 py-4 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-t border-border"
          >
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="md:hidden grid gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-28 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Fetch users
  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        const res = await fetch('/api/admin/users');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        if (!cancelled) {
          // Map API response shape to the AdminUser shape expected by the UI
          const rawUsers = data.users ?? data ?? [];
          const mapped: AdminUser[] = (Array.isArray(rawUsers) ? rawUsers : []).map((u: Record<string, unknown>) => {
            // syncStatus from API is an array of { connector, status, ... }
            const syncArr = Array.isArray(u.syncStatus) ? u.syncStatus as Record<string, string>[] : [];
            const findSync = (name: string): SyncStatus => {
              const s = syncArr.find((x) => x.connector?.toLowerCase() === name);
              if (!s) return 'never';
              if (s.status === 'SYNCED' || s.status === 'ok' || s.status === 'synced') return 'synced';
              if (s.status === 'ERROR' || s.status === 'error') return 'error';
              return 'never';
            };
            const callStats = (u.callStats ?? {}) as Record<string, unknown>;
            return {
              id: (u.id as string) ?? '',
              name: (u.name as string | null) ?? null,
              email: (u.email as string) ?? '',
              role: ((u.role as string) ?? 'STUDENT') as Role,
              createdAt: u.createdAt ? String(u.createdAt) : '',
              subscriptionTier: ((u.subscription as Record<string, unknown>)?.tier as string) ?? null,
              coachingPhase: null,
              totalCalls: (callStats.total as number) ?? (u.totalCalls as number) ?? 0,
              lastCallDate: (callStats.lastCallAt as string) ?? (u.lastCallDate as string) ?? null,
              syncStatus: {
                calendar: typeof (u.syncStatus as Record<string, unknown>)?.calendar === 'string'
                  ? (u.syncStatus as Record<string, SyncStatus>).calendar
                  : findSync('calendar'),
                email: typeof (u.syncStatus as Record<string, unknown>)?.email === 'string'
                  ? (u.syncStatus as Record<string, SyncStatus>).email
                  : findSync('email'),
                drive: typeof (u.syncStatus as Record<string, unknown>)?.drive === 'string'
                  ? (u.syncStatus as Record<string, SyncStatus>).drive
                  : findSync('drive'),
              },
            };
          });
          setUsers(mapped);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      }
    }

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic role update
  const handleRoleChanged = useCallback((userId: string, newRole: Role) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
    );
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.name?.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Loading...' : `${users.length} total users`}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full pl-9 pr-3 py-2 text-sm rounded-lg',
              'bg-card border border-border',
              'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
              'placeholder:text-muted-foreground/60',
            )}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <>
          <TableSkeleton />
          <CardSkeleton />
        </>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No users match your search.' : 'No users found.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Desktop table */}
      {!loading && filtered.length > 0 && (
        <div className="hidden md:block border border-border rounded-xl overflow-hidden bg-card">
          {/* Table header */}
          <div className="bg-muted/30 px-6 py-3 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>User</span>
            <span>Role</span>
            <span>Sync</span>
            <span>Calls</span>
            <span>Phase / Tier</span>
            <span>Change Role</span>
          </div>

          {/* Rows */}
          {filtered.map((user) => (
            <div
              key={user.id}
              className="px-6 py-3.5 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center border-t border-border hover:bg-muted/20 transition-colors"
            >
              {/* Name + email + joined */}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name || 'Unnamed'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Joined {formatDate(user.createdAt)}
                </p>
              </div>

              {/* Role badge */}
              <div>
                <RoleBadge role={user.role} />
              </div>

              {/* Sync indicators */}
              <div className="flex items-center gap-2.5">
                <SyncDot status={user.syncStatus.calendar} label="Cal" />
                <SyncDot status={user.syncStatus.email} label="Mail" />
                <SyncDot status={user.syncStatus.drive} label="Drive" />
              </div>

              {/* Call stats */}
              <div>
                <p className="text-sm font-medium text-foreground">{user.totalCalls}</p>
                <p className="text-[11px] text-muted-foreground">
                  {user.lastCallDate ? formatDate(user.lastCallDate) : 'No calls'}
                </p>
              </div>

              {/* Phase + tier */}
              <div className="space-y-1">
                {user.coachingPhase && (
                  <Badge variant="outline" className="text-[11px]">
                    {PHASE_LABELS[user.coachingPhase] ?? user.coachingPhase}
                  </Badge>
                )}
                {user.subscriptionTier && (
                  <p className="text-[11px] text-muted-foreground">
                    {user.subscriptionTier}
                  </p>
                )}
              </div>

              {/* Role changer */}
              <div>
                <RoleSelect
                  userId={user.id}
                  currentRole={user.role}
                  onRoleChanged={handleRoleChanged}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile cards */}
      {!loading && filtered.length > 0 && (
        <div className="md:hidden grid gap-3">
          {filtered.map((user) => (
            <Card key={user.id}>
              <CardContent className="py-4 space-y-3">
                {/* Top row: name + role badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <RoleBadge role={user.role} />
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Joined {formatDate(user.createdAt)}</span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {user.totalCalls} calls
                  </span>
                  {user.coachingPhase && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      {PHASE_LABELS[user.coachingPhase] ?? user.coachingPhase}
                    </Badge>
                  )}
                  {user.subscriptionTier && (
                    <span>{user.subscriptionTier}</span>
                  )}
                </div>

                {/* Sync row */}
                <div className="flex items-center gap-3">
                  <SyncDot status={user.syncStatus.calendar} label="Calendar" />
                  <SyncDot status={user.syncStatus.email} label="Email" />
                  <SyncDot status={user.syncStatus.drive} label="Drive" />
                </div>

                {/* Role changer */}
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <span className="text-xs text-muted-foreground">Change role</span>
                  <RoleSelect
                    userId={user.id}
                    currentRole={user.role}
                    onRoleChanged={handleRoleChanged}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
