import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../../src/platform/config/env.js';

describe('Environment Configuration', () => {
  it('should load valid config from env overrides', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORT: '4000',
      HOST: '0.0.0.0',
      API_PREFIX: '/api/v1',
      MONGODB_URI: 'mongodb://localhost:27017/mihnati-test',
      MONGODB_DB_NAME: 'mihnati-test',
      SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
      CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
      LOG_LEVEL: 'error',
      LOG_FORMAT: 'json',
    });

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.API_PREFIX).toBe('/api/v1');
    expect(config.MONGODB_URI).toBe('mongodb://localhost:27017/mihnati-test');
    expect(config.MONGODB_DB_NAME).toBe('mihnati-test');
  });

  it('should fail fast with missing required fields', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: '',
        SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
      })
    ).toThrow(/MONGODB_URI/);
  });

  it('should fail fast with short SESSION_SECRET', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://localhost:27017/mihnati-test',
        SESSION_SECRET: 'short',
      })
    ).toThrow(/SESSION_SECRET/);
  });

  it('should apply defaults for optional fields', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/mihnati-test',
      SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    });

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.STORAGE_DRIVER).toBe('fake');
    expect(config.OTP_DRIVER).toBe('fake');
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(config.SESSION_ACCESS_LIFETIME_MINUTES).toBe(15);
    expect(config.SESSION_REFRESH_LIFETIME_DAYS).toBe(30);
  });

  it('should reject invalid NODE_ENV', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'staging' as 'development',
        MONGODB_URI: 'mongodb://localhost:27017/mihnati-test',
        SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
      })
    ).toThrow();
  });

  it('should reject invalid PORT', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        PORT: '99999',
        MONGODB_URI: 'mongodb://localhost:27017/mihnati-test',
        SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
      })
    ).toThrow();
  });
});

