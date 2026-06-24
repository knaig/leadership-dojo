
import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { interviewerAgent } from '../src/agents/interviewer';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function verify() {
    console.log('🧪 Verifying Agent Logic Directly...');

    // 1. Get User
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');

    console.log(`👤 User: ${user.email}`);

    // 2. Call Agent
    const input = "What should I focus on?";
    console.log(`🗣️ Input: "${input}"`);

    const result = await interviewerAgent({
        userId: user.id,
        message: input
    });

    // 3. Output
    if (result.success) {
        console.log('\n🤖 Agent Response:');
        console.log('---------------------------------------------------');
        console.log(result.response);
        console.log('---------------------------------------------------');

        if (result.response.includes('Budget Review') || result.response.includes('upcoming meetings')) {
            console.log('✅ PASS: Agent mentioned the mocked meeting.');
        } else {
            console.log('⚠️ WARNING: Agent did not mention the meeting via specific keywords. Check the output text manually.');
        }
    } else {
        console.error('❌ Agent Failed:', result.error);
    }
}

verify()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
