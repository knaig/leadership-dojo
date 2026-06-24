import { ChallengeData } from "@/types/case-engine";

interface ChallengeSectionProps {
    challenge: ChallengeData;
    selectedOption: string | null;
    onSelect: (letter: string) => void;
}

export function ChallengeSection({ challenge, selectedOption, onSelect }: ChallengeSectionProps) {
    return (
        <section>
            <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                🎓 The Simulation Challenge
            </h4>

            {/* Scenario */}
            <div className="bg-card border-l-4 border-accent rounded-r-xl p-5 mb-4 border-y border-r border-[#333]">
                <p className="mb-3 text-foreground">
                    <strong>Scenario:</strong> {challenge.scenario}
                </p>
                {challenge.quote && <p className="italic text-muted-foreground mb-3">"{challenge.quote}"</p>}
                <p className="text-accent font-medium">{challenge.prompt}</p>
            </div>

            {/* Options */}
            <div className="space-y-3">
                {challenge.options.map((option) => (
                    <button
                        key={option.letter}
                        onClick={() => onSelect(option.letter)}
                        className={`w-full text-left bg-card border rounded-xl p-4 flex gap-3 transition-all
              ${selectedOption === option.letter
                                ? 'border-accent'
                                : 'border-border hover:border-accent/50'
                            }`}
                    >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 transition-colors
              ${selectedOption === option.letter
                                ? 'bg-accent text-black'
                                : 'bg-secondary text-foreground'
                            }`}
                        >
                            {option.letter}
                        </div>
                        <div>
                            <div className="font-medium mb-1 text-foreground">{option.label}</div>
                            <div className="text-sm text-muted-foreground">"{option.response}"</div>
                        </div>
                    </button>
                ))}
            </div>
        </section>
    );
}
