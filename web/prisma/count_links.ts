
import { prisma } from '../lib/prisma';

async function main() {
    const count = await prisma.artifactLink.count();
    console.log(`Total Knowledge Links: ${count}`);

    const recent = await prisma.artifactLink.count({
        where: {
            createdAt: {
                gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 mins
            }
        }
    });
    console.log(`Links created in last 5 mins: ${recent}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
