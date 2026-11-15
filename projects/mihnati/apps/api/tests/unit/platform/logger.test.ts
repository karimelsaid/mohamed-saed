import { describe, it, expect } from 'vitest';
import { redactSensitiveData, Logger } from '../../../src/platform/logging/logger.js';

describe('Logger', () => {
  describe('redactSensitiveData', () => {
    it('should redact password fields', () => {
      const data = { username: 'test', password: 'secret123' };
      const result = redactSensitiveData(data) as Record<string, unknown>;
      expect(result['username']).toBe('test');
      expect(result['password']).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const data = {
        user: { name: 'Karim', credentials: { token: 'abc123', otp: '123456' } },
      };
      const result = redactSensitiveData(data) as Record<string, unknown>;
      const user = result['user'] as Record<string, unknown>;
      const creds = user['credentials'] as Record<string, unknown>;
      expect(user['name']).toBe('Karim');
      expect(creds['token']).toBe('[REDACTED]');
      expect(creds['otp']).toBe('[REDACTED]');
    });

    it('should redact authorization header', () => {
      const data = { authorization: 'Bearer xyz', 'Content-Type': 'application/json' };
      const result = redactSensitiveData(data) as Record<string, unknown>;
      expect(result['authorization']).toBe('[REDACTED]');
      expect(result['Content-Type']).toBe('application/json');
    });

    it('should redact location-related fields', () => {
      const data = {
        latitude: 30.0444,
        longitude: 31.2357,
        fullAddress: '123 Test Street',
        city: 'Cairo',
      };
      const result = redactSensitiveData(data) as Record<string, unknown>;
      expect(result['latitude']).toBe('[REDACTED]');
      expect(result['longitude']).toBe('[REDACTED]');
      expect(result['fullAddress']).toBe('[REDACTED]');
      expect(result['city']).toBe('Cairo');
    });

    it('should handle null and undefined', () => {
      expect(redactSensitiveData(null)).toBeNull();
      expect(redactSensitiveData(undefined)).toBeUndefined();
    });

    it('should handle arrays', () => {
      const data = [{ password: 'a' }, { name: 'b' }];
      const result = redactSensitiveData(data) as Array<Record<string, unknown>>;
      expect(result[0]['password']).toBe('[REDACTED]');
      expect(result[1]['name']).toBe('b');
    });
  });

  describe('Logger instance', () => {
    it('should be constructable', () => {
      const log = new Logger();
      expect(log).toBeDefined();
      expect(typeof log.info).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.debug).toBe('function');
    });
  });
});

