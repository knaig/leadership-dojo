/**
 * Backfill Re-Extraction Script
 *
 * When an extractor is improved, old data doesn't benefit. This script
 * clears extraction logs for a specific source type and re-queues extraction
 * so all existing data gets reprocessed through the improved extractor.
 *
 * Usage (from worker directory):
 *   npx ts-node src/scripts/backfill-extraction.ts email       # Re-extract all emails
 *   npx ts-node src/scripts/backfill-extraction.ts document    # Re-extract all documents
 *   npx ts-node src/scripts/backfill-extraction.ts calendar    # Re-extract all calendar events
 *   npx ts-node src/scripts/backfill-extraction.ts meeting-notes  # Re-extract meeting notes
 *   npx ts-node src/scripts/backfill-extraction.ts all         # Re-extract everything
 */

import { prisma } from '../lib/prisma';

const SOURCE_TYPE_MAP: Record<string, string> = {
    'email': 'EmailSummary',
    'document': 'WorkArtifact',
    'calendar': 'MeetingSyncRecord',
    'meeting-notes': 'MeetingNotes',
    'voice': 'VoiceCall',
    'chat': 'Message',
};

async function backfill(type: string) {
    if (type === 'all') {
        for (const t of Object.keys(SOURCE_TYPE_MAP)) {
            await backfillType(t);
        }
        return;
    }

    if (!SOURCE_TYPE_MAP[type]) {
        console.error(`Unknown type: ${type}. Valid types: ${Object.keys(SOURCE_TYPE_MAP).join(', ')}, all`);
        process.exit(1);
    }

    await backfillType(type);
}

async function backfillType(type: string) {
    const sourceType = SOURCE_TYPE_MAP[type];
    console.log(`[Backfill] Clearing extraction logs for ${sourceType}...`);

    const deleted = await prisma.extractionLog.deleteMany({
        where: { sourceType },
    });

    console.log(`[Backfill] Cleared ${deleted.count} extraction log entries for ${sourceType}`);
    console.log(`[Backfill] Next scheduled extraction run will reprocess all ${sourceType} records`);

    // Get active users to show scope
    const users = await prisma.extractionLog.findMany({
        where: {},
        select: { userId: true },
        distinct: ['userId'],
    });
    console.log(`[Backfill] ${users.length} users will be affected on next extraction cycle`);
}

const type = process.argv[2];
if (!type) {
    console.log('Usage: npx ts-node src/scripts/backfill-extraction.ts <type>');
    console.log('Types: email, document, calendar, meeting-notes, voice, chat, all');
    process.exit(0);
}

backfill(type)
    .then(() => {
        console.log('[Backfill] Done');
        process.exit(0);
    })
    .catch(err => {
        console.error('[Backfill] Error:', err);
        process.exit(1);
    });
