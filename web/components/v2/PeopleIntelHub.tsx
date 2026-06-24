'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Users, Search, Plus, X, ChevronRight, ArrowRight,
    LayoutGrid, GitBranch, Building2, UserPlus,
    Calendar, Trash2, ChevronDown, Edit2, Check, Lightbulb
} from 'lucide-react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface PersonIntel {
    id: string;
    name: string;
    role: string | null;
    personaArchetype: string | null;
    communicationStyle: string | null;
    decisionStyle: string | null;
    riskTolerance: string | null;
    primaryMotivation: string | null;
    fears: string[];
    archetype: string | null;
    politicalStance: string | null;
    communicationTone: string | null;
    relationshipStrength: number;
    powerLevel: string;
    influenceRole: string | null;
    organization?: string | null;
    email?: string | null;
    intelligence: {
        profileSummary: string | null;
        successPatterns: string[];
        objectionPatterns: string[];
        failurePatterns: string[];
        recentTopics: string[];
        currentMood: string | null;
        decisionMakingNotes: string | null;
        evidenceCount: number;
    } | null;
    meetingContext: string;
}

// ═══════════════════════════════════════════════════════
// ARCHETYPE CONFIG
// ═══════════════════════════════════════════════════════

const ARCHETYPE_PLAYBOOK: Record<string, { emoji: string; label: string; brief: string; doThis: string; dontDoThis: string }> = {
    DRIVER: { emoji: '🎯', label: 'Driver', brief: 'Results-first, decisive, impatient with process', doThis: 'Lead with outcomes, be concise, show ROI', dontDoThis: 'Ramble, bury the ask, bring problems without solutions' },
    ANALYST: { emoji: '📊', label: 'Analyst', brief: 'Data-driven, methodical, cautious about claims', doThis: 'Bring evidence, give them time to process, be precise', dontDoThis: 'Use vague claims, rush decisions, skip the details' },
    COLLABORATOR: { emoji: '🤝', label: 'Collaborator', brief: 'Consensus-seeking, values inclusion and harmony', doThis: 'Include them early, validate input, build agreement', dontDoThis: 'Steamroll, decide without consulting, create us-vs-them' },
    VISIONARY: { emoji: '🔭', label: 'Visionary', brief: 'Big-picture thinker, inspired by possibility', doThis: 'Connect to vision, show long-term impact, be bold', dontDoThis: 'Get lost in minutiae, focus only on risks, be incremental' },
    GUARDIAN: { emoji: '🛡️', label: 'Guardian', brief: 'Risk-averse, protective of team and process', doThis: 'Show safety nets, propose incremental steps, respect tradition', dontDoThis: 'Propose radical change, dismiss concerns, move too fast' },
    POLITICIAN: { emoji: '♟️', label: 'Politician', brief: 'Influence-driven, strategic, reads the room', doThis: 'Understand their agenda, find mutual wins, give them credit', dontDoThis: 'Challenge publicly, ignore their network, be naive about motives' },
    CHAMPION: { emoji: '📣', label: 'Champion', brief: 'Enthusiastic advocate, amplifies what they believe in', doThis: 'Give them something to champion, share early, public credit', dontDoThis: 'Keep them out of the loop, be cynical, undermine their enthusiasm' },
    PRAGMATIST: { emoji: '⚙️', label: 'Pragmatist', brief: 'Practical, ROI-focused, wants concrete next steps', doThis: 'Show ROI, be specific about timelines, start small', dontDoThis: 'Be abstract, promise the moon, skip implementation details' },
    SKEPTIC: { emoji: '🔍', label: 'Skeptic', brief: 'Questions everything, needs proof before commitment', doThis: 'Welcome objections, provide evidence, earn trust gradually', dontDoThis: 'Dismiss concerns, ask for blind trust, take shortcuts' },
    CONSERVATIVE: { emoji: '⚓', label: 'Conservative', brief: 'Values stability, prefers proven approaches', doThis: 'Change slowly, show precedent, respect what exists', dontDoThis: 'Propose disruption, dismiss history, force urgency' },
    OPERATOR: { emoji: '📋', label: 'Operator', brief: 'Process-focused, reliable, detail-oriented', doThis: 'Be structured, respect their systems, follow up in writing', dontDoThis: 'Be disorganized, skip steps, change plans frequently' },
};

