'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users, UserPlus, Building2, FolderKanban, Globe,
    ChevronDown, ChevronRight, X, Loader2, Sparkles,
    Star, MoreHorizontal, Trash2, Pencil, MessageCircle,
    LayoutGrid, Radar, Search, Plus, UserCheck, Zap, Network,
    HeartPulse, AlertTriangle, TrendingUp, TrendingDown, Minus,
    ShieldCheck, ShieldAlert, HelpCircle
} from 'lucide-react';
import Link from 'next/link';
import { InfluenceMap } from '@/components/v2/InfluenceMap';
import { OrgMap } from '@/components/v2/OrgMap';
import { StakeholderProfilePanel } from '@/components/v2/StakeholderProfilePanel';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface StakeholderIntel {
    profileSummary: string | null;
    currentMood: string | null;
    recentTopics: string[];
    successPatterns: string[];
    objectionPatterns: string[];
}

interface Stakeholder {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    organization: string | null;
    orgId: string | null;
    teamId: string | null;
    powerLevel: string;
    influenceRole: string;
    politicalStance: string;
    archetype: string | null; // relationship type
    influenceLevel: string | null; // context: org|project|customer
    relationshipStrength: number;
    lastInteraction: string | null;
    interactionCount: number;
    // Extended attributes
    communicationStyle: string | null;
    personaArchetype: string | null;
    primaryMotivation: string | null;
    userNotes: string | null;
    isImportant: boolean;
    intelligence?: StakeholderIntel | null;
    createdAt: string;
}

interface Team {
    id: string;
    name: string;
    context: string | null;
    orgId: string | null;
}

interface Project {
    id: string;
    name: string;
    context: string | null;
    status: string;
    orgId: string | null;
}

interface OrgData {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    relationToUser: string;
    size: string | null;
    parentOrgId: string | null;
}

interface GraphEdge {
    source: string;
    sourceType: string;
    target: string;
    targetType: string;
    relationType: string;
    confidence: number;
}

interface NetworkData {
    stakeholders: Stakeholder[];
    discovered: Stakeholder[];
    grouped: { org: Stakeholder[]; project: Stakeholder[]; customer: Stakeholder[] };
    teams: Team[];
    projects: Project[];
    orgs: OrgData[];
    orgContext: { organization?: Record<string, unknown> } | null;
    graphEdges: GraphEdge[];
    totalCount: number;
    discoveredCount: number;
}

interface RelHealthStakeholder {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    organization: string | null;
    powerLevel: string;
    influenceRole: string;
    politicalStance: string | null;
    personaArchetype: string | null;
    relationshipStrength: number;
    lastInteraction: string | null;
    interactionCount: number;
    isImportant: boolean;
    daysSinceContact: number | null;
    isStale: boolean;
    trend: 'improving' | 'stable' | 'declining';
    linkedinHeadline: string | null;
    intelligence: {
        profileSummary: string | null;
        currentMood: string | null;
        objectionPatterns: string[];
        successPatterns: string[];
    } | null;
}

interface RelHealthStats {
    total: number;
    healthy: number;
    stale: number;
    unknown: number;
    champions: number;
    skeptics: number;
    needsEnrichment: number;
}

interface RelHealthData {
    stakeholders: RelHealthStakeholder[];
    stats: RelHealthStats;
}

type HealthFilter = 'all' | 'at-risk' | 'stale' | 'champions' | 'unknown';

type TabKey = 'org' | 'project' | 'customer';
type ModalContext = TabKey | null;

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const RELATIONSHIP_OPTIONS: Record<TabKey, { value: string; label: string }[]> = {
    org: [
        { value: 'manager', label: 'Manager' },
        { value: 'direct_report', label: 'Direct Report' },
        { value: 'peer', label: 'Peer' },
        { value: 'cross_functional', label: 'Cross-Functional' },
        { value: 'executive_sponsor', label: 'Executive Sponsor' },
        { value: 'skip_level', label: 'Skip-Level' },
        { value: 'board_member', label: 'Board Member' },
        { value: 'mentor', label: 'Mentor' },
        { value: 'mentee', label: 'Mentee' },
        { value: 'advisor', label: 'Advisor' },
        { value: 'gatekeeper', label: 'Gatekeeper' },
        { value: 'blocker', label: 'Blocker' },
    ],
    project: [
        { value: 'peer', label: 'Peer / Collaborator' },
        { value: 'manager', label: 'Project Lead' },
        { value: 'cross_functional', label: 'Cross-Functional' },
        { value: 'executive_sponsor', label: 'Executive Sponsor' },
        { value: 'gatekeeper', label: 'Gatekeeper' },
        { value: 'blocker', label: 'Blocker' },
    ],
    customer: [
        { value: 'customer_buyer', label: 'Buyer / Decision Maker' },
        { value: 'customer_champion', label: 'Champion' },
        { value: 'customer_influencer', label: 'Influencer' },
        { value: 'customer_technical', label: 'Technical Evaluator' },
        { value: 'customer_executive', label: 'Executive Sponsor' },
        { value: 'customer_end_user', label: 'End User' },
        { value: 'vendor', label: 'Vendor' },
        { value: 'partner', label: 'Partner' },
        { value: 'investor', label: 'Investor' },
        { value: 'gatekeeper', label: 'Gatekeeper' },
        { value: 'blocker', label: 'Blocker' },
    ],
};

const RELATIONSHIP_LABELS: Record<string, string> = {
    manager: 'Manager',
    direct_report: 'Direct Report',
    peer: 'Peer',
    cross_functional: 'Cross-Functional',
    customer_buyer: 'Buyer',
    customer_champion: 'Champion',
    customer_influencer: 'Influencer',
    customer_end_user: 'End User',
    customer_technical: 'Technical Eval',
    customer_executive: 'Customer Exec',
    executive_sponsor: 'Exec Sponsor',
    skip_level: 'Skip-Level',
    board_member: 'Board Member',
    mentor: 'Mentor',
    mentee: 'Mentee',
    advisor: 'Advisor',
    vendor: 'Vendor',
    partner: 'Partner',
    investor: 'Investor',
    gatekeeper: 'Gatekeeper',
    blocker: 'Blocker',
};

const RELATIONSHIP_COLORS: Record<string, string> = {
    manager: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    direct_report: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    peer: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
    cross_functional: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    customer_buyer: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
    customer_champion: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    customer_influencer: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    customer_end_user: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
    customer_technical: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
    customer_executive: 'bg-pink-500/15 text-pink-400 border-pink-500/25',
    executive_sponsor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    skip_level: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    board_member: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    mentor: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
    mentee: 'bg-teal-500/15 text-teal-400 border-teal-500/25',
    advisor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
    vendor: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    partner: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    investor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    gatekeeper: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    blocker: 'bg-red-500/15 text-red-400 border-red-500/25',
};

// Political stance options for UI
const STANCE_OPTIONS = [
    { value: '', label: 'Unknown' },
    { value: 'CHAMPION', label: 'Champion -- actively supports you' },
    { value: 'SUPPORTIVE', label: 'Supportive -- generally aligned' },
    { value: 'NEUTRAL', label: 'Neutral -- no clear position' },
    { value: 'SKEPTIC', label: 'Skeptic -- needs convincing' },
    { value: 'HOSTILE', label: 'Hostile -- actively opposes' },
];

