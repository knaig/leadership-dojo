
// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { syncAllConnectors } from '@/lib/sync-service';

async function main() {
    console.log('🔄 Force Sync Initiated...');

    const user = await prisma.user.findFirst();
    if (!user) {
        console.error('No user found');
        return;
    }

    console.log(`👤 Syncing for: ${user.email}`);

    try {
        const results = await syncAllConnectors(user.id);
        console.log('✅ Sync Completed. Results:', JSON.stringify(results, null, 2));
    } catch (e: any) {
        console.error('❌ Sync Failed:', e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
