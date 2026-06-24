'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';

/**
 * OrgMap — Organization-level network graph.
 * Shows organizations as nodes with relationship edges between them.
 * Your company is the central node. Click an org to see its details.
 */

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading graph...
        </div>
    ),
});

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

interface OrgMapProps {
    orgs: OrgData[];
    graphEdges: GraphEdge[];
    peopleCounts: Record<string, number>; // orgId -> count of people
    onOrgClick?: (orgId: string) => void;
}

interface OrgNode {
    id: string;
    name: string;
    type: 'org' | 'you';
    relation: string;
    domain: string | null;
    industry: string | null;
    peopleCount: number;
    color: string;
    val: number;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
}

interface OrgLink {
    source: string;
    target: string;
    relationType: string;
    color: string;
    width: number;
}

const ORG_RELATION_COLORS: Record<string, string> = {
    EMPLOYER: '#6366f1',
    CLIENT: '#f59e0b',
    VENDOR: '#f97316',
    PARTNER: '#0ea5e9',
    COMPETITOR: '#ef4444',
    INVESTOR: '#eab308',
    REGULATOR: '#64748b',
    OTHER: '#94a3b8',
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

const EDGE_TYPE_COLORS: Record<string, string> = {
    client_of: '#f59e0b',
    vendor_of: '#f97316',
    partner_with: '#0ea5e9',
    competes_with: '#ef4444',
    invests_in: '#eab308',
    regulates: '#64748b',
    parent_org: '#8b5cf6',
    subsidiary: '#a78bfa',
};

export function OrgMap({ orgs, graphEdges, peopleCounts, onOrgClick }: OrgMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
    const [hoveredNode, setHoveredNode] = useState<OrgNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // Build graph data
    const graphData = useMemo(() => {
        const nodes: OrgNode[] = [];
        const links: OrgLink[] = [];

        // Find employer org (center node)
        const employer = orgs.find(o => o.relationToUser === 'EMPLOYER');

        // Add "You" center node
        nodes.push({
            id: '_you',
            name: 'You',
            type: 'you',
            relation: 'YOU',
            domain: null,
            industry: null,
            peopleCount: 0,
            color: '#6366f1',
            val: 15,
            fx: 0,
            fy: 0,
        });

        // Add org nodes
        for (const org of orgs) {
            const count = peopleCounts[org.id] || 0;
            const isEmployer = org.relationToUser === 'EMPLOYER';
            nodes.push({
                id: org.id,
                name: org.name,
                type: 'org',
                relation: org.relationToUser,
                domain: org.domain,
                industry: org.industry,
                peopleCount: count,
                color: ORG_RELATION_COLORS[org.relationToUser] || '#94a3b8',
                val: isEmployer ? 12 : Math.max(4, Math.min(10, 4 + count)),
            });

            // Link each org to the center "You" node
            links.push({
                source: '_you',
                target: org.id,
                relationType: org.relationToUser,
                color: ORG_RELATION_COLORS[org.relationToUser] || '#94a3b8',
                width: isEmployer ? 2.5 : 1.5,
            });
        }

        // Add org-to-org edges from graphEdges
        const orgEdges = graphEdges.filter(
            e => e.sourceType === 'ORGANIZATION' && e.targetType === 'ORGANIZATION'
        );
        for (const edge of orgEdges) {
            const sourceExists = nodes.some(n => n.id === edge.source);
            const targetExists = nodes.some(n => n.id === edge.target);
            if (sourceExists && targetExists) {
                links.push({
                    source: edge.source,
                    target: edge.target,
                    relationType: edge.relationType,
                    color: EDGE_TYPE_COLORS[edge.relationType] || '#64748b',
                    width: 1.5,
                });
            }
        }

        // Parent-child org relationships
        for (const org of orgs) {
            if (org.parentOrgId) {
                const parentExists = nodes.some(n => n.id === org.parentOrgId);
                if (parentExists) {
                    links.push({
                        source: org.parentOrgId!,
                        target: org.id,
                        relationType: 'parent_org',
                        color: '#8b5cf6',
                        width: 1,
                    });
                }
            }
        }

        return { nodes, links };
    }, [orgs, graphEdges, peopleCounts]);

    // Node canvas renderer
    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const n = node as OrgNode;
        const x = n.x || 0;
        const y = n.y || 0;
        const baseSize = n.val;

        if (n.type === 'you') {
            // Central "You" node — filled circle with ring
            ctx.beginPath();
            ctx.arc(x, y, baseSize, 0, 2 * Math.PI);
            ctx.fillStyle = '#6366f1';
            ctx.fill();
            ctx.strokeStyle = '#818cf8';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = `bold ${11 / globalScale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('YOU', x, y);
            return;
        }

        // Org node — rounded rect with icon
        const w = Math.max(60, n.name.length * 5 + 24) / globalScale;
        const h = 28 / globalScale;
        const radius = 6 / globalScale;

        // Background
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
        ctx.fillStyle = n.color + '25'; // 15% opacity fill
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();

        // Org name
        const fontSize = Math.max(9, 11 / globalScale);
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = n.color;
        ctx.fillText(n.name, x, y - 1 / globalScale);

        // People count badge
        if (n.peopleCount > 0) {
            const badgeText = `${n.peopleCount}`;
            const badgeFontSize = 7 / globalScale;
            ctx.font = `${badgeFontSize}px sans-serif`;
            const badgeW = ctx.measureText(badgeText).width + 6 / globalScale;
            const badgeH = 10 / globalScale;
            const badgeX = x + w / 2 - badgeW / 2 - 2 / globalScale;
            const badgeY = y - h / 2 - badgeH / 2;

            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 / globalScale);
            ctx.fillStyle = n.color;
            ctx.fill();
            ctx.font = `bold ${badgeFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
        }

        // Relation label below
        const labelFontSize = 7 / globalScale;
        ctx.font = `${labelFontSize}px sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(
            ORG_RELATION_LABELS[n.relation] || n.relation,
            x,
            y + h / 2 + 8 / globalScale
        );
    }, []);

    // Link renderer
    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const source = link.source as OrgNode;
        const target = link.target as OrgNode;
        if (!source.x || !target.x) return;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y!);
        ctx.lineTo(target.x, target.y!);
        ctx.strokeStyle = link.color + '60';
        ctx.lineWidth = link.width / globalScale;
        ctx.stroke();

        // Edge label at midpoint
        if (link.relationType && link.relationType !== source.relation) {
            const mx = (source.x + target.x) / 2;
            const my = (source.y! + target.y!) / 2;
            const fontSize = 6 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = link.color + '80';
            const label = link.relationType.replace(/_/g, ' ');
            ctx.fillText(label, mx, my - 4 / globalScale);
        }
    }, []);

    // Fit to view on mount
    useEffect(() => {
        if (graphRef.current && graphData.nodes.length > 1) {
            setTimeout(() => {
                graphRef.current?.zoomToFit(400, 60);
            }, 600);
        }
    }, [graphData.nodes.length]);

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <ForceGraph2D
                ref={graphRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeCanvasObject={paintNode}
                linkCanvasObject={paintLink}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                    const n = node as OrgNode;
                    const x = n.x || 0;
                    const y = n.y || 0;
                    if (n.type === 'you') {
                        ctx.beginPath();
                        ctx.arc(x, y, n.val, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();
                    } else {
                        const w = 60;
                        const h = 28;
                        ctx.fillStyle = color;
                        ctx.fillRect(x - w / 2, y - h / 2, w, h);
                    }
                }}
                onNodeClick={(node: any) => {
                    const n = node as OrgNode;
                    if (n.type === 'org' && onOrgClick) {
                        onOrgClick(n.id);
                    }
                }}
                onNodeHover={(node: any, prevNode: any) => {
                    if (node && (node as OrgNode).type === 'org') {
                        setHoveredNode(node as OrgNode);
                    } else {
                        setHoveredNode(null);
                    }
                }}
                onNodeDrag={(node: any) => {
                    setHoveredNode(null);
                }}
                backgroundColor="transparent"
                linkDirectionalParticles={0}
                d3AlphaDecay={0.04}
                d3VelocityDecay={0.3}
                cooldownTicks={100}
                enableZoomInteraction={true}
                enablePanInteraction={true}
            />

            {/* Tooltip */}
            {hoveredNode && (
                <div
                    className="absolute z-30 pointer-events-none bg-card border border-border rounded-lg shadow-xl px-3 py-2 max-w-[200px]"
                    style={{
                        left: dimensions.width / 2 + (hoveredNode.x || 0),
                        top: dimensions.height / 2 + (hoveredNode.y || 0) - 40,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    <p className="text-xs font-semibold text-foreground">{hoveredNode.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                        {ORG_RELATION_LABELS[hoveredNode.relation] || hoveredNode.relation}
                    </p>
                    {hoveredNode.domain && (
                        <p className="text-[10px] text-muted-foreground">{hoveredNode.domain}</p>
                    )}
                    {hoveredNode.industry && (
                        <p className="text-[10px] text-muted-foreground">{hoveredNode.industry}</p>
                    )}
                    <p className="text-[10px] text-primary mt-1">
                        {hoveredNode.peopleCount} {hoveredNode.peopleCount === 1 ? 'person' : 'people'}
                    </p>
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                {Object.entries(ORG_RELATION_LABELS).map(([key, label]) => {
                    const hasOrg = orgs.some(o => o.relationToUser === key);
                    if (!hasOrg) return null;
                    return (
                        <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: ORG_RELATION_COLORS[key] }}
                            />
                            {label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
