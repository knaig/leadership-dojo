
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        encryptionSecret: process.env.ENCRYPTION_SECRET ? 'SET' : 'MISSING',
        databaseUrl: process.env.DATABASE_URL ? 'SET' : 'MISSING',
        anthropicKey: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING',
        perplexityKey: process.env.PERPLEXITY_API_KEY ? 'SET' : 'MISSING',
        nodeEnv: process.env.NODE_ENV
    });
}
