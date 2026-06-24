'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/v2/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  FileText,
  Plus,
  Trash2,
  Activity,
  Users,
  Target,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  orgId: string | null;
  org: { name: string } | null;
  healthScore: string | null;
  startDate: string | null;
  endDate: string | null;
  risks: any;
  userNotes: string | null;
  resources: Resource[];
  objectives: any[];
  _count: { facts: number };
}

interface Resource {
  id: string;
  sourceType: string;
  externalId: string;
  name: string;
  url: string | null;
  lastSyncAt: string | null;
  syncStatus: string | null;
}

interface ActivityFact {
  id: string;
  subjectName: string;
  predicate: string;
  objectName?: string;
  objectValue?: string;
  confidence: number;
  source: string;
  recordedAt: string;
}

interface ProjectPerson {
  entityId: string;
  name: string;
  factCount: number;
  predicates: string[];
}

const sourceTypeIcons: Record<string, any> = {
  GITHUB_REPO: GitBranch,
  DRIVE_FOLDER: FileText,
};

const sourceTypeLabels: Record<string, string> = {
  GITHUB_REPO: 'GitHub',
  DRIVE_FOLDER: 'Drive',
  SLACK_CHANNEL: 'Slack',
  JIRA_PROJECT: 'Jira',
  LINEAR_PROJECT: 'Linear',
  NOTION_DATABASE: 'Notion',
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [activity, setActivity] = useState<ActivityFact[]>([]);
  const [people, setPeople] = useState<ProjectPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResource, setNewResource] = useState({ sourceType: 'GITHUB_REPO', externalId: '', name: '' });

  useEffect(() => {
    fetchProject();
    fetchActivity();
    fetchPeople();
  }, [id]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) setProject(await res.json());
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActivity = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/activity`);
      if (res.ok) {
        const data = await res.json();
        setActivity(data.facts || []);
      }
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    }
  };

  const fetchPeople = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/people`);
      if (res.ok) {
        const data = await res.json();
        setPeople(data.people || []);
      }
    } catch (error) {
      console.error('Failed to fetch people:', error);
    }
  };

  const handleAddResource = async () => {
    if (!newResource.externalId.trim() || !newResource.name.trim()) return;
    try {
      const res = await fetch(`/api/projects/${id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newResource),
      });
      if (res.ok) {
        setShowAddResource(false);
        setNewResource({ sourceType: 'GITHUB_REPO', externalId: '', name: '' });
        fetchProject();
      }
    } catch (error) {
      console.error('Failed to add resource:', error);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!confirm('Remove this resource?')) return;
    try {
      await fetch(`/api/projects/${id}/resources/${resourceId}`, { method: 'DELETE' });
      fetchProject();
    } catch (error) {
      console.error('Failed to delete resource:', error);
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="p-6 max-w-5xl mx-auto text-center py-12 text-muted-foreground">
          Loading project...
        </div>
      </Shell>
    );
  }

  if (!project) {
    return (
      <Shell>
        <div className="p-6 max-w-5xl mx-auto text-center py-12">
          <h2 className="text-lg font-semibold">Project not found</h2>
          <Link href="/v2/projects">
            <Button variant="outline" className="mt-4">Back to Projects</Button>
          </Link>
        </div>
      </Shell>
    );
  }

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-500',
    ON_HOLD: 'bg-amber-500/10 text-amber-500',
    COMPLETED: 'bg-blue-500/10 text-blue-500',
    ARCHIVED: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <Shell>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/v2/projects"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{project.name}</h1>
                <Badge className={statusColors[project.status] || ''}>
                  {project.status.replace('_', ' ')}
                </Badge>
              </div>
              {project.org && (
                <p className="text-muted-foreground mt-1">{project.org.name}</p>
              )}
              {project.description && (
                <p className="text-sm text-muted-foreground mt-2">{project.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Resources Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                Connected Resources
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddResource(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Resource
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {project.resources.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No resources connected yet. Add a GitHub repo or Drive folder.
              </p>
            ) : (
              <div className="space-y-3">
                {project.resources.map((resource) => {
                  const Icon = sourceTypeIcons[resource.sourceType] || ExternalLink;
                  return (
                    <div key={resource.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">{resource.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {sourceTypeLabels[resource.sourceType] || resource.sourceType} &middot; {resource.externalId}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {resource.lastSyncAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(resource.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                        {resource.url && (
                          <a href={resource.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteResource(resource.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* People Section */}
        {people.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                People ({people.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {people.map((person) => (
                  <div key={person.entityId} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm">{person.name}</div>
                      <div className="flex gap-1 mt-1">
                        {person.predicates.slice(0, 3).map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {p.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{person.factCount} facts</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity Feed */}
        {activity.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activity.slice(0, 20).map((fact) => (
                  <div key={fact.id} className="flex items-start gap-3 p-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{fact.subjectName}</span>
                        {' '}
                        <span className="text-muted-foreground">{fact.predicate.replace(/_/g, ' ')}</span>
                        {' '}
                        {(fact.objectName || fact.objectValue) && (
                          <span className="font-medium">{fact.objectName || fact.objectValue}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {fact.source.replace('INFERRED_', '').toLowerCase()} &middot; {new Date(fact.recordedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Objectives */}
        {project.objectives.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                Objectives ({project.objectives.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {project.objectives.map((obj: any) => (
                  <div key={obj.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="font-medium text-sm">{obj.title}</div>
                      {obj.description && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{obj.description}</div>
                      )}
                    </div>
                    <Badge variant="secondary">{obj.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Resource Modal */}
        {showAddResource && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Add Resource</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddResource(false)}>
                    &times;
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Type</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newResource.sourceType}
                    onChange={(e) => setNewResource({ ...newResource, sourceType: e.target.value })}
                  >
                    <option value="GITHUB_REPO">GitHub Repository</option>
                    <option value="DRIVE_FOLDER">Google Drive Folder</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {newResource.sourceType === 'GITHUB_REPO' ? 'Repository (owner/repo)' : 'Folder ID or URL'}
                  </label>
                  <Input
                    placeholder={newResource.sourceType === 'GITHUB_REPO' ? 'octocat/hello-world' : 'Drive folder ID'}
                    value={newResource.externalId}
                    onChange={(e) => setNewResource({ ...newResource, externalId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Display Name</label>
                  <Input
                    placeholder="My Project Repo"
                    value={newResource.name}
                    onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowAddResource(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddResource}
                    disabled={!newResource.externalId.trim() || !newResource.name.trim()}
                  >
                    Add Resource
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
