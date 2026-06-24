'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface BlueprintMeeting {
    name: string;
    cadence: string;
    keywords: string[];
    importance: 'critical' | 'important' | 'nice-to-have';
}

interface BlueprintCategory {
    category: string;
    meetings: BlueprintMeeting[];
}

const MEETING_BLUEPRINTS: Record<string, BlueprintCategory[]> = {
    VP: [
        { category: 'Managing Up', meetings: [
            { name: 'CEO/CTO 1:1', cadence: 'Weekly', keywords: ['ceo', 'cto', 'c-suite', 'exec 1:1'], importance: 'critical' },
            { name: 'Board Prep', cadence: 'Quarterly', keywords: ['board', 'board prep', 'board review'], importance: 'critical' },
            { name: 'Business Review', cadence: 'Monthly', keywords: ['business review', 'qbr', 'quarterly review'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Directors', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'director'], importance: 'critical' },
            { name: 'Staff Meeting', cadence: 'Weekly', keywords: ['staff', 'leadership team', 'lt meeting'], importance: 'critical' },
            { name: 'Skip-Level 1:1s', cadence: 'Monthly', keywords: ['skip-level', 'skip level'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product-Eng Sync', cadence: 'Weekly', keywords: ['product sync', 'product-eng', 'roadmap'], importance: 'important' },
            { name: 'Architecture Review', cadence: 'Bi-weekly', keywords: ['architecture', 'tech review', 'design review'], importance: 'important' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Strategy Session', cadence: 'Monthly', keywords: ['strategy', 'planning', 'offsites'], importance: 'important' },
            { name: 'Talent Review', cadence: 'Quarterly', keywords: ['talent', 'perf review', 'calibration'], importance: 'nice-to-have' },
        ]},
    ],
    DIRECTOR: [
        { category: 'Managing Up', meetings: [
            { name: 'VP/Head 1:1', cadence: 'Weekly', keywords: ['vp', 'head of', 'exec 1:1', 'director 1:1'], importance: 'critical' },
            { name: 'Leadership Sync', cadence: 'Weekly', keywords: ['leadership', 'lt meeting', 'staff'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Managers', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'manager'], importance: 'critical' },
            { name: 'Team All-Hands', cadence: 'Bi-weekly', keywords: ['all-hands', 'team meeting', 'town hall'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product Sync', cadence: 'Weekly', keywords: ['product', 'pm sync', 'roadmap'], importance: 'important' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'OKR Check-in', cadence: 'Monthly', keywords: ['okr', 'goal', 'objective', 'key result'], importance: 'important' },
        ]},
    ],
    MANAGER: [
        { category: 'Managing Up', meetings: [
            { name: 'Manager 1:1', cadence: 'Weekly', keywords: ['1:1', '1-1', 'director', 'manager 1:1'], importance: 'critical' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Reports', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one'], importance: 'critical' },
            { name: 'Team Standup', cadence: 'Daily', keywords: ['standup', 'stand-up', 'daily', 'scrum'], importance: 'important' },
            { name: 'Retrospective', cadence: 'Bi-weekly', keywords: ['retro', 'retrospective'], importance: 'nice-to-have' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Product Sync', cadence: 'Weekly', keywords: ['product', 'pm', 'roadmap', 'planning'], importance: 'important' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Sprint Planning', cadence: 'Bi-weekly', keywords: ['sprint planning', 'planning'], importance: 'important' },
        ]},
    ],
    FOUNDER: [
        { category: 'Managing Up', meetings: [
            { name: 'Board Meeting', cadence: 'Monthly/Quarterly', keywords: ['board', 'investor', 'advisory'], importance: 'critical' },
            { name: 'Investor Update', cadence: 'Monthly', keywords: ['investor', 'fundraising', 'vc'], importance: 'important' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: '1:1 with Leads', cadence: 'Weekly', keywords: ['1:1', '1-1', 'one on one', 'lead'], importance: 'critical' },
            { name: 'All-Hands', cadence: 'Weekly/Bi-weekly', keywords: ['all-hands', 'town hall', 'company'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Customer Discovery', cadence: 'Weekly', keywords: ['customer', 'user research', 'discovery', 'sales call'], importance: 'critical' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Strategy/Vision', cadence: 'Monthly', keywords: ['strategy', 'vision', 'roadmap', 'planning'], importance: 'important' },
        ]},
    ],
    GENERIC: [
        { category: 'Managing Up', meetings: [
            { name: 'Manager 1:1', cadence: 'Weekly', keywords: ['1:1', '1-1', 'manager', 'sync'], importance: 'critical' },
        ]},
        { category: 'Managing Down', meetings: [
            { name: 'Team Meeting', cadence: 'Weekly', keywords: ['team', 'standup', 'sync', 'all-hands'], importance: 'important' },
        ]},
        { category: 'Cross-Functional', meetings: [
            { name: 'Cross-Team Sync', cadence: 'Weekly', keywords: ['cross-team', 'collaboration', 'product', 'design'], importance: 'nice-to-have' },
        ]},
        { category: 'Strategic', meetings: [
            { name: 'Planning', cadence: 'Bi-weekly', keywords: ['planning', 'strategy', 'okr', 'goal'], importance: 'important' },
        ]},
    ],
};

function getBlueprintKey(title: string | null): string {
    if (!title) return 'GENERIC';
    const t = title.toLowerCase();
    if (/\b(vp|svp|vice president)\b/.test(t)) return 'VP';
    if (/\b(director|head of)\b/.test(t)) return 'DIRECTOR';
    if (/\b(founder|ceo|cto|co-founder)\b/.test(t)) return 'FOUNDER';
    if (/\b(manager|lead|senior manager|engineering manager|em)\b/.test(t)) return 'MANAGER';
    return 'GENERIC';
}

export function MeetingBlueprint() {
    const [data, setData] = useState<{ jobTitle: string | null; meetingTitles: string[] } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tz = new Date().getTimezoneOffset();
        fetch(`/api/today?tz=${tz}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d) {
                    const titles = [
                        ...(d.meetings || []).map((m: any) => m.title?.toLowerCase() || ''),
                        ...(d.weekAhead || []).flatMap((day: any) => (day.meetings || []).map((m: any) => m.title?.toLowerCase() || '')),
                    ];
                    setData({ jobTitle: d.user?.jobTitle || null, meetingTitles: titles });
                }
            })
            .finally(() => setLoading(false));
    }, []);

    if (loading || !data) return null;

    const key = getBlueprintKey(data.jobTitle);
    const blueprint = MEETING_BLUEPRINTS[key] || MEETING_BLUEPRINTS.GENERIC;

    let totalSlots = 0;
    let matchedSlots = 0;

    const results = blueprint.map(cat => ({
        category: cat.category,
        meetings: cat.meetings.map(bm => {
            totalSlots++;
            const found = data.meetingTitles.some(t => bm.keywords.some(kw => t.includes(kw)));
            if (found) {
                matchedSlots++;
                return { ...bm, status: 'matched' as const };
            }
            const partial = data.meetingTitles.some(t => bm.keywords.some(kw => {
                const parts = kw.split(' ');
                return parts.length > 1 && parts.some(p => t.includes(p));
            }));
            if (partial) {
                matchedSlots += 0.5;
                return { ...bm, status: 'partial' as const };
            }
            return { ...bm, status: 'missing' as const };
        }),
    }));

    const coverage = totalSlots > 0 ? Math.round((matchedSlots / totalSlots) * 100) : 0;
    const missingCritical = results.flatMap(c => c.meetings).filter(m => m.status === 'missing' && m.importance === 'critical');

    return (
        <div className="p-6 w-full">
            <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-foreground">Meeting Blueprint</h2>
                <span className="text-xs text-muted-foreground">{key} template</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
                Ideal meeting cadence for your role. {coverage}% coverage this week.
            </p>

            {/* Coverage bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
                <div
                    className={`h-full rounded-full ${coverage >= 70 ? 'bg-emerald-500' : coverage >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${coverage}%` }}
                />
            </div>

            {/* Missing critical meetings */}
            {missingCritical.length > 0 && (
                <div className="border-l-2 border-red-400/60 pl-3 mb-4 py-1">
                    <div className="text-xs font-medium text-red-400 mb-1">Missing critical meetings</div>
                    {missingCritical.map(m => (
                        <div key={m.name} className="text-xs text-muted-foreground">
                            {m.name} ({m.cadence})
                        </div>
                    ))}
                </div>
            )}

            {/* Expandable detail */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mb-3"
            >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {expanded ? 'Hide detail' : 'Show full blueprint'}
            </button>

            {expanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {results.map(cat => (
                        <div key={cat.category}>
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{cat.category}</div>
                            <div className="space-y-1.5">
                                {cat.meetings.map(m => (
                                    <div key={m.name} className="flex items-center gap-2">
                                        {m.status === 'matched' ? (
                                            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                                        ) : m.status === 'partial' ? (
                                            <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                                        ) : (
                                            <Circle size={14} className="text-muted-foreground/30 flex-shrink-0" />
                                        )}
                                        <span className={`text-sm ${m.status === 'missing' ? 'text-muted-foreground' : 'text-foreground'}`}>
                                            {m.name}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground ml-auto">{m.cadence}</span>
                                        {m.importance === 'critical' && m.status === 'missing' && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400">missing</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
