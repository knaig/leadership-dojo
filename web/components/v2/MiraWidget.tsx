'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, X, Maximize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { BRAND } from '@/lib/brand';

interface WidgetMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export function MiraWidget() {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<WidgetMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isTyping]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || isTyping) return;

        const userMsg: WidgetMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });

            if (res.ok) {
                // Response comes via Pusher, but we also poll for it
                const pollForResponse = async () => {
                    for (let i = 0; i < 30; i++) {
                        await new Promise(r => setTimeout(r, 2000));
                        const histRes = await fetch('/api/chat/history');
                        if (histRes.ok) {
                            const data = await histRes.json();
                            const msgs = data.messages || data || [];
                            if (msgs.length > 0) {
                                const lastMsg = msgs[msgs.length - 1];
                                if (lastMsg.role === 'assistant') {
                                    setMessages(prev => {
                                        if (prev.some(m => m.id === lastMsg.id)) return prev;
                                        return [...prev, { id: lastMsg.id, role: 'assistant', content: lastMsg.content }];
                                    });
                                    setIsTyping(false);
                                    return;
                                }
                            }
                        }
                    }
                    setIsTyping(false);
                };
                pollForResponse();
            } else {
                setIsTyping(false);
            }
        } catch {
            setIsTyping(false);
        }
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all text-sm"
            >
                <Sparkles size={16} className="text-primary flex-shrink-0" />
                <span>Ask {BRAND.name} anything...</span>
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-primary" />
                    <span className="text-sm font-medium text-foreground">{BRAND.name}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => router.push('/chat')}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        title="Open full chat"
                    >
                        <Maximize2 size={14} />
                    </button>
                    <button
                        onClick={() => setOpen(false)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="max-h-64 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && !isTyping && (
                    <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground">Ask about your meetings, goals, or anything on your mind</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed
                            ${msg.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-foreground'
                            }
                        `}>
                            {msg.role === 'assistant' ? (
                                <ReactMarkdown
                                    components={{
                                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc pl-3 mb-1 space-y-0.5">{children}</ul>,
                                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            ) : msg.content}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 size={12} className="animate-spin" />
                        <span>{BRAND.name} is thinking...</span>
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-border p-2 flex gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
                <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="p-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 transition-colors"
                >
                    <Send size={12} />
                </button>
            </form>
        </div>
    );
}
