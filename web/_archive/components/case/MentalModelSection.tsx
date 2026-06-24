import { MentalModel } from "@/types/case-engine";

export function MentalModelSection({ model }: { model: MentalModel }) {
    return (
        <section>
            <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                🧠 Applied Framework: {model.name}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* The Model */}
                <div className="bg-purple-900/10 border border-purple-500/30 rounded-xl p-4">
                    <div className="text-sm font-medium text-purple-400 mb-2">The Model</div>
                    <p className="text-sm leading-relaxed mb-2 text-foreground">{model.description}</p>
                    <div className="text-xs text-muted-foreground">Source: {model.source}</div>
                </div>

                {/* Why It Applies */}
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="text-sm font-medium text-accent mb-2">Why It Applies Here</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{model.applicationReason}</p>
                </div>
            </div>
        </section>
    );
}
