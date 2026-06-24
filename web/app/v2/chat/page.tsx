'use client';
import { Suspense, useState, useCallback } from 'react';
import { ActiveDialogue } from '@/components/v2/ActiveDialogue';
import { ArtifactPanel } from '@/components/v2/ArtifactPanel';
import type { Artifact } from '@/lib/artifact-parser';

export default function ChatPage() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    const handleArtifact = useCallback((newArtifacts: Artifact[]) => {
        setArtifacts(prev => {
            // Append new artifacts, dedup by id
            const existing = new Set(prev.map(a => a.id));
            const unique = newArtifacts.filter(a => !existing.has(a.id));
            return [...prev, ...unique];
        });
        // Show the first of the new artifacts
        setActiveIndex(artifacts.length); // index of first new one
        setIsOpen(true);
    }, [artifacts.length]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Chat — takes full width when panel closed, shrinks when open */}
            <section className={`flex-1 min-w-0 bg-background relative transition-all duration-300 ${isOpen ? 'lg:max-w-[60%]' : ''}`}>
                <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-pulse text-muted-foreground">Loading...</div></div>}>
                    <ActiveDialogue onArtifact={handleArtifact} />
                </Suspense>
            </section>

            {/* Artifact Panel — desktop: inline right pane, mobile: overlay */}
            {isOpen && artifacts.length > 0 && (
                <>
                    {/* Mobile overlay backdrop */}
                    <div
                        className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                        onClick={handleClose}
                    />

                    {/* Panel */}
                    <aside className={`
                        fixed inset-y-0 right-0 w-full max-w-md z-50
                        lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:w-[40%] lg:flex-shrink-0
                        border-l border-border shadow-2xl lg:shadow-none
                        bg-background
                        transition-transform duration-300
                    `}>
                        <ArtifactPanel
                            artifacts={artifacts}
                            activeIndex={activeIndex}
                            onClose={handleClose}
                            onChangeIndex={setActiveIndex}
                        />
                    </aside>
                </>
            )}
        </div>
    );
}
