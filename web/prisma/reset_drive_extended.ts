
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDriveExtended() {
    console.log('Resetting Drive Connector LastSyncAt (Extended)...');

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

    // Reset lastSyncAt to 90 days ago (3 months)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    await prisma.dataConnector.update({
        where: { id: connector.id },
        data: {
            lastSyncAt: ninetyDaysAgo,
            lastSyncStatus: 'Manual Reset (90 Days) for Doc Recovery'
        }
    });

    console.log('✅ Drive Connector reset to 90 days ago. Next sync will scan deeper history.');

    await prisma.$disconnect();
}

resetDriveExtended()
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
