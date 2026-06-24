'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shell } from '@/components/v2/Shell';
import { Settings, Save, Plus, History } from 'lucide-react';

interface ConversationConfig {
    id: string;
    version: number;
    confidenceThresholds: Record<string, unknown>;
    adaptationRules: Record<string, unknown>;
    maturityTransitions: Record<string, unknown>;
    voiceOverrides: Record<string, unknown>;
    guardrails: Record<string, unknown>;
    status: string;
    notes: string | null;
    createdAt: string;
}

export default function ConfigPage() {
    const [active, setActive] = useState<ConversationConfig | null>(null);
    const [history, setHistory] = useState<ConversationConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [editSection, setEditSection] = useState<string>('confidenceThresholds');
    const [editJson, setEditJson] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [jsonError, setJsonError] = useState('');

    const fetchConfig = useCallback(async () => {
        const res = await fetch('/api/admin/config');
        const data = await res.json();
        setActive(data.active || null);
        setHistory(data.history || []);
        setLoading(false);
        if (data.active) {
            setEditJson(JSON.stringify(
                data.active[editSection as keyof ConversationConfig] || {},
                null, 2
            ));
        }
    }, [editSection]);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const switchSection = (section: string) => {
        setEditSection(section);
        if (active) {
            setEditJson(JSON.stringify(
                active[section as keyof ConversationConfig] || {},
                null, 2
            ));
        }
        setJsonError('');
    };

    const validateJson = (text: string): boolean => {
        try {
            JSON.parse(text);
            setJsonError('');
            return true;
        } catch (e) {
            setJsonError((e as Error).message);
            return false;
        }
    };

    const saveConfig = async (activate: boolean) => {
        if (!validateJson(editJson)) return;
        setSaving(true);
        try {
            const parsed = JSON.parse(editJson);
            const body: Record<string, unknown> = {
                [editSection]: parsed,
                notes: editNotes || `Updated ${editSection}`,
                activate,
            };

            // Carry forward unchanged sections from active config
            if (active) {
                const sections = ['confidenceThresholds', 'adaptationRules', 'maturityTransitions', 'voiceOverrides', 'guardrails'];
                for (const s of sections) {
                    if (s !== editSection) {
                        body[s] = active[s as keyof ConversationConfig];
                    }
                }
            }

            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                await fetchConfig();
                setEditNotes('');
            }
        } finally {
            setSaving(false);
        }
    };

    const sections = [
        { key: 'confidenceThresholds', label: 'Confidence Thresholds', desc: 'SILENT/PROBE/SUGGEST/ASSERT tier boundaries per archetype' },
        { key: 'adaptationRules', label: 'Adaptation Rules', desc: 'Behavioral signal definitions and mode lean thresholds' },
        { key: 'maturityTransitions', label: 'Maturity Transitions', desc: 'LEARNING → OBSERVING → COACHING trigger conditions' },
        { key: 'voiceOverrides', label: 'Voice Overrides', desc: 'Speed, temperature, silence timeout per context/archetype' },
        { key: 'guardrails', label: 'Guardrails', desc: 'Closed-world rules, ban list, specificity test, personal rules' },
    ];

    if (loading) {
        return <Shell><div className="p-6 text-muted-foreground">Loading config...</div></Shell>;
    }

    return (
        <Shell>
            <div className="flex flex-col h-full">
                <div className="p-4 border-b border-border">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <Settings size={20} /> Conversation Config
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Active: v{active?.version || '—'} · {history.length} version{history.length !== 1 ? 's' : ''}
                    </p>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Sections */}
                    <div className="w-64 border-r border-border overflow-y-auto">
                        <div className="p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Config Sections
                        </div>
                        {sections.map(s => (
                            <button
                                key={s.key}
                                onClick={() => switchSection(s.key)}
                                className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition-colors ${
                                    editSection === s.key ? 'bg-accent' : ''
                                }`}
                            >
                                <div className="text-sm font-medium">{s.label}</div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
                            </button>
                        ))}

                        <div className="p-2 mt-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            <History size={12} className="inline mr-1" /> Version History
                        </div>
                        {history.map(h => (
                            <button
                                key={h.id}
                                onClick={() => {
                                    setEditJson(JSON.stringify(
                                        h[editSection as keyof ConversationConfig] || {},
                                        null, 2
                                    ));
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors"
                            >
                                <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${
                                    h.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                                }`} />
                                v{h.version} — {h.status}
                                {h.notes && <span className="text-muted-foreground ml-1">({h.notes})</span>}
                            </button>
                        ))}
                    </div>

                    {/* Right: Editor */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <div className="text-sm font-medium">
                            {sections.find(s => s.key === editSection)?.label}
                        </div>

                        <textarea
                            value={editJson}
                            onChange={e => {
                                setEditJson(e.target.value);
                                validateJson(e.target.value);
                            }}
                            className="w-full h-[450px] p-3 text-xs font-mono bg-card border border-border rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                            spellCheck={false}
                        />

                        {jsonError && (
                            <div className="text-xs text-red-500 p-2 border border-red-500/30 rounded bg-red-500/5">
                                Invalid JSON: {jsonError}
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                placeholder="What changed? (optional)"
                                className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                                onClick={() => saveConfig(false)}
                                disabled={saving || !!jsonError}
                                className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                <Save size={14} /> Save Draft
                            </button>
                            <button
                                onClick={() => saveConfig(true)}
                                disabled={saving || !!jsonError}
                                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                                <Plus size={14} /> Save & Activate
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Shell>
    );
}
