'use client';
import { useState } from 'react';
import { X, FileText, ClipboardList, Users, Mail, Target, BarChart3, BookOpen, Sparkles, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact } from '@/lib/artifact-parser';

// ═══════════════════════════════════════════════════════
// TYPE ICONS
// ═══════════════════════════════════════════════════════

const TYPE_ICONS: Record<string, React.ReactNode> = {
    'meeting-notes': <FileText size={14} />,
    'stakeholder-brief': <Users size={14} />,
    'email-summary': <Mail size={14} />,
    'prep': <ClipboardList size={14} />,
    'report': <BarChart3 size={14} />,
    'action-items': <Target size={14} />,
    'goals': <Target size={14} />,
    'weekly-snapshot': <BarChart3 size={14} />,
    'coaching': <Sparkles size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
    'meeting-notes': 'text-blue-400',
    'stakeholder-brief': 'text-purple-400',
    'email-summary': 'text-amber-400',
    'prep': 'text-emerald-400',
    'report': 'text-cyan-400',
    'action-items': 'text-red-400',
    'goals': 'text-green-400',
    'weekly-snapshot': 'text-indigo-400',
    'coaching': 'text-primary',
};

// ═══════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════

interface ArtifactPanelProps {
    artifacts: Artifact[];
    activeIndex: number;
    onClose: () => void;
    onChangeIndex: (index: number) => void;
}

// ═══════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════

export function ArtifactPanel({ artifacts, activeIndex, onClose, onChangeIndex }: ArtifactPanelProps) {
    const [copied, setCopied] = useState(false);
    const artifact = artifacts[activeIndex];

    if (!artifact) return null;

    const icon = TYPE_ICONS[artifact.type] || <BookOpen size={14} />;
    const color = TYPE_COLORS[artifact.type] || 'text-primary';

    const handleCopy = async () => {
        await navigator.clipboard.writeText(artifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            {/* Header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 z-10">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={color}>{icon}</span>
                        <h3 className="text-sm font-semibold truncate">{artifact.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={handleCopy}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy content"
                        >
                            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Close panel"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Tab navigation for multiple artifacts */}
                {artifacts.length > 1 && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border">
                        <button
                            onClick={() => onChangeIndex(Math.max(0, activeIndex - 1))}
                            disabled={activeIndex === 0}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <div className="flex gap-1 overflow-x-auto">
                            {artifacts.map((a, i) => (
                                <button
                                    key={a.id}
                                    onClick={() => onChangeIndex(i)}
                                    className={`
                                        px-2 py-1 rounded text-xs whitespace-nowrap transition-colors
                                        ${i === activeIndex
                                            ? 'bg-primary/15 text-primary font-medium'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        }
                                    `}
                                >
                                    {a.title.length > 20 ? a.title.slice(0, 20) + '...' : a.title}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => onChangeIndex(Math.min(artifacts.length - 1, activeIndex + 1))}
                            disabled={activeIndex === artifacts.length - 1}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Artifact content */}
            <div className="flex-1 overflow-y-auto p-5">
                <div className="artifact-content prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-foreground mt-0 mb-3" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-base font-semibold text-foreground mt-5 mb-2 pb-1 border-b border-border" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-sm font-semibold text-foreground mt-4 mb-1.5" {...props} />,
                            p: ({ node, ...props }) => <p className="mb-2.5 text-sm leading-relaxed text-foreground/90" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-3 space-y-1" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-3 space-y-1" {...props} />,
                            li: ({ node, ...props }) => <li className="text-sm leading-relaxed text-foreground/90" {...props} />,
                            strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                            a: ({ node, ...props }) => <a className="text-primary hover:underline" target="_blank" {...props} />,
                            blockquote: ({ node, ...props }) => (
                                <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-3" {...props} />
                            ),
                            table: ({ node, ...props }) => (
                                <div className="overflow-x-auto my-3 rounded-lg border border-border">
                                    <table className="w-full text-sm" {...props} />
                                </div>
                            ),
                            thead: ({ node, ...props }) => <thead className="bg-muted/50" {...props} />,
                            th: ({ node, ...props }) => <th className="px-3 py-2 text-left font-medium text-foreground border-b border-border" {...props} />,
                            td: ({ node, ...props }) => <td className="px-3 py-2 text-foreground/90 border-b border-border/50" {...props} />,
                            code: ({ node, className, children, ...props }) => {
                                const isInline = !className;
                                return isInline
                                    ? <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                                    : <code className="block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto my-2" {...props}>{children}</code>;
                            },
                            hr: ({ node, ...props }) => <hr className="my-4 border-border" {...props} />,
                            // Render checkboxes in task lists
                            input: ({ node, ...props }) => {
                                if (props.type === 'checkbox') {
                                    return (
                                        <input
                                            {...props}
                                            disabled
                                            className="mr-2 rounded border-border accent-primary"
                                        />
                                    );
                                }
                                return <input {...props} />;
                            },
                        }}
                    >
                        {artifact.content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
