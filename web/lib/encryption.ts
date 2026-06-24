import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not defined');
  }
  // Generate a consistent key from the secret
  return scryptSync(secret, 'salt', KEY_LENGTH);
}

export function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Combine iv + encrypted + tag
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'hex'),
    tag
  ]);

  return combined.toString('base64');
}

export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  // Extract iv, encrypted data, and tag
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
 * Encrypt an OAuth token for storage.
 * Returns null if input is null/undefined.
 * Tokens that are already encrypted (base64 with known length pattern) are returned as-is.
 */
export function encryptOAuthToken(token: string | null | undefined): string | null {
  if (!token) return null;
  // Skip if already encrypted (base64 with IV+data+tag, minimum ~60 chars)
  if (isLikelyEncrypted(token)) return token;
  return encryptApiKey(token);
}

/**
 * Decrypt an OAuth token from storage.
 * Returns null if input is null/undefined.
 * Handles both encrypted and plaintext tokens (migration-safe).
 */
export function decryptOAuthToken(token: string | null | undefined): string | null {
  if (!token) return null;
  // If it looks like a plaintext token (starts with ya29. for Google access tokens,
  // or contains typical token characters), return as-is
  if (!isLikelyEncrypted(token)) return token;
  try {
    return decryptApiKey(token);
  } catch {
    // If decryption fails, it might be a plaintext token we didn't recognize
    return token;
  }
}

/**
 * Check if a string looks like it was encrypted by our encryptApiKey function.
 * Encrypted values are base64-encoded and have a minimum length from IV+tag overhead.
 */
function isLikelyEncrypted(value: string): boolean {
  // Our encrypted format: base64(IV[16] + ciphertext + tag[16]) = at least 44 base64 chars
  // Google access tokens start with "ya29." and refresh tokens with "1//"
  if (value.startsWith('ya29.') || value.startsWith('1//')) return false;
  // Base64 pattern check + minimum length for our encryption format
  return value.length >= 44 && /^[A-Za-z0-9+/]+=*$/.test(value);
}

export function getApiKeyPreview(apiKey: string): string {
  // Show first 8 characters for preview
  if (apiKey.length <= 12) {
    return apiKey.substring(0, 4) + '...';
  }
  return apiKey.substring(0, 12) + '...';
}
