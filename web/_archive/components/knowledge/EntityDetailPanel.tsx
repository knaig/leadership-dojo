'use client';

import { useState, useEffect } from 'react';
import { X, Check, XCircle, ExternalLink, ArrowRight, ArrowLeft, Shield, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface Fact {
  id: string;
  predicate: string;
  objectEntity?: { id: string; name: string; type: string } | null;
  objectValue?: string | null;
  confidence: number;
  source: string;
  validFrom: string;
  validTo: string | null;
  userVerified: boolean | null;
  direction: 'outgoing' | 'incoming';
}

interface Community {
  id: string;
  name: string;
  summary: string | null;
  role: string | null;
  entityCount: number;
}

interface RelatedEntity {
  id: string;
  name: string;
  type: string;
}

interface EntityDetail {
  entity: {
    id: string;
    name: string;
    type: string;
    properties: any;
  };
  facts: Fact[];
  communities: Community[];
  relatedEntities: RelatedEntity[];
}

const TYPE_COLORS: Record<string, string> = {
  PERSON: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PROJECT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  TOPIC: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  MEETING_SERIES: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  SKILL: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  TEAM: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  ORGANIZATION: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  GOAL: 'bg-lime-500/20 text-lime-400 border-lime-500/30',
  DOCUMENT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const SOURCE_LABELS: Record<string, string> = {
  USER_STATED: 'User Stated',
  INFERRED_MEETING: 'Meeting',
  INFERRED_EMAIL: 'Email',
  INFERRED_DOCUMENT: 'Document',
  INFERRED_CHAT: 'Chat',
  SYSTEM_DERIVED: 'System',
  MIGRATED: 'Migrated',
};

interface EntityDetailPanelProps {
  entityId: string;
  onClose: () => void;
  onEntityClick?: (entityId: string) => void;
}

export function EntityDetailPanel({ entityId, onClose, onEntityClick }: EntityDetailPanelProps) {
  const [data, setData] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    fetchEntity();
  }, [entityId]);

  const fetchEntity = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/entities/${entityId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch entity:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (factId: string, verified: boolean) => {
    setVerifying(factId);
    try {
      const res = await fetch(`/api/knowledge/facts/${factId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified }),
      });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            facts: prev.facts.map((f) =>
              f.id === factId ? { ...f, userVerified: verified } : f
            ),
          };
        });
      }
    } catch (e) {
      console.error('Failed to verify fact:', e);
    } finally {
      setVerifying(null);
    }
  };

  // Group facts by predicate
  const groupedFacts = data?.facts.reduce<Record<string, Fact[]>>((acc, fact) => {
    const key = fact.predicate;
    if (!acc[key]) acc[key] = [];
    acc[key].push(fact);
    return acc;
  }, {}) || {};

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 bg-background border-l border-border shadow-2xl shadow-black/50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="h-7 w-48 bg-muted animate-pulse rounded" />
          ) : data ? (
            <>
              <h2 className="text-xl font-bold text-white truncate">{data.entity.name}</h2>
              <Badge variant="outline" className={`mt-1 ${TYPE_COLORS[data.entity.type] || ''}`}>
                {data.entity.type.replace('_', ' ')}
              </Badge>
            </>
          ) : (
            <p className="text-muted-foreground">Entity not found</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-muted-foreground hover:text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Facts Section */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Facts ({data.facts.length})
              </h3>
              {Object.keys(groupedFacts).length === 0 ? (
                <p className="text-sm text-muted-foreground">No facts recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedFacts).map(([predicate, facts]) => (
                    <div key={predicate}>
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        {predicate.replace(/_/g, ' ')}
                      </p>
                      <div className="space-y-2">
                        {facts.map((fact) => (
                          <Card key={fact.id} className="bg-muted border-border">
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {fact.direction === 'outgoing' ? (
                                      <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    ) : (
                                      <ArrowLeft className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    )}
                                    <span className="text-sm text-white truncate">
                                      {fact.objectEntity?.name || fact.objectValue || '—'}
                                    </span>
                                  </div>
                                  {/* Confidence bar */}
                                  <div className="flex items-center gap-2 mt-2">
                                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${fact.confidence * 100}%`,
                                          backgroundColor:
                                            fact.confidence > 0.7
                                              ? '#10b981'
                                              : fact.confidence > 0.4
                                                ? '#f59e0b'
                                                : '#ef4444',
                                        }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                      {Math.round(fact.confidence * 100)}%
                                    </span>
                                  </div>
                                  {/* Source + temporal info */}
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {SOURCE_LABELS[fact.source] || fact.source}
                                    </Badge>
                                    {fact.validTo && (
                                      <span className="text-[10px] text-red-400">Expired</span>
                                    )}
                                    {fact.userVerified === true && (
                                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 py-0">
                                        <Check className="h-2.5 w-2.5 mr-0.5" /> Confirmed
                                      </Badge>
                                    )}
                                    {fact.userVerified === false && (
                                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
                                        <XCircle className="h-2.5 w-2.5 mr-0.5" /> Denied
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                {/* Verify/Deny buttons */}
                                <div className="flex gap-1 flex-shrink-0">
                                  {verifying === fact.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => handleVerify(fact.id, true)}
                                        className={`h-7 w-7 ${fact.userVerified === true ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'}`}
                                        title="Confirm fact"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => handleVerify(fact.id, false)}
                                        className={`h-7 w-7 ${fact.userVerified === false ? 'text-red-400' : 'text-muted-foreground hover:text-red-400'}`}
                                        title="Deny fact"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Communities Section */}
            {data.communities.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Communities ({data.communities.length})
                </h3>
                <div className="space-y-2">
                  {data.communities.map((c) => (
                    <Card key={c.id} className="bg-muted border-border">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{c.name}</p>
                            {c.summary && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {c.summary}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {c.role && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {c.role}
                              </Badge>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {c.entityCount} members
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Related Entities */}
            {data.relatedEntities.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Related Entities ({data.relatedEntities.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {data.relatedEntities.map((re) => (
                    <button
                      key={re.id}
                      onClick={() => onEntityClick?.(re.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted border border-border text-sm text-white hover:border-blue-500/50 transition-colors"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            re.type === 'PERSON' ? '#3b82f6' :
                            re.type === 'PROJECT' ? '#f59e0b' :
                            re.type === 'TOPIC' ? '#10b981' :
                            re.type === 'MEETING_SERIES' ? '#8b5cf6' :
                            '#6b7280',
                        }}
                      />
                      {re.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
