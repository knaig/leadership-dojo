'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuickCapture } from '@/components/capture/QuickCapture';
import { ReflectReview } from '@/components/capture/ReflectReview';
import { PenSquare, Search } from 'lucide-react';

export default function CapturePage() {
    const [activeTab, setActiveTab] = useState('capture');

    return (
        <AppShell>
            <div className="p-8 max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold">Capture & Reflect</h1>
                    <p className="text-muted-foreground mt-1">Log your leadership moments and review your progress</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                        <TabsTrigger value="capture" className="flex items-center gap-2">
                            <PenSquare className="h-4 w-4" />
                            <span>Capture</span>
                        </TabsTrigger>
                        <TabsTrigger value="reflect" className="flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            <span>Reflect</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="capture">
                        <QuickCapture />
                    </TabsContent>

                    <TabsContent value="reflect">
                        <ReflectReview />
                    </TabsContent>
                </Tabs>
            </div>
        </AppShell>
    );
}
