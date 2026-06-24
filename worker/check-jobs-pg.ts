import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function check() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query("SELECT id, name, data, state, created_on, started_on, completed_on FROM pgboss.job ORDER BY created_on DESC LIMIT 10");
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}
check();
