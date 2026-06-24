
"use client";

import { useState } from "react";
import { GamePlanCard } from "./GamePlanCard";
import { Loader2, Zap } from "lucide-react";

export function PrepConsole() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [plan, setPlan] = useState<any>(null);

    const handleSimulate = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setPlan(null); // Reset previous plan
        setError("");

        try {
            const res = await fetch("/api/simulator/prep", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            if (data.success) {
                setPlan(data.data);
            } else {
                setError(data.error || "Failed to generate plan.");
            }
        } catch (e) {
            console.error(e);
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto mb-12 space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-serif font-bold mb-2 flex items-center gap-2 text-foreground">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    The Prep Console
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                    Facing a tough interaction? Enter the situation below to run a simulation against your Context Graph.
                </p>

                <div className="relative">
                    <textarea
                        className="w-full bg-background border border-input rounded-lg p-4 min-h-[100px] text-foreground focus:ring-2 focus:ring-ring focus:outline-none transition-all resize-none"
                        placeholder="e.g. I need to ask Jai for budget, but he's been blocking my requests..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={loading}
                    />

                    {error && (
                        <div className="absolute bottom-16 left-2 text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded">
                            {error}
                        </div>
                    )}

                    <div className="absolute bottom-3 right-3">
                        <button
                            onClick={handleSimulate}
                            disabled={loading || !query.trim()}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-all"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Generate Game Plan
                        </button>
                    </div>
                </div>
            </div>

            {plan && <GamePlanCard plan={plan} />}
        </div>
    );
}
