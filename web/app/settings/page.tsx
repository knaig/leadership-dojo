'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { NotificationManager } from '@/components/settings/NotificationManager';
import { Shell } from '@/components/v2/Shell';
import {
  Calendar, ChevronDown, ChevronRight, Key, Shield,
  User, Briefcase, Target, Phone, Pencil, Check, Loader2, Upload, AlertCircle,
  Moon, Sun, Bell, Clock, Plus, X, Save,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';

interface ApiKey {
  id: string;
  provider: string;
  keyPreview: string;
  isActive: boolean;
  lastUsed: string | null;
  createdAt: string;
}

interface UsageData {
  llmSource: string;
  tokenLimit: number;
  tokensUsed: number;
  tokensRemaining: number;
  percentage: number;
  resetDate: string | null;
  tier: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface ProfileData {
  profile: {
    name: string | null;
    email: string;
    jobTitle: string | null;
    company: string | null;
    team: string | null;
    phoneNumber: string | null;
    preferredChannel: string | null;
  };
  responsibility: {
    title: string;
    scope: string | null;
    responsibilities: string[];
    kpis: string[];
    successCriteria: string[];
    reportsTo: string | null;
    teamSize: number | null;
    businessOutcomes: { title: string; metric: string; timeframe: string }[];
    inferred: boolean;
    confirmedAt: string | null;
  } | null;
  businessContext: {
    communicationStyle: string | null;
    strengths: string[];
    blindSpots: string[];
    currentChallenges: string[];
    strategicPriorities: string[];
  } | null;
  intelligence: {
    strengths: unknown;
    growthAreas: unknown;
  } | null;
  gaps: string[];
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newKeyProvider, setNewKeyProvider] = useState<'openai' | 'anthropic' | 'perplexity' | 'gemini'>('gemini');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    fetchApiKeys();
    fetchUsage();
    fetchProfile();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/api-keys');
      const data = await response.json();
      if (response.ok) {
        setApiKeys(data.apiKeys || []);
      }
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) setProfile(await res.json());
    } catch {} finally { setProfileLoading(false); }
  };

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      if (response.ok) {
        setUsage(data);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsAdding(true);

    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newKeyProvider,
          apiKey: newKeyValue,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setApiKeys([...apiKeys, data.apiKey]);
        setNewKeyValue('');
      } else {
        setError(data.error || 'Failed to add API key');
      }
    } catch {
      setError('Failed to add API key');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;
    try {
      const response = await fetch(`/api/api-keys?id=${keyId}`, { method: 'DELETE' });
      if (response.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== keyId));
      }
    } catch {}
  };

  return (
    <Shell>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-6">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>

          {/* --- My Profile --- */}
          <MyProfileSection profile={profile} loading={profileLoading} onUpdate={fetchProfile} />

          {/* --- Data Sources (most important for non-tech users) --- */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Data Sources</h2>
            <Link
              href="/settings/connectors"
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Calendar size={20} className="text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Google Calendar, Gmail & Drive
                </div>
                <div className="text-xs text-muted-foreground">
                  Connect your Google Workspace to enable meeting intelligence
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </Link>
          </div>

          {/* --- Notifications --- */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Notifications</h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <NotificationManager />
            </div>
          </div>

          {/* --- Delivery Preferences (DND, batching, call windows) --- */}
          <DeliveryPreferencesSection />

          {/* --- Subscription --- */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Plan</h2>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {usage?.tier === 'free' ? 'Free Plan' : usage?.tier || 'Current Plan'}
                  </div>
                  {usage && usage.llmSource === 'platform' && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatTokens(usage.tokensUsed)} / {formatTokens(usage.tokenLimit)} AI tokens used
                      {usage.percentage >= 80 && (
                        <span className="text-amber-500 ml-1">({usage.percentage}%)</span>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href="/pricing"
                  className="text-xs text-primary hover:underline"
                >
                  Upgrade
                </Link>
              </div>
              {usage && usage.llmSource === 'platform' && (
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, usage.percentage)}%`,
                      backgroundColor:
                        usage.percentage >= 100 ? '#ef4444' :
                        usage.percentage >= 80 ? '#f59e0b' :
                        'hsl(var(--primary))',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* --- Advanced (collapsed by default) --- */}
          <div className="space-y-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
            >
              <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-0' : '-rotate-90'}`} />
              Advanced
            </button>

            {showAdvanced && (
              <div className="space-y-4">
                {/* Explanation for non-technical users */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Shield size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {BRAND.name} includes AI capabilities out of the box — no setup required. If you&apos;re
                      a power user and prefer to use your own AI provider (OpenAI, Google Gemini,
                      or Anthropic), you can add your API key below. This is entirely optional.
                    </div>
                  </div>
                </div>

                {/* Token Usage (only if using own key) */}
                {usage && usage.llmSource !== 'platform' && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm text-foreground">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Using your own API key — no token limits
                    </div>
                  </div>
                )}

                {/* Add API Key */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Key size={14} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">API Keys</span>
                  </div>

                  <form onSubmit={handleAddKey} className="space-y-3">
                    <div>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value as any)}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="perplexity">Perplexity AI</option>
                      </select>
                    </div>
                    <div>
                      <input
                        type="password"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder={
                          newKeyProvider === 'openai' ? 'sk-...' :
                          newKeyProvider === 'anthropic' ? 'sk-ant-...' :
                          newKeyProvider === 'gemini' ? 'AIza...' : 'pplx-...'
                        }
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Your key is encrypted and stored securely. Never shared.
                      </p>
                    </div>
                    {error && (
                      <div className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
                    )}
                    <button
                      type="submit"
                      disabled={isAdding || !newKeyValue}
                      className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isAdding ? 'Adding...' : 'Add API Key'}
                    </button>
                  </form>

                  {/* Existing Keys */}
                  {!isLoading && apiKeys.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border space-y-2">
                      {apiKeys.map((key) => (
                        <div key={key.id} className="flex items-center justify-between py-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-primary uppercase">{key.provider}</span>
                              {key.isActive && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Active</span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">{key.keyPreview}</div>
                          </div>
                          <button
                            onClick={() => handleDeleteKey(key.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── My Profile Section ──

function MyProfileSection({ profile, loading, onUpdate }: {
  profile: ProfileData | null;
  loading: boolean;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState('');
  const [phone, setPhone] = useState('');
  const [inferring, setInferring] = useState(false);

  useEffect(() => {
    if (profile) {
      setJobTitle(profile.profile.jobTitle || '');
      setCompany(profile.profile.company || '');
      setTeam(profile.profile.team || '');
      setPhone(profile.profile.phoneNumber || '');
    }
  }, [profile]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          company: company.trim(),
          industry: team.trim(),
          phoneNumber: phone.trim(),
        }),
      });
      setEditing(false);
      onUpdate();
    } catch {}
    setSaving(false);
  }

  async function handleReInfer() {
    setInferring(true);
    try {
      await fetch('/api/onboarding/infer-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          company: company.trim(),
          industry: team.trim(),
        }),
      });
      onUpdate();
    } catch {}
    setInferring(false);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">My Profile</h2>
        <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-32" />
      </div>
    );
  }

  const p = profile?.profile;
  const r = profile?.responsibility;
  const gaps = profile?.gaps || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">My Profile</h2>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
        >
          <Pencil size={12} /> {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Gaps warning */}
      {gaps.length > 0 && !editing && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
          <AlertCircle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Mira needs more context to coach you effectively
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Missing: {gaps.join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {/* Basic info */}
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Role</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Company</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Team / Department</label>
                <input type="text" value={team} onChange={e => setTeam(e.target.value)}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+91..."
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
              </button>
              <button onClick={handleReInfer} disabled={inferring || !jobTitle.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50">
                {inferring ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
                Re-analyze my role
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User size={20} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{p?.jobTitle || 'No role set'}</div>
              <div className="text-xs text-muted-foreground">
                {[p?.company, p?.team].filter(Boolean).join(' · ') || 'No company set'}
              </div>
              {r?.reportsTo && (
                <div className="text-xs text-muted-foreground mt-0.5">Reports to: {r.reportsTo}</div>
              )}
              {r?.teamSize && (
                <div className="text-xs text-muted-foreground">Team size: {r.teamSize}</div>
              )}
            </div>
          </div>
        )}

        {/* Responsibilities */}
        {r && !editing && (
          <>
            {r.scope && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">What I Own</h4>
                <p className="text-sm text-foreground/80">{r.scope}</p>
              </div>
            )}

            {r.responsibilities.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Responsibilities</h4>
                <ul className="space-y-0.5">
                  {r.responsibilities.map((item, i) => (
                    <li key={i} className="text-sm text-foreground/80 flex items-start gap-1.5">
                      <span className="text-primary mt-1">&#8226;</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {r.kpis.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Measured On</h4>
                <div className="flex flex-wrap gap-1.5">
                  {r.kpis.map((kpi, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary">{kpi}</span>
                  ))}
                </div>
              </div>
            )}

            {r.businessOutcomes.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1">Business Outcomes</h4>
                <div className="space-y-1">
                  {r.businessOutcomes.map((o: { title: string; metric: string; timeframe: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Target size={12} className="text-primary flex-shrink-0" />
                      <span className="text-foreground/80">{o.title}</span>
                      <span className="text-xs text-muted-foreground">({o.metric})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {r.inferred && !r.confirmedAt && (
              <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
                <AlertCircle size={12} />
                Mira inferred this from your role. Review and confirm in Edit mode.
              </div>
            )}
          </>
        )}

        {/* What Mira has learned */}
        {profile?.businessContext && !editing && (
          (profile.businessContext.strengths?.length > 0 || profile.businessContext.blindSpots?.length > 0) && (
            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">What Mira Has Learned</h4>
              {profile.businessContext.strengths?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-muted-foreground">Strengths: </span>
                  <span className="text-xs text-foreground/80">{profile.businessContext.strengths.join(', ')}</span>
                </div>
              )}
              {profile.businessContext.blindSpots?.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">Growth areas: </span>
                  <span className="text-xs text-foreground/80">{profile.businessContext.blindSpots.join(', ')}</span>
                </div>
              )}
            </div>
          )
        )}

        {/* Link to full onboarding */}
        {!editing && (
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <Link href="/onboarding" className="text-xs text-primary hover:text-primary/80">
              Complete setup wizard →
            </Link>
            <span className="text-[10px] text-muted-foreground">
              {p?.preferredChannel === 'voice' ? '📞 Voice mode' : '💬 Text mode'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Delivery Preferences Section ──

interface CallWindow {
  start: string;
  end: string;
  label: string;
}

interface DeliveryPrefs {
  dndStart: string | null;
  dndEnd: string | null;
  timezone: string;
  quietWeekends: boolean;
  batchNudges: boolean;
  maxCallsPerDay: number;
  preferredCallWindows: CallWindow[];
}

const TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function DeliveryPreferencesSection() {
  const [prefs, setPrefs] = useState<DeliveryPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dndEnabled, setDndEnabled] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/preferences/delivery');
      if (res.ok) {
        const data = await res.json();
        setPrefs(data);
        setDndEnabled(!!(data.dndStart && data.dndEnd));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const savePrefs = async () => {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        ...prefs,
        dndStart: dndEnabled ? prefs.dndStart : null,
        dndEnd: dndEnabled ? prefs.dndEnd : null,
      };
      const res = await fetch('/api/preferences/delivery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {} finally { setSaving(false); }
  };

  const addCallWindow = () => {
    if (!prefs) return;
    setPrefs({
      ...prefs,
      preferredCallWindows: [
        ...prefs.preferredCallWindows,
        { start: '09:00', end: '10:00', label: '' },
      ],
    });
  };

  const removeCallWindow = (index: number) => {
    if (!prefs) return;
    setPrefs({
      ...prefs,
      preferredCallWindows: prefs.preferredCallWindows.filter((_, i) => i !== index),
    });
  };

  const updateCallWindow = (index: number, field: keyof CallWindow, value: string) => {
    if (!prefs) return;
    const updated = [...prefs.preferredCallWindows];
    updated[index] = { ...updated[index], [field]: value };
    setPrefs({ ...prefs, preferredCallWindows: updated });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Delivery</h2>
        <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-20" />
      </div>
    );
  }

  if (!prefs) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Delivery</h2>

      <div className="rounded-xl border border-border bg-card p-4 space-y-5">
        {/* DND Toggle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Do Not Disturb</span>
            </div>
            <button
              onClick={() => {
                setDndEnabled(!dndEnabled);
                if (!dndEnabled && !prefs.dndStart) {
                  setPrefs({ ...prefs, dndStart: '22:00', dndEnd: '07:00' });
                }
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                dndEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                dndEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
          {dndEnabled && (
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={prefs.dndStart || '22:00'}
                onChange={(e) => setPrefs({ ...prefs, dndStart: e.target.value })}
                className="flex-1 bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
              />
              <Sun size={12} className="text-muted-foreground" />
              <input
                type="time"
                value={prefs.dndEnd || '07:00'}
                onChange={(e) => setPrefs({ ...prefs, dndEnd: e.target.value })}
                className="flex-1 bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
              />
            </div>
          )}
        </div>

        {/* Timezone */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Timezone</span>
          </div>
          <select
            value={prefs.timezone}
            onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            className="bg-input border border-border rounded-lg px-2 py-1.5 text-xs text-foreground max-w-[180px]"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Quiet Weekends */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Quiet Weekends</span>
          </div>
          <button
            onClick={() => setPrefs({ ...prefs, quietWeekends: !prefs.quietWeekends })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              prefs.quietWeekends ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              prefs.quietWeekends ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`} />
          </button>
        </div>

        {/* Batch Nudges */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-muted-foreground" />
            <div>
              <span className="text-sm font-medium text-foreground">Batch Nudges</span>
              <p className="text-[10px] text-muted-foreground">Non-urgent nudges saved for morning brief</p>
            </div>
          </div>
          <button
            onClick={() => setPrefs({ ...prefs, batchNudges: !prefs.batchNudges })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
              prefs.batchNudges ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              prefs.batchNudges ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`} />
          </button>
        </div>

        {/* Max Calls Per Day */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Max Calls / Day</span>
            <span className="text-xs font-mono text-muted-foreground ml-auto">{prefs.maxCallsPerDay}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={prefs.maxCallsPerDay}
            onChange={(e) => setPrefs({ ...prefs, maxCallsPerDay: parseInt(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        {/* Preferred Call Windows */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Call Windows</span>
            </div>
            <button onClick={addCallWindow} className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5">
              <Plus size={12} /> Add
            </button>
          </div>
          {prefs.preferredCallWindows.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              No windows set — Mira calls anytime outside DND.
            </p>
          )}
          {prefs.preferredCallWindows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="time" value={w.start}
                onChange={(e) => updateCallWindow(i, 'start', e.target.value)}
                className="bg-input border border-border rounded-lg px-2 py-1 text-xs text-foreground w-[90px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="time" value={w.end}
                onChange={(e) => updateCallWindow(i, 'end', e.target.value)}
                className="bg-input border border-border rounded-lg px-2 py-1 text-xs text-foreground w-[90px]"
              />
              <input type="text" value={w.label} placeholder="Label"
                onChange={(e) => updateCallWindow(i, 'label', e.target.value)}
                className="bg-input border border-border rounded-lg px-2 py-1 text-xs text-foreground flex-1 placeholder:text-muted-foreground/50"
              />
              <button onClick={() => removeCallWindow(i)} className="text-muted-foreground hover:text-destructive">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Save */}
        <button
          onClick={savePrefs}
          disabled={saving}
          className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Delivery Preferences'}
        </button>
      </div>
    </div>
  );
}
