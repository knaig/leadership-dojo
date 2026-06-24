import { Stakeholder, Meeting } from "@/types/case-engine";

interface ContextSectionProps {
    meeting?: Meeting;
    stakeholders: Stakeholder[];
}

export function ContextSection({ meeting, stakeholders }: ContextSectionProps) {
    // Format time (e.g. 10:00 AM)
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <section>
            <h4 className="text-xs font-mono text-accent uppercase tracking-wider mb-3">
                📍 Your Context
            </h4>
            <div className="bg-card rounded-xl p-5 border border-border">
                {meeting && (
                    <p className="text-sm mb-4 text-foreground">
                        <strong>Meeting:</strong> {meeting.title} · Today at {formatTime(meeting.startTime)}
                    </p>
                )}

                {/* Stakeholder cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stakeholders.map((stakeholder) => (
                        <StakeholderCard key={stakeholder.id} stakeholder={stakeholder} />
                    ))}
                </div>

                {/* Historical context warning */}
                {meeting?.historicalTension && (
                    <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                        ⚠️ <strong className="text-accent">Historical tension detected:</strong>{' '}
                        {meeting.historicalTension}
                    </div>
                )}
            </div>
        </section>
    );
}

function StakeholderCard({ stakeholder }: { stakeholder: Stakeholder }) {
    const stanceColors = {
        blocker: { bg: 'bg-red-500/20', text: 'text-red-500', emoji: '🔴' },
        neutral: { bg: 'bg-amber-500/20', text: 'text-amber-500', emoji: '🟠' },
        ally: { bg: 'bg-green-500/20', text: 'text-green-500', emoji: '🟢' }
    };
    const colors = stanceColors[stakeholder.stance];

    return (
        <div className="bg-secondary rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2.5 mb-2">
                <div className={`w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center`}>
                    {colors.emoji}
                </div>
                <div>
                    <div className="text-sm font-medium text-foreground">{stakeholder.name}</div>
                    <div className="text-xs text-muted-foreground">{stakeholder.role}</div>
                </div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
                <span className={colors.text + " font-medium capitalize"}>{stakeholder.stance}</span> · {stakeholder.influence} Influence<br />
                Motivation: {stakeholder.motivation}
            </div>
        </div>
    );
}
