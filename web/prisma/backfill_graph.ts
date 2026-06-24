
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfill() {
    console.log('Starting Graph Builder Backfill (Robust Mode)...');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required');
    }

    const pgBossModule = require('pg-boss');
    console.log('pg-boss exports:', Object.keys(pgBossModule));

    // Try all variants
    const BossClass = pgBossModule.PgBoss || pgBossModule.default || pgBossModule;

    if (typeof BossClass !== 'function') {
        throw new Error('Could not find PgBoss constructor');
    }

    const boss = new BossClass(process.env.DATABASE_URL);
    await boss.start();

    // Ensure queue exists
    await boss.createQueue('agent-graph-builder');

    const artifacts = await prisma.workArtifact.findMany({
        select: { id: true, userId: true, title: true }
    });

    console.log(`Found ${artifacts.length} artifacts to process.`);

    let count = 0;
    for (const artifact of artifacts) {
        if (count % 10 === 0) console.log(`Processed ${count}...`);

        // Send job directly
        await boss.send('agent-graph-builder', {
            userId: artifact.userId,
            artifactId: artifact.id
        });

        count++;
    }

    console.log('✅ Backfill Complete. Jobs queued.');

    // Cleanup
    await boss.stop();
    await prisma.$disconnect();
}

backfill()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
