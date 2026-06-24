import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { linkAllNotesForUser } from '@/lib/intelligence/meeting-notes-matcher';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/link-meeting-notes
 * 
 * Manually trigger meeting notes linking for the current user
 */
export async function POST() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await linkAllNotesForUser(session.user.id);

        return NextResponse.json({
            success: true,
            linked: result.linked,
            total: result.total,
            message: `Linked ${result.linked} notes out of ${result.total} potential note emails`,
        });
    } catch (error) {
        console.error('Failed to link meeting notes:', error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
