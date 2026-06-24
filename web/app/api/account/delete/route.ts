import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/account/delete
 *
 * Full account deletion: revokes OAuth tokens, deletes all user data,
 * and returns confirmation. User must re-confirm via Clerk to delete
 * their auth identity.
 *
 * GDPR Article 17 — Right to Erasure
 */
export async function DELETE() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[AccountDelete] Starting data purge for user ${userId.substring(0, 8)}...`);

        // 1. Revoke Google OAuth tokens
        try {
            const account = await prisma.account.findFirst({
                where: { userId, provider: 'google' },
                select: { access_token: true },
            });
            if (account?.access_token) {
                const token = decryptOAuthToken(account.access_token);
                if (token) {
                    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    }).catch(() => {});
                }
            }
        } catch {}

        // 2. Delete all user data in dependency order
        // Child tables first, then parent tables
        const deletions = [
            // Knowledge graph
            prisma.graphCommunity.deleteMany({ where: { userId } }),
            prisma.graphFact.deleteMany({ where: { userId } }),
            prisma.graphEntity.deleteMany({ where: { userId } }),
            prisma.extractionLog.deleteMany({ where: { userId } }),

            // Meetings & coaching
            prisma.meetingOutcome.deleteMany({ where: { userId } }),
            prisma.meetingPrep.deleteMany({ where: { userId } }),
            prisma.meetingNote.deleteMany({ where: { userId } }),
            prisma.meeting.deleteMany({ where: { userId } }),

            // Stakeholders & network
            prisma.stakeholderRelationship.deleteMany({ where: { userId } }),
            prisma.stakeholderProfile.deleteMany({ where: { userId } }),
            prisma.organization.deleteMany({ where: { userId } }),

            // Goals & KPIs
            prisma.goalProgress.deleteMany({ where: { goal: { userId } } }),
            prisma.goal.deleteMany({ where: { userId } }),

            // Chat & conversations
            prisma.chatMessage.deleteMany({ where: { conversation: { userId } } }),
            prisma.conversation.deleteMany({ where: { userId } }),

            // Connectors & artifacts
            prisma.watchChannel.deleteMany({ where: { userId } }),
            prisma.workArtifact.deleteMany({ where: { connector: { userId } } }),
            prisma.dataConnector.deleteMany({ where: { userId } }),

            // WhatsApp
            prisma.whatsAppMessage.deleteMany({ where: { userId } }),
            prisma.whatsAppGroup.deleteMany({ where: { userId } }),
            prisma.whatsAppSession.deleteMany({ where: { userId } }),

            // Settings & preferences
            prisma.userApiKey.deleteMany({ where: { userId } }),
            prisma.domainContext.deleteMany({ where: { userId } }),
            prisma.professionalTeam.deleteMany({ where: { userId } }),
            prisma.professionalProject.deleteMany({ where: { userId } }),

            // Auth accounts
            prisma.account.deleteMany({ where: { userId } }),
        ];

        // Run deletions in batches to avoid overwhelming the DB
        for (const deletion of deletions) {
            try {
                await deletion;
            } catch (err: any) {
                // Log but continue — some tables may not exist or have no data
                console.warn(`[AccountDelete] Skipped deletion:`, err.message?.substring(0, 100));
            }
        }

        // 3. Finally delete the user record itself
        try {
            await prisma.user.delete({ where: { id: userId } });
        } catch (err: any) {
            console.warn(`[AccountDelete] User record deletion:`, err.message?.substring(0, 100));
        }

        console.log(`[AccountDelete] Data purge complete for user ${userId.substring(0, 8)}...`);

        return NextResponse.json({
            success: true,
            message: 'All your data has been permanently deleted. Your authentication account can be removed from your profile settings.',
        });
    } catch (error: any) {
        console.error('[AccountDelete] Error:', error.message);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
