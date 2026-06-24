
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDrive() {
    console.log('Resetting Drive Connector LastSyncAt...');

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
            provider: 'gdrive'
        }
    });

    if (!connector) {
        console.error('Drive Connector not found');
        return;
    }

    console.log(`Found Connector: ${connector.id} (Last Sync: ${connector.lastSyncAt})`);

    // Reset lastSyncAt to 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await prisma.dataConnector.update({
        where: { id: connector.id },
        data: {
            lastSyncAt: thirtyDaysAgo,
            lastSyncStatus: 'Manual Reset for Safe Full Ingest'
        }
    });

    console.log('✅ Drive Connector reset. Next sync will scan past 30 days without deleting data.');

    await prisma.$disconnect();
}

resetDrive()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
