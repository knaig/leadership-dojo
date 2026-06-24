
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetGmail() {
    console.log('Resetting Gmail Connector LastSyncAt...');

    // Find user
    const user = await prisma.user.findUnique({
        where: { email: 'karthik@coss.org.in' }
    });

    if (!user) {
        console.error('User not found');
        return;
    }

    // Find connector
    const connector = await prisma.dataConnector.findFirst({
        where: {
            userId: user.id,
            provider: 'gmail'
        }
    });

    if (!connector) {
        console.error('Gmail Connector not found');
        return;
    }

    console.log(`Found Connector: ${connector.id} (Last Sync: ${connector.lastSyncAt})`);

    // Reset lastSyncAt to 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await prisma.dataConnector.update({
        where: { id: connector.id },
        data: {
            lastSyncAt: thirtyDaysAgo,
            lastSyncStatus: 'Manual Reset for Expanded Ingest'
        }
    });

    console.log('✅ Gmail Connector reset. Next sync will scan past 30 days for new personal emails.');

    await prisma.$disconnect();
}

resetGmail()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
