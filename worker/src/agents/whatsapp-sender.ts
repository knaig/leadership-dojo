/**
 * WhatsApp Brief Sender
 *
 * Sends meeting briefs to users via WhatsApp Business API.
 * BSP-agnostic: supports Gupshup, Interakt, Twilio, or direct Meta API.
 *
 * The BSP is configured via environment variables:
 *   WHATSAPP_BSP=gupshup|interakt|twilio|meta
 *   WHATSAPP_API_KEY=<bsp api key>
 *   WHATSAPP_PHONE_NUMBER_ID=<for Meta direct API>
 *   WHATSAPP_FROM_NUMBER=<Mira's business number>
 *
 * Message flow:
 * 1. Pre-meeting prep generates a brief (existing proactive-agent)
 * 2. If user has whatsappBriefs enabled + phone number set
 * 3. Brief is formatted and sent via BSP API
 */

interface WhatsAppBriefPayload {
    to: string; // User's phone number (with country code, e.g., "919876543210")
    meetingTitle: string;
    startTime: string; // e.g., "2:30 PM"
    brief: string; // The coaching brief content
    edge?: string; // One-liner edge
    attendees?: string[]; // Key attendee names
}

interface SendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Send a meeting brief to a user's WhatsApp.
 */
export async function sendWhatsAppBrief(payload: WhatsAppBriefPayload): Promise<SendResult> {
    const bsp = process.env.WHATSAPP_BSP || 'none';

    if (bsp === 'none' || !process.env.WHATSAPP_API_KEY) {
        console.log(`[WhatsAppSender] No BSP configured, skipping send`);
        return { success: false, error: 'No WhatsApp BSP configured' };
    }

    // Format the brief for WhatsApp (keep it concise for mobile)
    const message = formatBriefForWhatsApp(payload);

    switch (bsp) {
        case 'gupshup':
            return sendViaGupshup(payload.to, message);
        case 'interakt':
            return sendViaInterakt(payload.to, message);
        case 'twilio':
            return sendViaTwilio(payload.to, message);
        case 'meta':
            return sendViaMeta(payload.to, message);
        default:
            return { success: false, error: `Unknown BSP: ${bsp}` };
    }
}

/**
 * Format a meeting brief for WhatsApp readability.
 * Keep it under 1000 chars — WhatsApp truncates long messages on notifications.
 */
function formatBriefForWhatsApp(payload: WhatsAppBriefPayload): string {
    const parts: string[] = [];

    parts.push(`*${payload.meetingTitle}* at ${payload.startTime}`);

    if (payload.attendees && payload.attendees.length > 0) {
        parts.push(`with ${payload.attendees.slice(0, 4).join(', ')}`);
    }

    parts.push('');

    if (payload.brief) {
        // Truncate brief to ~500 chars for mobile
        const truncated = payload.brief.length > 500
            ? payload.brief.substring(0, 497) + '...'
            : payload.brief;
        parts.push(truncated);
    }

    if (payload.edge) {
        parts.push('');
        parts.push(`_${payload.edge}_`);
    }

    return parts.join('\n');
}

// ============================================================================
// BSP IMPLEMENTATIONS
// ============================================================================

/**
 * Gupshup API — popular in India
 * Docs: https://docs.gupshup.io/docs/send-message
 */
async function sendViaGupshup(to: string, message: string): Promise<SendResult> {
    const apiKey = process.env.WHATSAPP_API_KEY!;
    const sourceNumber = process.env.WHATSAPP_FROM_NUMBER || '';

    try {
        const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'apikey': apiKey,
            },
            body: new URLSearchParams({
                channel: 'whatsapp',
                source: sourceNumber,
                destination: to,
                'message': JSON.stringify({ type: 'text', text: message }),
                'src.name': 'Mira Coach',
            }),
        });

        const data = await response.json() as any;
        if (response.ok && data.status === 'submitted') {
            console.log(`[WhatsAppSender] Gupshup: sent to ${to.substring(0, 5)}***`);
            return { success: true, messageId: data.messageId };
        }
        return { success: false, error: data.message || 'Gupshup send failed' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Interakt API (by Jio Haptik)
 * Docs: https://docs.interakt.ai/
 */
async function sendViaInterakt(to: string, message: string): Promise<SendResult> {
    const apiKey = process.env.WHATSAPP_API_KEY!;

    try {
        const response = await fetch('https://api.interakt.ai/v1/public/message/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${apiKey}`,
            },
            body: JSON.stringify({
                countryCode: '+' + to.substring(0, 2),
                phoneNumber: to.substring(2),
                type: 'Text',
                data: { message },
            }),
        });

        const data = await response.json() as any;
        if (response.ok) {
            console.log(`[WhatsAppSender] Interakt: sent to ${to.substring(0, 5)}***`);
            return { success: true, messageId: data.id };
        }
        return { success: false, error: data.message || 'Interakt send failed' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Twilio WhatsApp API
 * Docs: https://www.twilio.com/docs/whatsapp/api
 */
async function sendViaTwilio(to: string, message: string): Promise<SendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    const authToken = process.env.WHATSAPP_API_KEY!;
    const fromNumber = process.env.WHATSAPP_FROM_NUMBER || '';

    try {
        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                },
                body: new URLSearchParams({
                    From: `whatsapp:+${fromNumber}`,
                    To: `whatsapp:+${to}`,
                    Body: message,
                }),
            }
        );

        const data = await response.json() as any;
        if (response.ok) {
            console.log(`[WhatsAppSender] Twilio: sent to ${to.substring(0, 5)}***`);
            return { success: true, messageId: data.sid };
        }
        return { success: false, error: data.message || 'Twilio send failed' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

/**
 * Meta WhatsApp Business API (direct, no BSP)
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/
 */
async function sendViaMeta(to: string, message: string): Promise<SendResult> {
    const accessToken = process.env.WHATSAPP_API_KEY!;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

    try {
        const response = await fetch(
            `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to,
                    type: 'text',
                    text: { body: message },
                }),
            }
        );

        const data = await response.json() as any;
        if (response.ok) {
            console.log(`[WhatsAppSender] Meta: sent to ${to.substring(0, 5)}***`);
            return { success: true, messageId: data.messages?.[0]?.id };
        }
        return { success: false, error: data.error?.message || 'Meta API send failed' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ============================================================================
// BRIEF TRIGGER (called from proactive-agent pre-meeting flow)
// ============================================================================

/**
 * Check if a user should receive WhatsApp briefs and send if so.
 * Called after a meeting brief is generated.
 */
export async function maybeSendWhatsAppBrief(
    userId: string,
    meetingTitle: string,
    startTime: Date,
    briefContent: string,
    edge: string | null,
    attendeeNames: string[],
): Promise<void> {
    try {
        // Check user preferences
        const prefs = await (await import('../lib/prisma')).prisma.userPreferences.findUnique({
            where: { userId },
        });

        if (!prefs || !(prefs as any).whatsappBriefs) return;

        // Get user's phone number
        const user = await (await import('../lib/prisma')).prisma.user.findUnique({
            where: { id: userId },
            select: { phoneNumber: true },
        });

        const phone = (user as any)?.phoneNumber;
        if (!phone) return;

        const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        await sendWhatsAppBrief({
            to: phone,
            meetingTitle,
            startTime: timeStr,
            brief: briefContent,
            edge: edge || undefined,
            attendees: attendeeNames,
        });
    } catch (err: any) {
        console.error(`[WhatsAppSender] Failed to send brief: ${err.message}`);
    }
}
