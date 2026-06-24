'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Brain,
  Lightbulb,
  Mail,
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  ChevronRight,
  ArrowRight,
  Key,
  Settings,
} from 'lucide-react';

interface PipelineStatus {
  sync: {
    connectors: Array<{
      id: string;
      provider: string;
      type: string;
      status: string;
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
      totalArtifacts: number;
      recentArtifacts: Array<{
        id: string;
        title: string;
        type: string;
        ingestedAt: string;
        analyzed: boolean;
      }>;
    }>;
    summary: {
      totalConnected: number;
      totalConnectors: number;
    };
  };
  analysis: {
    total: number;
    analyzed: number;
    pending: number;
    percentComplete: number;
    byType: Array<{ type: string; count: number }>;
    pendingArtifacts: Array<{
      id: string;
      title: string;
      type: string;
      ingestedAt: string;
      connector: { provider: string } | null;
    }>;
  };
  intelligence: {
    totalObservations: number;
    byType: Array<{ type: string; count: number }>;
    recentObservations: Array<{
      id: string;
      observation: string;
      evidence: string;
      type: string;
      score: number;
      confidence: number;
      createdAt: string;
      capacity: { name: string; slug: string };
      artifact: { id: string; title: string; type: string } | null;
    }>;
    capacityCoverage: Array<{
      slug: string;
      name: string;
      observationCount: number;
      score: number | null;
      confidence: number | null;
      trend: string;
    }>;
  };
}

const providerIcons: Record<string, typeof Mail> = {
  gmail: Mail,
  gcal: Calendar,
  gdrive: FileText,
};

const providerNames: Record<string, string> = {
  gmail: 'Gmail',
  gcal: 'Google Calendar',
  gdrive: 'Google Drive',
  manual: 'Manual Input',
};

const typeColors: Record<string, string> = {
  POSITIVE: 'bg-emerald-500/10 text-emerald-500',
  NEGATIVE: 'bg-red-500/10 text-red-500',
  MISSED_OPPORTUNITY: 'bg-amber-500/10 text-amber-500',
  NEUTRAL: 'bg-muted text-muted-foreground',
};

const trendIcons: Record<string, typeof TrendingUp> = {
  IMPROVING: TrendingUp,
  DECLINING: TrendingDown,
  STABLE: Minus,
  INSUFFICIENT_DATA: Clock,
};

