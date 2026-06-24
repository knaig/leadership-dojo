import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function BriefingCard({ content }: { content: string }) {
    return (
        <Card className="bg-card border-border h-full">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Morning Briefing
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
                    <p className="leading-relaxed whitespace-pre-line">{content}</p>
                </div>
            </CardContent>
        </Card>
    );
}