const STANCE_COLORS: Record<string, string> = {
    CHAMPION: 'bg-emerald-500',
    SUPPORTIVE: 'bg-emerald-400',
    NEUTRAL: 'bg-gray-400',
    SKEPTIC: 'bg-amber-500',
    HOSTILE: 'bg-red-400',
    UNKNOWN: 'bg-gray-300',
};

// ═══════════════════════════════════════════════════════
// NARRATIVE SYNTHESIS
// ═══════════════════════════════════════════════════════

function synthesizeWhisper(person: PersonIntel): string {
    const firstName = person.name.split(' ')[0];
    const archetype = person.personaArchetype ? ARCHETYPE_PLAYBOOK[person.personaArchetype] : null;
    const intel = person.intelligence;
    const parts: string[] = [];

    if (archetype) {
        const traitMap: Record<string, string> = {
            DRIVER: `Moves fast, values directness`,
            ANALYST: `Needs data before committing`,
            COLLABORATOR: `Wants everyone heard`,
            VISIONARY: `Thinks in big arcs`,
            GUARDIAN: `Protects what works`,
            POLITICIAN: `Always reading the room`,
            CHAMPION: `Will amplify what they believe in`,
            PRAGMATIST: `Cuts through fluff`,
            SKEPTIC: `Will poke holes`,
            CONSERVATIVE: `Trusts precedent`,
            OPERATOR: `Respects process`,
        };
        parts.push(traitMap[person.personaArchetype!] || archetype.brief);
    }

    if (intel?.successPatterns?.[0]) {
        parts.push(intel.successPatterns[0]);
    } else if (archetype) {
        parts.push(archetype.doThis.split(',')[0].trim());
    }

    return parts.length > 0 ? parts.join('. ') : (intel?.profileSummary || `${person.role || firstName}`);
}

function confidenceNarrative(n: number): string {
    if (n >= 15) return 'Deep intel';
    if (n >= 8) return `${n} data points`;
    if (n >= 3) return `${n} interactions`;
    if (n >= 1) return 'Limited data';
    return 'Inferred';
}

// ═══════════════════════════════════════════════════════
// ORG GROUPING
// ═══════════════════════════════════════════════════════

interface OrgGroup {
    name: string;
    people: PersonIntel[];
}

function groupByOrg(people: PersonIntel[]): OrgGroup[] {
    const orgMap = new Map<string, PersonIntel[]>();
    const ungrouped: PersonIntel[] = [];

    for (const p of people) {
        const org = p.organization?.trim();
        if (org) {
            if (!orgMap.has(org)) orgMap.set(org, []);
            orgMap.get(org)!.push(p);
        } else {
            ungrouped.push(p);
        }
    }

    const groups: OrgGroup[] = [];
    for (const [name, members] of orgMap) {
        groups.push({ name, people: members });
    }
    // Sort orgs by number of people descending
    groups.sort((a, b) => b.people.length - a.people.length);
    if (ungrouped.length > 0) {
        groups.push({ name: 'Uncategorized', people: ungrouped });
    }
    return groups;
}

// ═══════════════════════════════════════════════════════
// MINI RELATIONSHIP GRAPH — SVG radial layout
// ═══════════════════════════════════════════════════════

