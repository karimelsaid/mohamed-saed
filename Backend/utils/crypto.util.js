const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended IV length for GCM (96 bits)

/**
 * Helper to derive a 32-byte Buffer key from environment variable
 */
function getEncryptionKey() {
  const secret = process.env.AMAZON_TOKEN_ENCRYPTION_KEY || 'kenouz_default_secret_key_32_bytes_len!!';
  // Use SHA-256 to guarantee exact 32-byte Buffer key
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt a plain text string (e.g. LWA Refresh Token)
 * @param {string} text
 * @returns {string} Encrypted string in format "ivHex:authTagHex:encryptedDataHex"
 */
function encryptToken(text) {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return `${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted token string
 * @param {string} encryptedText in format "ivHex:authTagHex:encryptedDataHex"
 * @returns {string} Plain text string
 */
function decryptToken(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) {
    // If text is not encrypted format, return as-is (backward compatibility)
    return encryptedText;
  }

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;

    const [ivHex, authTagHex, encryptedDataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('❌ [CryptoUtil] Decryption failed:', error.message);
    throw new Error('فشل فك تشفير الـ Refresh Token الخاطئ أو الفاسد');
  }
}

module.exports = {
  encryptToken,
  decryptToken
};
