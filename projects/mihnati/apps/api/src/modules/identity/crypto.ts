import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Hashes a plaintext password using Node.js crypto.scrypt.
 * Output format: <salt_hex>:<derived_key_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored <salt>:<hash> string.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [salt, expectedKeyHex] = parts;
  const expectedKey = Buffer.from(expectedKeyHex, 'hex');
  const actualKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  if (expectedKey.length !== actualKey.length) {
    return false;
  }

  return timingSafeEqual(expectedKey, actualKey);
}

/**
 * Generates a cryptographically secure random token (hex string).
 */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/**
 * Hashes a token (e.g. refresh token or session secret) using SHA-256.
 * We store only hashes in the database, never raw tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Normalizes a phone number to standard E.164 Egypt (+20...) or clean numeric.
 */
export function normalizePhone(rawPhone: string): string {
  let cleaned = rawPhone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('0020')) {
    cleaned = '+20' + cleaned.slice(4);
  } else if (cleaned.startsWith('20') && !cleaned.startsWith('+20')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('01')) {
    // Local Egyptian mobile (010, 011, 012, 015)
    cleaned = '+20' + cleaned.slice(1);
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

