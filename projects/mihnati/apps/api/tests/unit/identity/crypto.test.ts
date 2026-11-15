import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  normalizePhone,
} from '../../../src/modules/identity/crypto.js';

describe('Identity Crypto Utilities', () => {
  describe('hashPassword and verifyPassword', () => {
    it('should hash a password and verify it correctly', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toContain(':');
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correctPassword');
      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should reject malformed hashes', async () => {
      expect(await verifyPassword('password', 'malformed_hash')).toBe(false);
      expect(await verifyPassword('password', '')).toBe(false);
    });
  });

  describe('generateSecureToken and hashToken', () => {
    it('should generate random hex token', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it('should compute consistent SHA-256 hash of token', () => {
      const token = 'my-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('normalizePhone', () => {
    it('should normalize Egyptian mobile numbers starting with 01', () => {
      expect(normalizePhone('01012345678')).toBe('+201012345678');
      expect(normalizePhone('01112345678')).toBe('+201112345678');
      expect(normalizePhone('01212345678')).toBe('+201212345678');
      expect(normalizePhone('01512345678')).toBe('+201512345678');
    });

    it('should normalize numbers starting with 20 or 0020', () => {
      expect(normalizePhone('201012345678')).toBe('+201012345678');
      expect(normalizePhone('00201012345678')).toBe('+201012345678');
    });

    it('should clean dashes, spaces, and brackets', () => {
      expect(normalizePhone('010-1234-5678')).toBe('+201012345678');
      expect(normalizePhone('+20 (10) 1234 5678')).toBe('+201012345678');
    });
  });
});

