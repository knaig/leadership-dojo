import { ingestArticle } from '../lib/agents/ingest';
import { runQAGate } from '../lib/agents/qa';
import { prisma } from '@/lib/db';

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error("Usage: ts-node scripts/ingest.ts <URL>");
        process.exit(1);
    }

    console.log("-----------------------------------------");
    console.log("STARTING INGESTION PIPELINE");
    console.log("-----------------------------------------");

    try {
        // 1. Ingest
        const caseId = await ingestArticle(url);

        if (!caseId) {
            console.error("Ingestion Failed.");
            process.exit(1);
        }

        // Fetch current version ID
        const c = await prisma.case.findUnique({ where: { id: caseId } });
        if (!c || !c.currentVersionId) {
            console.error("Case created but version missing.");
            process.exit(1);
        }

        console.log(`Case Created: ${c.title} (${c.slug})`);

        // 2. QA
        console.log("Running QA Gate...");
        const report = await runQAGate(c.id, c.currentVersionId);

        console.log("-----------------------------------------");
        console.log("QA REPORT");
        console.log("PASSED:", report.passed);
        console.log("SCORE:", report.score);
        console.log("FLAGS:", report.flags);
        console.log("-----------------------------------------");

    } catch (e) {
        console.error("Pipeline Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
