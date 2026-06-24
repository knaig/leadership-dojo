
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FROM_USER_ID = 'user_38c29fcvlNfCf9jjtGuoWhMn4GW'; // Gmail
const TO_USER_ID = 'user_38bjWMpHr5VKNDSV52Bc7YsHJOW'; // Coss

async function main() {
    try {
        console.log("=== MIGRATING GEMINI KEY ===");
        console.log(`From: ${FROM_USER_ID}`);
        console.log(`To:   ${TO_USER_ID}`);

        // 1. Find key on Source
        const sourceKey = await prisma.userApiKey.findFirst({
            where: { userId: FROM_USER_ID, provider: 'gemini', isActive: true }
        });

        if (!sourceKey) {
            console.log("No active Gemini key found on source user.");
            return;
        }

        console.log(`Found Key ID: ${sourceKey.id}`);

        // 2. Check if Dest has active key
        const destKey = await prisma.userApiKey.findFirst({
            where: { userId: TO_USER_ID, provider: 'gemini', isActive: true }
        });

        if (destKey) {
            console.log("Destination user already has an active Gemini key. Skipping migration.");
            return;
        }

        // 3. Migrate (Update userId)
        await prisma.userApiKey.update({
            where: { id: sourceKey.id },
            data: { userId: TO_USER_ID }
        });

        console.log("SUCCESS: Key migrated to destination user.");

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
