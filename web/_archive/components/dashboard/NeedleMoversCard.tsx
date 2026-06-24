import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

// Mock interface based on usage
interface NeedleMover {
    id: string;
    headline: string;
    status: 'pending' | 'completed';
    impact: 'high' | 'strategic' | 'urgent';
}

export function NeedleMoversCard({ tasks }: { tasks: any[] }) {
    if (!tasks || tasks.length === 0) return null;

    return (
        <Card className="bg-card border-border h-full">
            <CardHeader>
                <CardTitle className="font-serif font-light text-foreground">Needle Movers</CardTitle>
                <p className="text-muted-foreground text-sm">Strategic priorities for today</p>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {tasks.map((task) => (
                        <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors group">
                            <button className="mt-0.5 text-muted-foreground hover:text-accent transition-colors">
                                {task.status === 'completed' ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                    <Circle className="w-5 h-5" />
                                )}
                            </button>
                            <div className="flex-1">
                                <div className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                                    {task.headline}
                                </div>
                                <div className="flex gap-2 mt-1.5">
                                    {task.impact === 'high' && (
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">High Impact</span>
                                    )}
                                    {task.impact === 'strategic' && (
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">Strategic</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
