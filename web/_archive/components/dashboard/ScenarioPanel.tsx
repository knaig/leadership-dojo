'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    MessageCircle,
    AlertTriangle,
    Lightbulb,
    ChevronRight,
    RefreshCw,
    X
} from 'lucide-react';

interface DetectedScenario {
    scenarioId: string;
    headline: string;
    evidence: string[];
    stakeholders: string[];
    confidence: number;
    suggestedAction: string;
    conversationalPrompt: string;
}

interface ScenarioPanelProps {
    onPrepClick?: (scenario: DetectedScenario) => void;
}

export function ScenarioPanel({ onPrepClick }: ScenarioPanelProps) {
    const [scenarios, setScenarios] = useState<DetectedScenario[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    const fetchScenarios = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/scenarios/detect');
            const data = await res.json();

            if (data.success) {
                setScenarios(data.data.scenarios || []);
            } else {
                setError(data.error || 'Failed to detect scenarios');
            }
        } catch (e) {
            setError('Unable to analyze your context');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchScenarios();
    }, []);

    const handleDismiss = (scenarioId: string) => {
        setDismissedIds(prev => new Set([...prev, scenarioId]));
    };

    const activeScenarios = scenarios.filter(s => !dismissedIds.has(s.scenarioId));

    if (isLoading) {
        return (
            <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-primary" />
                        What You&apos;re Facing
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-20 w-full bg-muted" />
                    <Skeleton className="h-16 w-full bg-muted" />
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-primary" />
                        What You&apos;re Facing
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={fetchScenarios}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card border-border">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-foreground flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-primary" />
                        What You&apos;re Facing
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchScenarios}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {activeScenarios.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                        <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                        <p>No pressing scenarios detected</p>
                        <p className="text-xs mt-1">I&apos;ll surface relevant challenges as they emerge</p>
                    </div>
                ) : (
                    activeScenarios.map((scenario) => (
                        <ScenarioCard
                            key={scenario.scenarioId}
                            scenario={scenario}
                            onDismiss={() => handleDismiss(scenario.scenarioId)}
                            onPrepClick={() => onPrepClick?.(scenario)}
                        />
                    ))
                )}
            </CardContent>
        </Card>
    );
}

interface ScenarioCardProps {
    scenario: DetectedScenario;
    onDismiss: () => void;
    onPrepClick: () => void;
}

function ScenarioCard({ scenario, onDismiss, onPrepClick }: ScenarioCardProps) {
    const confidenceColor = scenario.confidence >= 0.8
        ? 'text-amber-500'
        : 'text-blue-400';

    const ConfidenceIcon = scenario.confidence >= 0.8
        ? AlertTriangle
        : Lightbulb;

    return (
        <div className="bg-background/50 border border-border rounded-lg p-3 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                    <ConfidenceIcon className={`w-4 h-4 mt-0.5 ${confidenceColor}`} />
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            {scenario.headline}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {scenario.conversationalPrompt}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onDismiss}
                    className="text-muted-foreground hover:text-foreground p-1"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Evidence */}
            {scenario.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {scenario.evidence.slice(0, 2).map((evidence, i) => (
                        <span
                            key={i}
                            className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
                        >
                            {evidence.length > 40 ? evidence.substring(0, 40) + '...' : evidence}
                        </span>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onPrepClick}
                    className="text-xs"
                >
                    {scenario.suggestedAction || 'Prep for this'}
                    <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                    className="text-xs text-muted-foreground"
                >
                    Not relevant
                </Button>
            </div>
        </div>
    );
}

export default ScenarioPanel;
