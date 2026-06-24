'use server';

import { ingestArticle } from '@/lib/agents/ingest';
import { runQAGate } from '@/lib/agents/qa';
import { prisma } from '@/lib/db';

export async function triggerIngest(url: string) {
    if (!url) return { success: false, error: 'No URL provided' };

    try {
        const result = await ingestArticle(url);
        if (!result || typeof result !== 'string') {
            const errorMsg = typeof result === 'object' && result && 'error' in result ? (result as { error: string }).error : 'Ingestion failed';
            return { success: false, error: errorMsg };
        }
        const caseId = result;

        const c = await prisma.case.findUnique({ where: { id: caseId } });
        if (!c?.currentVersionId) return { success: false, error: 'Version missing' };

        const report = await runQAGate(c.id, c.currentVersionId);

        return {
            success: true,
            case: { title: c.title, slug: c.slug },
            qa: report
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
