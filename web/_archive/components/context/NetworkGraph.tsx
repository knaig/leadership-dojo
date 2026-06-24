"use client";

import { useMemo } from 'react';
import { ReactFlow, Background, Controls, Node, Edge, MarkerType, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodeStyle = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    padding: '12px',
    borderRadius: '12px',
    minWidth: '180px',
    fontSize: '12px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
};

export function NetworkGraph({ stakeholders }: { stakeholders: any[] }) {

    const nodes: Node[] = useMemo(() => {
        // Center Node (User)
        const centerNode = {
            id: 'user-node',
            data: { label: 'YOU' },
            position: { x: 400, y: 300 },
            style: {
                ...nodeStyle,
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                border: 'none',
                fontWeight: 'bold',
                minWidth: '80px',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }
        };

        const others = stakeholders.map((s, index) => {
            const angle = (index / stakeholders.length) * 2 * Math.PI;
            const radius = 250;
            const x = 400 + radius * Math.cos(angle);
            const y = 300 + radius * Math.sin(angle);

            return {
                id: s.id,
                data: {
                    label: (
                        <div className="flex flex-col gap-1">
                            <div className="font-bold text-sm truncate text-foreground">{s.name}</div>
                            <div className="text-muted-foreground text-xs truncate">{s.role || 'Unknown'}</div>
                            <div className="flex gap-1 mt-1">
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${s.influenceLevel === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200' :
                                    s.influenceLevel === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-200' :
                                        'bg-accent text-accent-foreground'
                                    }`}>
                                    {s.influenceLevel}
                                </span>
                            </div>
                        </div>
                    )
                },
                position: { x, y },
                style: {
                    ...nodeStyle,
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))'
                }
            };
        });

        return [centerNode, ...others];
    }, [stakeholders]);

    const edges: Edge[] = useMemo(() => {
        return stakeholders.map(s => {
            const strength = s.relationshipStrength || 0.1;

            let stroke = 'hsl(var(--muted-foreground))';
            if (strength >= 0.8) stroke = '#10b981';
            if (strength <= 0.3) stroke = '#ef4444';

            const strokeWidth = Math.max(1, strength * 5);

            return {
                id: `e-${s.id}`,
                source: 'user-node',
                target: s.id,
                animated: true,
                type: 'default',
                markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
                style: { stroke, strokeWidth, opacity: 0.8 }
            };
        });
    }, [stakeholders]);

    if (!stakeholders.length) return null;

    return (
        <div className="w-full h-[600px] border border-border rounded-xl bg-background">
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <Background color="hsl(var(--muted-foreground))" gap={20} style={{ opacity: 0.2 }} />
                    <Controls className="fill-foreground text-foreground border-border bg-card" />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
