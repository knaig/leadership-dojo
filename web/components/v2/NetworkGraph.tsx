'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize, RefreshCw } from 'lucide-react';

// Dynamically import ForceGraph2D with no SSR
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full text-muted-foreground">Loading Graph Engine...</div>
});

interface GraphNode {
    id: string;
    name: string;
    val: number; // Size
    color?: string;
    role?: string;
    img?: string;
}

interface GraphLink {
    source: string;
    target: string;
    value: number; // Thickness/Strength
}

interface NetworkGraphProps {
    data: {
        nodes: GraphNode[];
        links: GraphLink[];
    };
    onNodeClick?: (node: GraphNode) => void;
}

export function NetworkGraph({ data, onNodeClick }: NetworkGraphProps) {
    const fgRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ w: 800, h: 600 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Resize observer to make sure graph fits container
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ w: width, h: height });
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const handleZoomIn = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() * 1.2, 400);
        }
    };

    const handleZoomOut = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() / 1.2, 400);
        }
    };

    const handleCenter = () => {
        if (fgRef.current) {
            fgRef.current.zoomToFit(400, 20);
        }
    };

    const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
    const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
    const [hoverNode, setHoverNode] = useState<string | null>(null);

    const handleNodeClick = useCallback((node: any) => {
        // Always notify parent of click (for detail panel, etc.)
        if (onNodeClick) onNodeClick(node);

        // Toggle Focus
        const newHighlights = new Set<string>();
        const newLinks = new Set<string>();

        // If clicking same node, clear focus
        if (highlightNodes.has(node.id) && highlightNodes.size > 0) {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
            if (fgRef.current) fgRef.current.zoomToFit(400); // Reset zoom
            return;
        }

        // Add selected node
        newHighlights.add(node.id);

        // Add neighbors
        data.links.forEach((link: any) => {
            if (link.source.id === node.id || link.target.id === node.id) {
                newHighlights.add(link.source.id);
                newHighlights.add(link.target.id);
                newLinks.add(link.source.id + '-' + link.target.id); // Assuming simple link ID strategy or object ref check
                newLinks.add(link.target.id + '-' + link.source.id);
                newLinks.add(link.id); // If link has ID
            }
        });

        setHighlightNodes(newHighlights);
        setHighlightLinks(newLinks);

        // Zoom to node
        if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 400);
            fgRef.current.zoom(2.5, 400);
        }
    }, [data, onNodeClick, highlightNodes]);

    return (
        <Card className="bg-background border-border h-full relative overflow-hidden flex flex-col shadow-inner shadow-black/50">
            {/* Toolbar */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <Button variant="secondary" size="icon" onClick={() => { setHighlightNodes(new Set()); handleCenter(); }} className="bg-muted hover:bg-white/20 text-white rounded-lg">
                    <Maximize size={18} />
                </Button>
            </div>

            <div className="flex-1 w-full h-full" ref={containerRef}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.w}
                    height={dimensions.h}
                    graphData={data}

                    // Visual Styling
                    nodeRelSize={6}

                    // Dimming Logic
                    nodeColor={(node: any) => {
                        if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) return 'rgba(255,255,255,0.1)'; // Dimmed
                        return node.color || '#6366f1';
                    }}

                    linkColor={(link: any) => {
                        // Check if connected nodes are highlighted
                        const isConnected = highlightNodes.has(link.source.id) && highlightNodes.has(link.target.id);
                        if (highlightNodes.size > 0 && !isConnected) return 'rgba(255,255,255,0.02)'; // Dimmed
                        return 'rgba(255,255,255,0.15)';
                    }}

                    linkWidth={link => Math.min(Math.log((link as GraphLink).value + 1) * 3, 8)}
                    linkDirectionalParticles={highlightNodes.size > 0 ? 4 : 2}

                    backgroundColor="#0f1117"
                    onNodeClick={handleNodeClick}
                    cooldownTicks={100}
                    onEngineStop={() => fgRef.current?.zoomToFit(400)}

                    nodePointerAreaPaint={(node: any, color, ctx) => {
                        // Extend clickable area to cover both the circle and the label below it
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y + 4, 12, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }}

                    nodeCanvasObject={(node: any, ctx, globalScale) => {
                        const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
                        const label = node.name;
                        const fontSize = 12 / globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;

                        // Draw Circle
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                        ctx.fillStyle = isDimmed ? 'rgba(80,80,80,0.5)' : (node.color || '#6366f1');
                        ctx.fill();

                        // Draw Label
                        if (!isDimmed || globalScale > 2) { // Hide labels of dimmed nodes unless zoomed in
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = isDimmed ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.9)';
                            ctx.fillText(label, node.x, node.y + 8);
                        }
                    }}
                />
            </div>
        </Card>
    );
}
