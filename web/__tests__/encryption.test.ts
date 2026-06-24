/**
 * OAuth Token Encryption Tests
 *
 * Tests encryptOAuthToken/decryptOAuthToken roundtrip and edge cases.
 * Bug: tokens could get double-encrypted if encrypt was called twice.
 */

import { describe, it, expect } from 'vitest';

// Set encryption secret before importing
process.env.ENCRYPTION_SECRET = 'test-encryption-secret-for-ci';

import { encryptOAuthToken, decryptOAuthToken } from '@/lib/encryption';

describe('OAuth Token Encryption', () => {
    it('encrypts and decrypts a token roundtrip', () => {
        const token = 'ya29.a0ARrdaM_fake_access_token_12345';
        const encrypted = encryptOAuthToken(token);

        expect(encrypted).not.toBeNull();
        expect(encrypted).not.toBe(token);

        const decrypted = decryptOAuthToken(encrypted);
        expect(decrypted).toBe(token);
    });

    it('returns null for null/undefined input', () => {
        expect(encryptOAuthToken(null)).toBeNull();
        expect(encryptOAuthToken(undefined)).toBeNull();
        expect(decryptOAuthToken(null)).toBeNull();
        expect(decryptOAuthToken(undefined)).toBeNull();
    });

    it('is idempotent — does not double-encrypt', () => {
        const token = 'ya29.a0ARrdaM_some_google_token';
        const encrypted1 = encryptOAuthToken(token);
        const encrypted2 = encryptOAuthToken(encrypted1!);

        // Second encryption should be no-op (already encrypted)
        expect(encrypted2).toBe(encrypted1);

        // Should still decrypt correctly
        const decrypted = decryptOAuthToken(encrypted2);
        expect(decrypted).toBe(token);
    });

    it('handles refresh tokens (1// prefix)', () => {
        const refreshToken = '1//0fake-refresh-token-value';
        const encrypted = encryptOAuthToken(refreshToken);
        const decrypted = decryptOAuthToken(encrypted);
        expect(decrypted).toBe(refreshToken);
    });

    it('returns plaintext tokens unchanged when decrypting', () => {
        // Unencrypted Google access token should pass through
        const plainToken = 'ya29.short';
        const result = decryptOAuthToken(plainToken);
        expect(result).toBe(plainToken);
    });

    it('returns empty string token as-is', () => {
        const encrypted = encryptOAuthToken('');
        expect(encrypted).toBeNull(); // empty string is falsy
    });
});
