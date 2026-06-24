
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const pgBossModule = require('pg-boss');
        const debugInfo = {
            typeofModule: typeof pgBossModule,
            keys: Object.keys(pgBossModule),
            hasDefault: !!pgBossModule.default,
            hasPgBoss: !!pgBossModule.PgBoss,
            isConstructor: typeof pgBossModule === 'function',
            defaultIsConstructor: pgBossModule.default && typeof pgBossModule.default === 'function',
            pgBossIsConstructor: pgBossModule.PgBoss && typeof pgBossModule.PgBoss === 'function',
            stringified: JSON.stringify(pgBossModule, (key, value) => (key === 'default' ? '[Circular/Code]' : value)).substring(0, 200)
        };

        return NextResponse.json(debugInfo);
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack });
    }
}
