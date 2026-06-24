'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/v2/Shell';
import { BRAND } from '@/lib/brand';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Calendar,
  FileText,
  StickyNote,
  Mic,
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Settings,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ChevronRight,
  Shield,
  ArrowLeft,
  Github,
  MessageSquare,
  Video,
  BarChart3,
} from 'lucide-react';

interface Connector {
  id: string;
  type: string;
  provider: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING' | 'PAUSED';
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  syncFrequency: number;
}

interface SyncResult {
  provider: string;
  success: boolean;
  artifactsCreated: number;
  error?: string;
}

interface GoogleAccountStatus {
  connected: boolean;
  hasTokens: boolean;
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  isExpired?: boolean;
  needsReconnect?: boolean;
  scopes?: string[];
  availableConnectors?: {
    gmail: boolean;
    gcal: boolean;
    gdrive: boolean;
  };
  message?: string;
}

const connectorConfigs = [
  {
    provider: 'gmail',
    name: 'Gmail',
    description: 'Analyze sent emails for communication patterns and stakeholder relationships',
    icon: Mail,
    type: 'EMAIL',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    features: ['Email sentiment analysis', 'Response time tracking', 'Stakeholder extraction']
  },
  {
    provider: 'gcal',
    name: 'Google Calendar',
    description: 'Track meetings, prep time, and follow-through on commitments',
    icon: Calendar,
    type: 'CALENDAR',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    features: ['Meeting preparation', 'Post-meeting reflections', 'Time allocation analysis']
  },
  {
    provider: 'gdrive',
    name: 'Google Drive',
    description: 'Analyze documents for strategic thinking and clarity of communication',
    icon: FileText,
    type: 'DOCUMENTS',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    features: ['Document quality analysis', 'Strategic thinking indicators', 'Writing patterns']
  },
  {
    provider: 'microsoft_calendar',
    name: 'Outlook Calendar',
    description: 'Track meetings, prep time, and follow-through on commitments',
    icon: Calendar,
    type: 'CALENDAR',
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    features: ['Meeting preparation', 'Post-meeting reflections', 'Time allocation analysis']
  },
  {
    provider: 'microsoft_mail',
    name: 'Outlook Mail',
    description: 'Analyze sent emails for communication patterns and stakeholder relationships',
    icon: Mail,
    type: 'EMAIL',
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    features: ['Email sentiment analysis', 'Response time tracking', 'Stakeholder extraction']
  },
  {
    provider: 'microsoft_onedrive',
    name: 'OneDrive',
    description: 'Analyze documents for strategic thinking and clarity of communication',
    icon: FileText,
    type: 'DOCUMENTS',
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    features: ['Document quality analysis', 'Strategic thinking indicators', 'Writing patterns']
  },
  {
    provider: 'dropbox',
    name: 'Dropbox',
    description: 'Sync documents and files for context intelligence',
    icon: FileText,
    type: 'DOCUMENTS',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    features: ['Document analysis', 'File activity tracking', 'Shared file intelligence']
  },
  {
    provider: 'box',
    name: 'Box',
    description: 'Enterprise document storage and collaboration',
    icon: FileText,
    type: 'DOCUMENTS',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    features: ['Document analysis', 'Collaboration tracking', 'Enterprise content']
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Analyze communication patterns and stakeholder dynamics',
    icon: MessageSquare,
    type: 'MESSAGING',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    features: ['Communication patterns', 'Stakeholder dynamics', 'Channel intelligence']
  },
  {
    provider: 'zoom',
    name: 'Zoom',
    description: 'Meeting recordings and transcripts for coaching intelligence',
    icon: Video,
    type: 'MEETINGS',
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    features: ['Meeting transcripts', 'Speaking patterns', 'Action item extraction']
  },
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Pages and databases for project and knowledge context',
    icon: FileText,
    type: 'DOCUMENTS',
    color: 'text-gray-700',
    bgColor: 'bg-gray-700/10',
    features: ['Page analysis', 'Project tracking', 'Knowledge base']
  },
  {
    provider: 'linear',
    name: 'Linear',
    description: 'Issues and projects for engineering leadership context',
    icon: BarChart3,
    type: 'PROJECTS',
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    features: ['Issue tracking', 'Sprint velocity', 'Team workload']
  },
  {
    provider: 'jira',
    name: 'Jira',
    description: 'Issues, sprints, and project tracking intelligence',
    icon: BarChart3,
    type: 'PROJECTS',
    color: 'text-blue-700',
    bgColor: 'bg-blue-700/10',
    features: ['Sprint tracking', 'Issue patterns', 'Cross-team dependencies']
  },
  {
    provider: 'trello',
    name: 'Trello',
    description: 'Boards and cards for visual project intelligence',
    icon: BarChart3,
    type: 'PROJECTS',
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    features: ['Board activity', 'Card tracking', 'Workflow patterns']
  },
  {
    provider: 'asana',
    name: 'Asana',
    description: 'Tasks and projects for team coordination intelligence',
    icon: BarChart3,
    type: 'PROJECTS',
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    features: ['Task tracking', 'Project status', 'Workload patterns']
  },
  {
    provider: 'github',
    name: 'GitHub',
    description: 'Track PRs, issues, and code reviews for project intelligence',
    icon: Github,
    type: 'GITHUB',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    features: ['PR velocity tracking', 'Code review patterns', 'Contributor network']
  },
  {
    provider: 'apple_notes',
    name: 'Apple Notes',
    description: 'Connect via Claude Cowork to analyze meeting notes and reflections',
    icon: StickyNote,
    type: 'NOTES',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    features: ['Meeting notes analysis', 'Reflection capture', 'Quick voice notes'],
    requiresMCP: true
  },
  {
    provider: 'voice_memo',
    name: 'Voice Memos',
    description: 'Capture quick reflections and thoughts via voice',
    icon: Mic,
    type: 'MANUAL',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    features: ['Voice-to-text', 'Quick capture', 'On-the-go reflections']
  },
  {
    provider: 'manual',
    name: 'Manual Input',
    description: 'Add notes, reflections, and context directly',
    icon: StickyNote,
    type: 'MANUAL',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    features: ['Quick notes', 'Structured reflections', 'Context teaching']
  }
];

