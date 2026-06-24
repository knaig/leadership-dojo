
import { PrismaClient } from '@prisma/client';
import { interviewerAgent } from '../src/agents/interviewer';
import dotenv from 'dotenv';
import path from 'path';

// Load env from web/.env.local (relative to worker/scripts/ -> ../../web/.env.local)
dotenv.config({ path: path.resolve(__dirname, '../../web/.env.local') });

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Phase 12 Verification (Real Data)...");

    // 1. Setup Test User
    const email = `test_phase12_${Date.now()}@example.com`;
    const user = await prisma.user.create({
        data: {
            email,
            name: "Phase 12 Real User",
            jobTitle: "VP of Engineering"
        }
    });
    console.log(`✅ Created Real User: ${user.id}`);

    // 2. Seed Real Context (The "Reality")
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    await prisma.meetingSyncRecord.create({
        data: {
            userId: user.id,
            externalId: `evt_${Date.now()}`,
            title: "Project Phoenix Go-Live",
            startTime: tomorrow,
            endTime: new Date(tomorrow.getTime() + 60 * 60 * 1000),
            status: "confirmed",
            participants: ["alice@example.com", "bob@example.com"],
            attendees: [
                { email: "alice@example.com", name: "Alice", response: "accepted" },
                { email: "bob@example.com", name: "Bob", response: "accepted" }
            ]
        }
    });
    console.log("✅ Seeded Real Meeting: 'Project Phoenix Go-Live'");

    // 3. User Message
    const userMessage = "I am worried about the go-live tomorrow.";
    console.log(`\n💬 Sending Message: "${userMessage}"`);

    // 4. Run Agent
    const result: any = await interviewerAgent({
        userId: user.id,
        message: userMessage
    });

    if (result.success) {
        console.log("\n🤖 Agent Response:");
        console.log("-----------------------------------");
        console.log(result.response);
        console.log("-----------------------------------");

        // 5. Verification
        if (result.response.includes("Phoenix") || result.response.includes("Go-Live")) {
            console.log("\n✅ SUCCESS: Agent mentioned the real meeting context!");
        } else {
            console.log("\n⚠️ WARNING: Agent response did not explicitly mention 'Phoenix' or 'Go-Live'. Check logic.");
        }
    } else {
        console.error("\n❌ Agent Failed:", result.error);
    }

    // Cleanup
    await prisma.meetingSyncRecord.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
}

main();
