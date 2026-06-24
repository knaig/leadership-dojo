
import { prisma } from '../src/lib/prisma';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function cleanup() {
    console.log('🧹 Cleaning up Mock Data...');

    // Delete the mock meeting
    const deleted = await prisma.meetingSyncRecord.deleteMany({
        where: {
            externalId: 'evt_q3_budget_review'
        }
    });

    console.log(`✅ Deleted ${deleted.count} mock meetings.`);

    // Check stakeholders (Sarah Chen)
    // We might want to keep the stakeholder if it's "real-looking"? 
    // But user said "no mocks".
    const deletedS = await prisma.stakeholderProfile.deleteMany({
        where: {
            email: 'sarah.chen@acme.com'
        }
    });
    console.log(`✅ Deleted ${deletedS.count} mock stakeholders.`);

    // KPI
    const deletedK = await prisma.userKPI.deleteMany({
        where: {
            name: 'Q3 Burn Rate',
            metric: 'Monthly Burn'
        }
    });
    console.log(`✅ Deleted ${deletedK.count} mock KPIs.`);
}

cleanup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
