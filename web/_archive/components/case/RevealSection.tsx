import { RevealData } from "@/types/case-engine";

export function RevealSection({ reveal }: { reveal: RevealData }) {
    return (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                ✨ The Strategic Unlock
            </h4>
            <div className="bg-green-900/10 border border-green-500/20 rounded-xl p-5">
                <p className="mb-3 text-foreground">
                    <strong className="text-green-500">Option {reveal.correctOption} is correct.</strong>
                </p>
                <p className="text-muted-foreground mb-3 leading-relaxed">{reveal.explanation}</p>
                <p className="text-sm border-t border-green-500/20 pt-3 mt-3 text-muted-foreground">
                    <strong className="text-green-500">The Principle:</strong> {reveal.principle}
                </p>
            </div>
        </section>
    );
}
