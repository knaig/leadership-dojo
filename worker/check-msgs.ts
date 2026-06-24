import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function check() {
    const client = new Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
    await client.connect();
    // In Prisma, Message table is usually "Message" with capital M unless mapped
    const res = await client.query('SELECT "userId", role, content, "createdAt" FROM "Message" WHERE content ILIKE \'%AI4Inclusion%\' ORDER BY "createdAt" DESC LIMIT 5');
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}
check().catch(console.error);
