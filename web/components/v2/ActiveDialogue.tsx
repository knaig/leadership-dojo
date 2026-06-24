'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Mic, ArrowLeft, Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2, Bell, Zap, X, FileText } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { usePusher } from '@/hooks/usePusher';
import { SyncStatusPanel, SyncStatus } from './SyncStatusPanel';
import { BRAND } from '@/lib/brand';
import { parseMessageArtifacts, hasArtifacts, detectStructuredContent } from '@/lib/artifact-parser';
import type { Artifact } from '@/lib/artifact-parser';
import { parseInteractiveBlocks, hasInteractiveBlocks } from '@/lib/interactive-blocks';
import { InteractiveBlocks } from './InteractiveBlocks';

interface MessageAction {
    label: string;
    value: string;
    style?: 'primary' | 'secondary' | 'danger';
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isSystemUpdate?: boolean; // For "Context Updated" cards
    isProactiveNudge?: boolean; // For AI-initiated messages
    actions?: MessageAction[]; // Inline action buttons
    createdAt?: Date;
}

// Processing status stages
type ProcessingStage = 'idle' | 'queued' | 'processing' | 'generating' | 'complete' | 'error';

interface ActiveDialogueProps {
    onArtifact?: (artifacts: Artifact[]) => void;
}

export function ActiveDialogue({ onArtifact }: ActiveDialogueProps = {}) {
    const { userId } = useAuth();
    const searchParams = useSearchParams();

    const [messages, setMessages] = useState<Message[]>([]);
    const [mode, setMode] = useState<string>('GENERAL');
    const [input, setInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiTyping, setIsAiTyping] = useState(false);
    const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
    const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
    const [proactiveNudgeId, setProactiveNudgeId] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [isAskingMira, setIsAskingMira] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<Array<{ id: string; type: string; content: string; responded: boolean; deliveredAt: string }>>([]);
    const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const notificationRef = useRef<HTMLDivElement>(null);

    // Fetch unread notification count - wait for auth
    useEffect(() => {
        if (!userId) return;
        const fetchCount = () => {
            fetch('/api/notifications/unread-count')
                .then(res => res.ok ? res.json() : { count: 0 })
                .then(data => setUnreadCount(data.count || 0))
                .catch(() => setUnreadCount(0));
        };

        fetchCount();
        // Refresh every 5 minutes (was 30s — caused excessive DB transfer)
        const interval = setInterval(fetchCount, 300000);
        return () => clearInterval(interval);
    }, [userId]);

    // Handle new messages from Pusher
    const handleNewMessage = useCallback((message: Message) => {
        setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === message.id)) {
                return prev;
            }
            // Only remove optimistic messages if this is a user message (replacement from DB)
            // Keep optimistic user messages when assistant messages arrive
            if (message.role === 'user') {
                const filtered = prev.filter(m => !m.id.startsWith('optim-'));
                return [...filtered, message];
            }
            return [...prev, message];
        });
        if (message.role === 'assistant') {
            setIsAiTyping(false);
            setProcessingStage('complete');
            setTimeout(() => setProcessingStage('idle'), 2000);
        }
    }, []);

    // Handle typing indicator from Pusher
    const handleTyping = useCallback((isTyping: boolean) => {
        setIsAiTyping(isTyping);
        if (isTyping) {
            setProcessingStage('generating');
        }
    }, []);

    // Handle system events from Pusher (calendar sync, drive sync, etc.)
    const handleSystemEvent = useCallback((event: { type: string; message: string; data?: any }) => {
        // Check if this is a sync event (has syncType in data)
        if (event.data?.syncType) {
            const syncType = event.data.syncType as 'calendar' | 'email' | 'drive';
            const syncId = `sync-${syncType}`;

            setSyncStatuses(prev => {
                // Find existing sync status for this type
                const existingIndex = prev.findIndex(s => s.id === syncId);

                const newStatus: SyncStatus = {
                    id: syncId,
                    syncType,
                    status: event.data.status || 'processing',
                    message: event.message,
                    progress: event.data.progress,
                    currentFile: event.data.currentFile,
                    processed: event.data.processed,
                    total: event.data.total || event.data.totalFiles,
                    error: event.data.error,
                    timestamp: Date.now(),
                };

                if (existingIndex >= 0) {
                    // Update existing
                    const updated = [...prev];
                    updated[existingIndex] = newStatus;
                    return updated;
                } else {
                    // Add new
                    return [...prev, newStatus];
                }
            });
        } else if (event.type === 'proactive_nudge') {
            // Proactive nudge content arrives separately via new-message event.
            // Just scroll to bottom so user sees the new message.
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 500);
        } else {
            // Non-sync system events go to chat (like goal created, stakeholder added)
            const systemMsg: Message = {
                id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: event.message,
                isSystemUpdate: true,
            };
            setMessages(prev => [...prev, systemMsg]);
        }
    }, []);

    // Dismiss a sync status
    const handleDismissSync = useCallback((id: string) => {
        setSyncStatuses(prev => prev.filter(s => s.id !== id));
    }, []);

    // Dismiss all sync statuses
    const handleDismissAllSyncs = useCallback(() => {
        setSyncStatuses([]);
    }, []);

    // Handle mode changes from Pusher
    const handleModeChange = useCallback((newMode: string) => {
        setMode(newMode);
    }, []);

    // Handle proactive nudges from Pusher
    const handleProactiveNudge = useCallback((nudge: { trigger: string; messageId: string; preview: string }) => {
        console.log('[ActiveDialogue] Proactive nudge received:', nudge);
        // Mark the message as a proactive nudge for special styling
        setProactiveNudgeId(nudge.messageId);
        // Clear the highlight after 10 seconds
        setTimeout(() => setProactiveNudgeId(null), 10000);
    }, []);

    // Ask Mira for a proactive insight
    const handleAskMira = async () => {
        if (isAskingMira) return;
        setIsAskingMira(true);
        try {
            const res = await fetch('/api/proactive/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trigger: 'CONTEXT_DEEPENING' })
            });
            if (!res.ok) throw new Error('Failed to trigger');
            // Message will arrive via Pusher
        } catch (err) {
            console.error('[AskMira] Failed:', err);
        } finally {
            setTimeout(() => setIsAskingMira(false), 3000);
        }
    };

    // Fetch notification history
    const fetchNotifications = async () => {
        setIsLoadingNotifications(true);
        try {
            const res = await fetch('/api/proactive/history');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.prompts || []);
            }
        } catch (err) {
            console.error('[Notifications] Failed to fetch:', err);
        } finally {
            setIsLoadingNotifications(false);
        }
    };

    // Toggle notification dropdown
    const toggleNotifications = () => {
        const next = !showNotifications;
        setShowNotifications(next);
        if (next) fetchNotifications();
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        };
        if (showNotifications) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showNotifications]);

    // Connect to Pusher for real-time updates
    const { isConnected, connectionState } = usePusher({
        userId,
        onMessage: handleNewMessage,
        onTyping: handleTyping,
        onSystemEvent: handleSystemEvent,
        onModeChange: handleModeChange,
        onProactiveNudge: handleProactiveNudge,
    });

    // Initial data fetch - waits for Clerk userId before fetching
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        const fetchInitialData = async (attempt = 1): Promise<void> => {
            if (cancelled) return;
            setIsLoadingHistory(true);
            setHistoryError(null);
            try {
                const res = await fetch('/api/chat/history', { credentials: 'include' });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    if (attempt < 5) {
                        await new Promise(r => setTimeout(r, 1000 * attempt));
                        if (!cancelled) return fetchInitialData(attempt + 1);
                        return;
                    }
                    setHistoryError(`Failed to load conversations (${res.status})`);
                    setIsLoadingHistory(false);
                    return;
                }

                const data = await res.json();
                console.log('[Chat] History loaded:', data.messages?.length, 'messages');
                if (cancelled) return;

                if (data.messages && Array.isArray(data.messages)) {
                    setMessages(data.messages);
                    setMode(data.mode || 'GENERAL');
                } else if (Array.isArray(data)) {
                    setMessages(data);
                } else {
                    console.warn('[Chat] Unexpected history format:', Object.keys(data));
                }
            } catch (err: any) {
                if (cancelled) return;
                console.error("[Chat] Failed to fetch history", err);
                if (attempt < 5) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    if (!cancelled) return fetchInitialData(attempt + 1);
                    return;
                }
                setHistoryError('Failed to load conversations. Check your connection.');
            } finally {
                if (!cancelled) setIsLoadingHistory(false);
            }
        };

        fetchInitialData();
        return () => { cancelled = true; };
    }, [userId]);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isAiTyping]);

    // Track elapsed time while processing
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (processingStage !== 'idle' && processingStage !== 'complete') {
            if (!processingStartTime) {
                setProcessingStartTime(Date.now());
            }
            timer = setInterval(() => {
                if (processingStartTime) {
                    setElapsedTime(Math.floor((Date.now() - processingStartTime) / 1000));
                }
            }, 1000);
        } else {
            setProcessingStartTime(null);
            setElapsedTime(0);
        }
        return () => clearInterval(timer);
    }, [processingStage, processingStartTime]);

    // Timeout fallback - if stuck for more than 60 seconds, show error
    useEffect(() => {
        if (elapsedTime > 60 && processingStage !== 'idle' && processingStage !== 'complete') {
            setProcessingStage('error');
        }
    }, [elapsedTime, processingStage]);

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;

        const optimMsg: Message = {
            id: 'optim-' + Date.now(),
            role: 'user',
            content: text,
        };

        setMessages(prev => [...prev, optimMsg]);
        setInput('');
        setIsSubmitting(true);
        setIsAiTyping(true);
        setProcessingStage('processing');
        setProcessingStartTime(Date.now());

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) {
                setProcessingStage('error');
                setIsAiTyping(false);
            }
        } catch (error) {
            console.error(error);
            setIsAiTyping(false);
            setProcessingStage('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await sendMessage(input);
    };

    // Auto-send message from query params (prep= or q=)
    const prepSentRef = useRef(false);
    useEffect(() => {
        if (prepSentRef.current || isLoadingHistory) return;
        const prep = searchParams.get('prep');
        const q = searchParams.get('q');
        if (prep) {
            prepSentRef.current = true;
            sendMessage(`Prep me for: ${prep}`);
        } else if (q) {
            prepSentRef.current = true;
            sendMessage(q);
        }
    }, [searchParams, isLoadingHistory]);

    // Show loader if AI is typing
    const showLoader = isAiTyping;

    // Mode Badge Color Logic
    const getModeColor = (m: string) => {
        switch (m) {
            case 'GOAL_CAPTURE': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'STAKEHOLDER_MAPPING': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'STRATEGY': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
            case 'EXECUTION': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            default: return 'text-indigo-400 bg-indigo-500/20 border-transparent';
        }
    };

    // Connection status indicator
    const getConnectionStatus = () => {
        if (isConnected) {
            return { icon: Wifi, color: 'text-emerald-500', label: 'Live' };
        }
        if (connectionState === 'connecting' || connectionState === 'initialized') {
            return { icon: Wifi, color: 'text-amber-500 animate-pulse', label: 'Connecting...' };
        }
        if (connectionState === 'unavailable') {
            return { icon: WifiOff, color: 'text-red-500', label: 'Unavailable' };
        }
        return { icon: WifiOff, color: 'text-slate-500', label: 'Offline' };
    };

    const status = getConnectionStatus();
    const StatusIcon = status.icon;

    return (
        <div className="flex flex-col h-full w-full">
            {/* Sync Status Panel - Non-blocking overlay */}
            <SyncStatusPanel
                syncStatuses={syncStatuses}
                onDismiss={handleDismissSync}
                onDismissAll={handleDismissAllSyncs}
            />

            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-3 justify-between bg-card text-card-foreground">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${getModeColor(mode).split(' ')[1]}`}>
                        <Sparkles size={18} className={getModeColor(mode).split(' ')[0]} />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-foreground">{BRAND.name}</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Notification Bell with Dropdown */}
                    <div className="relative" ref={notificationRef}>
                        <button
                            onClick={toggleNotifications}
                            className="relative group p-1.5 rounded-lg hover:bg-muted transition-colors"
                            title={unreadCount > 0 ? `${unreadCount} new insight${unreadCount > 1 ? 's' : ''}` : 'Recent insights'}
                        >
                            <Bell size={20} className={`transition-colors ${unreadCount > 0 ? 'text-amber-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[10px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-medium animate-pulse">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>

                        {/* Notification Dropdown */}
                        {showNotifications && (
                            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-50">
                                <div className="p-3 border-b border-border flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">{BRAND.name}&apos;s Insights</span>
                                    <button onClick={() => setShowNotifications(false)} className="text-muted-foreground hover:text-foreground">
                                        <X size={14} />
                                    </button>
                                </div>
                                {isLoadingNotifications ? (
                                    <div className="p-4 flex items-center justify-center">
                                        <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                        No recent insights. Tap the <Zap size={12} className="inline text-amber-500" /> button to ask {BRAND.name}.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {notifications.map(n => (
                                            <div key={n.id} className={`p-3 text-sm hover:bg-muted/50 transition-colors ${!n.responded ? 'bg-amber-500/5' : ''}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{n.type.replace('_', ' ')}</span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {new Date(n.deliveredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {!n.responded && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                                </div>
                                                <p className="text-foreground leading-relaxed line-clamp-3">{n.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Connection Status */}
                    <div className={`flex items-center gap-1 text-xs ${status.color}`}>
                        <StatusIcon size={12} />
                    </div>
                </div>
            </div>

            {/* Chat Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
                {isLoadingHistory && messages.length === 0 && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-muted-foreground mr-2" />
                        <span className="text-sm text-muted-foreground">Loading conversations...</span>
                    </div>
                )}
                {!isLoadingHistory && !historyError && messages.length === 0 && (
                    <div className="py-8 px-4 space-y-4">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                                <Sparkles size={24} className="text-primary" />
                            </div>
                            <h2 className="text-base font-semibold text-foreground">Chat with {BRAND.name}</h2>
                            <p className="text-xs text-muted-foreground mt-1">Your AI coach — sharp, contextual, always ready</p>
                        </div>
                        <div className="space-y-2 max-w-sm mx-auto">
                            {[
                                'Prep me for my next meeting',
                                'What should I focus on this week?',
                                'Help me think through my board presentation',
                                'What commitments am I behind on?'
                            ].map((suggestion, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(suggestion)}
                                    className="w-full text-left px-4 py-2.5 text-sm rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 text-foreground transition-all"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {historyError && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <AlertCircle size={20} className="text-red-400" />
                        <span className="text-sm text-red-400">{historyError}</span>
                        <button
                            onClick={() => {
                                setHistoryError(null);
                                setIsLoadingHistory(true);
                                fetch('/api/chat/history')
                                    .then(res => { if (!res.ok) throw new Error(`${res.status}`); return res.json(); })
                                    .then(data => {
                                        if (data.messages && Array.isArray(data.messages)) {
                                            setMessages(data.messages);
                                            setMode(data.mode || 'GENERAL');
                                        }
                                    })
                                    .catch(err => setHistoryError(`Retry failed: ${err.message}`))
                                    .finally(() => setIsLoadingHistory(false));
                            }}
                            className="text-xs text-primary hover:text-primary/80 underline"
                        >
                            Retry
                        </button>
                    </div>
                )}
                {messages.filter(msg => {
                    // Hide internal prompt assembly from chat history
                    if (msg.role === 'user' && msg.content.includes('[Context:')) return false;
                    if ((msg.role as string) === 'system') return false;
                    return true;
                }).map((msg) => {
                    const isProactiveMessage = msg.id === proactiveNudgeId;
                    return (
                        <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} ${isProactiveMessage ? 'animate-pulse-once' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium text-white
                            ${msg.role === 'user' ? 'bg-muted-foreground' : isProactiveMessage ? 'bg-amber-500' : 'bg-primary'}
                        `}>
                                {msg.role === 'user' ? 'U' : isProactiveMessage ? <Bell size={14} /> : 'M'}
                            </div>

                            <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed
                            ${msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                    : isProactiveMessage
                                        ? 'bg-amber-500/10 text-foreground border border-amber-500/30 rounded-tl-sm'
                                        : 'bg-muted text-foreground border border-border rounded-tl-sm'
                                }
                        `}>
                                {isProactiveMessage && (
                                    <div className="mb-2 pb-2 border-b border-amber-500/20 text-xs text-amber-400 font-medium flex items-center gap-2">
                                        <Bell size={10} />
                                        {BRAND.name} spotted something
                                    </div>
                                )}
                                <div className="markdown-content">
                                    {(() => {
                                        const isAssistant = msg.role === 'assistant';

                                        // Parse interactive blocks first (strips <!--interactive:...--> from content)
                                        const { cleanContent: contentAfterInteractive, interactive } = isAssistant
                                            ? parseInteractiveBlocks(msg.content)
                                            : { cleanContent: msg.content, interactive: null };

                                        // Path 1: Explicit artifact fences
                                        const hasFences = isAssistant && hasArtifacts(contentAfterInteractive);
                                        const parsed = hasFences ? parseMessageArtifacts(contentAfterInteractive) : null;

                                        // Path 2: Auto-detect structured markdown
                                        const autoArtifact = (!parsed || parsed.artifacts.length === 0) && isAssistant
                                            ? detectStructuredContent(contentAfterInteractive)
                                            : null;

                                        const displayContent = parsed && parsed.artifacts.length > 0
                                            ? parsed.inlineContent
                                            : contentAfterInteractive;

                                        const artifactsToShow = parsed && parsed.artifacts.length > 0
                                            ? parsed.artifacts
                                            : autoArtifact ? [autoArtifact] : [];

                                        return (
                                            <>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                                        li: ({ node, ...props }) => <li className="" {...props} />,
                                                        strong: ({ node, ...props }) => <strong className="font-semibold text-primary" {...props} />,
                                                        a: ({ node, ...props }) => <a className="text-primary hover:underline" target="_blank" {...props} />,
                                                        blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-indigo-500/50 pl-3 italic text-muted-foreground my-2" {...props} />,
                                                    }}
                                                >
                                                    {displayContent}
                                                </ReactMarkdown>
                                                {artifactsToShow.length > 0 && (
                                                    <div className="mt-3 space-y-2">
                                                        {artifactsToShow.map(art => (
                                                            <button
                                                                key={art.id}
                                                                onClick={() => onArtifact?.(artifactsToShow)}
                                                                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-sm group"
                                                            >
                                                                <FileText size={14} className="text-primary flex-shrink-0" />
                                                                <span className="text-primary font-medium truncate">{art.title}</span>
                                                                <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                                                                    {art.autoDetected ? 'Open in panel →' : 'Open →'}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {interactive && (
                                                    <InteractiveBlocks
                                                        messageId={msg.id}
                                                        payload={interactive}
                                                        onAction={async (actionId, responses) => {
                                                            await fetch('/api/chat/action', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ actionId, responses }),
                                                            });
                                                        }}
                                                    />
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                {msg.isSystemUpdate && (
                                    <div className="mt-2 pt-2 border-t border-border text-xs text-primary font-mono flex items-center gap-2">
                                        <Sparkles size={10} />
                                        Context Updated
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}

                {showLoader && (
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                            {processingStage === 'error' ? (
                                <AlertCircle size={14} className="text-red-400" />
                            ) : processingStage === 'complete' ? (
                                <CheckCircle2 size={14} className="text-emerald-400" />
                            ) : (
                                <Loader2 size={14} className="animate-spin text-white" />
                            )}
                        </div>
                        <div className="flex flex-col justify-center">
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {processingStage === 'queued' && (
                                    <>
                                        <span className="text-amber-400">●</span>
                                        <span>Queued for processing...</span>
                                    </>
                                )}
                                {processingStage === 'processing' && (
                                    <>
                                        <span className="text-blue-400">●</span>
                                        <span>Worker picked up job...</span>
                                    </>
                                )}
                                {processingStage === 'generating' && (
                                    <>
                                        <span className="text-indigo-400">●</span>
                                        <span>AI is thinking...</span>
                                    </>
                                )}
                                {processingStage === 'error' && (
                                    <>
                                        <span className="text-red-400">●</span>
                                        <span>Something went wrong.</span>
                                        <button
                                            onClick={() => {
                                                setIsAiTyping(false);
                                                setProcessingStage('idle');
                                            }}
                                            className="text-primary hover:text-primary/80 underline ml-2"
                                        >
                                            Dismiss
                                        </button>
                                    </>
                                )}
                                {processingStage === 'complete' && (
                                    <>
                                        <span className="text-emerald-400">●</span>
                                        <span>Complete!</span>
                                    </>
                                )}
                                {elapsedTime > 0 && processingStage !== 'complete' && processingStage !== 'error' && (
                                    <span className="text-muted-foreground ml-2">({elapsedTime}s)</span>
                                )}
                            </div>
                            {processingStage === 'processing' && elapsedTime > 10 && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    Taking longer than usual... worker may be starting up
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-6 pt-2 bg-gradient-to-t from-background to-transparent">
                {/* Ask Mira button */}
                <div className="flex justify-center mb-2">
                    <button
                        onClick={handleAskMira}
                        disabled={isAskingMira}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title={`Ask ${BRAND.name} for a proactive insight`}
                    >
                        {isAskingMira ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Zap size={12} />
                        )}
                        {isAskingMira ? `${BRAND.name} is thinking...` : `${BRAND.name} wants to chat...`}
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="relative group">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Ask anything or just start talking..."
                        className="w-full bg-input border border-border rounded-2xl py-4 pl-5 pr-14 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all shadow-sm"
                    />
                    <div className="absolute right-2 top-2 bottom-2 flex items-center gap-1">
                        <button type="button" className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                            <Mic size={20} />
                        </button>
                        <button
                            type="submit"
                            disabled={!input.trim() || isSubmitting}
                            className="p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
                <div className="text-center mt-3 text-[10px] text-muted-foreground flex items-center justify-center gap-2">
                    <span>Press Enter to send</span>
                    <span>•</span>
                    <span className={`flex items-center gap-1 ${status.color}`}>
                        <StatusIcon size={10} />
                        {status.label}
                    </span>
                </div>
            </div>
        </div>
    );
}
