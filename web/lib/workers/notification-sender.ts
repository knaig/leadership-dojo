
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';

export async function notificationSenderWorker(targetUserId?: string) {
    // 1. Get subscriptions
    const whereClause = targetUserId ? { userId: targetUserId } : {};
    const subscriptions = await prisma.pushSubscription.findMany({
        where: whereClause,
    });

    if (subscriptions.length === 0) return { skipped: true, reason: 'No subscriptions found' };

    // 2. Group by user
    const userSubsMap = new Map<string, typeof subscriptions>();
    subscriptions.forEach(sub => {
        if (!userSubsMap.has(sub.userId)) userSubsMap.set(sub.userId, []);
        userSubsMap.get(sub.userId)?.push(sub);
    });

    const results = [];

    // 3. Process each user
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    for (const [userId, subs] of userSubsMap.entries()) {
        try {
            // Find meetings today
            const meetings = await prisma.meetingSyncRecord.findMany({
                where: {
                    userId,
                    startTime: { gte: startOfDay, lte: endOfDay }
                }
            });

            // Filter for "High Stakes" heuristic
            // In a real agentic system, the Scout would have already tagged these
            const highStakes = meetings.filter(m => {
                const title = m.title.toLowerCase();
                return title.includes('board') ||
                    title.includes('review') ||
                    title.includes('strategy') ||
                    title.includes('vp') ||
                    m.participants.length > 5;
            });

            if (highStakes.length > 0) {
                const payload = {
                    title: `🎯 ${highStakes.length} Priority Meetings Today`,
                    body: `Upcoming: ${highStakes[0].title}. Tap to prepare with your AI Coach.`,
                    url: '/dashboard'
                };

                let sentCount = 0;
                for (const sub of subs) {
                    try {
                        await sendPushNotification(sub, payload);
                        sentCount++;
                    } catch (error: any) {
                        console.error('Push failed for sub', sub.id, error);
                        if (error.statusCode === 410) {
                            await prisma.pushSubscription.delete({ where: { id: sub.id } });
                        }
                    }
                }
                results.push({ userId, meetingsFound: meetings.length, highStakes: highStakes.length, sentCount });
            } else {
                results.push({ userId, reason: 'No high stakes meetings' });
            }

        } catch (error) {
            console.error(`Error processing user ${userId}:`, error);
            results.push({ userId, error: String(error) });
        }
    }

    return results;
}