function RelationshipGraph({ people, onPersonClick }: { people: PersonIntel[]; onPersonClick?: (id: string) => void }) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const size = 320;
    const cx = size / 2;
    const cy = size / 2;

    // Position people in a radial layout grouped by org
    const nodes = useMemo(() => {
        const orgs = groupByOrg(people);
        const result: { person: PersonIntel; x: number; y: number; orgIndex: number }[] = [];
        const totalOrgs = orgs.length;

        orgs.forEach((org, oi) => {
            const orgAngle = (oi / Math.max(totalOrgs, 1)) * 2 * Math.PI - Math.PI / 2;
            org.people.forEach((p, pi) => {
                // Distance based on relationship strength (stronger = closer)
                const dist = 50 + (1 - p.relationshipStrength) * 80;
                // Spread within org sector
                const spread = org.people.length > 1 ? (pi - (org.people.length - 1) / 2) * 0.3 : 0;
                const angle = orgAngle + spread;
                result.push({
                    person: p,
                    x: cx + dist * Math.cos(angle),
                    y: cy + dist * Math.sin(angle),
                    orgIndex: oi,
                });
            });
        });
        return result;
    }, [people, cx, cy]);

    const orgColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const orgs = useMemo(() => groupByOrg(people), [people]);
    const hovered = nodes.find(n => n.person.id === hoveredId);

    return (
        <div className="relative">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
                {/* Concentric rings */}
                {[0.3, 0.55, 0.8].map((r, i) => (
                    <circle key={i} cx={cx} cy={cy} r={r * (size / 2 - 20)}
                        fill="none" stroke="currentColor" strokeWidth={0.5}
                        className="text-border" strokeDasharray="4 4" />
                ))}

                {/* Connection lines from center to each person */}
                {nodes.map(n => (
                    <line key={`line-${n.person.id}`}
                        x1={cx} y1={cy} x2={n.x} y2={n.y}
                        stroke={orgColors[n.orgIndex % orgColors.length]}
                        strokeWidth={hoveredId === n.person.id ? 2 : 0.8}
                        opacity={hoveredId && hoveredId !== n.person.id ? 0.15 : 0.4}
                    />
                ))}

                {/* Org cluster lines — connect people within same org */}
                {orgs.map((org, oi) => {
                    if (org.people.length < 2) return null;
                    const orgNodes = nodes.filter(n => n.orgIndex === oi);
                    return orgNodes.slice(1).map((n, i) => (
                        <line key={`org-${oi}-${i}`}
                            x1={orgNodes[i].x} y1={orgNodes[i].y}
                            x2={n.x} y2={n.y}
                            stroke={orgColors[oi % orgColors.length]}
                            strokeWidth={0.6} opacity={0.25}
                            strokeDasharray="2 3"
                        />
                    ));
                })}

                {/* Center node — YOU */}
                <circle cx={cx} cy={cy} r={12} fill="currentColor" className="text-primary" opacity={0.9} />
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                    fill="white" fontSize={7} fontWeight="700">YOU</text>

                {/* Person nodes */}
                {nodes.map(n => {
                    const stanceColor = STANCE_COLORS[n.person.politicalStance || 'UNKNOWN']?.replace('bg-', '') || 'gray-400';
                    const isHovered = hoveredId === n.person.id;
                    const nodeR = n.person.powerLevel === 'HIGH' ? 10 : n.person.powerLevel === 'MEDIUM' ? 8 : 6;

                    return (
                        <g key={n.person.id}
                            onMouseEnter={() => setHoveredId(n.person.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => onPersonClick?.(n.person.id)}
                            className="cursor-pointer"
                        >
                            {/* Outer ring — org color */}
                            <circle cx={n.x} cy={n.y} r={nodeR + 2}
                                fill={orgColors[n.orgIndex % orgColors.length]}
                                opacity={isHovered ? 0.6 : 0.2}
                            />
                            {/* Inner circle — stance color */}
                            <circle cx={n.x} cy={n.y} r={nodeR}
                                fill={orgColors[n.orgIndex % orgColors.length]}
                                stroke={isHovered ? 'white' : 'none'}
                                strokeWidth={1.5}
                                opacity={0.85}
                            />
                            {/* First initial */}
                            <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                                fill="white" fontSize={nodeR * 0.9} fontWeight="600">
                                {n.person.name[0]}
                            </text>
                            {/* Name label on hover */}
                            {isHovered && (
                                <text x={n.x} y={n.y + nodeR + 10} textAnchor="middle"
                                    fill="currentColor" fontSize={9} fontWeight="500"
                                    className="text-foreground">
                                    {n.person.name.split(' ')[0]}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Hover tooltip */}
            {hovered && (
                <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-card border border-border p-2.5 shadow-lg">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STANCE_COLORS[hovered.person.politicalStance || 'UNKNOWN']}`} />
                        <span className="text-sm font-medium">{hovered.person.name}</span>
                        {hovered.person.role && <span className="text-[10px] text-muted-foreground">· {hovered.person.role}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {synthesizeWhisper(hovered.person)}
                    </div>
                </div>
            )}

            {/* Org legend */}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
                {orgs.map((org, i) => (
                    <div key={org.name} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: orgColors[i % orgColors.length] }} />
                        {org.name} ({org.people.length})
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// PERSON CARD — compact grid card
// ═══════════════════════════════════════════════════════

function PersonCard({ person, onRemove, onExpand, isExpanded, onUpdate }: {
    person: PersonIntel;
    onRemove?: (id: string) => void;
    onExpand: (id: string | null) => void;
    isExpanded: boolean;
    onUpdate?: (id: string, updates: Record<string, any>) => Promise<void>;
}) {
    const archetype = person.personaArchetype ? ARCHETYPE_PLAYBOOK[person.personaArchetype] : null;
    const firstName = person.name.split(' ')[0];
    const intel = person.intelligence;
    const [isEditing, setIsEditing] = useState(false);
    const [learningMsg, setLearningMsg] = useState<string | null>(null);

    const handleFieldUpdate = async (field: string, value: string | null) => {
        if (!onUpdate) return;
        try {
            await onUpdate(person.id, { [field]: value });
        } catch { /* ignore */ }
    };

    return (
        <div className={`rounded-xl border transition-all duration-200 ${
            isExpanded ? 'border-primary/30 bg-card shadow-md col-span-2' : 'border-border bg-card hover:border-primary/20'
        }`}>
            <div className="p-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-1">
                    <button onClick={() => onExpand(isExpanded ? null : person.id)} className="flex items-start gap-2 text-left flex-1 min-w-0">
                        {/* Stance dot + archetype emoji */}
                        <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                            <div className={`w-2 h-2 rounded-full ${STANCE_COLORS[person.politicalStance || 'UNKNOWN']}`} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{person.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                                {person.role || person.organization || 'Stakeholder'}
                            </div>
                        </div>
                    </button>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        {isExpanded && onUpdate && (
                            <button onClick={() => setIsEditing(!isEditing)}
                                className={`p-1 rounded transition-colors ${isEditing ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                                title="Edit profile">
                                <Edit2 size={11} />
                            </button>
                        )}
                        {onRemove && (
                            <button onClick={() => onRemove(person.id)}
                                className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                                title="Remove from view">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Whisper — 2 lines max */}
                <div className="text-[11px] leading-relaxed text-foreground/65 mt-1.5 line-clamp-2">
                    {synthesizeWhisper(person)}
                </div>

                {/* Footer: meeting context + confidence */}
                <div className="flex items-center gap-1.5 mt-2 text-[9px] text-muted-foreground">
                    <Calendar size={8} />
                    <span className="truncate">{person.meetingContext}</span>
                    <span className="text-border">·</span>
                    <span>{confidenceNarrative(intel?.evidenceCount ?? 0)}</span>
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2.5 space-y-2">
                    {/* Learning acknowledgment */}
                    {learningMsg && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-medium animate-in fade-in duration-300">
                            <Lightbulb size={11} />
                            {learningMsg}
                        </div>
                    )}

                    {/* Inline edit panel */}
                    {isEditing && onUpdate && (
                        <StakeholderEditPanel
                            person={person}
                            onUpdate={async (field, value) => {
                                await handleFieldUpdate(field, value);
                                setLearningMsg(`Got it — Mira will remember this about ${firstName}.`);
                                setTimeout(() => setLearningMsg(null), 3500);
                            }}
                        />
                    )}

                    {intel?.profileSummary && (
                        <p className="text-xs leading-relaxed text-foreground/80">{intel.profileSummary}</p>
                    )}
                    {archetype && (
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                                <div className="text-[9px] font-medium text-emerald-600 mb-1">APPROACH</div>
                                <div className="text-[11px] text-foreground/75 leading-relaxed">{archetype.doThis}</div>
                            </div>
                            <div className="p-2 rounded-lg bg-red-400/5 border border-red-400/15">
                                <div className="text-[9px] font-medium text-red-500 mb-1">AVOID</div>
                                <div className="text-[11px] text-foreground/75 leading-relaxed">{archetype.dontDoThis}</div>
                            </div>
                        </div>
                    )}
                    {(intel?.successPatterns?.length || intel?.objectionPatterns?.length) ? (
                        <div className="text-[11px] text-foreground/70 leading-relaxed space-y-1">
                            {intel?.successPatterns?.[0] && <div><span className="text-emerald-600">Worked:</span> {intel.successPatterns[0]}</div>}
                            {intel?.objectionPatterns?.[0] && <div><span className="text-amber-600">Pushback:</span> {intel.objectionPatterns[0]}</div>}
                        </div>
                    ) : null}
                    <Link href={`/chat?prep=I'm meeting ${encodeURIComponent(person.name)} — how should I approach them?`}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1 pt-1 font-medium">
                        Get Mira&apos;s game plan <ArrowRight size={8} />
                    </Link>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STAKEHOLDER EDIT PANEL — inline editable fields
// ═══════════════════════════════════════════════════════

const ARCHETYPE_OPTIONS = Object.entries(ARCHETYPE_PLAYBOOK).map(([key, val]) => ({
    value: key, label: `${val.emoji} ${val.label}`,
}));

const STANCE_OPTIONS = [
    { value: 'CHAMPION', label: 'Champion', color: 'bg-emerald-500/10 text-emerald-500' },
    { value: 'SUPPORTIVE', label: 'Supportive', color: 'bg-emerald-400/10 text-emerald-400' },
    { value: 'NEUTRAL', label: 'Neutral', color: 'bg-gray-400/10 text-gray-400' },
    { value: 'SKEPTIC', label: 'Skeptic', color: 'bg-amber-500/10 text-amber-500' },
    { value: 'HOSTILE', label: 'Hostile', color: 'bg-red-400/10 text-red-400' },
];

const POWER_OPTIONS = [
    { value: 'HIGH', label: 'High' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'LOW', label: 'Low' },
];

function StakeholderEditPanel({ person, onUpdate }: {
    person: PersonIntel;
    onUpdate: (field: string, value: string | null) => Promise<void>;
}) {
    const [roleInput, setRoleInput] = useState(person.role || '');
    const [orgInput, setOrgInput] = useState(person.organization || '');

    return (
        <div className="p-2.5 bg-muted/50 rounded-lg border border-border space-y-2.5" onClick={e => e.stopPropagation()}>
            {/* Role */}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Role / Title</div>
                <div className="flex gap-1">
                    <input type="text" value={roleInput} onChange={e => setRoleInput(e.target.value)}
                        placeholder="e.g. VP Engineering"
                        className="flex-1 text-xs bg-input border border-border rounded px-2 py-1"
                        onKeyDown={e => { if (e.key === 'Enter') onUpdate('role', roleInput.trim() || null); }}
                    />
                    <button onClick={() => onUpdate('role', roleInput.trim() || null)}
                        className="p-1 text-primary hover:bg-primary/10 rounded"><Check size={12} /></button>
                </div>
            </div>

            {/* Organization */}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Organization</div>
                <div className="flex gap-1">
                    <input type="text" value={orgInput} onChange={e => setOrgInput(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="flex-1 text-xs bg-input border border-border rounded px-2 py-1"
                        onKeyDown={e => { if (e.key === 'Enter') onUpdate('organization', orgInput.trim() || null); }}
                    />
                    <button onClick={() => onUpdate('organization', orgInput.trim() || null)}
                        className="p-1 text-primary hover:bg-primary/10 rounded"><Check size={12} /></button>
                </div>
            </div>

            {/* Persona Archetype */}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Persona</div>
                <div className="flex gap-1 flex-wrap">
                    {ARCHETYPE_OPTIONS.map(opt => (
                        <button key={opt.value}
                            onClick={() => onUpdate('personaArchetype', person.personaArchetype === opt.value ? null : opt.value)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                person.personaArchetype === opt.value
                                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Political Stance */}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Stance</div>
                <div className="flex gap-1 flex-wrap">
                    {STANCE_OPTIONS.map(opt => (
                        <button key={opt.value}
                            onClick={() => onUpdate('politicalStance', person.politicalStance === opt.value ? null : opt.value)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                person.politicalStance === opt.value
                                    ? opt.color + ' ring-1 ring-primary/30'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Power Level */}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Influence</div>
                <div className="flex gap-1">
                    {POWER_OPTIONS.map(opt => (
                        <button key={opt.value}
                            onClick={() => onUpdate('powerLevel', opt.value)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                                person.powerLevel === opt.value
                                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN: PEOPLE INTEL HUB
// ═══════════════════════════════════════════════════════

type ViewMode = 'grid' | 'graph';
type GroupMode = 'all' | 'org' | 'category';

export function PeopleIntelHub({ people }: { people: PersonIntel[] }) {
    const [view, setView] = useState<ViewMode>('grid');
    const [groupBy, setGroupBy] = useState<GroupMode>('org');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
    const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());

    const handleUpdateStakeholder = useCallback(async (id: string, updates: Record<string, any>) => {
        const res = await fetch(`/api/context/stakeholders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update');
    }, []);

    // Filter by search and hidden
    const visiblePeople = useMemo(() => {
        let filtered = people.filter(p => !hiddenIds.has(p.id));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.role?.toLowerCase().includes(q)) ||
                (p.organization?.toLowerCase().includes(q)) ||
                p.meetingContext.toLowerCase().includes(q)
            );
        }
        return filtered;
    }, [people, hiddenIds, searchQuery]);

    const orgGroups = useMemo(() => groupByOrg(visiblePeople), [visiblePeople]);

    const handleRemove = useCallback((id: string) => {
        setHiddenIds(prev => new Set(prev).add(id));
    }, []);

    const toggleOrg = useCallback((orgName: string) => {
        setCollapsedOrgs(prev => {
            const next = new Set(prev);
            if (next.has(orgName)) next.delete(orgName);
            else next.add(orgName);
            return next;
        });
    }, []);

    if (people.length === 0) return null;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users size={14} className="text-primary" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">People in Your Day</span>
                    <span className="text-[10px] text-muted-foreground">({visiblePeople.length})</span>
                </div>
                <div className="flex items-center gap-1">
                    {/* Search toggle */}
                    <button onClick={() => setSearchOpen(!searchOpen)}
                        className={`p-1.5 rounded-lg transition-colors ${searchOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                        <Search size={13} />
                    </button>
                    {/* View toggles */}
                    <div className="flex items-center bg-muted/50 rounded-lg p-0.5 ml-1">
                        <button onClick={() => setView('grid')}
                            className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Grid view">
                            <LayoutGrid size={12} />
                        </button>
                        <button onClick={() => setView('graph')}
                            className={`p-1.5 rounded-md transition-colors ${view === 'graph' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            title="Graph view">
                            <GitBranch size={12} />
                        </button>
                    </div>
                    {/* Full page link */}
                    <Link href="/stakeholders" className="text-[10px] text-primary hover:underline flex items-center gap-1 ml-2">
                        Full network <ArrowRight size={8} />
                    </Link>
                </div>
            </div>

            {/* Search bar */}
            {searchOpen && (
                <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, role, or org..."
                        className="w-full text-xs bg-input border border-border rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:border-primary/50"
                        autoFocus
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X size={12} />
                        </button>
                    )}
                </div>
            )}

            {/* Restored people notice */}
            {hiddenIds.size > 0 && (
                <button onClick={() => setHiddenIds(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                    <Plus size={10} /> Show {hiddenIds.size} hidden {hiddenIds.size === 1 ? 'person' : 'people'}
                </button>
            )}

            {/* GRAPH VIEW */}
            {view === 'graph' && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <RelationshipGraph
                        people={visiblePeople}
                        onPersonClick={(id) => setExpandedId(expandedId === id ? null : id)}
                    />
                </div>
            )}

            {/* GRID VIEW — grouped by org */}
            {view === 'grid' && (
                <div className="space-y-3">
                    {orgGroups.map(org => {
                        const isCollapsed = collapsedOrgs.has(org.name);
                        return (
                            <div key={org.name}>
                                {/* Org header */}
                                {orgGroups.length > 1 && (
                                    <button onClick={() => toggleOrg(org.name)}
                                        className="flex items-center gap-2 mb-2 group w-full text-left">
                                        <Building2 size={11} className="text-muted-foreground" />
                                        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{org.name}</span>
                                        <span className="text-[9px] text-muted-foreground">({org.people.length})</span>
                                        <ChevronDown size={10} className={`text-muted-foreground transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                    </button>
                                )}
                                {/* People grid */}
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {org.people.map(person => (
                                            <PersonCard
                                                key={person.id}
                                                person={person}
                                                onRemove={handleRemove}
                                                onExpand={setExpandedId}
                                                isExpanded={expandedId === person.id}
                                                onUpdate={handleUpdateStakeholder}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Add more CTA */}
                    <Link href="/stakeholders"
                        className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors">
                        <UserPlus size={14} />
                        Manage your full network
                    </Link>
                </div>
            )}
        </div>
    );
}