function StatusBadge({ status }: { status: Connector['status'] }) {
  const configs = {
    CONNECTED: { label: 'Connected', color: 'bg-emerald-500/10 text-emerald-500', icon: CheckCircle2 },
    DISCONNECTED: { label: 'Not Connected', color: 'bg-muted text-muted-foreground', icon: Link2 },
    ERROR: { label: 'Error', color: 'bg-red-500/10 text-red-500', icon: AlertCircle },
    SYNCING: { label: 'Syncing...', color: 'bg-blue-500/10 text-blue-500', icon: RefreshCw },
    PAUSED: { label: 'Paused', color: 'bg-amber-500/10 text-amber-500', icon: Pause }
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <Badge className={`${config.color} gap-1`}>
      <Icon className={`h-3 w-3 ${status === 'SYNCING' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}

function ConnectorCard({
  config,
  connector,
  onConnect,
  onDisconnect,
  onSync,
  onFullResync,
  onPause,
  onResume,
  onReconnect,
  isSyncingThis
}: {
  config: typeof connectorConfigs[0];
  connector?: Connector;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onFullResync: () => void;
  onPause: () => void;
  onResume: () => void;
  onReconnect?: () => void;
  isSyncingThis?: boolean;
}) {
  const Icon = config.icon;
  const isConnected = connector?.status === 'CONNECTED';
  const isPaused = connector?.status === 'PAUSED';
  const isSyncing = connector?.status === 'SYNCING' || isSyncingThis;
  const isError = connector?.status === 'ERROR';
  const isDisconnected = connector?.status === 'DISCONNECTED';
  const needsReconnect = isError || (isDisconnected && connector?.lastSyncStatus?.includes('expired'));

  return (
    <Card className={`transition-all ${isConnected ? 'border-emerald-500/30' : ''}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}>
              <Icon className={`h-6 w-6 ${config.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{config.name}</CardTitle>
                {config.requiresMCP && (
                  <Badge variant="outline" className="text-xs">
                    MCP
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">{config.description}</CardDescription>
            </div>
          </div>
          <StatusBadge status={connector?.status || 'DISCONNECTED'} />
        </div>
      </CardHeader>
      <CardContent>
        {/* Features */}
        <div className="flex flex-wrap gap-2 mb-4">
          {config.features.map((feature) => (
            <Badge key={feature} variant="secondary" className="text-xs">
              {feature}
            </Badge>
          ))}
        </div>

        {/* Sync Info */}
        {(isConnected || isPaused) && connector?.lastSyncAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Clock className="h-3 w-3" />
            Last synced: {new Date(connector.lastSyncAt).toLocaleString()}
          </div>
        )}

        {/* Error/Reconnect Notice */}
        {needsReconnect && connector && (
          <div className="flex items-center gap-2 text-xs text-amber-500 mb-4 p-2 bg-amber-500/10 rounded">
            <AlertCircle className="h-3 w-3" />
            {connector.lastSyncStatus || 'Authentication issue. Please reconnect.'}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!connector ? (
            <Button onClick={onConnect} className="flex-1">
              Connect
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : needsReconnect && onReconnect ? (
            <>
              <Button
                onClick={onReconnect}
                className="flex-1 bg-amber-500 hover:bg-amber-600"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Reconnect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                onClick={onDisconnect}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onFullResync}
                disabled={isSyncing}
                title="Delete existing data and resync last 30 days"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                Full Resync
              </Button>
              {isPaused ? (
                <Button variant="outline" size="sm" onClick={onResume}>
                  <Play className="h-4 w-4 mr-1" />
                  Resume
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onPause}>
                  <Pause className="h-4 w-4 mr-1" />
                  Pause
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                onClick={onDisconnect}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectorsPageContent() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMCPSetup, setShowMCPSetup] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleAccountStatus | null>(null);
  const [syncingConnectorId, setSyncingConnectorId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    fetchConnectors();
    fetchGoogleStatus();

    // Check for OAuth callback params
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const detail = searchParams.get('detail');

    if (success === 'google_connected') {
      setOauthMessage({ type: 'success', message: 'Google account connected successfully!' });
      // Clear URL params
      window.history.replaceState({}, '', '/settings/connectors');
      // Refresh status
      fetchGoogleStatus();
    } else if (success === 'microsoft_connected') {
      setOauthMessage({ type: 'success', message: 'Microsoft account connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'github_connected') {
      setOauthMessage({ type: 'success', message: 'GitHub connected successfully! Add repos to your projects to start syncing.' });
      window.history.replaceState({}, '', '/settings/connectors');
    } else if (success === 'dropbox_connected') {
      setOauthMessage({ type: 'success', message: 'Dropbox connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'box_connected') {
      setOauthMessage({ type: 'success', message: 'Box connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'slack_connected') {
      setOauthMessage({ type: 'success', message: 'Slack connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'zoom_connected') {
      setOauthMessage({ type: 'success', message: 'Zoom connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'notion_connected') {
      setOauthMessage({ type: 'success', message: 'Notion connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'linear_connected') {
      setOauthMessage({ type: 'success', message: 'Linear connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'jira_connected') {
      setOauthMessage({ type: 'success', message: 'Jira connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'trello_connected') {
      setOauthMessage({ type: 'success', message: 'Trello connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (success === 'asana_connected') {
      setOauthMessage({ type: 'success', message: 'Asana connected successfully!' });
      window.history.replaceState({}, '', '/settings/connectors');
      fetchConnectors();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        oauth_failed: 'Google OAuth failed',
        missing_params: 'OAuth callback missing parameters',
        token_exchange_failed: 'Failed to exchange OAuth token',
        callback_failed: 'OAuth callback processing failed',
      };
      setOauthMessage({
        type: 'error',
        message: `${errorMessages[error] || error}${detail ? `: ${detail}` : ''}`
      });
      // Clear URL params
      window.history.replaceState({}, '', '/settings/connectors');
    }
  }, [searchParams]);

  const fetchGoogleStatus = async () => {
    try {
      const response = await fetch('/api/connectors/status');
      if (response.ok) {
        const data = await response.json();
        setGoogleStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch Google status:', error);
    }
  };

  const fetchConnectors = async () => {
    try {
      const response = await fetch('/api/connectors');
      const data = await response.json();
      if (response.ok) {
        setConnectors(data.connectors || []);
      }
    } catch (error) {
      console.error('Failed to fetch connectors:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (provider: string, type: string) => {
    if (provider === 'gmail' || provider === 'gcal' || provider === 'gdrive') {
      // For Google connectors, first try to create the connector
      // If user has Google OAuth tokens, this will work
      // If not, we'll redirect to OAuth
      try {
        const response = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, type })
        });

        if (response.ok) {
          fetchConnectors();
        } else if (response.status === 401) {
          // User not authenticated - should not happen with Clerk
          alert('Please sign in first');
        } else {
          const data = await response.json();
          if (data.error === 'Google account not connected' || data.error?.includes('Google')) {
            // User signed in but no Google account linked - redirect to Google OAuth
            window.location.href = '/api/auth/google';
          } else {
            alert(data.error || 'Failed to connect');
          }
        }
      } catch (error) {
        console.error('Failed to create connector:', error);
        alert('Failed to connect. Please try again.');
      }
    } else if (provider === 'github') {
      // Redirect to GitHub App installation
      window.location.href = '/api/auth/github';
    } else if (provider === 'microsoft_calendar' || provider === 'microsoft_mail' || provider === 'microsoft_onedrive') {
      // For Microsoft connectors, check if Microsoft OAuth exists, otherwise redirect
      try {
        const response = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, type })
        });

        if (response.ok) {
          fetchConnectors();
        } else {
          const data = await response.json();
          if (data.error?.includes('Microsoft') || data.error?.includes('account not connected')) {
            window.location.href = '/api/auth/microsoft';
          } else {
            alert(data.error || 'Failed to connect');
          }
        }
      } catch (error) {
        console.error('Failed to create Microsoft connector:', error);
        alert('Failed to connect. Please try again.');
      }
    } else if (['dropbox', 'box', 'slack', 'zoom', 'notion', 'linear', 'jira', 'trello', 'asana'].includes(provider)) {
      try {
        const response = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, type })
        });
        if (response.ok) {
          fetchConnectors();
        } else {
          window.location.href = `/api/auth/${provider}`;
        }
      } catch {
        window.location.href = `/api/auth/${provider}`;
      }
    } else if (provider === 'manual' || provider === 'voice_memo') {
      // Create a manual connector directly
      try {
        const response = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, type })
        });
        if (response.ok) {
          fetchConnectors();
        } else if (response.status === 401) {
          alert('Please sign in first');
        }
      } catch (error) {
        console.error('Failed to create connector:', error);
      }
    } else if (provider === 'apple_notes') {
      // MCP connector - open setup dialog
      setShowMCPSetup(true);
    } else {
      alert('This connector type is not yet supported.');
    }
  };

  const handleDisconnect = async (connectorId: string) => {
    if (!confirm('Are you sure you want to disconnect this data source?')) {
      return;
    }
    try {
      const response = await fetch(`/api/connectors/${connectorId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchConnectors();
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleSync = async (connectorId: string, fullResync: boolean = false) => {
    setSyncingConnectorId(connectorId);
    setSyncResult(null);
    const connector = connectors.find(c => c.id === connectorId);
    const provider = connector?.provider || 'unknown';

    try {
      const url = fullResync
        ? `/api/connectors/${connectorId}/sync?fullResync=true`
        : `/api/connectors/${connectorId}/sync`;

      const response = await fetch(url, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        // Check if reconnection is required
        if (data.requiresReconnect) {
          setSyncResult({ provider, success: false, artifactsCreated: 0, error: 'Authentication expired. Please reconnect.' });
          if (provider.startsWith('microsoft_')) {
            window.location.href = '/api/auth/microsoft';
          } else {
            window.location.href = '/api/auth/google';
          }
          return;
        }
        setSyncResult({ provider, success: false, artifactsCreated: 0, error: data.error || 'Sync failed' });
      } else {
        setSyncResult({
          provider,
          success: true,
          artifactsCreated: data.artifactsCreated || 0,
        });
      }

      fetchConnectors();
      fetchGoogleStatus();
    } catch (error) {
      console.error('Failed to sync:', error);
      setSyncResult({ provider, success: false, artifactsCreated: 0, error: 'Failed to sync connector' });
    } finally {
      setSyncingConnectorId(null);
      // Auto-clear the result after 10 seconds
      setTimeout(() => setSyncResult(null), 10000);
    }
  };

  const handleFullResync = async (connectorId: string) => {
    if (!confirm('This will delete all existing synced data for this connector and resync the last 30 days. Continue?')) {
      return;
    }
    await handleSync(connectorId, true);
  };

  const handleReconnect = async (connectorId: string) => {
    const oauthUrls: Record<string, string> = {
      gmail: '/api/auth/google', gcal: '/api/auth/google', gdrive: '/api/auth/google',
      microsoft_calendar: '/api/auth/microsoft', microsoft_mail: '/api/auth/microsoft', microsoft_onedrive: '/api/auth/microsoft',
      dropbox: '/api/auth/dropbox', box: '/api/auth/box', slack: '/api/auth/slack',
      zoom: '/api/auth/zoom', notion: '/api/auth/notion', linear: '/api/auth/linear',
      jira: '/api/auth/jira', trello: '/api/auth/trello', asana: '/api/auth/asana',
    };

    try {
      const connector = connectors.find(c => c.id === connectorId);
      const response = await fetch(`/api/connectors/${connectorId}/reconnect`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.action === 'SIGN_IN_REQUIRED') {
        const provider = connector?.provider || '';
        const oauthUrl = oauthUrls[provider] || '/api/auth/google';
        window.location.href = oauthUrl;
      }
    } catch (error) {
      console.error('Failed to reconnect:', error);
      alert('Failed to initiate reconnection');
    }
  };

  const handlePause = async (connectorId: string) => {
    try {
      await fetch(`/api/connectors/${connectorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED' })
      });
      fetchConnectors();
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  };

  const handleResume = async (connectorId: string) => {
    try {
      await fetch(`/api/connectors/${connectorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONNECTED' })
      });
      fetchConnectors();
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  };

  const getConnector = (provider: string) =>
    connectors.find(c => c.provider === provider);

  const connectedCount = connectors.filter(c => c.status === 'CONNECTED').length;

  return (
    <Shell>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <h1 className="text-3xl font-bold">Data Connections</h1>
          <p className="text-muted-foreground mt-1">
            Connect your work tools to enable personalized feedback and insights
          </p>
        </div>

        {/* OAuth Message */}
        {oauthMessage && (
          <Card className={`mb-6 ${oauthMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {oauthMessage.type === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={oauthMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}>
                    {oauthMessage.message}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOauthMessage(null)}
                >
                  ×
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Privacy Notice */}
        <Card className="mb-8 border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Your data stays private</h3>
                <p className="text-sm text-muted-foreground">
                  All data is encrypted and processed locally. We never share your information.
                  You can disconnect any source at any time and all associated data will be deleted.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Google Account Status Warning */}
        {googleStatus && !googleStatus.connected && (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-600 mb-1">Google Account Not Connected</h3>
                    <p className="text-sm text-muted-foreground">
                      Sign in with Google to enable Gmail, Calendar, and Drive connectors.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => window.location.href = '/api/auth/google'}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Connect Google
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {googleStatus && googleStatus.connected && googleStatus.needsReconnect && (
          <Card className="mb-6 border-red-500/30 bg-red-500/10">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-600 mb-1">Authentication Expired</h3>
                    <p className="text-sm text-muted-foreground">
                      Your Google authentication has expired. Please reconnect to restore sync functionality.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => window.location.href = '/api/auth/google'}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  Reconnect Google
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sync Result Notification */}
        {syncResult && (
          <div className={`mb-6 p-4 rounded-lg border ${syncResult.success
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-red-500/10 border-red-500/30'
            }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {syncResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <div>
                  <div className={`font-medium ${syncResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                    {syncResult.success
                      ? `Sync complete: ${syncResult.artifactsCreated} new items from ${syncResult.provider}`
                      : `Sync failed for ${syncResult.provider}`}
                  </div>
                  {syncResult.error && (
                    <div className="text-sm text-muted-foreground">{syncResult.error}</div>
                  )}
                  {syncResult.success && syncResult.artifactsCreated > 0 && (
                    <div className="text-sm text-muted-foreground">
                      Items are ready for analysis. <Link href="/admin/pipeline" className="underline">View pipeline status</Link>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        {connectedCount > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">
                  {connectedCount} data source{connectedCount !== 1 ? 's' : ''} connected
                </span>
              </div>
              <Link href="/admin/pipeline" className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                View Pipeline Status
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Connector Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading connectors...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {connectorConfigs.map((config) => {
              const conn = getConnector(config.provider);
              return (
                <ConnectorCard
                  key={config.provider}
                  config={config}
                  connector={conn}
                  onConnect={() => handleConnect(config.provider, config.type)}
                  onDisconnect={() => {
                    if (conn) handleDisconnect(conn.id);
                  }}
                  onSync={() => {
                    if (conn) handleSync(conn.id, false);
                  }}
                  onFullResync={() => {
                    if (conn) handleFullResync(conn.id);
                  }}
                  onPause={() => {
                    if (conn) handlePause(conn.id);
                  }}
                  onResume={() => {
                    if (conn) handleResume(conn.id);
                  }}
                  onReconnect={() => {
                    if (conn) handleReconnect(conn.id);
                  }}
                  isSyncingThis={conn ? syncingConnectorId === conn.id : false}
                />
              );
            })}
          </div>
        )}

        {/* MCP Info */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Claude Cowork Integration</CardTitle>
            <CardDescription>
              Connect local tools like Apple Notes via Claude Cowork MCP
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              MCP (Model Context Protocol) connectors allow {BRAND.name} to access local
              data sources through Claude Cowork. This enables analysis of your Apple Notes,
              local PDFs, and other files without uploading them to our servers.
            </p>
            <Button variant="outline" onClick={() => setShowMCPSetup(true)}>
              Setup MCP Connection
            </Button>
          </CardContent>
        </Card>

        {/* MCP Setup Dialog */}
        {showMCPSetup && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Setup Claude Cowork MCP</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowMCPSetup(false)}>
                    &times;
                  </Button>
                </div>
                <CardDescription>
                  Connect your local data sources through Claude Cowork
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Step 1: Install Claude Cowork</h3>
                  <p className="text-sm text-muted-foreground">
                    Claude Cowork is a desktop application that enables Claude to access local files
                    and applications through MCP (Model Context Protocol).
                  </p>
                  <Button variant="outline" asChild>
                    <a href="https://claude.ai/download" target="_blank" rel="noopener noreferrer">
                      Download Claude Cowork
                    </a>
                  </Button>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Step 2: Configure MCP Server</h3>
                  <p className="text-sm text-muted-foreground">
                    Add the {BRAND.name} MCP server to your Claude Cowork configuration.
                    Edit your <code className="bg-muted px-1 rounded">~/.claude/claude_desktop_config.json</code>:
                  </p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {`{
  "mcpServers": {
    "mira": {
      "command": "npx",
      "args": ["-y", "@miracos/mira-mcp"],
      "env": {
        "MIRA_API_KEY": "your-api-key"
      }
    }
  }
}`}
                  </pre>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Step 3: Available MCP Tools</h3>
                  <p className="text-sm text-muted-foreground">
                    Once connected, {BRAND.name} can access:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                    <li><strong>Apple Notes</strong> - Meeting notes and reflections</li>
                    <li><strong>Local PDFs</strong> - Project documents and reports</li>
                    <li><strong>Voice Memos</strong> - Quick audio reflections (transcribed)</li>
                    <li><strong>Filesystem</strong> - Specified folders for document analysis</li>
                  </ul>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-600 mb-2">Coming Soon</h4>
                  <p className="text-sm text-muted-foreground">
                    Full MCP integration is under development. For now, you can use the Manual Input
                    connector to add notes and reflections directly.
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowMCPSetup(false)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    handleConnect('manual', 'MANUAL');
                    setShowMCPSetup(false);
                  }}>
                    Enable Manual Input Instead
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function ConnectorsPage() {
  return (
    <Suspense fallback={
      <Shell>
        <div className="p-8 max-w-5xl mx-auto">
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        </div>
      </Shell>
    }>
      <ConnectorsPageContent />
    </Suspense>
  );
}
