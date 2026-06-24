
"use client";

import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Node, Edge, MarkerType, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Mail, Calendar, FileText, Link2 } from 'lucide-react';

const nodeStyle = {
    background: '#1e1e1e', // Dark mode default
    border: '1px solid #333',
    padding: '12px',
    borderRadius: '8px',
    minWidth: '180px',
    fontSize: '12px',
    color: '#e5e7eb',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
};

const TypeIcon = ({ type }: { type: string }) => {
    switch (type) {
        case 'EMAIL_SENT': return <Mail className="w-4 h-4 text-blue-400" />;
        case 'MEETING_ATTENDED': return <Calendar className="w-4 h-4 text-orange-400" />;
        case 'DOCUMENT_AUTHORED':
        case 'DOCUMENT_EDITED': return <FileText className="w-4 h-4 text-emerald-400" />;
        default: return <Link2 className="w-4 h-4 text-gray-400" />;
    }
}

export function ArtifactGraph({ nodes: rawNodes, links }: { nodes: any[], links: any[] }) {

    const nodes: Node[] = useMemo(() => {
        // Simple force-directed layout simulation (randomized for now, ReactFlow handles dragging)
        // In a real app, use dagre or d3-force to calculate positions

        return rawNodes.map((n, index) => {
            // Spiral layout
            const angle = 0.5 * index;
            const radius = 50 + 10 * index;
            const x = 400 + radius * Math.cos(angle);
            const y = 300 + radius * Math.sin(angle);

            return {
                id: n.id,
                data: {
                    label: (
                        <div className="flex items-center gap-3">
                            <TypeIcon type={n.type} />
                            <div className="flex flex-col overflow-hidden">
                                <div className="font-medium truncate max-w-[140px]" title={n.title}>
                                    {n.title || "Untitled"}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate">
                                    {n.type}
                                </div>
                            </div>
                        </div>
                    )
                },
                position: { x, y },
                style: nodeStyle
            };
        });
    }, [rawNodes]);

    const edges: Edge[] = useMemo(() => {
        return links.map(l => {
            let stroke = '#666';
            let animated = false;

            // Color Coding by Link Type
            switch (l.type) {
                case 'FOLLOW_UP':
                    stroke = '#10b981'; // Green
                    animated = true;
                    break;
                case 'PRE_READ':
                    stroke = '#3b82f6'; // Blue
                    break;
                case 'EXPLICIT_MENTION':
                    stroke = '#a855f7'; // Purple
                    break;
                case 'TIME_PROXIMITY':
                    stroke = '#4b5563'; // Grey
                    break;
            }

            return {
                id: l.id,
                source: l.sourceId,
                target: l.targetId,
                animated,
                label: l.type !== 'TIME_PROXIMITY' ? l.type.replace('_', ' ') : '',
                labelStyle: { fill: '#888', fontSize: 9 },
                labelBgStyle: { fill: '#1a1a1a', fillOpacity: 0.8 },
                type: 'default',
                markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
                style: { stroke, strokeWidth: 1.5, opacity: 0.8 }
            };
        });
    }, [links]);

    if (!rawNodes.length) {
        return <div className="p-8 text-center text-gray-500">No connected artifacts found. Try syncing more data!</div>;
    }

    return (
        <div className="w-full h-[600px] border border-gray-800 rounded-xl bg-[#0a0a0a]">
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <Background color="#333" gap={20} style={{ opacity: 0.2 }} />
                    <Controls className="bg-gray-800 border-gray-700 text-white" />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
