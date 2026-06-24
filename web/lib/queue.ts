// Use dynamic import for ESM package compatibility in Next.js/Node
let boss: any = null;
let initializationPromise: Promise<any> | null = null;

export async function getQueue() {
    if (boss) {
        // console.log('✅ [Queue Lib] Reusing existing PgBoss instance');
        return boss;
    }

    // Return pending initialization if already in progress
    if (initializationPromise) {
        return initializationPromise;
    }

    const connectionString = (process.env.DIRECT_URL || process.env.DATABASE_URL)?.trim();

    if (!connectionString) {
        console.error('❌ [Queue Lib] DATABASE_URL and DIRECT_URL missing');
        throw new Error('Database connection string not set');
    }

    console.log('🔌 [Queue Lib] Loading pg-boss via dynamic import...');

    initializationPromise = (async () => {
        try {
            // Dynamic import handles ESM modules correctly
            const module = await import('pg-boss');
            const PgBoss = module.PgBoss;

            if (!PgBoss) {
                console.error('❌ [Queue Lib] PgBoss named export not found in module:', Object.keys(module));
                throw new Error('PgBoss export missing');
            }

            console.log('🔌 [Queue Lib] Creating new PgBoss instance...');
            const newBoss = new PgBoss(connectionString);

            newBoss.on('error', (err: any) => console.error('🔴 [PgBoss Error]', err));

            await newBoss.start();
            console.log('✅ [Queue Lib] PgBoss started successfully');

            boss = newBoss;
            return boss;

        } catch (e: any) {
            console.error('🔥 [Queue Lib] Failed to initialize queue:', e);
            initializationPromise = null; // Allow retry on failure
            throw e;
        }
    })();

    return initializationPromise;
}

export async function publishGraphJob(userId: string, artifactId: string) {
    try {
        const queue = await getQueue();
        await queue.send('agent-graph-builder', { userId, artifactId });
        console.log(`[Queue Lib] Published graph job for artifact: ${artifactId}`);
    } catch (e) {
        console.error('Failed to publish graph job:', e);
    }
}
