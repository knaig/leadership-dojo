/**
 * Zoom meeting/recording adapter.
 * Fetches meeting recordings and transcripts for coaching intelligence.
 */
import { prisma } from '../../prisma';

// Auth helper
async function zoomRequest(userId: string, path: string): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'zoom' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });
    if (!account?.access_token) throw new Error(`No Zoom account for user ${userId}`);

    // Refresh if expired
    const now = Math.floor(Date.now() / 1000);
    let token = account.access_token;
    if (account.expires_at && account.expires_at <= now + 300) {
        const clientId = process.env.ZOOM_CLIENT_ID || '';
        const clientSecret = process.env.ZOOM_CLIENT_SECRET || '';
        const res = await fetch('https://zoom.us/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: account.refresh_token || '' }),
        });
        if (!res.ok) throw new Error(`Zoom token refresh failed: ${res.status}`);
        const data = await res.json() as any;
        token = data.access_token;
        await prisma.account.update({
            where: { id: account.id },
            data: { access_token: token, refresh_token: data.refresh_token || account.refresh_token, expires_at: now + (data.expires_in || 3600) },
        });
    }

    const res = await fetch(`https://api.zoom.us/v2${path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Zoom API ${path} failed: ${res.status}`);
    return res.json();
}

export interface ZoomMeeting {
    id: string;
    topic: string;
    startTime: Date;
    duration: number; // minutes
    participants: number;
    recordingUrl?: string;
    transcriptUrl?: string;
    transcript?: string;
}

export class ZoomMeetingAdapter {
    provider = 'zoom';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listRecordings(options?: { from?: Date; to?: Date }): Promise<ZoomMeeting[]> {
        const from = options?.from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = options?.to || new Date();

        const data = await zoomRequest(this.userId, `/users/me/recordings?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&page_size=50`);

        return (data.meetings || []).map((m: any) => {
            const audioTranscript = (m.recording_files || []).find((f: any) => f.recording_type === 'audio_transcript');
            const recording = (m.recording_files || []).find((f: any) => f.recording_type === 'shared_screen_with_speaker_view' || f.recording_type === 'active_speaker');

            return {
                id: String(m.id),
                topic: m.topic || '',
                startTime: new Date(m.start_time),
                duration: m.duration || 0,
                participants: m.total_size || 0,
                recordingUrl: recording?.play_url || undefined,
                transcriptUrl: audioTranscript?.download_url || undefined,
            };
        });
    }

    async getTranscript(meetingId: string): Promise<string | null> {
        try {
            const data = await zoomRequest(this.userId, `/meetings/${meetingId}/recordings`);
            const transcript = (data.recording_files || []).find((f: any) => f.recording_type === 'audio_transcript');
            if (!transcript?.download_url) return null;

            // Download transcript VTT file
            const account = await prisma.account.findFirst({ where: { userId: this.userId, provider: 'zoom' }, select: { access_token: true } });
            const res = await fetch(transcript.download_url, { headers: { 'Authorization': `Bearer ${account?.access_token}` } });
            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    }
}