// Communication style options
const COMM_STYLE_OPTIONS = [
    { value: '', label: 'Not sure yet' },
    { value: 'DIRECT', label: 'Direct -- straight to the point' },
    { value: 'DIPLOMATIC', label: 'Diplomatic -- tactful, reads the room' },
    { value: 'DATA_DRIVEN', label: 'Data-Driven -- wants evidence & numbers' },
    { value: 'NARRATIVE', label: 'Narrative -- prefers stories & context' },
    { value: 'COLLABORATIVE', label: 'Collaborative -- seeks consensus' },
    { value: 'FORMAL', label: 'Formal -- structured, by-the-book' },
    { value: 'RELATIONSHIP', label: 'Relationship -- values personal connection' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const AVATAR_COLORS: Record<TabKey, string> = {
    org: 'from-blue-500 to-indigo-600',
    project: 'from-amber-500 to-orange-600',
    customer: 'from-emerald-500 to-teal-600',
};

const STATUS_BADGES: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    DONE: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
    HOLD: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

const ORG_RELATION_LABELS: Record<string, string> = {
    EMPLOYER: 'Your Company',
    CLIENT: 'Client',
    VENDOR: 'Vendor',
    PARTNER: 'Partner',
    COMPETITOR: 'Competitor',
    INVESTOR: 'Investor',
    REGULATOR: 'Regulator',
    OTHER: 'Other',
};

const ORG_RELATION_COLORS: Record<string, string> = {
    EMPLOYER: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    CLIENT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    VENDOR: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    PARTNER: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
    COMPETITOR: 'bg-red-500/15 text-red-400 border-red-500/25',
    INVESTOR: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    REGULATOR: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
    OTHER: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
}

function getStrengthColor(strength: number): string {
    if (strength >= 0.7) return 'bg-emerald-500';
    if (strength >= 0.4) return 'bg-amber-500';
    return 'bg-red-500';
}

function getStrengthBgColor(strength: number): string {
    if (strength >= 0.7) return 'bg-emerald-500/20';
    if (strength >= 0.4) return 'bg-amber-500/20';
    return 'bg-red-500/20';
}

function getStanceBadge(stance: string | null): { label: string; color: string } {
    switch (stance) {
        case 'CHAMPION': return { label: 'Champion', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
        case 'SUPPORTIVE': return { label: 'Supportive', color: 'bg-sky-500/15 text-sky-400 border-sky-500/25' };
        case 'NEUTRAL': return { label: 'Neutral', color: 'bg-slate-500/15 text-slate-400 border-slate-500/25' };
        case 'SKEPTIC': return { label: 'Skeptic', color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' };
        case 'HOSTILE': return { label: 'Hostile', color: 'bg-red-500/15 text-red-400 border-red-500/25' };
        default: return { label: 'Unknown', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
    }
}

// ═══════════════════════════════════════════════════════
// PERSON ROW (compact row inside org card)
// ═══════════════════════════════════════════════════════

function PersonRow({
    stakeholder,
    onDelete,
    onEdit,
    onViewProfile,
}: {
    stakeholder: Stakeholder;
    onDelete: (id: string) => void;
    onEdit: (stakeholder: Stakeholder) => void;
    onViewProfile?: (id: string) => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const relType = stakeholder.archetype || 'peer';
    const relLabel = RELATIONSHIP_LABELS[relType] || relType;
    const relColor = RELATIONSHIP_COLORS[relType] || 'bg-slate-500/15 text-slate-400 border-slate-500/25';

    return (
        <div
            className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors cursor-pointer group rounded-lg relative"
            onClick={() => onViewProfile?.(stakeholder.id)}
        >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-[11px] font-semibold text-white shrink-0">
                {stakeholder.name.charAt(0).toUpperCase()}
            </div>

            {/* Name & role */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{stakeholder.name}</span>
                    {stakeholder.isImportant && <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                    {stakeholder.role && <span className="truncate">{stakeholder.role}</span>}
                    {stakeholder.role && <span className="shrink-0">·</span>}
                    <span className={`text-[10px] font-medium px-1.5 py-0 rounded-full border shrink-0 ${relColor}`}>
                        {relLabel}
                    </span>
                </div>
            </div>

            {/* Strength indicator */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <div className={`w-12 h-1 rounded-full ${getStrengthBgColor(stakeholder.relationshipStrength)}`}>
                    <div
                        className={`h-full rounded-full ${getStrengthColor(stakeholder.relationshipStrength)}`}
                        style={{ width: `${Math.round(stakeholder.relationshipStrength * 100)}%` }}
                    />
                </div>
                <span className="text-[10px] text-muted-foreground w-6 text-right">
                    {Math.round(stakeholder.relationshipStrength * 100)}%
                </span>
            </div>

            {/* Menu */}
            <div className="shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                >
                    <MoreHorizontal size={14} />
                </button>
                {showMenu && (
                    <div className="absolute right-3 top-10 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => { onEdit(stakeholder); setShowMenu(false); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground w-full text-left transition-colors"
                        >
                            <Pencil size={12} /> Edit
                        </button>
                        <Link
                            href={`/chat?q=Tell me about ${encodeURIComponent(stakeholder.name)}`}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            onClick={() => setShowMenu(false)}
                        >
                            <MessageCircle size={12} /> Ask Mira
                        </Link>
                        <button
                            onClick={() => { onDelete(stakeholder.id); setShowMenu(false); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 w-full text-left transition-colors"
                        >
                            <Trash2 size={12} /> Remove
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// CLASSIFY MODAL — assign relationship to a discovered person
// ═══════════════════════════════════════════════════════

function ClassifyModal({
    person,
    orgs,
    onClose,
    onClassify,
    isEdit = false,
}: {
    person: Stakeholder;
    orgs: OrgData[];
    onClose: () => void;
    onClassify: (id: string, data: Record<string, string>) => Promise<void>;
    isEdit?: boolean;
}) {
    // Pre-fill from existing data when editing
    const initialContext: TabKey = (person.influenceLevel === 'customer' ? 'customer' : person.influenceLevel === 'project' ? 'project' : 'org') as TabKey;
    const [context, setContext] = useState<TabKey>(isEdit ? initialContext : 'org');
    const [relationship, setRelationship] = useState(isEdit && person.archetype ? person.archetype : '');
    const [customRole, setCustomRole] = useState('');
    const [showMore, setShowMore] = useState(isEdit && !!(person.communicationStyle || person.primaryMotivation || person.userNotes));
    const [stance, setStance] = useState(isEdit && person.politicalStance ? person.politicalStance : '');
    const [commStyle, setCommStyle] = useState(isEdit && person.communicationStyle ? person.communicationStyle : '');
    const [motivation, setMotivation] = useState(isEdit && person.primaryMotivation ? person.primaryMotivation : '');
    const [notes, setNotes] = useState(isEdit && person.userNotes ? person.userNotes : '');
    const [company, setCompany] = useState(isEdit && person.organization ? person.organization : '');
    const [selectedOrgId, setSelectedOrgId] = useState(isEdit && person.orgId ? person.orgId : '');
    const [saving, setSaving] = useState(false);

    const options = RELATIONSHIP_OPTIONS[context];
    const effectiveRelationship = relationship === '_custom' ? customRole.trim().toLowerCase().replace(/\s+/g, '_') : relationship;

    // When org is selected from dropdown, sync company name
    function handleOrgSelect(orgId: string) {
        setSelectedOrgId(orgId);
        if (orgId) {
            const org = orgs.find(o => o.id === orgId);
            if (org) setCompany(org.name);
        }
    }

    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        // In edit mode, relationship is optional (preserve existing)
        if (!isEdit && !effectiveRelationship) return;
        setError('');
        setSaving(true);
        try {
            const data: Record<string, string> = { context };
            if (effectiveRelationship) data.relationship = effectiveRelationship;
            if (stance) data.politicalStance = stance;
            if (commStyle) data.communicationStyle = commStyle;
            if (motivation.trim()) data.primaryMotivation = motivation.trim();
            if (notes.trim()) data.userNotes = notes.trim();
            if (company.trim()) data.company = company.trim();
            if (selectedOrgId) data.orgId = selectedOrgId;
            await onClassify(person.id, data);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">{isEdit ? 'Edit Person' : 'Classify Person'}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Tell Mira who {person.name} is to you</p>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Person info */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                            {person.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{person.name}</p>
                            {person.email && <p className="text-xs text-muted-foreground truncate">{person.email}</p>}
                            {person.role && <p className="text-xs text-muted-foreground truncate">{person.role}</p>}
                        </div>
                    </div>

                    {/* Context selector */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2">Where do you interact?</label>
                        <div className="flex gap-2">
                            {([
                                { key: 'org' as TabKey, label: 'Org', icon: <Building2 size={13} /> },
                                { key: 'project' as TabKey, label: 'Project', icon: <FolderKanban size={13} /> },
                                { key: 'customer' as TabKey, label: 'External', icon: <Globe size={13} /> },
                            ]).map(opt => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => { setContext(opt.key); setRelationship(''); }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors ${
                                        context === opt.key
                                            ? 'border-primary bg-primary/10 text-foreground'
                                            : 'border-border text-muted-foreground hover:border-border/80'
                                    }`}
                                >
                                    {opt.icon} {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Relationship */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Relationship *</label>
                        <select
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        >
                            <option value="">Select relationship...</option>
                            {options.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            <option value="_custom">Other (type your own)...</option>
                        </select>
                        {relationship === '_custom' && (
                            <input
                                type="text"
                                value={customRole}
                                onChange={(e) => setCustomRole(e.target.value)}
                                placeholder="e.g., Technical Advisor, Board Observer"
                                className="w-full mt-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                autoFocus
                            />
                        )}
                    </div>

                    {/* Organization */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organization</label>
                        {orgs.length > 0 ? (
                            <select
                                value={selectedOrgId}
                                onChange={(e) => handleOrgSelect(e.target.value)}
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            >
                                <option value="">No organization</option>
                                {orgs.map(o => (
                                    <option key={o.id} value={o.id}>{o.name} ({ORG_RELATION_LABELS[o.relationToUser] || o.relationToUser})</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="e.g., Acme Corp, Google"
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            />
                        )}
                    </div>

                    {/* Political Stance */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Their stance towards you</label>
                        <select
                            value={stance}
                            onChange={(e) => setStance(e.target.value)}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        >
                            {STANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Expandable: More attributes */}
                    <button
                        type="button"
                        onClick={() => setShowMore(!showMore)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                        {showMore ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {showMore ? 'Less details' : 'Add more details (optional)'}
                    </button>

                    {showMore && (
                        <div className="space-y-4 pt-1">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Communication style</label>
                                <select
                                    value={commStyle}
                                    onChange={(e) => setCommStyle(e.target.value)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                >
                                    {COMM_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">What motivates them?</label>
                                <input
                                    type="text"
                                    value={motivation}
                                    onChange={(e) => setMotivation(e.target.value)}
                                    placeholder="e.g., Career growth, Innovation, Cost savings"
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes for Mira</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Anything Mira should know -- politics, preferences, history..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors resize-none"
                                />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                            Skip
                        </button>
                        <button
                            type="submit"
                            disabled={(!isEdit && !effectiveRelationship) || saving}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {isEdit ? 'Save' : 'Classify'}
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ADD PERSON MODAL
// ═══════════════════════════════════════════════════════

function AddPersonModal({
    context,
    teams,
    orgs = [],
    existingPeople = [],
    defaultOrgId = '',
    defaultCompany = '',
    onClose,
    onAdd,
    onAssignExisting,
}: {
    context: TabKey;
    teams: Team[];
    orgs?: OrgData[];
    existingPeople?: Stakeholder[];
    defaultOrgId?: string;
    defaultCompany?: string;
    onClose: () => void;
    onAdd: (data: Record<string, string>) => Promise<void>;
    onAssignExisting?: (id: string, data: Record<string, string>) => Promise<void>;
}) {
    const [mode, setMode] = useState<'pick' | 'new'>(existingPeople.length > 0 ? 'pick' : 'new');
    const [personSearch, setPersonSearch] = useState('');
    const [selectedPerson, setSelectedPerson] = useState<Stakeholder | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('');
    const [relationship, setRelationship] = useState('');
    const [customRole, setCustomRole] = useState('');
    const [company, setCompany] = useState(defaultCompany);
    const [selectedOrgId, setSelectedOrgId] = useState(defaultOrgId);
    const [teamId, setTeamId] = useState('');
    const [showMore, setShowMore] = useState(false);
    const [stance, setStance] = useState('');
    const [commStyle, setCommStyle] = useState('');
    const [motivation, setMotivation] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [activeContext, setActiveContext] = useState<TabKey>(context);

    const options = RELATIONSHIP_OPTIONS[activeContext];
    const effectiveRelationship = relationship === '_custom' ? customRole.trim().toLowerCase().replace(/\s+/g, '_') : relationship;

    // Filtered people for search
    const filteredPeople = useMemo(() => {
        if (!personSearch.trim()) return existingPeople.slice(0, 15);
        const q = personSearch.toLowerCase();
        return existingPeople.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.email && p.email.toLowerCase().includes(q)) ||
            (p.role && p.role.toLowerCase().includes(q)) ||
            (p.organization && p.organization.toLowerCase().includes(q))
        ).slice(0, 15);
    }, [existingPeople, personSearch]);

    function handlePickPerson(person: Stakeholder) {
        setSelectedPerson(person);
        setName(person.name);
        setEmail(person.email || '');
        setRole(person.role || '');
        setCompany(person.organization || defaultCompany);
        if (person.politicalStance && person.politicalStance !== 'UNKNOWN') setStance(person.politicalStance);
        if (person.communicationStyle) setCommStyle(person.communicationStyle);
        if (person.primaryMotivation) setMotivation(person.primaryMotivation);
        if (person.userNotes) setNotes(person.userNotes);
        if (person.archetype) setRelationship(person.archetype);
        // Try to resolve orgId from person's organization string
        if (!selectedOrgId && person.orgId) {
            setSelectedOrgId(person.orgId);
        } else if (!selectedOrgId && person.organization) {
            const match = orgs.find(o => o.name.toLowerCase() === person.organization!.toLowerCase());
            if (match) setSelectedOrgId(match.id);
        }
        setMode('new'); // Switch to form view with fields pre-filled
    }

    function handleOrgSelect(orgId: string) {
        setSelectedOrgId(orgId);
        if (orgId) {
            const org = orgs.find(o => o.id === orgId);
            if (org) setCompany(org.name);
        }
    }

    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        // For new people, name + relationship required. For existing, relationship optional.
        if (!selectedPerson && (!name.trim() || !effectiveRelationship)) return;
        if (selectedPerson && !name.trim()) return;
        setError('');
        setSaving(true);
        try {
            const formData: Record<string, string> = {
                name: name.trim(),
                email: email.trim(),
                role: role.trim(),
                context: activeContext,
                company: company.trim(),
                teamId,
            };
            if (effectiveRelationship) formData.relationship = effectiveRelationship;
            if (selectedOrgId) formData.orgId = selectedOrgId;
            if (stance) formData.politicalStance = stance;
            if (commStyle) formData.communicationStyle = commStyle;
            if (motivation.trim()) formData.primaryMotivation = motivation.trim();
            if (notes.trim()) formData.userNotes = notes.trim();

            if (selectedPerson && onAssignExisting) {
                // PATCH existing person (assign to org + update fields)
                await onAssignExisting(selectedPerson.id, formData);
            } else {
                // POST new person
                await onAdd(formData);
            }
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
                    <h3 className="text-sm font-semibold text-foreground">
                        {selectedPerson ? `Assign ${selectedPerson.name}` : 'Add Person'}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Mode toggle: Pick existing vs Create new */}
                {existingPeople.length > 0 && !selectedPerson && (
                    <div className="px-5 pt-4 pb-0">
                        <div className="flex rounded-lg border border-border overflow-hidden mb-4">
                            <button
                                type="button"
                                onClick={() => setMode('pick')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                    mode === 'pick' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Search size={12} className="inline mr-1.5 -mt-0.5" />
                                Pick existing ({existingPeople.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('new')}
                                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                                    mode === 'new' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Plus size={12} className="inline mr-1.5 -mt-0.5" />
                                Create new
                            </button>
                        </div>
                    </div>
                )}

                {/* Pick existing person mode */}
                {mode === 'pick' && !selectedPerson && (
                    <div className="px-5 pb-5">
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={personSearch}
                                onChange={(e) => setPersonSearch(e.target.value)}
                                placeholder="Search by name, email, role..."
                                className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                autoFocus
                            />
                        </div>
                        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/50 rounded-lg border border-border">
                            {filteredPeople.length === 0 ? (
                                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                    {personSearch ? 'No matches found' : 'No people available'}
                                </div>
                            ) : (
                                filteredPeople.map(person => (
                                    <button
                                        key={person.id}
                                        type="button"
                                        onClick={() => handlePickPerson(person)}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                                            {person.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-foreground truncate">{person.name}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {[person.role, person.email, person.organization].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                                    </button>
                                ))
                            )}
                        </div>
                        {existingPeople.length > 15 && !personSearch && (
                            <p className="text-[10px] text-muted-foreground text-center mt-2">
                                Showing 15 of {existingPeople.length} — use search to find more
                            </p>
                        )}
                    </div>
                )}

                {/* New person form (also shown after picking an existing person) */}
                {(mode === 'new' || selectedPerson) && (
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Selected person indicator */}
                    {selectedPerson && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                                {selectedPerson.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate">{selectedPerson.name}</p>
                                <p className="text-[10px] text-muted-foreground">Assigning to organization — fill in details below</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedPerson(null);
                                    setName(''); setEmail(''); setRole('');
                                    setRelationship(''); setStance(''); setCommStyle('');
                                    setMotivation(''); setNotes('');
                                    setMode('pick');
                                }}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Sarah Chen"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            autoFocus={!selectedPerson}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="sarah@company.com"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role / Title</label>
                        <input
                            type="text"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            placeholder="e.g., VP of Engineering"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>

                    {/* Organization select */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organization</label>
                        {orgs.length > 0 ? (
                            <select
                                value={selectedOrgId}
                                onChange={(e) => handleOrgSelect(e.target.value)}
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            >
                                <option value="">No organization</option>
                                {orgs.map(o => (
                                    <option key={o.id} value={o.id}>{o.name} ({ORG_RELATION_LABELS[o.relationToUser] || o.relationToUser})</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="e.g., Acme Corp"
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            />
                        )}
                    </div>

                    {/* Context selector */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-2">Context</label>
                        <div className="flex gap-2">
                            {([
                                { key: 'org' as TabKey, label: 'Org', icon: <Building2 size={13} /> },
                                { key: 'project' as TabKey, label: 'Project', icon: <FolderKanban size={13} /> },
                                { key: 'customer' as TabKey, label: 'External', icon: <Globe size={13} /> },
                            ]).map(opt => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => { setActiveContext(opt.key); setRelationship(''); }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors ${
                                        activeContext === opt.key
                                            ? 'border-primary bg-primary/10 text-foreground'
                                            : 'border-border text-muted-foreground hover:border-border/80'
                                    }`}
                                >
                                    {opt.icon} {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Relationship *</label>
                        <select
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        >
                            <option value="">Select relationship...</option>
                            {options.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            <option value="_custom">Other (type your own)...</option>
                        </select>
                        {relationship === '_custom' && (
                            <input
                                type="text"
                                value={customRole}
                                onChange={(e) => setCustomRole(e.target.value)}
                                placeholder="e.g., Technical Advisor, Board Observer"
                                className="w-full mt-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            />
                        )}
                    </div>

                    {activeContext === 'project' && teams.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Team</label>
                            <select
                                value={teamId}
                                onChange={(e) => setTeamId(e.target.value)}
                                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            >
                                <option value="">No specific team</option>
                                {teams.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Political Stance */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Their stance towards you</label>
                        <select
                            value={stance}
                            onChange={(e) => setStance(e.target.value)}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        >
                            {STANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Expandable: More attributes */}
                    <button
                        type="button"
                        onClick={() => setShowMore(!showMore)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                        {showMore ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {showMore ? 'Less details' : 'Add more details (optional)'}
                    </button>

                    {showMore && (
                        <div className="space-y-4 pt-1">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Communication style</label>
                                <select
                                    value={commStyle}
                                    onChange={(e) => setCommStyle(e.target.value)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                >
                                    {COMM_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">What motivates them?</label>
                                <input
                                    type="text"
                                    value={motivation}
                                    onChange={(e) => setMotivation(e.target.value)}
                                    placeholder="e.g., Career growth, Innovation, Cost savings"
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes for Mira</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Anything Mira should know -- politics, preferences, history..."
                                    rows={2}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors resize-none"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || (!selectedPerson && !effectiveRelationship) || saving}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {selectedPerson ? 'Assign to Org' : 'Add Person'}
                        </button>
                    </div>
                    {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
                </form>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ADD ORG MODAL
// ═══════════════════════════════════════════════════════

function AddOrgModal({
    onClose,
    onAdd,
    editOrg,
}: {
    onClose: () => void;
    onAdd: (data: { name: string; domain?: string; industry?: string; relationToUser: string; size?: string; id?: string }) => Promise<void>;
    editOrg?: OrgData | null;
}) {
    const [name, setName] = useState(editOrg?.name || '');
    const [domain, setDomain] = useState(editOrg?.domain || '');
    const [industry, setIndustry] = useState(editOrg?.industry || '');
    const [relation, setRelation] = useState(editOrg?.relationToUser || 'CLIENT');
    const [size, setSize] = useState(editOrg?.size || '');
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        try {
            await onAdd({
                id: editOrg?.id,
                name: name.trim(),
                domain: domain.trim() || undefined,
                industry: industry.trim() || undefined,
                relationToUser: relation,
                size: size.trim() || undefined,
            });
            onClose();
        } catch {
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">{editOrg ? 'Edit Organization' : 'Add Organization'}</h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Organization Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Acme Corp"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Domain / Website</label>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="e.g., acme.com"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Industry</label>
                        <input
                            type="text"
                            value={industry}
                            onChange={(e) => setIndustry(e.target.value)}
                            placeholder="e.g., Technology, Healthcare"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Relation to you *</label>
                        <select
                            value={relation}
                            onChange={(e) => setRelation(e.target.value)}
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        >
                            {Object.entries(ORG_RELATION_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Size</label>
                        <input
                            type="text"
                            value={size}
                            onChange={(e) => setSize(e.target.value)}
                            placeholder="e.g., 50-200, 1000+, Startup"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || saving}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {editOrg ? 'Save' : 'Add Organization'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ADD PROJECT MODAL
// ═══════════════════════════════════════════════════════

function AddProjectModal({
    onClose,
    onAdd,
}: {
    onClose: () => void;
    onAdd: (name: string, context: string) => Promise<void>;
}) {
    const [name, setName] = useState('');
    const [context, setContext] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        try {
            await onAdd(name.trim(), context.trim());
            onClose();
        } catch {
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Add Initiative</h3>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Q3 Platform Migration"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">One-liner (what Mira should know)</label>
                        <input
                            type="text"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="e.g., Migrating 200K users to new platform by Sept"
                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || saving}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            Add
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// DISCOVERED PEOPLE -- searchable pool from meetings
// ═══════════════════════════════════════════════════════

function DiscoveredPeoplePanel({
    people,
    onClassify,
}: {
    people: Stakeholder[];
    onClassify: (person: Stakeholder) => void;
}) {
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState(true);

    const filtered = useMemo(() => {
        if (!search.trim()) return people.slice(0, 20);
        const q = search.toLowerCase();
        return people.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.email && p.email.toLowerCase().includes(q)) ||
            (p.role && p.role.toLowerCase().includes(q))
        ).slice(0, 20);
    }, [people, search]);

    if (people.length === 0) return null;

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center">
                        <Zap size={14} className="text-amber-400" />
                    </div>
                    <div className="text-left">
                        <span className="text-sm font-medium text-foreground">People Mira Found</span>
                        <span className="text-xs text-muted-foreground ml-2">
                            {people.length} from your meetings
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                        Classify to train your AI
                    </span>
                    {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-border">
                    {/* Search */}
                    <div className="px-4 py-3 border-b border-border/50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name, email, or role..."
                                className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                            />
                        </div>
                    </div>

                    {/* People list */}
                    <div className="max-h-[320px] overflow-y-auto divide-y divide-border/50">
                        {filtered.length === 0 ? (
                            <div className="px-5 py-6 text-center text-xs text-muted-foreground">
                                {search ? 'No matches found' : 'No discovered people yet'}
                            </div>
                        ) : (
                            filtered.map(person => (
                                <div
                                    key={person.id}
                                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                                            {person.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm text-foreground truncate">{person.name}</p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {person.email || person.role || `${person.interactionCount} meeting${person.interactionCount !== 1 ? 's' : ''}`}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onClassify(person)}
                                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors opacity-70 group-hover:opacity-100"
                                    >
                                        <UserCheck size={12} /> Classify
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {people.length > 20 && !search && (
                        <div className="px-5 py-2 border-t border-border/50 text-center">
                            <span className="text-[10px] text-muted-foreground">
                                Showing 20 of {people.length} -- use search to find more
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// INITIATIVES PANEL
// ═══════════════════════════════════════════════════════

function InitiativesPanel({
    projects,
    onAdd,
    onDelete,
}: {
    projects: Project[];
    onAdd: () => void;
    onDelete: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center">
                        <FolderKanban size={14} className="text-violet-400" />
                    </div>
                    <div className="text-left">
                        <span className="text-sm font-medium text-foreground">Your Initiatives</span>
                        {projects.length > 0 && (
                            <span className="text-xs text-muted-foreground ml-2">{projects.length} active</span>
                        )}
                    </div>
                </div>
                {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
            </button>

            {expanded && (
                <div className="border-t border-border px-5 py-3">
                    {projects.length === 0 ? (
                        <div className="text-center py-4">
                            <p className="text-xs text-muted-foreground mb-3">
                                Add your key projects so Mira can connect people to initiatives
                            </p>
                            <button
                                onClick={onAdd}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                            >
                                <Plus size={13} /> Add Initiative
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {projects.map(p => (
                                <div key={p.id} className="flex items-center justify-between group py-1.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-foreground font-medium">{p.name}</span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${STATUS_BADGES[p.status] || STATUS_BADGES.ACTIVE}`}>
                                                {p.status}
                                            </span>
                                        </div>
                                        {p.context && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{p.context}</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onDelete(p.id)}
                                        className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all shrink-0"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={onAdd}
                                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            >
                                <Plus size={12} /> Add initiative
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ORG CARD — primary container for people
// ═══════════════════════════════════════════════════════

function OrgCard({
    org,
    people,
    onAddPerson,
    onEditOrg,
    onDeleteOrg,
    onDeletePerson,
    onEditPerson,
    onViewProfile,
}: {
    org: OrgData;
    people: Stakeholder[];
    onAddPerson: (orgId: string, orgName: string) => void;
    onEditOrg: (org: OrgData) => void;
    onDeleteOrg: (id: string) => void;
    onDeletePerson: (id: string) => void;
    onEditPerson: (s: Stakeholder) => void;
    onViewProfile: (id: string) => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const relationLabel = ORG_RELATION_LABELS[org.relationToUser] || org.relationToUser;
    const relationColor = ORG_RELATION_COLORS[org.relationToUser] || ORG_RELATION_COLORS.OTHER;

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/20 transition-colors">
            {/* Org Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-3 min-w-0 flex-1"
                >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Building2 size={15} className="text-blue-400" />
                    </div>
                    <div className="min-w-0 text-left">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground truncate">{org.name}</h3>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${relationColor}`}>
                                {relationLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {org.domain && <span className="truncate">{org.domain}</span>}
                            {org.domain && org.industry && <span>·</span>}
                            {org.industry && <span className="truncate">{org.industry}</span>}
                            {!org.domain && !org.industry && (
                                <span>{people.length} {people.length === 1 ? 'person' : 'people'}</span>
                            )}
                        </div>
                    </div>
                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{people.length}</span>
                        {collapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    </div>
                </button>

                {/* Kebab menu */}
                <div className="relative ml-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-all"
                    >
                        <MoreHorizontal size={14} />
                    </button>
                    {showMenu && (
                        <div className="absolute right-0 top-7 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => { onEditOrg(org); setShowMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground w-full text-left transition-colors"
                            >
                                <Pencil size={12} /> Edit Organization
                            </button>
                            <button
                                onClick={() => { onAddPerson(org.id, org.name); setShowMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground w-full text-left transition-colors"
                            >
                                <UserPlus size={12} /> Add Person
                            </button>
                            <button
                                onClick={() => { onDeleteOrg(org.id); setShowMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 w-full text-left transition-colors"
                            >
                                <Trash2 size={12} /> Delete Organization
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* People rows */}
            {!collapsed && (
                <div>
                    {people.length > 0 ? (
                        <div className="divide-y divide-border/30">
                            {people.map(s => (
                                <PersonRow
                                    key={s.id}
                                    stakeholder={s}
                                    onDelete={onDeletePerson}
                                    onEdit={onEditPerson}
                                    onViewProfile={(id) => onViewProfile(id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-4 text-center">
                            <p className="text-xs text-muted-foreground mb-2">No people in this organization yet</p>
                        </div>
                    )}

                    {/* Add person button inside card */}
                    <div className="px-3 py-2 border-t border-border/30">
                        <button
                            onClick={() => onAddPerson(org.id, org.name)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        >
                            <UserPlus size={12} /> Add Person
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function NetworkPage() {
    const [data, setData] = useState<NetworkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [modalContext, setModalContext] = useState<ModalContext>(null);
    const [addPersonOrgId, setAddPersonOrgId] = useState<string>('');
    const [addPersonOrgName, setAddPersonOrgName] = useState<string>('');
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [editOrgData, setEditOrgData] = useState<OrgData | null>(null);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [classifyPerson, setClassifyPerson] = useState<Stakeholder | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'cards' | 'map' | 'orgmap' | 'health'>('cards');
    const [profileId, setProfileId] = useState<string | null>(null);
    const [healthData, setHealthData] = useState<RelHealthData | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/network');
            if (!res.ok) throw new Error('Failed to load network');
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error(e);
            setError('Failed to load your network. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (viewMode !== 'health') return;
        if (healthData) return;
        setHealthLoading(true);
        fetch('/api/stakeholders/relationships')
            .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load')))
            .then(json => setHealthData(json))
            .catch(() => {})
            .finally(() => setHealthLoading(false));
    }, [viewMode, healthData]);

    const filteredHealthStakeholders = useMemo(() => {
        if (!healthData) return [];
        const list = healthData.stakeholders;
        let filtered: RelHealthStakeholder[];
        switch (healthFilter) {
            case 'at-risk':
                filtered = list.filter(s => s.isStale && (s.isImportant || s.powerLevel === 'HIGH'));
                break;
            case 'stale':
                filtered = list.filter(s => s.isStale);
                break;
            case 'champions':
                filtered = list.filter(s => s.politicalStance === 'CHAMPION');
                break;
            case 'unknown':
                filtered = list.filter(s => !s.politicalStance || s.politicalStance === 'UNKNOWN');
                break;
            default:
                filtered = list;
        }
        return filtered.sort((a, b) => {
            const aUrgency = (a.isStale ? 2 : 0) + (a.isImportant || a.powerLevel === 'HIGH' ? 1 : 0);
            const bUrgency = (b.isStale ? 2 : 0) + (b.isImportant || b.powerLevel === 'HIGH' ? 1 : 0);
            return bUrgency - aUrgency;
        });
    }, [healthData, healthFilter]);

    // ── Group stakeholders by org ──
    const { orgGroups, unaffiliated } = useMemo(() => {
        if (!data) return { orgGroups: [] as { org: OrgData; people: Stakeholder[] }[], unaffiliated: [] as Stakeholder[] };

        const allClassified = data.stakeholders;
        const orgMap = new Map(data.orgs.map(o => [o.id, o]));
        const orgNameMap = new Map(data.orgs.map(o => [o.name.toLowerCase(), o]));

        // Group by orgId FK
        const byOrgId: Record<string, Stakeholder[]> = {};
        const noOrg: Stakeholder[] = [];

        for (const s of allClassified) {
            let resolvedOrgId = s.orgId;

            // Fallback: try to match by organization name string
            if (!resolvedOrgId && s.organization) {
                const matchedOrg = orgNameMap.get(s.organization.toLowerCase());
                if (matchedOrg) {
                    resolvedOrgId = matchedOrg.id;
                }
            }

            if (resolvedOrgId && orgMap.has(resolvedOrgId)) {
                if (!byOrgId[resolvedOrgId]) byOrgId[resolvedOrgId] = [];
                byOrgId[resolvedOrgId].push(s);
            } else {
                noOrg.push(s);
            }
        }

        // Build org groups, including orgs with 0 people
        const groups: { org: OrgData; people: Stakeholder[] }[] = [];
        for (const org of data.orgs) {
            groups.push({
                org,
                people: byOrgId[org.id] || [],
            });
        }

        // Sort: EMPLOYER first, then by people count desc, then alphabetically
        groups.sort((a, b) => {
            if (a.org.relationToUser === 'EMPLOYER' && b.org.relationToUser !== 'EMPLOYER') return -1;
            if (b.org.relationToUser === 'EMPLOYER' && a.org.relationToUser !== 'EMPLOYER') return 1;
            if (b.people.length !== a.people.length) return b.people.length - a.people.length;
            return a.org.name.localeCompare(b.org.name);
        });

        return { orgGroups: groups, unaffiliated: noOrg };
    }, [data]);

    // People counts per org (for OrgMap node sizing)
    const peopleCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const { org, people } of orgGroups) {
            counts[org.id] = people.length;
        }
        return counts;
    }, [orgGroups]);

    async function handleAdd(formData: Record<string, string>) {
        const res = await fetch('/api/network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to add' }));
            throw new Error(err.error);
        }
        await fetchData();
    }

    async function handleClassify(id: string, classifyData: Record<string, string>) {
        const res = await fetch('/api/network', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...classifyData }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to classify' }));
            throw new Error(err.error);
        }
        await fetchData();
    }

    function handleEdit(stakeholder: Stakeholder) {
        setClassifyPerson(stakeholder);
        setIsEditMode(true);
    }

    async function handleDelete(id: string) {
        const res = await fetch(`/api/network?id=${id}`, { method: 'DELETE' });
        if (!res.ok) return;
        await fetchData();
    }

    async function handleAddOrg(orgData: { name: string; domain?: string; industry?: string; relationToUser: string; size?: string; id?: string }) {
        const method = orgData.id ? 'PATCH' : 'POST';
        const res = await fetch('/api/network/orgs', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orgData),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to save org' }));
            throw new Error(err.error);
        }
        await fetchData();
    }

    async function handleDeleteOrg(id: string) {
        await fetch(`/api/network/orgs?id=${id}`, { method: 'DELETE' });
        await fetchData();
    }

    async function handleAddProject(name: string, context: string) {
        const res = await fetch('/api/network/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, context }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed to add project' }));
            throw new Error(err.error);
        }
        await fetchData();
    }

    async function handleDeleteProject(id: string) {
        const res = await fetch(`/api/network/projects?id=${id}`, { method: 'DELETE' });
        if (!res.ok) return;
        await fetchData();
    }

    function handleToggleImportant(id: string, isImportant: boolean) {
        setData(prev => {
            if (!prev) return prev;
            const update = (list: Stakeholder[]) => list.map(s => s.id === id ? { ...s, isImportant } : s);
            return {
                ...prev,
                stakeholders: update(prev.stakeholders),
                discovered: update(prev.discovered),
                grouped: {
                    org: update(prev.grouped.org),
                    project: update(prev.grouped.project),
                    customer: update(prev.grouped.customer),
                },
            };
        });
    }

    function handleCorrectArchetype(id: string, currentArchetype: string | null) {
        const allPeople = [...(data?.stakeholders || []), ...(data?.discovered || [])];
        const person = allPeople.find(s => s.id === id);
        const name = person?.name || 'this person';
        const label = currentArchetype || 'unknown';
        window.location.href = `/chat?q=${encodeURIComponent(`You classified ${name} as a "${label}" archetype, but I think that's not quite right. Let's discuss what fits better.`)}`;
    }

    function openAddPersonForOrg(orgId: string, orgName: string) {
        setAddPersonOrgId(orgId);
        setAddPersonOrgName(orgName);
        // Determine context from org relation
        const org = data?.orgs.find(o => o.id === orgId);
        const relation = org?.relationToUser || 'OTHER';
        if (relation === 'EMPLOYER') {
            setModalContext('org');
        } else if (['CLIENT', 'VENDOR', 'PARTNER', 'INVESTOR', 'COMPETITOR'].includes(relation)) {
            setModalContext('customer');
        } else {
            setModalContext('org');
        }
    }

    function openAddPersonTopLevel() {
        setAddPersonOrgId('');
        setAddPersonOrgName('');
        setModalContext('org');
    }

    const classifiedCount = data?.totalCount || 0;
    const discoveredCount = data?.discoveredCount || 0;
    const TARGET = 15;

    return (
        <div className="flex-1 overflow-y-auto bg-background">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-6 pb-24">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground tracking-tight">Your Network</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Organizations and people in your professional world.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Progress indicator */}
                        {!loading && data && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs">
                                <Users size={13} className="text-primary" />
                                <span className="text-foreground font-medium">{classifiedCount}</span>
                                <span className="text-muted-foreground">of {TARGET}+ mapped</span>
                                <div className="w-12 h-1.5 rounded-full bg-muted">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.min(100, (classifiedCount / TARGET) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        {/* View toggle */}
                        <div className="flex rounded-lg border border-border overflow-hidden">
                            <button
                                onClick={() => setViewMode('cards')}
                                className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                                title="Org Cards"
                            >
                                <LayoutGrid size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('orgmap')}
                                className={`p-2 transition-colors ${viewMode === 'orgmap' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                                title="Org Network Map"
                            >
                                <Network size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`p-2 transition-colors ${viewMode === 'map' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                                title="People Influence Map"
                            >
                                <Radar size={16} />
                            </button>
                            <button
                                onClick={() => setViewMode('health')}
                                className={`p-2 transition-colors ${viewMode === 'health' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                                title="Relationship Health"
                            >
                                <HeartPulse size={16} />
                            </button>
                        </div>
                        <button
                            onClick={() => { setEditOrgData(null); setShowOrgModal(true); }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            <Building2 size={14} /> Add Organization
                        </button>
                        <button
                            onClick={openAddPersonTopLevel}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                            <UserPlus size={14} /> Add Person
                        </button>
                    </div>
                </div>

                {/* Nudge banner */}
                {!loading && data && classifiedCount < 5 && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-6 flex items-start gap-3">
                        <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-foreground font-medium mb-0.5">Help Mira understand your world</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {discoveredCount > 0
                                    ? `Mira found ${discoveredCount} people from your meetings. Classify them below to unlock full intelligence, or add people manually.`
                                    : 'Start by adding organizations you work with, then add people to each one. The more Mira knows, the better she can help.'
                                }
                            </p>
                        </div>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 rounded-xl bg-card border border-border animate-pulse" />
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
                        <p className="text-sm text-red-400 mb-3">{error}</p>
                        <button
                            onClick={() => { setError(null); setLoading(true); fetchData(); }}
                            className="text-xs text-primary hover:underline"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {/* Content */}
                {!loading && data && !error && (
                    <div className="space-y-5">
                        {viewMode === 'map' ? (
                            /* People Influence Map View */
                            <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ height: 'calc(100vh - 340px)', minHeight: 500 }}>
                                {data.stakeholders.length > 0 ? (
                                    <InfluenceMap
                                        people={data.stakeholders}
                                        orgs={data.orgs || []}
                                        graphEdges={data.graphEdges || []}
                                        userName="You"
                                        onPersonClick={(id) => {
                                            setProfileId(id);
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                                <Radar size={28} className="text-primary" />
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-1">Your people influence map is empty</p>
                                            <p className="text-xs text-muted-foreground mb-4">
                                                Add people to organizations to see relationship dynamics visualized
                                            </p>
                                            <button
                                                onClick={() => setViewMode('cards')}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                                            >
                                                <LayoutGrid size={13} /> Switch to card view
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : viewMode === 'orgmap' ? (
                            /* Org Network Map View */
                            <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ height: 'calc(100vh - 340px)', minHeight: 500 }}>
                                {data.orgs.length > 0 ? (
                                    <OrgMap
                                        orgs={data.orgs}
                                        graphEdges={data.graphEdges || []}
                                        peopleCounts={peopleCounts}
                                        onOrgClick={(_orgId) => {
                                            // Switch to card view and scroll to the org
                                            setViewMode('cards');
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                                <Network size={28} className="text-primary" />
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-1">No organizations in your network yet</p>
                                            <p className="text-xs text-muted-foreground mb-4">
                                                Add your company and organizations you work with to see the network map
                                            </p>
                                            <button
                                                onClick={() => { setEditOrgData(null); setShowOrgModal(true); }}
                                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                                            >
                                                <Building2 size={13} /> Add your first organization
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : viewMode === 'health' ? (
                            /* Relationship Health View */
                            healthLoading ? (
                                <div className="space-y-4">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="h-20 rounded-xl bg-card border border-border animate-pulse" />
                                    ))}
                                </div>
                            ) : healthData ? (
                                <div className="space-y-5">
                                    {/* Stats summary row */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                        <div className="rounded-xl border border-border bg-card p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Users size={14} className="text-primary" />
                                                <span className="text-xs text-muted-foreground">Total</span>
                                            </div>
                                            <span className="text-xl font-semibold text-foreground">{healthData.stats.total}</span>
                                        </div>
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <ShieldCheck size={14} className="text-emerald-400" />
                                                <span className="text-xs text-emerald-400/80">Healthy</span>
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-semibold text-emerald-400">{healthData.stats.healthy}</span>
                                                {healthData.stats.total > 0 && (
                                                    <span className="text-xs text-emerald-400/60">
                                                        {Math.round((healthData.stats.healthy / healthData.stats.total) * 100)}%
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <AlertTriangle size={14} className="text-amber-400" />
                                                <span className="text-xs text-amber-400/80">Stale / At Risk</span>
                                            </div>
                                            <span className="text-xl font-semibold text-amber-400">{healthData.stats.stale}</span>
                                        </div>
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Star size={14} className="text-emerald-400 fill-emerald-400" />
                                                <span className="text-xs text-emerald-400/80">Champions</span>
                                            </div>
                                            <span className="text-xl font-semibold text-emerald-400">{healthData.stats.champions}</span>
                                        </div>
                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <ShieldAlert size={14} className="text-red-400" />
                                                <span className="text-xs text-red-400/80">Skeptics</span>
                                            </div>
                                            <span className="text-xl font-semibold text-red-400">{healthData.stats.skeptics}</span>
                                        </div>
                                        <div className="rounded-xl border border-border bg-card p-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <HelpCircle size={14} className="text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">Needs Intel</span>
                                            </div>
                                            <span className="text-xl font-semibold text-muted-foreground">{healthData.stats.needsEnrichment}</span>
                                        </div>
                                    </div>

                                    {/* Filter toggles */}
                                    <div className="flex gap-2 flex-wrap">
                                        {([
                                            { key: 'all' as HealthFilter, label: 'All' },
                                            { key: 'at-risk' as HealthFilter, label: 'At Risk' },
                                            { key: 'stale' as HealthFilter, label: 'Stale' },
                                            { key: 'champions' as HealthFilter, label: 'Champions' },
                                            { key: 'unknown' as HealthFilter, label: 'Unknown Stance' },
                                        ]).map(f => (
                                            <button
                                                key={f.key}
                                                onClick={() => setHealthFilter(f.key)}
                                                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                                    healthFilter === f.key
                                                        ? 'border-primary bg-primary/10 text-foreground font-medium'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                                                }`}
                                            >
                                                {f.label}
                                                {f.key !== 'all' && healthFilter !== f.key && (
                                                    <span className="ml-1.5 text-[10px] opacity-60">
                                                        {f.key === 'at-risk' ? healthData.stakeholders.filter(s => s.isStale && (s.isImportant || s.powerLevel === 'HIGH')).length
                                                            : f.key === 'stale' ? healthData.stats.stale
                                                            : f.key === 'champions' ? healthData.stats.champions
                                                            : healthData.stats.unknown}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Stakeholder health list */}
                                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                                        {filteredHealthStakeholders.length === 0 ? (
                                            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                                                No stakeholders match this filter.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-border/30">
                                                {filteredHealthStakeholders.map(s => {
                                                    const stanceBadge = getStanceBadge(s.politicalStance);
                                                    const isAtRisk = s.isStale && (s.isImportant || s.powerLevel === 'HIGH');
                                                    const rowBg = isAtRisk
                                                        ? 'bg-red-500/5 hover:bg-red-500/10'
                                                        : s.isStale
                                                            ? 'bg-amber-500/5 hover:bg-amber-500/10'
                                                            : s.politicalStance === 'CHAMPION' && s.relationshipStrength >= 0.6
                                                                ? 'bg-emerald-500/5 hover:bg-emerald-500/8'
                                                                : 'hover:bg-muted/40';
                                                    return (
                                                        <div
                                                            key={s.id}
                                                            onClick={() => setProfileId(s.id)}
                                                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${rowBg}`}
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                                                                {s.name.charAt(0).toUpperCase()}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                                                                    {s.isImportant && <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                                                                    {isAtRisk && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                                                                    {s.role && <span className="truncate">{s.role}</span>}
                                                                    {s.role && s.organization && <span>·</span>}
                                                                    {s.organization && <span className="truncate">{s.organization}</span>}
                                                                </div>
                                                            </div>

                                                            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                                                                <div className={`w-16 h-1.5 rounded-full ${getStrengthBgColor(s.relationshipStrength)}`}>
                                                                    <div
                                                                        className={`h-full rounded-full ${getStrengthColor(s.relationshipStrength)}`}
                                                                        style={{ width: `${Math.round(s.relationshipStrength * 100)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground w-7 text-right">
                                                                    {Math.round(s.relationshipStrength * 100)}%
                                                                </span>
                                                            </div>

                                                            <span className={`hidden md:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${stanceBadge.color}`}>
                                                                {stanceBadge.label}
                                                            </span>

                                                            <div className="shrink-0 w-5 flex items-center justify-center" title={s.trend}>
                                                                {s.trend === 'improving' ? (
                                                                    <TrendingUp size={14} className="text-emerald-400" />
                                                                ) : s.trend === 'declining' ? (
                                                                    <TrendingDown size={14} className="text-red-400" />
                                                                ) : (
                                                                    <Minus size={14} className="text-muted-foreground" />
                                                                )}
                                                            </div>

                                                            <div className="shrink-0 text-right w-14">
                                                                <span className={`text-xs ${s.isStale ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                                                    {s.daysSinceContact !== null ? (
                                                                        s.daysSinceContact === 0 ? 'Today' : `${s.daysSinceContact}d`
                                                                    ) : 'Never'}
                                                                </span>
                                                                {s.isStale && (
                                                                    <div className="text-[10px] text-red-400/70">stale</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border bg-card p-10 text-center">
                                    <p className="text-sm text-muted-foreground">Failed to load relationship data.</p>
                                    <button
                                        onClick={() => { setHealthData(null); }}
                                        className="text-xs text-primary hover:underline mt-2"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )
                        ) : (
                            /* Card View - Org-first layout */
                            <>
                                {orgGroups.length === 0 && unaffiliated.length === 0 ? (
                                    /* Empty state */
                                    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
                                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                                            <Building2 size={20} className="text-blue-400" />
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-1">No organizations yet</p>
                                        <p className="text-xs text-muted-foreground mb-4">Start by adding your company and key organizations you work with.</p>
                                        <button
                                            onClick={() => { setEditOrgData(null); setShowOrgModal(true); }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                                        >
                                            <Building2 size={13} /> Add Organization
                                        </button>
                                    </div>
                                ) : (
                                    /* Org cards grid */
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {orgGroups.map(({ org, people }) => (
                                            <OrgCard
                                                key={org.id}
                                                org={org}
                                                people={people}
                                                onAddPerson={openAddPersonForOrg}
                                                onEditOrg={(o) => { setEditOrgData(o); setShowOrgModal(true); }}
                                                onDeleteOrg={handleDeleteOrg}
                                                onDeletePerson={handleDelete}
                                                onEditPerson={handleEdit}
                                                onViewProfile={(id) => setProfileId(id)}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Unaffiliated People */}
                                {unaffiliated.length > 0 && (
                                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                                        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border/50">
                                            <div className="w-7 h-7 rounded-full bg-slate-500/15 flex items-center justify-center">
                                                <Users size={14} className="text-slate-400" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-foreground">Unaffiliated</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {unaffiliated.length} {unaffiliated.length === 1 ? 'person' : 'people'} not assigned to an organization
                                                </span>
                                            </div>
                                        </div>
                                        <div className="divide-y divide-border/30">
                                            {unaffiliated.map(s => (
                                                <PersonRow
                                                    key={s.id}
                                                    stakeholder={s}
                                                    onDelete={handleDelete}
                                                    onEdit={handleEdit}
                                                    onViewProfile={(id) => setProfileId(id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Discovered People Panel */}
                        <DiscoveredPeoplePanel
                            people={data.discovered}
                            onClassify={(person) => { setClassifyPerson(person); setIsEditMode(false); }}
                        />

                        {/* Initiatives */}
                        <InitiativesPanel
                            projects={data.projects}
                            onAdd={() => setShowProjectModal(true)}
                            onDelete={handleDeleteProject}
                        />
                    </div>
                )}

                {/* Add Person Modal */}
                {modalContext && data && (
                    <AddPersonModal
                        context={modalContext}
                        teams={data.teams}
                        orgs={data.orgs}
                        existingPeople={[...data.discovered, ...unaffiliated]}
                        defaultOrgId={addPersonOrgId}
                        defaultCompany={addPersonOrgName || data.orgs.find(o => o.relationToUser === 'EMPLOYER')?.name || ''}
                        onClose={() => { setModalContext(null); setAddPersonOrgId(''); setAddPersonOrgName(''); }}
                        onAdd={handleAdd}
                        onAssignExisting={handleClassify}
                    />
                )}

                {/* Add/Edit Org Modal */}
                {showOrgModal && (
                    <AddOrgModal
                        editOrg={editOrgData}
                        onClose={() => { setShowOrgModal(false); setEditOrgData(null); }}
                        onAdd={handleAddOrg}
                    />
                )}

                {/* Classify Modal */}
                {classifyPerson && data && (
                    <ClassifyModal
                        person={classifyPerson}
                        orgs={data.orgs}
                        onClose={() => { setClassifyPerson(null); setIsEditMode(false); }}
                        onClassify={handleClassify}
                        isEdit={isEditMode}
                    />
                )}

                {/* Add Project Modal */}
                {showProjectModal && (
                    <AddProjectModal
                        onClose={() => setShowProjectModal(false)}
                        onAdd={handleAddProject}
                    />
                )}

                {/* Stakeholder Profile Panel */}
                {profileId && (
                    <StakeholderProfilePanel
                        stakeholderId={profileId}
                        onClose={() => setProfileId(null)}
                        onToggleImportant={handleToggleImportant}
                        onCorrectArchetype={handleCorrectArchetype}
                    />
                )}
            </div>
        </div>
    );
}