export default function PipelinePage() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/pipeline-status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch pipeline status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleStopAnalysis = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsAnalyzing(false);
      setAnalyzeResult('Analysis stopped by user.');
    }
  };

  const handleAnalyzeAll = async () => {
    setIsAnalyzing(true);
    setAnalyzeResult('Starting analysis...');
    let totalItems = 0;

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/admin/analyze-all', {
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const text = line.slice(6);
              const data = JSON.parse(text);

              if (data.type === 'start') {
                totalItems = data.total;
                setAnalyzeResult(data.message);
              } else if (data.type === 'progress') {
                // Format: [Gmail] 10/24: Title...
                const date = data.date ? new Date(data.date).toLocaleDateString() : '';
                const folder = data.meta?.folderName ? `(${data.meta.folderName}) ` : '';
                const source = data.source ? `[${data.source}] ` : '';

                setAnalyzeResult(`Analyzing: ${source}${folder}${date}: ${data.title}...`);
              } else if (data.type === 'result') {
                const icon = data.status === 'success' ? '✅' : '❌';
                const date = data.date ? new Date(data.date).toLocaleDateString() : '';
                // Check common folder paths
                const folder = data.meta?.folderName || data.meta?.path || '';
                const folderDisplay = folder ? `(${folder}) ` : '';
                const source = data.source ? `[${data.source}] ` : '';

                // Show [Current/Total]
                const current = data.successCount + data.errorCount;
                setAnalyzeResult(`${icon} [${current}/${totalItems || (data.successCount + data.errorCount)}] ${source}${folderDisplay}${date}: ${data.title}`)
                  ;
              } else if (data.type === 'complete') {
                const obsMsg = data.totalObservations ? ` - ${data.totalObservations} observations created` : '';
                setAnalyzeResult(`Done! Analyzed ${data.count} items${obsMsg}.`);
                fetchStatus();
                setIsAnalyzing(false);
              } else if (data.type === 'error') {
                setAnalyzeResult(`Error: ${data.message}`);
                setIsAnalyzing(false);
              }
            } catch (e) {
              console.error('Failed to parse stream event', e);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Analysis aborted by user');
        setAnalyzeResult('Analysis stopped by user.');
      } else {
        console.error('Analysis failed:', error);
        setAnalyzeResult(`Error: ${String(error)}`);
      }
      setIsAnalyzing(false);
    } finally {
      setAbortController(null);
    }
  };

  const handleFullResyncAll = async () => {
    if (!confirm('This will delete ALL synced data and resync the last 30 days from all connectors. Continue?')) {
      return;
    }
    setIsSyncing(true);
    setSyncResult('Starting parallel sync...');

    try {
      // Filter active connectors
      const activeConnectors = (status?.sync.connectors || []).filter(
        c => c.status === 'CONNECTED' || c.status === 'SYNCING'
      );

      if (activeConnectors.length === 0) {
        setSyncResult('No connected sources to sync.');
        setIsSyncing(false);
        return;
      }

      // Trigger all in parallel
      const results = await Promise.all(activeConnectors.map(async (connector) => {
        try {
          const response = await fetch(`/api/connectors/${connector.id}/sync?fullResync=true`, {
            method: 'POST'
          });
          const data = await response.json();
          return {
            provider: connector.provider,
            success: response.ok,
            count: data.artifactsCreated || 0,
            error: !response.ok ? (data.error || 'Failed') : null
          };
        } catch (e) {
          return { provider: connector.provider, success: false, count: 0, error: String(e) };
        }
      }));

      // Summarize
      const totalArtifacts = results.reduce((acc, r) => acc + r.count, 0);
      const failures = results.filter(r => !r.success);

      let msg = `Synced ${totalArtifacts} items from ${results.length} sources.`;
      if (failures.length > 0) {
        msg += ` (${failures.length} errors: ${failures.map(f => f.provider).join(', ')})`;
      }

      setSyncResult(msg);
      fetchStatus();
    } catch (error) {
      setSyncResult(`Error: ${String(error)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-8 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!status) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">
          Failed to load pipeline status
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/settings"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Data Pipeline</h1>
              <p className="text-muted-foreground mt-1">
                See exactly how your data flows from sync to insights
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/settings">
                <Button variant="outline">
                  <Key className="h-4 w-4 mr-2" />
                  API Keys
                </Button>
              </Link>
              <Button variant="outline" onClick={fetchStatus}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Pipeline Flow Diagram */}
        <div className="mb-8 p-6 bg-muted/30 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Database className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <div className="font-semibold">1. Data Sync</div>
                <div className="text-sm text-muted-foreground">
                  {status.sync.summary.totalConnected} sources connected
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Brain className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <div className="font-semibold">2. AI Analysis</div>
                <div className="text-sm text-muted-foreground">
                  {status.analysis.analyzed}/{status.analysis.total} analyzed
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Lightbulb className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <div className="font-semibold">3. Insights</div>
                <div className="text-sm text-muted-foreground">
                  {status.intelligence.totalObservations} observations
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Three Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Sync Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-lg">Data Sync</CardTitle>
              </div>
              <CardDescription>What data is being collected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status.sync.connectors.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No connectors configured</p>
                  <Link href="/settings/connectors">
                    <Button size="sm" className="mt-2">
                      Add Connector
                    </Button>
                  </Link>
                </div>
              ) : (
                status.sync.connectors.map((connector) => {
                  const Icon = providerIcons[connector.provider] || Database;
                  return (
                    <div
                      key={connector.id}
                      className="p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">
                            {providerNames[connector.provider] || connector.provider}
                          </span>
                        </div>
                        <Badge
                          className={
                            connector.status === 'CONNECTED'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : connector.status === 'ERROR'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-muted text-muted-foreground'
                          }
                        >
                          {connector.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex justify-between">
                          <span>Total artifacts:</span>
                          <span className="font-medium">{connector.totalArtifacts}</span>
                        </div>
                        {connector.lastSyncAt && (
                          <div className="flex justify-between">
                            <span>Last sync:</span>
                            <span>{new Date(connector.lastSyncAt).toLocaleString()}</span>
                          </div>
                        )}
                        {connector.lastSyncStatus && (
                          <div className="text-xs mt-1 text-muted-foreground/70">
                            {connector.lastSyncStatus}
                          </div>
                        )}
                      </div>
                      {connector.recentArtifacts.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Recent:</div>
                          {connector.recentArtifacts.slice(0, 2).map((artifact) => (
                            <div
                              key={artifact.id}
                              className="text-xs truncate flex items-center gap-1"
                            >
                              {artifact.analyzed ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                              ) : (
                                <Clock className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              )}
                              <span className="truncate">{artifact.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {/* Full Resync All Button */}
              {status.sync.connectors.length > 0 && (
                <Button
                  onClick={handleFullResyncAll}
                  disabled={isSyncing}
                  variant="default"
                  size="sm"
                  className="w-full mb-2"
                >
                  {isSyncing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Full Resync All (30 days)
                    </>
                  )}
                </Button>
              )}
              {syncResult && (
                <div className="text-xs text-center text-muted-foreground mb-2">
                  {syncResult}
                </div>
              )}
              <Link href="/settings/connectors" className="block">
                <Button variant="outline" size="sm" className="w-full">
                  Manage Connectors
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Column 2: Analysis Status */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                <CardTitle className="text-lg">AI Analysis</CardTitle>
              </div>
              <CardDescription>How artifacts are being processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Analysis Progress</span>
                  <span className="font-medium">{status.analysis.percentComplete}%</span>
                </div>
                <Progress value={status.analysis.percentComplete} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{status.analysis.analyzed} analyzed</span>
                  <span>{status.analysis.pending} pending</span>
                </div>
              </div>

              {/* By Type */}
              {status.analysis.byType.length > 0 && (
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-xs text-muted-foreground mb-2">Artifacts by type:</div>
                  <div className="space-y-1">
                    {status.analysis.byType.map((item) => (
                      <div key={item.type} className="flex justify-between text-xs">
                        <span>{item.type.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Artifacts */}
              {status.analysis.pending > 0 && (
                <div className="p-3 rounded-lg border bg-amber-500/5 border-amber-500/20">
                  <div className="flex items-center gap-2 text-amber-600 mb-2">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {status.analysis.pending} pending analysis
                    </span>
                  </div>
                  <div className="space-y-1">
                    {status.analysis.pendingArtifacts.slice(0, 3).map((artifact) => (
                      <div key={artifact.id} className="text-xs truncate">
                        {artifact.title}
                      </div>
                    ))}
                    {status.analysis.pending > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{status.analysis.pending - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Analyze Button */}
              <div className="flex gap-2">
                <Button
                  onClick={handleAnalyzeAll}
                  disabled={isAnalyzing || status.analysis.pending === 0}
                  className="flex-1"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Analyze All Pending ({status.analysis.pending})
                    </>
                  )}
                </Button>

                {isAnalyzing && (
                  <Button
                    onClick={handleStopAnalysis}
                    variant="destructive"
                    className="px-4"
                  >
                    Stop
                  </Button>
                )}
              </div>
              {analyzeResult && (
                <div className="text-xs text-center text-muted-foreground">
                  {analyzeResult}
                </div>
              )}

              {/* BYOLLM Settings Link */}
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">AI Configuration</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Configure your own LLM API keys (Anthropic/OpenAI) for analysis.
                </p>
                <Link href="/settings">
                  <Button variant="outline" size="sm" className="w-full">
                    <Settings className="h-4 w-4 mr-2" />
                    Configure API Keys
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Column 3: Intelligence Output */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-emerald-500" />
                <CardTitle className="text-lg">Intelligence</CardTitle>
              </div>
              <CardDescription>Insights extracted from your data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {status.intelligence.byType.map((item) => (
                  <div key={item.type} className="p-2 rounded-lg bg-muted/50">
                    <div className="text-lg font-bold">{item.count}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.type === 'POSITIVE'
                        ? 'Strengths'
                        : item.type === 'NEGATIVE'
                          ? 'Growth'
                          : 'Missed'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Capacity Coverage */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Capacity Coverage:</div>
                {status.intelligence.capacityCoverage.map((capacity) => {
                  const TrendIcon = trendIcons[capacity.trend] || Clock;
                  return (
                    <div
                      key={capacity.slug}
                      className="flex items-center justify-between p-2 rounded border bg-card"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{capacity.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {capacity.observationCount} observations
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {capacity.score !== null && (
                          <Badge variant="outline" className="text-xs">
                            {capacity.score.toFixed(1)}
                          </Badge>
                        )}
                        <TrendIcon
                          className={`h-4 w-4 ${capacity.trend === 'IMPROVING'
                            ? 'text-emerald-500'
                            : capacity.trend === 'DECLINING'
                              ? 'text-red-500'
                              : 'text-muted-foreground'
                            }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Observations */}
              {status.intelligence.recentObservations.length > 0 && (
                <div className="p-3 rounded-lg border bg-card">
                  <div className="text-xs text-muted-foreground mb-2">Recent observations:</div>
                  <div className="space-y-2">
                    {status.intelligence.recentObservations.slice(0, 3).map((obs) => (
                      <div key={obs.id} className="text-xs">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge className={`${typeColors[obs.type]} text-xs px-1`}>
                            {obs.type}
                          </Badge>
                          <span className="text-muted-foreground truncate">
                            {obs.capacity.name}
                          </span>
                        </div>
                        <div className="truncate">{obs.observation}</div>
                        {obs.evidence && (
                          <div className="text-muted-foreground italic truncate mt-0.5">
                            &quot;{obs.evidence}&quot;
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link href="/insights" className="block">
                <Button variant="outline" size="sm" className="w-full">
                  View Full Insights
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
