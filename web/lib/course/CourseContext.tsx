'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type NodeStatus = 'locked' | 'active' | 'completed';

export interface CourseNode {
    id: string;
    title: string;
    type: 'case' | 'reflection' | 'milestone';
    status: NodeStatus;
    x: number; // For map positioning
    y: number;
}

interface CourseState {
    currentLevel: number;
    nodes: CourseNode[];
    isLoading: boolean;
}

const CourseContext = createContext<CourseState | undefined>(undefined);

// Mock Data for Phase 2 Prototype
const INITIAL_NODES: CourseNode[] = [
    { id: 'onboarding', title: 'Start Here', type: 'milestone', status: 'completed', x: 10, y: 50 },
    { id: 'png-case', title: 'Papua New Guinea', type: 'case', status: 'active', x: 30, y: 50 },
    { id: 'brazil-case', title: 'Brazil', type: 'case', status: 'locked', x: 50, y: 50 },
    { id: 'reflection-1', title: 'First Reflection', type: 'reflection', status: 'locked', x: 70, y: 50 },
    { id: 'level-1-cert', title: 'Level 1 Complete', type: 'milestone', status: 'locked', x: 90, y: 50 },
];

export function CourseProvider({
    children,
    initialNodes = INITIAL_NODES,
    initialLevel = 1
}: {
    children: ReactNode;
    initialNodes?: CourseNode[];
    initialLevel?: number;
}) {
    const [state, setState] = useState<CourseState>({
        currentLevel: initialLevel,
        nodes: initialNodes,
        isLoading: false,
    });

    return (
        <CourseContext.Provider value={state}>
            {children}
        </CourseContext.Provider>
    );
}

export function useCourse() {
    const context = useContext(CourseContext);
    if (context === undefined) {
        throw new Error('useCourse must be used within a CourseProvider');
    }
    return context;
}
