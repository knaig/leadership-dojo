/**
 * Encryption utilities for the worker.
 * Mirrors web/lib/encryption.ts for OAuth token encrypt/decrypt.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('ENCRYPTION_SECRET is not defined');
    }
    return scryptSync(secret, 'salt', KEY_LENGTH);
}

function encrypt(value: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex'), tag]);
    return combined.toString('base64');
}

function decrypt(encryptedData: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Check if a string looks like it was encrypted by our encrypt function.
 */
function isLikelyEncrypted(value: string): boolean {
    if (value.startsWith('ya29.') || value.startsWith('1//')) return false;
    return value.length >= 44 && /^[A-Za-z0-9+/]+=*$/.test(value);
}

/**
 * Encrypt an OAuth token for storage. Migration-safe.
 */
export function encryptOAuthToken(token: string | null | undefined): string | null {
    if (!token) return null;
    if (isLikelyEncrypted(token)) return token;
    return encrypt(token);
}

/**
 * Decrypt an OAuth token from storage. Migration-safe (handles plaintext).
 */
export function decryptOAuthToken(token: string | null | undefined): string | null {
    if (!token) return null;
    if (!isLikelyEncrypted(token)) return token;
    try {
        return decrypt(token);
    } catch {
        return token;
    }
}
