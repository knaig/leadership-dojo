'use client';

import { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

export interface SyncStatus {
    id: string;
    syncType: 'calendar' | 'email' | 'drive';
    status: 'connecting' | 'fetching' | 'processing' | 'complete' | 'error';
    message: string;
    progress?: number;
    currentFile?: string;
    processed?: number;
    total?: number;
    error?: string;
    timestamp: number;
}

interface SyncStatusPanelProps {
    syncStatuses: SyncStatus[];
    onDismiss: (id: string) => void;
    onDismissAll: () => void;
}

export function SyncStatusPanel({ syncStatuses, onDismiss, onDismissAll }: SyncStatusPanelProps) {
    // Auto-dismiss completed syncs after 5 seconds
    useEffect(() => {
        const completedIds = syncStatuses
            .filter(s => s.status === 'complete')
            .map(s => s.id);

        if (completedIds.length > 0) {
            const timer = setTimeout(() => {
                completedIds.forEach(id => onDismiss(id));
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [syncStatuses, onDismiss]);

    if (syncStatuses.length === 0) return null;

    const getSyncIcon = (syncType: string) => {
        switch (syncType) {
            case 'drive': return '📁';
            case 'calendar': return '📅';
            case 'email': return '📧';
            default: return '🔄';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'complete':
                return <CheckCircle2 size={14} className="text-emerald-400" />;
            case 'error':
                return <AlertCircle size={14} className="text-red-400" />;
            default:
                return <Loader2 size={14} className="text-indigo-400 animate-spin" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'complete': return 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10';
            case 'error': return 'border-red-500/30 bg-red-50 dark:bg-red-500/10';
            default: return 'border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10';
        }
    };

    // Get the most recent active sync (for showing current file)
    const activeSyncs = syncStatuses.filter(s => s.status !== 'complete' && s.status !== 'error');
    const latestSync = activeSyncs[activeSyncs.length - 1];

    return (
        <div className="fixed top-4 right-4 z-50 w-80 space-y-2">
            {/* Header with dismiss all */}
            {syncStatuses.length > 1 && (
                <div className="flex justify-end">
                    <button
                        onClick={onDismissAll}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Active sync with file details */}
            {latestSync && (
                <div className={`rounded-lg border ${getStatusColor(latestSync.status)} backdrop-blur-sm p-3 shadow-lg`}>
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">{getSyncIcon(latestSync.syncType)}</span>
                            <div>
                                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                                    {latestSync.syncType === 'drive' ? 'Drive Sync' :
                                     latestSync.syncType === 'calendar' ? 'Calendar Sync' : 'Email Sync'}
                                    {getStatusIcon(latestSync.status)}
                                </div>
                                {latestSync.currentFile && (
                                    <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                                        <FileText size={10} className="inline mr-1" />
                                        {latestSync.currentFile}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => onDismiss(latestSync.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Progress bar */}
                    {latestSync.progress !== undefined && latestSync.status !== 'complete' && (
                        <div className="mt-2">
                            <div className="h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-300"
                                    style={{ width: `${latestSync.progress}%` }}
                                />
                            </div>
                            {latestSync.processed !== undefined && latestSync.total !== undefined && (
                                <div className="text-[10px] text-muted-foreground mt-1 text-right">
                                    {latestSync.processed} / {latestSync.total} files
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Completed syncs (compact) */}
            {syncStatuses.filter(s => s.status === 'complete').map(sync => (
                <div
                    key={sync.id}
                    className={`rounded-lg border ${getStatusColor(sync.status)} backdrop-blur-sm p-2 shadow-lg flex items-center justify-between gap-2`}
                >
                    <div className="flex items-center gap-2 text-sm">
                        {getStatusIcon(sync.status)}
                        <span className="text-emerald-700 dark:text-emerald-300">{sync.message}</span>
                    </div>
                    <button
                        onClick={() => onDismiss(sync.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}

            {/* Error syncs */}
            {syncStatuses.filter(s => s.status === 'error').map(sync => (
                <div
                    key={sync.id}
                    className={`rounded-lg border ${getStatusColor(sync.status)} backdrop-blur-sm p-2 shadow-lg`}
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm">
                            {getStatusIcon(sync.status)}
                            <span className="text-red-700 dark:text-red-300">{sync.message}</span>
                        </div>
                        <button
                            onClick={() => onDismiss(sync.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
