"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function QuickInputCard({ onSubmit }: { onSubmit?: (situation: string) => void }) {
    const [input, setInput] = useState("");
    const router = useRouter();

    const handleSubmit = () => {
        if (!input.trim()) return;
        if (onSubmit) {
            onSubmit(input);
        } else {
            // Default behavior if no handler
            console.log("Submitting:", input);
        }
    };

    const quickPrompts = [
        { emoji: "🤝", label: "Negotiation" },
        { emoji: "💬", label: "Feedback" },
        { emoji: "📊", label: "Presentation" },
        { emoji: "🔥", label: "Conflict" }
    ];

    return (
        <Card className="bg-card border-border">
            <CardHeader className="pb-3">
                <h3 className="text-lg font-serif font-light text-foreground">What's on your mind?</h3>
                <p className="text-muted-foreground text-sm">Tell us what you're facing — we'll find the right lesson</p>
            </CardHeader>
            <CardContent>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="I have a tough conversation coming up about..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent transition-all pr-10"
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={!input.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-accent disabled:opacity-30 transition-colors"
                    >
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex gap-2 mt-4 flex-wrap">
                    {quickPrompts.map((prompt) => (
                        <button
                            key={prompt.label}
                            onClick={() => setInput(prev => prev ? `${prev} ${prompt.label}` : prompt.label)}
                            className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-xs hover:border-accent hover:text-accent transition-colors flex items-center gap-1.5 text-muted-foreground"
                        >
                            <span>{prompt.emoji}</span>
                            <span>{prompt.label}</span>
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
