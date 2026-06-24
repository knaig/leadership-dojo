'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CaseModal } from '@/components/case/CaseModal';
import { AppShell } from '@/components/layout/AppShell';
import type { CaseData } from '@/types/case-engine';
import { Loader2 } from 'lucide-react';

export default function CasePage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [data, setData] = useState<CaseData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCase = async () => {
            try {
                const res = await fetch(`/api/cases/${params.id}`);
                const json = await res.json();

                if (json.success) {
                    setData(json.data);
                } else {
                    setError(json.error || "Failed to load case.");
                }
            } catch (e) {
                console.error(e);
                setError("Network error occurred.");
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchCase();
        }
    }, [params.id]);

    if (loading) {
        return (
            <AppShell>
                <div className="h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-accent" />
                </div>
            </AppShell>
        );
    }

    if (error || !data) {
        return (
            <AppShell>
                <div className="p-8 max-w-2xl mx-auto text-center mt-20">
                    <h2 className="text-xl font-serif text-destructive mb-2">Simulation unavailable</h2>
                    <p className="text-muted-foreground mb-4">{error || "This case could not be found."}</p>
                    <button
                        onClick={() => router.back()}
                        className="text-sm font-mono text-accent hover:underline"
                    >
                        ← Return to Dashboard
                    </button>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            {/* Render modal directly. Since this is a page, closing it goes back. */}
            <CaseModal
                caseData={data}
                isOpen={true}
                onClose={() => router.back()}
            />

            {/* Background content */}
            <div className="p-8 opacity-20 pointer-events-none">
                <h1 className="text-3xl font-serif mb-4">Simulation Active...</h1>
            </div>
        </AppShell>
    );
}
