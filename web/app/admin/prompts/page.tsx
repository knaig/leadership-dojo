'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/v2/Shell';
import { FileText, Check, Archive, Eye, Plus, ChevronDown, ChevronRight, Save } from 'lucide-react';

interface PromptTemplate {
    id: string;
    name: string;
    version: number;
    content: string;
    firstMessageOptions: string[] | null;
    variables: { name: string; description: string; required: boolean }[] | null;
    maxDurationSeconds: number | null;
    status: string;
    notes: string | null;
    createdAt: string;
}

export default function PromptsPage() {
    const [templates, setTemplates] = useState<Record<string, PromptTemplate[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<PromptTemplate | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [previewResult, setPreviewResult] = useState<string | null>(null);
    const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());

    const fetchTemplates = useCallback(async () => {
        const res = await fetch('/api/admin/prompts');
        const data = await res.json();
        setTemplates(data.templates || {});
        setLoading(false);
    }, []);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    const selectVersion = (t: PromptTemplate) => {
        setSelectedVersion(t);
        setEditContent(t.content);
        setEditNotes('');
        setPreviewResult(null);
    };

    const toggleExpanded = (name: string) => {
        const next = new Set(expandedNames);
        if (next.has(name)) next.delete(name); else next.add(name);
        setExpandedNames(next);
        setSelectedName(name);
        // Auto-select the active version
        const versions = templates[name];
        const active = versions?.find(v => v.status === 'active');
        if (active) selectVersion(active);
    };

    const saveNewVersion = async (activate: boolean) => {
        if (!selectedVersion) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: selectedVersion.name,
                    content: editContent,
                    notes: editNotes || `Edited version`,
                    activate,
                }),
            });
            if (res.ok) {
                await fetchTemplates();
                setEditNotes('');
            }
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (id: string, status: string) => {
        await fetch('/api/admin/prompts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        fetchTemplates();
    };

    const previewPrompt = async () => {
        if (!selectedVersion) return;
        const res = await fetch('/api/admin/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateName: selectedVersion.name }),
        });
        const data = await res.json();
        setPreviewResult(data.assembledPrompt);
    };

    if (loading) {
        return (
            <Shell>
                <div className="p-6 text-muted-foreground">Loading prompts...</div>
            </Shell>
        );
    }

    const names = Object.keys(templates).sort();

    return (
        <Shell>
            <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <FileText size={20} /> Prompt Templates
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {names.length} templates · Edit prompts without code deploys
                    </p>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Template list */}
                    <div className="w-72 border-r border-border overflow-y-auto">
                        {names.map(name => {
                            const versions = templates[name];
                            const active = versions.find(v => v.status === 'active');
                            const isExpanded = expandedNames.has(name);

                            return (
                                <div key={name}>
                                    <button
                                        onClick={() => toggleExpanded(name)}
                                        className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition-colors flex items-center gap-2 ${
                                            selectedName === name ? 'bg-accent' : ''
                                        }`}
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                v{active?.version || '?'} · {versions.length} version{versions.length > 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        {active && (
                                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                                        )}
                                    </button>

                                    {isExpanded && (
                                        <div className="bg-accent/30">
                                            {versions.map(v => (
                                                <button
                                                    key={v.id}
                                                    onClick={() => selectVersion(v)}
                                                    className={`w-full text-left px-6 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2 ${
                                                        selectedVersion?.id === v.id ? 'bg-accent font-medium' : ''
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                                        v.status === 'active' ? 'bg-green-500'
                                                        : v.status === 'draft' ? 'bg-yellow-500'
                                                        : 'bg-gray-400'
                                                    }`} />
                                                    v{v.version} — {v.status}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Right: Editor */}
                    <div className="flex-1 overflow-y-auto">
                        {selectedVersion ? (
                            <div className="p-4 space-y-4">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="font-semibold">{selectedVersion.name} v{selectedVersion.version}</h2>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            Status: <span className={
                                                selectedVersion.status === 'active' ? 'text-green-500'
                                                : selectedVersion.status === 'draft' ? 'text-yellow-500'
                                                : 'text-gray-400'
                                            }>{selectedVersion.status}</span>
                                            {selectedVersion.maxDurationSeconds && ` · Max ${Math.round(selectedVersion.maxDurationSeconds / 60)} min`}
                                            {selectedVersion.notes && ` · ${selectedVersion.notes}`}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={previewPrompt}
                                            className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-1"
                                        >
                                            <Eye size={14} /> Preview
                                        </button>
                                        {selectedVersion.status !== 'active' && (
                                            <button
                                                onClick={() => changeStatus(selectedVersion.id, 'active')}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
                                            >
                                                <Check size={14} /> Activate
                                            </button>
                                        )}
                                        {selectedVersion.status === 'active' && (
                                            <button
                                                onClick={() => changeStatus(selectedVersion.id, 'archived')}
                                                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-1"
                                            >
                                                <Archive size={14} /> Archive
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Variables */}
                                {selectedVersion.variables && (
                                    <div className="text-xs border border-border rounded-lg p-3 bg-card">
                                        <div className="font-medium mb-1.5">Variables</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(selectedVersion.variables as { name: string; required: boolean }[]).map(v => (
                                                <code key={v.name} className={`px-1.5 py-0.5 rounded ${
                                                    v.required ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {'{{' + v.name + '}}'}
                                                </code>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* First message options */}
                                {selectedVersion.firstMessageOptions && (
                                    <div className="text-xs border border-border rounded-lg p-3 bg-card">
                                        <div className="font-medium mb-1.5">First Message Options (random pick)</div>
                                        {(selectedVersion.firstMessageOptions as string[]).map((msg, i) => (
                                            <div key={i} className="py-1 text-muted-foreground font-mono text-[11px]">
                                                {i + 1}. {msg.substring(0, 120)}{msg.length > 120 ? '...' : ''}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Content editor */}
                                <div>
                                    <div className="text-xs font-medium mb-1.5">System Prompt</div>
                                    <textarea
                                        value={editContent}
                                        onChange={e => setEditContent(e.target.value)}
                                        className="w-full h-[400px] p-3 text-xs font-mono bg-card border border-border rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                                        spellCheck={false}
                                    />
                                </div>

                                {/* Save as new version */}
                                {editContent !== selectedVersion.content && (
                                    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
                                        <div className="text-xs font-medium">Save as new version</div>
                                        <input
                                            type="text"
                                            value={editNotes}
                                            onChange={e => setEditNotes(e.target.value)}
                                            placeholder="What changed? (optional)"
                                            className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => saveNewVersion(false)}
                                                disabled={saving}
                                                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-1"
                                            >
                                                <Save size={14} /> Save as Draft
                                            </button>
                                            <button
                                                onClick={() => saveNewVersion(true)}
                                                disabled={saving}
                                                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors flex items-center gap-1"
                                            >
                                                <Plus size={14} /> Save & Activate
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Preview result */}
                                {previewResult && (
                                    <div className="border border-border rounded-lg p-3 bg-card">
                                        <div className="text-xs font-medium mb-1.5">Preview (assembled with sample variables)</div>
                                        <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-[300px] overflow-y-auto">
                                            {previewResult}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                                Select a prompt template to view and edit
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Shell>
    );
}
