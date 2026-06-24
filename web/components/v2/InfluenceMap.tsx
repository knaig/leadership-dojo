'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, Maximize, ChevronRight, X } from 'lucide-react';

/**
 * Influence Map — Layered 2D force-directed graph with org clustering
 *
 * Design principles:
 * - Primary org expanded by default, secondary orgs as collapsed clusters
 * - Click cluster to drill in, breadcrumb to navigate back
 * - Edges are first-class: show relationship type, color by nature
 * - Rich tooltip on hover with all collected attributes
 * - Layered depth: expanded org is prominent, others are dimmed/smaller
 */

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading graph...
        </div>
    ),
});

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface Person {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    organization: string | null;
    orgId: string | null;
    archetype: string | null;
    powerLevel: string;
    influenceRole: string;
    politicalStance: string;
    communicationStyle: string | null;
    personaArchetype: string | null;
    primaryMotivation: string | null;
    relationshipStrength: number;
    lastInteraction: string | null;
    interactionCount: number;
    influenceLevel: string | null;
    intelligence?: {
        profileSummary: string | null;
        currentMood: string | null;
        recentTopics: string[];
        successPatterns: string[];
        objectionPatterns: string[];
    } | null;
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

interface InfluenceMapProps {
    people: Person[];
    orgs: OrgData[];
    graphEdges: GraphEdge[];
    userName: string;
    onPersonClick?: (id: string) => void;
}

// Internal graph types
interface GraphNode {
    id: string;
    name: string;
    type: 'person' | 'org-cluster' | 'you';
    val: number; // node size
    color: string;
    // Person data
    person?: Person;
    // Org cluster data
    orgName?: string;
    orgId?: string;
    memberCount?: number;
    orgRelation?: string;
    // Force positioning
    fx?: number;
    fy?: number;
    x?: number;
    y?: number;
}

interface GraphLink {
    source: string;
    target: string;
    relationType: string;
    color: string;
    width: number;
    dashed: boolean;
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const STANCE_COLORS: Record<string, string> = {
    CHAMPION: '#10b981',
    SUPPORTIVE: '#34d399',
    NEUTRAL: '#64748b',
    SKEPTIC: '#f59e0b',
    HOSTILE: '#ef4444',
    UNKNOWN: '#64748b',
};

const ARCHETYPE_COLORS: Record<string, string> = {
    manager: '#6366f1',
    skip_level: '#818cf8',
    executive_sponsor: '#4f46e5',
    board_member: '#7c3aed',
    peer: '#8b5cf6',
    cross_functional: '#a78bfa',
    direct_report: '#10b981',
    mentee: '#34d399',
    mentor: '#14b8a6',
    advisor: '#2dd4bf',
    customer_buyer: '#f59e0b',
    customer_champion: '#fbbf24',
    customer_influencer: '#d97706',
    customer_end_user: '#92400e',
    customer_technical: '#b45309',
    customer_executive: '#f59e0b',
    vendor: '#f97316',
    partner: '#0ea5e9',
    investor: '#eab308',
    blocker: '#ef4444',
    gatekeeper: '#f97316',
};

const EDGE_COLORS: Record<string, string> = {
    reports_to: '#6366f1',
    formal_reports_to: '#6366f1',
    matrix_reports_to: '#a78bfa',
    manages: '#10b981',
    peer: '#8b5cf6',
    collaborates_with: '#0ea5e9',
    client_of: '#f59e0b',
    vendor_of: '#f97316',
    mentors: '#14b8a6',
    blocks: '#ef4444',
};

const EDGE_LABELS: Record<string, string> = {
    reports_to: 'Reports to',
    formal_reports_to: 'Reports to',
    matrix_reports_to: 'Matrix reports to',
    manages: 'Manages',
    peer: 'Peer',
    collaborates_with: 'Collaborates',
    client_of: 'Client',
    vendor_of: 'Vendor',
    mentors: 'Mentors',
    blocks: 'Blocks',
};

const ORG_RELATION_COLORS: Record<string, string> = {
    EMPLOYER: '#6366f1',
    CLIENT: '#f59e0b',
    VENDOR: '#f97316',
    PARTNER: '#0ea5e9',
    COMPETITOR: '#ef4444',
    INVESTOR: '#eab308',
    REGULATOR: '#64748b',
    OTHER: '#64748b',
};

const RELATION_LABELS: Record<string, string> = {
    EMPLOYER: 'Your org',
    CLIENT: 'Client',
    VENDOR: 'Vendor',
    PARTNER: 'Partner',
    COMPETITOR: 'Competitor',
    INVESTOR: 'Investor',
    REGULATOR: 'Regulator',
    OTHER: 'Other',
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function getPersonColor(person: Person): string {
    if (person.politicalStance && person.politicalStance !== 'UNKNOWN') {
        return STANCE_COLORS[person.politicalStance] || '#64748b';
    }
    return ARCHETYPE_COLORS[person.archetype || ''] || '#64748b';
}

function getPersonSize(person: Person): number {
    if (person.powerLevel === 'HIGH') return 8;
    if (person.powerLevel === 'MEDIUM') return 5;
    return 3;
}

function groupPeopleByOrg(people: Person[], orgs: OrgData[]): Map<string, Person[]> {
    const orgMap = new Map<string, OrgData>();
    for (const org of orgs) orgMap.set(org.id, org);

    const groups = new Map<string, Person[]>();

    for (const p of people) {
        // Determine org key: use orgId if set, else try to match organization name
        let orgKey = p.orgId || '';
        if (!orgKey && p.organization) {
            // Try to find matching org by name
            const matchingOrg = orgs.find(o =>
                o.name.toLowerCase() === p.organization!.toLowerCase() ||
                (o.domain && p.email && p.email.endsWith(`@${o.domain}`))
            );
            if (matchingOrg) orgKey = matchingOrg.id;
            else orgKey = `_name:${p.organization}`; // Group by org name string
        }
        if (!orgKey) orgKey = '_unaffiliated';

        if (!groups.has(orgKey)) groups.set(orgKey, []);
        groups.get(orgKey)!.push(p);
    }

    return groups;
}

function formatRelType(relType: string): string {
    return EDGE_LABELS[relType] || relType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export function InfluenceMap({ people, orgs, graphEdges, userName, onPersonClick }: InfluenceMapProps) {
    const fgRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
    const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
    const [focusedOrg, setFocusedOrg] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
    const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);

    // Auto-expand employer orgs on mount
    useEffect(() => {
        const employerOrgs = orgs.filter(o => o.relationToUser === 'EMPLOYER');
        if (employerOrgs.length > 0) {
            setExpandedOrgs(new Set(employerOrgs.map(o => o.id)));
        } else {
            // If no orgs defined yet, expand all people (flat view)
            setExpandedOrgs(new Set(['_all']));
        }
    }, [orgs]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ w: width, h: Math.max(height, 500) });
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    // Build graph data from people + orgs + edges
    const graphData = useMemo(() => {
        const nodes: GraphNode[] = [];
        const links: GraphLink[] = [];
        const nodeIds = new Set<string>();

        // "YOU" center node
        nodes.push({
            id: '_you',
            name: userName,
            type: 'you',
            val: 12,
            color: '#6366f1',
            fx: 0,
            fy: 0,
        });
        nodeIds.add('_you');

        const peopleByOrg = groupPeopleByOrg(people, orgs);
        const isFlat = expandedOrgs.has('_all');

        // Search filter
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch = (p: Person) =>
            !searchQuery || p.name.toLowerCase().includes(searchLower) ||
            (p.role && p.role.toLowerCase().includes(searchLower)) ||
            (p.organization && p.organization.toLowerCase().includes(searchLower));

        for (const [orgKey, members] of peopleByOrg.entries()) {
            const org = orgs.find(o => o.id === orgKey);
            const orgName = org?.name || (orgKey.startsWith('_name:') ? orgKey.slice(6) : 'Unaffiliated');
            const isExpanded = isFlat || expandedOrgs.has(orgKey);
            const isFocused = !focusedOrg || focusedOrg === orgKey;
            const filteredMembers = members.filter(matchesSearch);

            if (isExpanded && isFocused) {
                // Show individual people
                for (const person of filteredMembers) {
                    const nodeId = person.id;
                    nodes.push({
                        id: nodeId,
                        name: person.name,
                        type: 'person',
                        val: getPersonSize(person),
                        color: getPersonColor(person),
                        person,
                        orgId: orgKey,
                        orgName,
                    });
                    nodeIds.add(nodeId);

                    // Link from YOU → person (based on relationship strength)
                    links.push({
                        source: '_you',
                        target: nodeId,
                        relationType: person.archetype || 'connected',
                        color: `rgba(${hexToRgb(getPersonColor(person))}, ${0.1 + person.relationshipStrength * 0.3})`,
                        width: person.powerLevel === 'HIGH' ? 1.5 : 0.8,
                        dashed: false,
                    });
                }
            } else if (filteredMembers.length > 0) {
                // Show collapsed org cluster
                const clusterId = `_cluster:${orgKey}`;
                const avgStrength = members.reduce((s, p) => s + p.relationshipStrength, 0) / members.length;
                const clusterColor = org ? (ORG_RELATION_COLORS[org.relationToUser] || '#64748b') : '#64748b';

                nodes.push({
                    id: clusterId,
                    name: orgName,
                    type: 'org-cluster',
                    val: Math.max(10, Math.min(25, members.length * 2)),
                    color: clusterColor,
                    orgName,
                    orgId: orgKey,
                    memberCount: members.length,
                    orgRelation: org?.relationToUser,
                });
                nodeIds.add(clusterId);

                // Link from YOU → cluster
                links.push({
                    source: '_you',
                    target: clusterId,
                    relationType: org?.relationToUser || 'connected',
                    color: `rgba(${hexToRgb(clusterColor)}, ${0.15 + avgStrength * 0.2})`,
                    width: 1.5,
                    dashed: true,
                });
            }
        }

        // Add explicit person-to-person edges
        for (const edge of graphEdges) {
            if (edge.sourceType === 'STAKEHOLDER' && edge.targetType === 'STAKEHOLDER') {
                if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
                    links.push({
                        source: edge.source,
                        target: edge.target,
                        relationType: edge.relationType,
                        color: EDGE_COLORS[edge.relationType] || 'rgba(148, 163, 184, 0.3)',
                        width: 1 + edge.confidence,
                        dashed: edge.confidence < 0.5,
                    });
                }
            }
        }

        return { nodes, links };
    }, [people, orgs, graphEdges, expandedOrgs, focusedOrg, searchQuery, userName]);

    // Handle org cluster click — expand it
    const handleNodeClick = useCallback((node: any) => {
        if (node.type === 'org-cluster' && node.orgId) {
            setExpandedOrgs(prev => {
                const next = new Set(prev);
                next.add(node.orgId);
                return next;
            });
            setFocusedOrg(node.orgId);
            setBreadcrumb(prev => [...prev, { id: node.orgId, name: node.orgName || node.name }]);
            // Zoom to fit after expansion
            setTimeout(() => fgRef.current?.zoomToFit(400, 40), 100);
        } else if (node.type === 'person' && onPersonClick) {
            onPersonClick(node.id);
        }
    }, [onPersonClick]);

    // Navigate breadcrumb
    const handleBreadcrumbClick = useCallback((index: number) => {
        if (index === -1) {
            // "All" — show all orgs
            setFocusedOrg(null);
            setBreadcrumb([]);
            const employerOrgs = orgs.filter(o => o.relationToUser === 'EMPLOYER');
            setExpandedOrgs(new Set(employerOrgs.map(o => o.id)));
            setTimeout(() => fgRef.current?.zoomToFit(400, 40), 100);
        } else {
            const target = breadcrumb[index];
            setFocusedOrg(target.id);
            setBreadcrumb(prev => prev.slice(0, index + 1));
        }
    }, [breadcrumb, orgs]);

    const handleZoomFit = useCallback(() => {
        fgRef.current?.zoomToFit(400, 40);
    }, []);

    // Node hover
    const handleNodeHover = useCallback((node: any, prevNode: any) => {
        if (node) {
            setHoveredNode(node);
        } else {
            setHoveredNode(null);
            setTooltipPos(null);
        }
    }, []);

    // Track mouse for tooltip position
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (hoveredNode) {
            setTooltipPos({ x: e.clientX, y: e.clientY });
        }
    }, [hoveredNode]);

    // Custom node rendering
    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        // Guard against NaN/undefined positions during initial simulation
        if (!isFinite(node.x) || !isFinite(node.y)) return;

        const isHovered = hoveredNode?.id === node.id;
        const isFocusedContext = !focusedOrg || node.orgId === focusedOrg || node.type === 'you';
        const isDimmed = focusedOrg && !isFocusedContext;
        const alpha = isDimmed ? 0.2 : 1;

        if (node.type === 'you') {
            // Center "YOU" node
            const r = 14;
            const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r);
            grad.addColorStop(0, 'hsl(250, 80%, 60%)');
            grad.addColorStop(1, 'hsl(250, 60%, 40%)');
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = 'bold 7px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('YOU', node.x, node.y);
            return;
        }

        if (node.type === 'org-cluster') {
            // Org cluster bubble
            const r = 6 + Math.sqrt(node.memberCount || 1) * 4;
            ctx.globalAlpha = alpha;

            // Background circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = node.color + '30';
            ctx.fill();
            ctx.strokeStyle = node.color + (isHovered ? 'cc' : '60');
            ctx.lineWidth = isHovered ? 2 : 1;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Org name
            const fontSize = Math.max(5, Math.min(8, 12 / globalScale));
            ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
            ctx.fillStyle = node.color + (isDimmed ? '60' : 'dd');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name, node.x, node.y - 2);

            // Member count
            ctx.font = `${fontSize * 0.8}px system-ui, sans-serif`;
            ctx.fillStyle = `rgba(255,255,255,${isDimmed ? 0.2 : 0.5})`;
            ctx.fillText(`${node.memberCount} people`, node.x, node.y + fontSize);

            // Relation badge
            if (node.orgRelation) {
                const label = RELATION_LABELS[node.orgRelation] || node.orgRelation;
                ctx.font = `${fontSize * 0.65}px system-ui, sans-serif`;
                ctx.fillStyle = `rgba(255,255,255,${isDimmed ? 0.15 : 0.35})`;
                ctx.fillText(label, node.x, node.y + fontSize * 2);
            }

            ctx.globalAlpha = 1;
            return;
        }

        // Person node
        const r = (node.val || 4) * (isHovered ? 1.3 : 1);
        ctx.globalAlpha = alpha;

        // Needs attention glow
        const twoWeeksAgo = Date.now() - 14 * 86400000;
        const needsAttention = node.person && (!node.person.lastInteraction || new Date(node.person.lastInteraction).getTime() < twoWeeksAgo);
        if (needsAttention && !isDimmed) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
            const glow = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 5);
            glow.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
            glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
            ctx.fillStyle = glow;
            ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? node.color : node.color + 'cc';
        ctx.fill();

        // Border
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered ? '#fff' : node.color + '40';
        ctx.lineWidth = isHovered ? 1.5 : 0.5;
        ctx.stroke();

        // Initial inside circle (only if big enough)
        if (r >= 4) {
            ctx.font = `${Math.max(3, r * 0.9)}px system-ui, sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.name.charAt(0).toUpperCase(), node.x, node.y);
        }

        // Name label — show for HIGH power or when zoomed in
        const showLabel = node.person?.powerLevel === 'HIGH' || isHovered || globalScale > 2;
        if (showLabel && !isDimmed) {
            const fontSize = Math.max(3, Math.min(6, 10 / globalScale));
            ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px system-ui, sans-serif`;
            const nameStr = node.name.split(' ')[0];
            const nameWidth = ctx.measureText(nameStr).width;

            // Background
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(node.x - nameWidth / 2 - 2, node.y + r + 2, nameWidth + 4, fontSize + 2);

            // Text
            ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.8)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(nameStr, node.x, node.y + r + 3);
        }

        ctx.globalAlpha = 1;
    }, [hoveredNode, focusedOrg]);

    // Custom link rendering
    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const sourceNode = link.source;
        const targetNode = link.target;
        if (!isFinite(sourceNode?.x) || !isFinite(sourceNode?.y) || !isFinite(targetNode?.x) || !isFinite(targetNode?.y)) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = link.color || 'rgba(255,255,255,0.1)';
        ctx.lineWidth = (link.width || 0.8) / globalScale;
        if (link.dashed) {
            ctx.setLineDash([4 / globalScale, 4 / globalScale]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Show edge label when zoomed in and link is between two people (not YOU)
        if (globalScale > 2.5 && sourceNode.id !== '_you' && targetNode.id !== '_you' && link.relationType) {
            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            const label = formatRelType(link.relationType);
            const fontSize = Math.max(2, 6 / globalScale);
            ctx.font = `${fontSize}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        }
    }, []);

    return (
        <div ref={containerRef} className="relative w-full h-full min-h-[500px]" onMouseMove={handleMouseMove}>
            {/* Search */}
            <div className="absolute top-3 left-3 z-10">
                <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5">
                    <Search size={13} className="text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search people..."
                        className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-32"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Breadcrumb navigation */}
            {breadcrumb.length > 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 text-xs">
                        <button
                            onClick={() => handleBreadcrumbClick(-1)}
                            className="text-primary hover:text-primary/80 font-medium"
                        >
                            All
                        </button>
                        {breadcrumb.map((crumb, i) => (
                            <span key={crumb.id} className="flex items-center gap-1">
                                <ChevronRight size={10} className="text-muted-foreground" />
                                <button
                                    onClick={() => handleBreadcrumbClick(i)}
                                    className={i === breadcrumb.length - 1
                                        ? 'text-foreground font-medium'
                                        : 'text-primary hover:text-primary/80'
                                    }
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Toolbar */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
                <button
                    onClick={handleZoomFit}
                    className="p-2 bg-black/60 backdrop-blur-sm border border-border/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    title="Fit to view"
                >
                    <Maximize size={14} />
                </button>
            </div>

            {/* Force Graph */}
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.w}
                height={dimensions.h}
                graphData={graphData}
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={(node: any, color, ctx) => {
                    const r = node.type === 'org-cluster' ? 6 + Math.sqrt(node.memberCount || 1) * 4 : (node.val || 4) + 4;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
                    ctx.fill();
                }}
                linkCanvasObject={paintLink}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                backgroundColor="transparent"
                cooldownTicks={150}
                d3AlphaDecay={0.04}
                d3VelocityDecay={0.3}
                onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
                enableNodeDrag={true}
                // @ts-ignore - react-force-graph-2d d3Force typing is overly strict
                d3Force={(forceName: string, force: any) => {
                    if (forceName === 'charge') {
                        force.strength((node: any) => {
                            if (node.type === 'org-cluster') return -200;
                            if (node.type === 'you') return -300;
                            return -60;
                        });
                    }
                    if (forceName === 'link') {
                        force.distance((link: any) => {
                            const src = link.source;
                            if (src?.id === '_you' || link.target?.id === '_you') {
                                const strength = src?.person?.relationshipStrength ?? link.target?.person?.relationshipStrength ?? 0.5;
                                return 40 + (1 - strength) * 120;
                            }
                            return 30 + (1 - (link.confidence || 0.5)) * 60;
                        });
                    }
                }}
            />

            {/* Tooltip */}
            {hoveredNode && tooltipPos && hoveredNode.type !== 'you' && (
                <div
                    className="fixed z-50 pointer-events-none"
                    style={{ left: tooltipPos.x + 16, top: tooltipPos.y - 10 }}
                >
                    {hoveredNode.type === 'org-cluster' ? (
                        <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 min-w-[180px] max-w-[260px]">
                            <div className="text-sm font-medium text-foreground">{hoveredNode.orgName}</div>
                            {hoveredNode.orgRelation && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {RELATION_LABELS[hoveredNode.orgRelation] || hoveredNode.orgRelation}
                                </div>
                            )}
                            <div className="text-xs text-muted-foreground mt-1">
                                {hoveredNode.memberCount} {hoveredNode.memberCount === 1 ? 'person' : 'people'}
                            </div>
                            <div className="text-[10px] text-primary mt-1.5">Click to expand</div>
                        </div>
                    ) : hoveredNode.person ? (
                        <PersonTooltip person={hoveredNode.person} orgName={hoveredNode.orgName} />
                    ) : null}
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg border border-border/50 p-3 text-[10px] max-w-[200px]">
                <div className="text-muted-foreground font-medium mb-1.5">Legend</div>
                <div className="space-y-1">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Champion / Supportive</div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Skeptic</div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /> Blocker / Hostile</div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Neutral / Unknown</div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-border/50 text-muted-foreground space-y-0.5">
                    <div>Larger node = more power</div>
                    <div>Closer to center = stronger relationship</div>
                    <div className="flex items-center gap-1"><div className="w-3 border-t border-dashed border-muted-foreground" /> Collapsed org</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full ring-2 ring-red-500/30" /> Needs attention</div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// PERSON TOOLTIP
// ═══════════════════════════════════════════════════════

function PersonTooltip({ person, orgName }: { person: Person; orgName?: string }) {
    const stanceLabel = person.politicalStance && person.politicalStance !== 'UNKNOWN'
        ? person.politicalStance.charAt(0) + person.politicalStance.slice(1).toLowerCase()
        : null;
    const commLabel = person.communicationStyle
        ? person.communicationStyle.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : null;
    const personaLabel = person.personaArchetype
        ? person.personaArchetype.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
        : null;
    const intel = person.intelligence;

    return (
        <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2.5 min-w-[220px] max-w-[300px]">
            <div className="text-sm font-medium text-foreground">{person.name}</div>
            {person.role && <div className="text-xs text-muted-foreground">{person.role}</div>}
            {(orgName || person.organization) && (
                <div className="text-xs text-muted-foreground/70">{orgName || person.organization}</div>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-1 mt-1.5">
                {person.archetype && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {formatRelType(person.archetype)}
                    </span>
                )}
                {stanceLabel && (
                    <span
                        className="text-[9px] px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: STANCE_COLORS[person.politicalStance] + 'cc' }}
                    >
                        {stanceLabel}
                    </span>
                )}
                {commLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">
                        {commLabel}
                    </span>
                )}
                {personaLabel && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                        {personaLabel}
                    </span>
                )}
            </div>

            {/* Strength bar */}
            <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0">Strength</span>
                <div className="flex-1 h-1 rounded-full bg-muted">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${person.relationshipStrength * 100}%`,
                            backgroundColor: getPersonColor(person),
                        }}
                    />
                </div>
                <span className="text-[10px] text-muted-foreground w-8 text-right">
                    {Math.round(person.relationshipStrength * 100)}%
                </span>
            </div>

            {/* Interaction info */}
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                <span>{person.interactionCount} interactions</span>
                <span>Last: {formatTimeAgo(person.lastInteraction)}</span>
            </div>

            {/* Intelligence data */}
            {intel && (
                <div className="mt-2 pt-1.5 border-t border-border/50">
                    {intel.currentMood && (
                        <div className="text-[10px] text-muted-foreground">
                            Mood: <span className="text-foreground/80">{intel.currentMood}</span>
                        </div>
                    )}
                    {intel.recentTopics && intel.recentTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {intel.recentTopics.slice(0, 3).map((topic, i) => (
                                <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                                    {topic}
                                </span>
                            ))}
                        </div>
                    )}
                    {intel.profileSummary && (
                        <div className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-2">
                            {intel.profileSummary}
                        </div>
                    )}
                </div>
            )}

            {person.primaryMotivation && (
                <div className="text-[10px] text-muted-foreground mt-1">
                    Motivated by: <span className="text-foreground/80">{person.primaryMotivation}</span>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════

function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '100, 100, 100';
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}
