import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/bootstrap/app.js';
import { loadConfig, type AppConfig } from '../../../src/platform/config/env.js';

let config: AppConfig;

beforeAll(() => {
  config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/mihnati-test',
    MONGODB_DB_NAME: 'mihnati-test',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long-ok',
    CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
  });
});

describe('Health & Readiness Routes', () => {
  it('GET /api/v1/health should return 200 with pass status', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pass');
    expect(res.body.data.timestamp).toBeDefined();
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.meta.requestId).toBeDefined();
  });

  it('GET /api/v1/health should set X-Request-ID header', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
  });

  it('GET /api/v1/health should respect client-sent X-Request-ID', async () => {
    const app = createApp(config);
    const customId = '12345678-1234-1234-1234-123456789abc';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', customId);

    expect(res.headers['x-request-id']).toBe(customId);
    expect(res.body.meta.requestId).toBe(customId);
  });

  it('GET /api/v1/ready should return readiness check with MongoDB and config status', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/ready');

    // Without MongoDB connected, readiness should fail
    expect(res.body.data.status).toBeDefined();
    expect(res.body.data.checks).toBeDefined();
    expect(res.body.data.checks.mongodb).toBeDefined();
    expect(res.body.data.checks.configuration).toBeDefined();
    expect(res.body.meta.requestId).toBeDefined();
  });
});

describe('Error Handling', () => {
  it('should return 404 error envelope for unknown routes', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
    expect(res.body.error.message).toBeDefined();
  });

  it('should return 404 for routes outside API prefix', async () => {
    const app = createApp(config);
    const res = await request(app).get('/something/else');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Security Headers', () => {
  it('should set security headers', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-xss-protection']).toBe('0');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('CORS', () => {
  it('should allow configured origins', async () => {
    const app = createApp(config);
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:4200');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('API Response Envelope', () => {
  it('success envelope should have data and meta', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/health');

    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('requestId');
  });

  it('error envelope should have error with code, message, requestId', async () => {
    const app = createApp(config);
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('requestId');
    // No stack trace should be exposed
    expect(res.body.error.stack).toBeUndefined();
  });
});

