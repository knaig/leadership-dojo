/**
 * Email Brief Sender
 *
 * Sends meeting briefs via email using Resend.
 * Fallback delivery channel — works for 100% of users.
 *
 * Env vars:
 *   RESEND_API_KEY — Resend API key
 *   EMAIL_FROM — sender address (e.g., "Mira <mira@yourdomain.com>")
 */

import { Resend } from 'resend';
import { prisma } from './prisma';

let resend: Resend | null = null;

function getResend(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null;
    if (!resend) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

interface MeetingBriefEmail {
    meetingTitle: string;
    startTime: string; // formatted time string
    brief: string;
    edge: string | null;
    attendeeNames: string[];
    desiredOutcome: string | null;
    userGrowthTip: string | null;
    attendeeIntel: Array<{
        name: string;
        whatWorks: string | null;
        watchFor: string | null;
    }>;
}

/**
 * Send a meeting brief email to a user.
 */
export async function sendBriefEmail(
    userId: string,
    data: MeetingBriefEmail,
): Promise<{ success: boolean; error?: string }> {
    const client = getResend();
    if (!client) {
        return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
    });

    if (!user?.email) {
        return { success: false, error: 'User has no email' };
    }

    const firstName = user.name?.split(' ')[0] || 'there';
    const from = process.env.EMAIL_FROM || 'Mira <noreply@resend.dev>';
    const subject = `${data.meetingTitle} — ${data.startTime}`;

    const html = buildBriefHTML(firstName, data);

    try {
        const result = await client.emails.send({
            from,
            to: user.email,
            subject,
            html,
        });

        if (result.error) {
            console.error(`[EmailSender] Failed: ${result.error.message}`);
            return { success: false, error: result.error.message };
        }

        console.log(`[EmailSender] Brief sent to ${user.email.substring(0, 5)}*** for "${data.meetingTitle}"`);
        return { success: true };
    } catch (err: any) {
        console.error(`[EmailSender] Error: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Build clean HTML email for a meeting brief.
 * Designed for mobile-first reading (most people check email on phone).
 */
function buildBriefHTML(firstName: string, data: MeetingBriefEmail): string {
    const attendeeSection = data.attendeeIntel.length > 0
        ? data.attendeeIntel.map(a => {
            const parts = [`<strong>${a.name}</strong>`];
            if (a.whatWorks) parts.push(`<span style="color:#16a34a">✓ ${a.whatWorks}</span>`);
            if (a.watchFor) parts.push(`<span style="color:#d97706">⚠ ${a.watchFor}</span>`);
            return `<li style="margin-bottom:8px">${parts.join('<br>')}</li>`;
        }).join('')
        : '';

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1a1a1a;line-height:1.5">

<p style="color:#666;font-size:13px;margin-bottom:4px">${data.startTime} ${data.attendeeNames.length > 0 ? '· ' + data.attendeeNames.slice(0, 4).join(', ') : ''}</p>
<h2 style="margin:0 0 16px;font-size:20px;font-weight:600">${data.meetingTitle}</h2>

${data.desiredOutcome ? `<div style="background:#f0fdf4;border-left:3px solid #16a34a;padding:10px 14px;margin-bottom:16px;border-radius:4px">
<strong style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">Your Outcome</strong><br>
${data.desiredOutcome}
</div>` : ''}

<div style="margin-bottom:16px">
${data.brief}
</div>

${data.edge ? `<div style="background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;margin-bottom:16px;border-radius:4px">
<strong style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">Your Edge</strong><br>
<em>${data.edge}</em>
</div>` : ''}

${attendeeSection ? `<div style="margin-bottom:16px">
<strong style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">Who's in the Room</strong>
<ul style="padding-left:16px;margin-top:8px">${attendeeSection}</ul>
</div>` : ''}

${data.userGrowthTip ? `<div style="background:#fefce8;border-left:3px solid #eab308;padding:10px 14px;margin-bottom:16px;border-radius:4px">
<strong style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px">Watch For</strong><br>
${data.userGrowthTip}
</div>` : ''}

<p style="color:#999;font-size:11px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
Sent by Mira · Your leadership coach
</p>

</body>
</html>`;
}

/**
 * Check if email briefs should be sent and send if appropriate.
 * Called after a meeting brief is generated by the proactive agent.
 */
export async function maybeSendEmailBrief(
    userId: string,
    data: MeetingBriefEmail,
): Promise<void> {
    // Check user preferences
    const prefs = await prisma.userPreferences.findUnique({
        where: { userId },
    });

    // Default: send email briefs unless user explicitly has a preferred channel that excludes email
    // For now, always send — email is the universal fallback
    const channel = prefs?.preferredChannel || 'web';

    // Send email for all channels except if explicitly disabled
    // (we don't have an "emailBriefs" toggle yet — email is always-on as fallback)
    await sendBriefEmail(userId, data);
}
