import dotenv from 'dotenv';
import path from 'path';
import { PgBoss } from 'pg-boss';

// Load env from root .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function enqueueTest() {
    console.log('🔌 Connecting to PgBoss using DIRECT_URL...');
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('Database connection string is not set');
    }

    const boss = new PgBoss(connectionString);
    boss.on('error', (err: any) => console.error('🔴 boss error', err));
    await boss.start();

    // We found this ID in the previous DB checks
    const testUserId = 'user_38bjWMpHr5VKNDSV52Bc7YsHJOW';
    const testMessage = 'Can you identify what my project needs? My project is AI4X or AI4I or I4Inclusion. All details are on github.';

    console.log(`📤 Enqueuing test chat message for user ${testUserId}...`);

    const payload = {
        userId: testUserId,
        message: testMessage,
        messageId: 'test_msg_' + Date.now(),
        timestamp: new Date().toISOString()
    };

    const jobId = await boss.send('agent-interviewer', payload);

    if (jobId) {
        console.log(`✅ Job successfully enqueued to pg-boss. Job ID: ${jobId}`);
        console.log('⏳ Waiting 15 seconds to see if the worker picks it up and processes it in the DB...');

        // Wait to allow Render worker to process
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Check the job state in DB
        const { Client } = require('pg');
        const client = new Client({ connectionString });
        await client.connect();

        const res = await client.query("SELECT state, started_on, completed_on FROM pgboss.job WHERE id = $1", [jobId]);

        if (res.rows.length > 0) {
            console.log(`\n🔍 Job State after 15s: [${res.rows[0].state.toUpperCase()}]`);
            if (res.rows[0].state === 'completed') {
                console.log('🎉 The Render worker successfully picked up and processed the job!');
            } else if (res.rows[0].state === 'failed') {
                console.log('🚨 The Render worker picked it up but FAILED processing.');
            } else {
                console.log('⏳ The Render worker is STILL processing it (or stalled).');
            }
        }
        await client.end();

    } else {
        console.error('❌ Failed to enqueue job');
    }

    await boss.stop();
    process.exit(0);
}

enqueueTest().catch(console.error);
