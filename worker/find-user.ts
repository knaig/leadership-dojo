import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const prisma = new PrismaClient();

async function findUser() {
    const users = await prisma.user.findMany({
        where: { email: { contains: 'karthik@coss.org.in', mode: 'insensitive' } }
    });
    console.log('Found users:', users);

    if (users.length === 0) {
        const allUsers = await prisma.user.findMany({ select: { id: true, email: true } });
        console.log('All users in DB:', allUsers);
    }
}

findUser().finally(() => prisma.$disconnect());
