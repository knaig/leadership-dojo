/**
 * Phone Number E.164 Formatting Tests
 *
 * Tests the phone number normalization logic used before Vapi API calls.
 * This logic exists in two places (worker + web) and must stay in sync.
 * Bug: 10-digit Indian numbers without +91 prefix failed silently at Vapi.
 */

import { describe, it, expect } from 'vitest';

/**
 * Extracted E.164 formatting logic — identical to worker/src/lib/vapi-voice.ts
 * and web/app/api/vapi/call/route.ts
 */
function formatE164(raw: string): string {
    let phoneNumber = raw.replace(/[\s\-()]/g, '');
    if (!phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('91') && phoneNumber.length === 12) {
            phoneNumber = '+' + phoneNumber;
        } else if (phoneNumber.length === 10) {
            phoneNumber = '+91' + phoneNumber;
        } else {
            phoneNumber = '+' + phoneNumber;
        }
    }
    return phoneNumber;
}

describe('E.164 Phone Number Formatting', () => {
    it('adds +91 to bare 10-digit Indian numbers', () => {
        expect(formatE164('8130024145')).toBe('+918130024145');
    });

    it('adds + to 12-digit numbers starting with 91', () => {
        expect(formatE164('918130024145')).toBe('+918130024145');
    });

    it('keeps already-formatted +91 numbers unchanged', () => {
        expect(formatE164('+918130024145')).toBe('+918130024145');
    });

    it('strips spaces and hyphens before formatting', () => {
        expect(formatE164('813-002-4145')).toBe('+918130024145');
        expect(formatE164('81300 24145')).toBe('+918130024145');
    });

    it('strips parentheses', () => {
        expect(formatE164('(813) 002 4145')).toBe('+918130024145');
    });

    it('handles US numbers with country code', () => {
        expect(formatE164('+14155551234')).toBe('+14155551234');
    });

    it('prepends + for other non-10-digit numbers', () => {
        expect(formatE164('4155551234')).toBe('+914155551234'); // 10-digit defaults to +91
        expect(formatE164('14155551234')).toBe('+14155551234'); // 11-digit gets +
    });

    it('handles numbers with + already', () => {
        expect(formatE164('+441234567890')).toBe('+441234567890');
    });
});
