'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/v2/Shell';
import { NetworkGraph } from '@/components/v2/NetworkGraph';
import { EntityDetailPanel } from '@/components/knowledge/EntityDetailPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Brain, Users, Network, Search,
  Loader2, ChevronRight, Activity,
} from 'lucide-react';

// Entity type → color mapping
const TYPE_CONFIG: Record<string, { color: string; label: string; bgClass: string }> = {
  PERSON: { color: '#3b82f6', label: 'Person', bgClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  PROJECT: { color: '#f59e0b', label: 'Project', bgClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  TOPIC: { color: '#10b981', label: 'Topic', bgClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  MEETING_SERIES: { color: '#8b5cf6', label: 'Meeting', bgClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  SKILL: { color: '#ec4899', label: 'Skill', bgClass: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  TEAM: { color: '#06b6d4', label: 'Team', bgClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  ORGANIZATION: { color: '#f97316', label: 'Org', bgClass: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  GOAL: { color: '#84cc16', label: 'Goal', bgClass: 'bg-lime-500/20 text-lime-400 border-lime-500/30' },
  DOCUMENT: { color: '#6b7280', label: 'Doc', bgClass: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

interface GraphNode {
  id: string;
  name: string;
  type: string;
  factCount: number;
  communityIds: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  confidence: number;
}

interface Entity {
  id: string;
  name: string;
  type: string;
  factCount: number;
  topFacts: Array<{
    id: string;
    predicate: string;
    objectValue: string | null;
    objectEntityName: string | null;
    confidence: number;
    source: string;
  }>;
  communities: Array<{ id: string; name: string }>;
  updatedAt: string;
}

interface Community {
  id: string;
  name: string;
  summary: string | null;
  level: number;
  entityCount: number;
  factCount: number;
  activityScore: number;
  memberPreview: Array<{ name: string; type: string; role: string | null }>;
  lastAnalyzedAt: string | null;
}

export default function KnowledgeGraphPage() {
  const [tab, setTab] = useState('graph');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Graph state
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] } | null>(null);
  const [stats, setStats] = useState<{ entityCount: number; factCount: number; communityCount: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  // Entities state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitiesTotal, setEntitiesTotal] = useState(0);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string | null>(null);
  const [entitySearch, setEntitySearch] = useState('');

  // Communities state
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [expandedCommunity, setExpandedCommunity] = useState<string | null>(null);

  // Fetch graph data on mount
  useEffect(() => {
    fetchGraph();
  }, []);

  const fetchGraph = async () => {
    setGraphLoading(true);
    try {
      const res = await fetch('/api/knowledge/graph');
      if (res.ok) {
        const json = await res.json();
        setStats(json.stats);

        // Transform for NetworkGraph component
        const nodes = json.nodes.map((n: GraphNode) => ({
          id: n.id,
          name: n.name,
          val: 5 + Math.min(n.factCount * 2, 20),
          color: TYPE_CONFIG[n.type]?.color || '#6b7280',
          type: n.type,
          factCount: n.factCount,
        }));

        const links = json.edges.map((e: GraphEdge) => ({
          source: e.source,
          target: e.target,
          value: Math.max(e.confidence * 3, 0.5),
          predicate: e.predicate,
        }));

        setGraphData({ nodes, links });
      }
    } catch (e) {
      console.error('Failed to fetch graph:', e);
    } finally {
      setGraphLoading(false);
    }
  };

  // Fetch entities when tab changes or filters change
  useEffect(() => {
    if (tab === 'entities') fetchEntities();
  }, [tab, entityTypeFilter, entitySearch]);

  const fetchEntities = async () => {
    setEntitiesLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityTypeFilter) params.set('type', entityTypeFilter);
      if (entitySearch) params.set('search', entitySearch);
      params.set('limit', '50');

      const res = await fetch(`/api/knowledge/entities?${params}`);
      if (res.ok) {
        const json = await res.json();
        setEntities(json.entities);
        setEntitiesTotal(json.total);
      }
    } catch (e) {
      console.error('Failed to fetch entities:', e);
    } finally {
      setEntitiesLoading(false);
    }
  };

  // Fetch communities when tab changes
  useEffect(() => {
    if (tab === 'communities') fetchCommunities();
  }, [tab]);

  const fetchCommunities = async () => {
    setCommunitiesLoading(true);
    try {
      const res = await fetch('/api/knowledge/communities');
      if (res.ok) {
        const json = await res.json();
        setCommunities(json.communities);
      }
    } catch (e) {
      console.error('Failed to fetch communities:', e);
    } finally {
      setCommunitiesLoading(false);
    }
  };

  const handleNodeClick = useCallback((node: any) => {
    setSelectedEntityId(node.id);
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Shell>
      <div className="p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Knowledge Graph</h1>
              <p className="text-muted-foreground">
                Entities, relationships, and communities extracted from your work context.
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2 text-sm">
                <Brain className="h-4 w-4 text-blue-400" />
                <span className="text-white font-medium">{stats.entityCount}</span>
                <span className="text-muted-foreground">entities</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Network className="h-4 w-4 text-emerald-400" />
                <span className="text-white font-medium">{stats.factCount}</span>
                <span className="text-muted-foreground">facts</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-purple-400" />
                <span className="text-white font-medium">{stats.communityCount}</span>
                <span className="text-muted-foreground">communities</span>
              </div>
            </div>
          )}
        </header>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted border border-border mb-6">
            <TabsTrigger value="graph">Graph</TabsTrigger>
            <TabsTrigger value="entities">Entities</TabsTrigger>
            <TabsTrigger value="communities">Communities</TabsTrigger>
          </TabsList>

          {/* Graph Tab */}
          <TabsContent value="graph">
            {graphLoading ? (
              <div className="h-[600px] flex items-center justify-center border border-dashed border-border rounded-xl">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading knowledge graph...
                </div>
              </div>
            ) : graphData && graphData.nodes.length > 0 ? (
              <div className="relative">
                <div className="h-[600px] border border-border rounded-xl overflow-hidden">
                  <NetworkGraph data={graphData} onNodeClick={handleNodeClick} />
                </div>
                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-10 bg-black/60 backdrop-blur-md p-3 rounded-lg border border-border text-xs">
                  <div className="font-semibold mb-2 text-muted-foreground">Entity Types</div>
                  {Object.entries(TYPE_CONFIG).map(([type, config]) => (
                    <div key={type} className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                      <span className="text-gray-300">{config.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[400px] flex items-center justify-center border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-lg font-medium text-white mb-1">No entities yet</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Knowledge entities are automatically extracted from your meetings, emails, and documents.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Entities Tab */}
          <TabsContent value="entities">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search entities..."
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  className="pl-10 bg-muted border-border"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={entityTypeFilter === null ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEntityTypeFilter(null)}
                  className={entityTypeFilter === null ? 'bg-blue-600 hover:bg-blue-700' : ''}
                >
                  All
                </Button>
                {Object.entries(TYPE_CONFIG).map(([type, config]) => (
                  <Button
                    key={type}
                    variant={entityTypeFilter === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEntityTypeFilter(type)}
                    className={entityTypeFilter === type ? 'bg-blue-600 hover:bg-blue-700' : ''}
                  >
                    {config.label}
                  </Button>
                ))}
              </div>
            </div>

            {entitiesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : entities.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Showing {entities.length} of {entitiesTotal} entities
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {entities.map((entity) => (
                    <Card
                      key={entity.id}
                      className="bg-muted border-border hover:border-blue-500/30 transition-colors cursor-pointer group"
                      onClick={() => setSelectedEntityId(entity.id)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                              {entity.name}
                            </h3>
                            <Badge variant="outline" className={`mt-1 text-[10px] ${TYPE_CONFIG[entity.type]?.bgClass || ''}`}>
                              {TYPE_CONFIG[entity.type]?.label || entity.type}
                            </Badge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-400 transition-colors flex-shrink-0 mt-1" />
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                          <span>{entity.factCount} facts</span>
                          {entity.communities.length > 0 && (
                            <span>{entity.communities[0].name}</span>
                          )}
                        </div>

                        {entity.topFacts.length > 0 && (
                          <div className="space-y-1">
                            {entity.topFacts.slice(0, 2).map((f) => (
                              <p key={f.id} className="text-xs text-gray-400 truncate">
                                <span className="text-gray-500">{f.predicate.replace(/_/g, ' ')}:</span>{' '}
                                {f.objectEntityName || f.objectValue || '—'}
                              </p>
                            ))}
                          </div>
                        )}

                        <p className="text-[10px] text-gray-600 mt-3">
                          Updated {formatDate(entity.updatedAt)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[300px] flex items-center justify-center border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-white font-medium mb-1">No entities found</p>
                  <p className="text-sm text-muted-foreground">
                    {entitySearch || entityTypeFilter ? 'Try adjusting your filters.' : 'Entities will appear as your data is processed.'}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Communities Tab */}
          <TabsContent value="communities">
            {communitiesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
                ))}
              </div>
            ) : communities.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {communities.map((community) => (
                  <Card
                    key={community.id}
                    className="bg-muted border-border hover:border-purple-500/30 transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedCommunity(expandedCommunity === community.id ? null : community.id)
                    }
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-base font-semibold text-white">{community.name}</h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Activity className="h-3 w-3" />
                          {community.activityScore.toFixed(1)}
                        </div>
                      </div>

                      {community.summary && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {community.summary}
                        </p>
                      )}

                      <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                        <span>{community.entityCount} entities</span>
                        <span>{community.factCount} facts</span>
                        {community.level > 0 && <span>Level {community.level}</span>}
                      </div>

                      {/* Member preview */}
                      <div className="flex flex-wrap gap-1.5">
                        {community.memberPreview.map((m, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={`text-[10px] ${TYPE_CONFIG[m.type]?.bgClass || ''}`}
                          >
                            {m.name}
                            {m.role && (
                              <span className="ml-1 opacity-60">({m.role})</span>
                            )}
                          </Badge>
                        ))}
                      </div>

                      {community.lastAnalyzedAt && (
                        <p className="text-[10px] text-gray-600 mt-3">
                          Analyzed {formatDate(community.lastAnalyzedAt)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center border border-dashed border-border rounded-xl">
                <div className="text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-white font-medium mb-1">No communities detected yet</p>
                  <p className="text-sm text-muted-foreground">
                    Communities are automatically discovered as more entities and relationships are extracted.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Entity Detail Panel */}
      {selectedEntityId && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedEntityId(null)}
          />
          <EntityDetailPanel
            entityId={selectedEntityId}
            onClose={() => setSelectedEntityId(null)}
            onEntityClick={(id) => setSelectedEntityId(id)}
          />
        </>
      )}
    </Shell>
  );
}
